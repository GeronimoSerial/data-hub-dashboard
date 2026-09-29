"""Indice de aislamiento territorial derivado de OpenStreetMap (batch G1 ENOS).

Ver docs/ejecucion-enos/G1/contrato-datos.md para el contrato de salida y la
escala 0-3 del indice. Este modulo separa deliberadamente el calculo puro
(testeable sin red) de la construccion de la red (que si requiere red/Overpass
via osmnx).

## G1-fix2 — cruces de agua (ver docs/ejecucion-enos/G1/registro.md)

Bug corregido en esta version: en OSM los cursos de agua (`waterway=river|
stream|canal|drain`) son ENTIDADES SEPARADAS (ways propios), nunca un
atributo de las aristas viales. Buscar `waterway` en los datos de una arista
de camino (como hacia la version anterior de este modulo) nunca encuentra
nada, y por eso `cruces_agua_count` daba siempre 0. La correccion carga las
geometrias de los cursos de agua por separado (`construir_geometrias_agua_local`)
y las cruza espacialmente contra la geometria de cada arista vial usando un
indice espacial (`shapely.strtree.STRtree`) via `construir_cruces_por_arista`,
UNA sola vez para todo el grafo (no por escuela), para que el costo sea
manejable sobre ~600.000 aristas y ~2000 rutas.

## G1-fix2b — bug "todos los cruces son puente" (ver docs/ejecucion-enos/G1/registro.md)

Bug corregido en esta version: `pyrosm` devuelve `float('nan')` (no `None`
ni clave ausente) para un atributo (`bridge`, `tunnel`, `ford`, `surface`)
no tageado en una arista. `_tiene_puente`/`_tiene_ford` comparaban con
`valor not in (None, "", "no")`, y un `nan` no coincide con ninguno de esos
tres valores -> se clasificaba como puente. Efecto observado en la corrida
real: `cruces_agua_con_puente_count == cruces_agua_count` para las 890
escuelas con cruces, `cruces_agua_con_vado_count` en 0 siempre, y por lo
tanto indice 2 estructuralmente inalcanzable. Corregido centralizando la
normalizacion en `_primer_valor` (ver su docstring).

## Optimizacion de rendimiento (N1) — busquedas batched por departamento

`calcular_metricas_escuela` (per-escuela, se mantiene para compatibilidad y
tests unitarios) hace un `nx.shortest_path` punto-a-punto por escuela contra
el grafo completo: ~0.5-1s por escuela sobre ~590k aristas, ~1200s
acumulados en la corrida real de 2001 escuelas. `calcular_metricas_departamento`
(camino de produccion, ver su docstring) calcula lo mismo para todas las
escuelas de un departamento con una unica busqueda multi-destino compartida
(25 busquedas en total en vez de 2000), documentado en
docs/ejecucion-enos/G1/registro.md.
"""

from __future__ import annotations

import math
from typing import Optional

UMBRAL_SNAP_SIN_CONEXION_M = 5000.0
UMBRAL_VIA_PAVIMENTADA_CERCANA_M = 3000.0
UMBRAL_VIA_NO_ALCANZABLE_M = 20000.0
SUPERFICIES_NO_PAVIMENTADAS = {"unpaved", "dirt", "ground", "gravel", "sand"}
HIGHWAYS_SIN_SURFACE_ES_NO_PAVIMENTADO = {"track", "unclassified"}

# Tipos de waterway considerados "cruce relevante" para el indice de
# aislamiento. Se incluye `drain` (canales de desagüe/esteros, muy comunes en
# Corrientes y con relevancia real para el paso de un vehiculo) pero se
# excluye deliberadamente `ditch` (zanjas de borde de campo, en general sin
# entidad suficiente para bloquear un camino ni para justificar un puente) —
# decision de N2, documentada en el registro.
WATERWAYS_CRUCE = ("river", "stream", "canal", "drain")

# Tolerancia para deduplicar cruces del mismo curso de agua detectados dos
# veces muy cerca uno del otro a lo largo de una misma ruta (p. ej. porque la
# interseccion linea-linea cae en mas de un punto sobre la misma arista, o
# porque dos aristas consecutivas cruzan el mismo curso de agua a la entrada y
# salida de un puente). Documentado, no es un valor "magico": 30 m es del
# orden del ancho de un puente rural tipico, muy por debajo de la distancia
# entre dos cruces reales distintos del mismo curso de agua.
TOLERANCIA_DEDUP_CRUCE_M = 30.0

# Clasificacion de un cruce para el export de geometria (N3). Solo distingue
# "puente" de "vado"/"sin_evidencia" para MOSTRAR el dato: la metrica
# `cruces_agua_con_vado_count` sigue contando "sin_evidencia" junto con "vado"
# (ver `clasificar_cruce`), el export nunca altera el conteo.
CLASIFICACION_PUENTE = "puente"
CLASIFICACION_VADO = "vado"
CLASIFICACION_SIN_EVIDENCIA = "sin_evidencia"


def clasificar_cruce(cruce: dict) -> str:
    """Clasifica un cruce para el export de geometria (N3).

    `con_puente` gana sobre `es_ford` (un cruce con puente nunca es vado).
    Si no hay puente ni evidencia de vado devuelve "sin_evidencia": la metrica
    `cruces_agua_con_vado_count` cuenta "sin_evidencia" junto con "vado" (nunca
    se asume seguro), pero el export las distingue solo para mostrar el dato.
    """
    if cruce["con_puente"]:
        return CLASIFICACION_PUENTE
    if cruce["es_ford"]:
        return CLASIFICACION_VADO
    return CLASIFICACION_SIN_EVIDENCIA


def _coordenadas_ruta(grafo, ruta_nodos) -> list[list[float]]:
    """Coordenadas [lon, lat] de la geometria REALMENTE usada por la ruta.

    Para cada par consecutivo (u, v) elige, entre las aristas paralelas
    `grafo.get_edge_data(u, v)`, la de menor `length` (la que uso Dijkstra) y
    toma su geometria real via `_geometria_arista` (atributo `geometry` si
    existe; si no, las coordenadas de los dos nodos OSM, que son nodos reales
    de la via, no una recta inventada). Orienta cada tramo para que empiece en
    `u`, concatena salteando una coordenada igual a la anterior y redondea
    cada lon/lat a 6 decimales. Devuelve [] si la ruta tiene menos de 2 nodos.
    """
    if len(ruta_nodos) < 2:
        return []

    coords: list[list[float]] = []
    for u, v in zip(ruta_nodos[:-1], ruta_nodos[1:]):
        datos_aristas = grafo.get_edge_data(u, v) or {}
        if not datos_aristas:
            continue
        k_min = min(datos_aristas, key=lambda k: datos_aristas[k].get("length", math.inf))
        geometria = _geometria_arista(datos_aristas[k_min], grafo, u, v)
        puntos = [(p[0], p[1]) for p in geometria.coords]

        ux, uy = grafo.nodes[u]["x"], grafo.nodes[u]["y"]
        dist_primero = (puntos[0][0] - ux) ** 2 + (puntos[0][1] - uy) ** 2
        dist_ultimo = (puntos[-1][0] - ux) ** 2 + (puntos[-1][1] - uy) ** 2
        if dist_ultimo < dist_primero:
            puntos.reverse()

        for lon, lat in puntos:
            coord = [round(lon, 6), round(lat, 6)]
            if coords and coords[-1] == coord:
                continue
            coords.append(coord)
    return coords


def calcular_indice_aislamiento(
    distancia_via_pavimentada_m: Optional[float],
    tramos_sin_pavimentar_count: Optional[int],
    cruces_agua_con_puente_count: Optional[int],
    cruces_agua_con_vado_count: Optional[int],
    tiene_alternativa_sin_cruce: Optional[bool],
) -> Optional[int]:
    """Escala 0-3 documentada en el contrato de datos de G1.

    Devuelve None cuando faltan datos suficientes (nunca asume "seguro").
    """
    if (
        distancia_via_pavimentada_m is None
        or tramos_sin_pavimentar_count is None
        or cruces_agua_con_puente_count is None
        or cruces_agua_con_vado_count is None
    ):
        return None

    if distancia_via_pavimentada_m > UMBRAL_VIA_NO_ALCANZABLE_M:
        return 3

    if cruces_agua_con_vado_count >= 1:
        # Vado (sin puente): riesgo alto salvo que haya alternativa que lo evite.
        return 2 if tiene_alternativa_sin_cruce else 3

    if tramos_sin_pavimentar_count >= 5 and not tiene_alternativa_sin_cruce:
        return 2

    sin_cruces_relevantes = cruces_agua_con_puente_count == 0
    via_cercana = distancia_via_pavimentada_m <= UMBRAL_VIA_PAVIMENTADA_CERCANA_M
    if sin_cruces_relevantes and via_cercana and tramos_sin_pavimentar_count <= 1:
        return 0

    if tiene_alternativa_sin_cruce:
        return 1

    # Caso residual no cubierto explicitamente arriba (p. ej. cruces con
    # puente sin alternativa documentada, o via lejana sin cruces): criterio
    # conservador, se trata como aislamiento medio-alto en vez de asumir
    # seguro, y queda documentado para revision de N1.
    return 2


def construir_red(bbox_norte: float, bbox_sur: float, bbox_este: float, bbox_oeste: float):
    """Descarga la red vial 'drive' de OSM para el bbox dado via osmnx/Overpass.

    A partir de G1-fix1 esta funcion queda como FALLBACK DOCUMENTADO: se usa
    unicamente cuando no esta disponible el extracto local de Geofabrik (ver
    `construir_red_local` y PBF_LOCAL_DEFAULT en jobs/calcular_aislamiento.py).
    La corrida de produccion construye la red desde el pbf local, no desde
    Overpass. La firma y el comportamiento se mantienen sin cambios.

    Esta funcion SI hace uso de red (Overpass API) y por eso queda fuera de
    los tests unitarios; se ejercita en la corrida real documentada en
    docs/ejecucion-enos/G1/registro.md.
    """
    import osmnx as ox

    if "surface" not in ox.settings.useful_tags_way:
        ox.settings.useful_tags_way = list(ox.settings.useful_tags_way) + ["surface"]

    # El chequeo de rate-limit de osmnx pega contra overpass-api.de/api/status,
    # que responde 406 al User-Agent por defecto de `requests` (verificado
    # manualmente) y deja a osmnx reintentando en un backoff largo. Se
    # deshabilita y se usa un timeout explicito para no depender de ese
    # endpoint.
    ox.settings.overpass_rate_limit = False
    ox.settings.requests_timeout = 180

    return ox.graph_from_bbox(
        bbox=(bbox_norte, bbox_sur, bbox_este, bbox_oeste),
        network_type="drive",
    )


def construir_red_local(
    pbf_path: str,
    bbox_norte: float,
    bbox_sur: float,
    bbox_este: float,
    bbox_oeste: float,
):
    """Construye la red vial 'driving' desde un extracto local .osm.pbf (pyrosm).

    Camino de produccion desde G1-fix1: no golpea la red ni Overpass. El pbf
    (extracto Geofabrik de Argentina) se lee con pyrosm recortando por bbox y
    se devuelve un networkx.MultiDiGraph compatible con osmnx (nodos con x/y,
    aristas con atributos OSM como highway/surface/bridge), apto para
    `ox.distance.nearest_nodes` y el resto del calculo en osm_aislamiento.

    Ojo: pyrosm espera el bbox en orden [oeste, sur, este, norte], distinto
    del orden (norte, sur, este, oeste) que usa el resto del modulo.
    """
    from pyrosm import OSM

    osm = OSM(
        pbf_path,
        bounding_box=[bbox_oeste, bbox_sur, bbox_este, bbox_norte],
    )
    nodes, edges = osm.get_network(
        network_type="driving",
        nodes=True,
        extra_attributes=["surface", "bridge", "tunnel", "ford"],
    )
    return osm.to_graph(nodes, edges, graph_type="networkx", osmnx_compatible=True)


def construir_geometrias_agua_local(
    pbf_path: str,
    bbox_norte: float,
    bbox_sur: float,
    bbox_este: float,
    bbox_oeste: float,
):
    """Extrae las geometrias de cursos de agua (`WATERWAYS_CRUCE`) del mismo
    extracto local .osm.pbf, como entidades separadas de la red vial (ver nota
    de modulo G1-fix2). Devuelve una lista de geometrias shapely (LineString/
    MultiLineString); nunca la red vial.

    Mismo orden de bbox que `construir_red_local`: pyrosm espera
    [oeste, sur, este, norte].
    """
    from pyrosm import OSM

    osm = OSM(
        pbf_path,
        bounding_box=[bbox_oeste, bbox_sur, bbox_este, bbox_norte],
    )
    agua = osm.get_data_by_custom_criteria(
        custom_filter={"waterway": list(WATERWAYS_CRUCE)},
        osm_keys_to_keep=["waterway"],
        filter_type="keep",
        keep_nodes=False,
        keep_relations=False,
    )
    if agua is None or agua.empty:
        return []
    return [
        geom
        for geom in agua.geometry
        if geom is not None and not geom.is_empty and geom.geom_type in ("LineString", "MultiLineString")
    ]


def construir_arbol_agua(geometrias_agua: list):
    """Indice espacial (STRtree) sobre las geometrias de agua, para no tener
    que comparar cada arista vial contra cada curso de agua (O(aristas x
    cursos_de_agua)). Devuelve un STRtree vacio si no hay geometrias."""
    from shapely.strtree import STRtree

    return STRtree(geometrias_agua)


def _primer_valor(valor):
    """Normaliza un valor de atributo OSM: toma el primero si es lista, y
    convierte a `None` tanto `None`/`""` como un `NaN` flotante.

    ## G1-fix2b — bug de clasificacion "todos los cruces son puente" (ver
    docs/ejecucion-enos/G1/registro.md)

    `pyrosm.get_network(..., extra_attributes=[...])` devuelve un
    `pandas.DataFrame` donde una columna solicitada (`bridge`, `tunnel`,
    `ford`, `surface`) que no esta tageada en una arista dada queda como
    `float('nan')` (el "vacio" de pandas para una columna numerica-o-mixta),
    NUNCA como `None` ni como clave ausente del dict. Verificado leyendo
    directamente aristas reales del grafo de Corrientes (`.data/osm/
    corrientes_graph.pkl`): `{'bridge': nan, 'tunnel': nan, 'ford': nan, ...}`
    para una arista sin ninguno de esos tags.

    Antes de este fix, `_tiene_puente`/`_tiene_ford` comparaban con
    `valor not in (None, "", "no")`, y `nan not in (...)` da `True` (un
    `float('nan')` no es `==` a nada, ni siquiera a si mismo, pero la
    comparacion `in` sobre una tupla no lanza excepcion, simplemente no
    encuentra coincidencia). Resultado: TODA arista sin tag `bridge` se
    clasificaba igual que una con `bridge=yes` -> `cruces_agua_con_puente_
    count` daba exactamente igual a `cruces_agua_count` en el 100% de los
    casos, `cruces_agua_con_vado_count` quedaba en 0 siempre, y por lo
    tanto `tiene_alternativa_sin_cruce` daba `True` siempre (nunca se
    quitaba ninguna arista del grafo seguro) — exactamente el patron que
    reporto N1 sobre la corrida `aislamiento_osm-v1-2026-09-26.csv`.

    Normalizar aca (un unico punto) corrige `_tiene_puente`, `_tiene_ford`
    y `_es_tramo_sin_pavimentar` (que tambien dependia de `_primer_valor`
    para `surface`/`highway`, con el mismo riesgo de tratar un `surface`
    NaN como si fuera un valor real no vacio)."""
    if isinstance(valor, list):
        valor = valor[0] if valor else None
    if isinstance(valor, float) and math.isnan(valor):
        return None
    return valor


def _es_tramo_sin_pavimentar(datos_arista: dict) -> bool:
    surface = _primer_valor(datos_arista.get("surface"))
    if surface is not None:
        return surface in SUPERFICIES_NO_PAVIMENTADAS
    highway = _primer_valor(datos_arista.get("highway"))
    return highway in HIGHWAYS_SIN_SURFACE_ES_NO_PAVIMENTADO


def _tiene_puente(datos_arista: dict) -> bool:
    """Puente si `bridge` esta presente y no es 'no' (bridge=yes, viaduct,
    movable, etc. — cualquier valor de bridge=* salvo 'no' es un puente real),
    o si el tramo es un `tunnel=culvert` (paso cubierto, tratado igual que un
    puente a los efectos de seguridad del cruce: no es un vado a cielo
    abierto)."""
    bridge = _primer_valor(datos_arista.get("bridge"))
    if bridge not in (None, "", "no"):
        return True
    tunnel = _primer_valor(datos_arista.get("tunnel"))
    return tunnel == "culvert"


def _tiene_ford(datos_arista: dict, grafo, u, v) -> bool:
    """Vado (ford=yes) si esta tageado en la propia arista, o en alguno de
    los dos nodos que la componen (un vado se tagea a veces sobre el nodo
    puntual del cruce, no sobre el camino)."""
    ford_arista = _primer_valor(datos_arista.get("ford"))
    if ford_arista not in (None, "", "no"):
        return True
    for nodo in (u, v):
        datos_nodo = grafo.nodes.get(nodo, {})
        ford_nodo = _primer_valor(datos_nodo.get("ford"))
        if ford_nodo not in (None, "", "no"):
            return True
    return False


def _geometria_arista(datos_arista: dict, grafo, u, v):
    geom = datos_arista.get("geometry")
    if geom is not None:
        return geom
    from shapely.geometry import LineString

    return LineString(
        [
            (grafo.nodes[u]["x"], grafo.nodes[u]["y"]),
            (grafo.nodes[v]["x"], grafo.nodes[v]["y"]),
        ]
    )


def construir_cruces_por_arista(grafo, arbol_agua, geometrias_agua) -> dict:
    """Clasifica, UNA sola vez para todo el grafo (no por escuela), que
    aristas viales cruzan un curso de agua y con que tipo de cruce.

    Devuelve un dict `{(u, v, k): [ {"agua_idx", "punto", "con_puente",
    "es_ford"}, ... ]}` con una entrada solo para las aristas que
    efectivamente intersectan algun curso de agua. `punto` es un
    `(x, y)` representativo de la interseccion, usado despues para
    deduplicar cruces del mismo curso de agua muy cercanos entre si.
    """
    cruces: dict = {}
    if not geometrias_agua:
        return cruces

    claves = []
    geometrias_aristas = []
    for u, v, k, datos in grafo.edges(keys=True, data=True):
        claves.append((u, v, k, datos))
        geometrias_aristas.append(_geometria_arista(datos, grafo, u, v))

    if not geometrias_aristas:
        return cruces

    # Consulta en bloque (mas rapida que una consulta STRtree por arista):
    # pares (indice_de_arista, indice_de_curso_de_agua) cuyos bounding boxes
    # se solapan; se filtra despues con interseccion real (`predicate` ya
    # filtra por 'intersects' real, no solo bbox).
    pares_arista, pares_agua = arbol_agua.query(geometrias_aristas, predicate="intersects")

    for idx_arista, idx_agua in zip(pares_arista, pares_agua):
        u, v, k, datos = claves[idx_arista]
        geom_arista = geometrias_aristas[idx_arista]
        geom_agua = geometrias_agua[idx_agua]
        interseccion = geom_arista.intersection(geom_agua)
        if interseccion.is_empty:
            continue
        punto = interseccion.centroid
        cruces.setdefault((u, v, k), []).append(
            {
                "agua_idx": int(idx_agua),
                "punto": (punto.x, punto.y),
                "con_puente": _tiene_puente(datos),
                "es_ford": _tiene_ford(datos, grafo, u, v),
            }
        )
    return cruces


def _aristas_inseguras(cruces_por_arista: dict) -> set:
    """Aristas con al menos un cruce de agua SIN puente (vado confirmado o
    sin evidencia de puente ni de vado). Nunca se asume que un cruce sin
    evidencia de puente es seguro: se trata igual que un vado confirmado a
    los efectos de la ruta alternativa (ver contrato-datos.md, nota
    G1-fix2)."""
    return {
        clave
        for clave, crucesarista in cruces_por_arista.items()
        if any(not c["con_puente"] for c in crucesarista)
    }


def construir_grafo_seguro(grafo, cruces_por_arista: dict):
    """Copia de `grafo` sin las aristas 'inseguras' (cruce de agua sin puente
    confirmado). Se construye UNA sola vez para todo el grafo y se reutiliza
    para las ~2000 escuelas que necesiten chequear ruta alternativa — evitar
    un `grafo.copy()` por escuela es lo que hace viable el tiempo de corrida
    (ver docstring de modulo)."""
    grafo_seguro = grafo.copy()
    aristas_a_quitar = _aristas_inseguras(cruces_por_arista)
    if aristas_a_quitar:
        grafo_seguro.remove_edges_from(aristas_a_quitar)
    return grafo_seguro


def _dedupe_cruces(crucesarista: list, ya_vistos: list, tolerancia_m: float) -> list:
    """De la lista de cruces de una arista, devuelve solo los que no son
    'el mismo cruce' que uno ya contado en esta ruta: mismo curso de agua
    (`agua_idx`) y punto de interseccion a menos de `tolerancia_m` metros de
    uno ya visto. `ya_vistos` se muta con los nuevos cruces aceptados."""
    nuevos = []
    for cruce in crucesarista:
        es_duplicado = False
        for visto in ya_vistos:
            if visto["agua_idx"] != cruce["agua_idx"]:
                continue
            px, py = cruce["punto"]
            vx, vy = visto["punto"]
            # Aproximacion en grados -> metros suficiente para deduplicar a
            # esta escala (decenas de metros), no para medir distancias
            # largas: 1 grado ~ 111 km en latitud/longitud en esta region.
            distancia_m = ((px - vx) ** 2 + (py - vy) ** 2) ** 0.5 * 111_000
            if distancia_m <= tolerancia_m:
                es_duplicado = True
                break
        if not es_duplicado:
            nuevos.append(cruce)
            ya_vistos.append(cruce)
    return nuevos


def calcular_metricas_escuela(
    grafo,
    lat: float,
    lon: float,
    nodo_cabecera,
    cruces_por_arista: Optional[dict] = None,
    grafo_seguro=None,
    tolerancia_dedup_m: float = TOLERANCIA_DEDUP_CRUCE_M,
) -> dict:
    """Calcula las metricas por escuela sobre un grafo networkx ya construido.

    `grafo` es un networkx.MultiDiGraph con nodos que tienen atributos x/y
    (lon/lat, convencion osmnx) y aristas con atributos OSM (surface, bridge,
    tunnel, ford, highway). `nodo_cabecera` es el nodo del grafo mas cercano a
    la cabecera departamental (ya snapeado por el llamador).

    `cruces_por_arista` es el resultado precomputado (UNA sola vez para todo
    el grafo) de `construir_cruces_por_arista`: los cursos de agua NO son un
    atributo de la arista vial, se cruzan por geometria (ver nota de modulo
    G1-fix2). Si es `None` (compatibilidad / grafo sin capa de agua), los
    cruces de agua quedan en 0 para todas las escuelas — nunca se inventa un
    cruce que no se pudo calcular.

    `grafo_seguro` es el resultado precomputado de `construir_grafo_seguro`
    (grafo sin las aristas con cruce sin puente confirmado); si no se provee
    se calcula al vuelo con `grafo.copy()` (mas lento, solo para tests/uso
    puntual).
    """
    import networkx as nx
    import osmnx as ox

    resultado = {
        "distancia_via_pavimentada_m": None,
        "distancia_cabecera_departamental_m": None,
        "tramos_sin_pavimentar_count": None,
        "cruces_agua_count": None,
        "cruces_agua_con_puente_count": None,
        "cruces_agua_con_vado_count": None,
        "tiene_alternativa_sin_cruce": None,
        "snap_distancia_m": None,
        "motivo_sin_datos": None,
    }

    nodo_escuela, snap_dist_deg = ox.distance.nearest_nodes(
        grafo, X=lon, Y=lat, return_dist=True
    )
    # nearest_nodes en osmnx>=1.9 devuelve distancia en metros cuando el grafo
    # esta en CRS geografico proyectado; si viniera en grados se documenta la
    # conversion en el llamador real (jobs/calcular_aislamiento.py).
    snap_distancia_m = float(snap_dist_deg)
    resultado["snap_distancia_m"] = snap_distancia_m

    if snap_distancia_m > UMBRAL_SNAP_SIN_CONEXION_M:
        resultado["motivo_sin_datos"] = "sin_conexion_red"
        return resultado

    try:
        ruta_cabecera = nx.shortest_path(
            grafo, nodo_escuela, nodo_cabecera, weight="length"
        )
        resultado["distancia_cabecera_departamental_m"] = nx.shortest_path_length(
            grafo, nodo_escuela, nodo_cabecera, weight="length"
        )
    except (nx.NetworkXNoPath, nx.NodeNotFound):
        resultado["motivo_sin_datos"] = "sin_conexion_red"
        return resultado

    cruces_por_arista = cruces_por_arista or {}
    tramos_sin_pavimentar = 0
    cruces_con_puente = 0
    cruces_con_vado = 0
    ya_vistos_ruta: list = []
    for u, v in zip(ruta_cabecera[:-1], ruta_cabecera[1:]):
        datos_aristas = grafo.get_edge_data(u, v) or {}
        for k, datos in datos_aristas.items():
            if _es_tramo_sin_pavimentar(datos):
                tramos_sin_pavimentar += 1
            crucesarista = cruces_por_arista.get((u, v, k), [])
            for cruce in _dedupe_cruces(crucesarista, ya_vistos_ruta, tolerancia_dedup_m):
                if cruce["con_puente"]:
                    cruces_con_puente += 1
                else:
                    # Vado confirmado (ford=yes) o cruce sin evidencia de
                    # puente: nunca se asume seguro, se cuenta como vado
                    # (ver contrato-datos.md, nota G1-fix2).
                    cruces_con_vado += 1

    cruces_count = cruces_con_puente + cruces_con_vado

    resultado["tramos_sin_pavimentar_count"] = tramos_sin_pavimentar
    resultado["cruces_agua_count"] = cruces_count
    resultado["cruces_agua_con_puente_count"] = cruces_con_puente
    resultado["cruces_agua_con_vado_count"] = cruces_con_vado

    # Vias pavimentadas: nodos cuyo grado de arista principal no tiene
    # tramo sin pavimentar directo; se usa la distancia a la cabecera como
    # proxy documentado cuando no hay un catalogo separado de vias troncales.
    resultado["distancia_via_pavimentada_m"] = resultado["distancia_cabecera_departamental_m"]

    if cruces_con_vado == 0:
        resultado["tiene_alternativa_sin_cruce"] = True
    else:
        tiene_alternativa = False
        try:
            if grafo_seguro is None:
                grafo_seguro = construir_grafo_seguro(grafo, cruces_por_arista)
            tiene_alternativa = nx.has_path(grafo_seguro, nodo_escuela, nodo_cabecera)
        except (nx.NetworkXError, nx.NodeNotFound):
            tiene_alternativa = False
        resultado["tiene_alternativa_sin_cruce"] = tiene_alternativa

    return resultado


def _resultado_vacio() -> dict:
    return {
        "distancia_via_pavimentada_m": None,
        "distancia_cabecera_departamental_m": None,
        "tramos_sin_pavimentar_count": None,
        "cruces_agua_count": None,
        "cruces_agua_con_puente_count": None,
        "cruces_agua_con_vado_count": None,
        "tiene_alternativa_sin_cruce": None,
        "snap_distancia_m": None,
        "motivo_sin_datos": None,
    }


def calcular_metricas_departamento(
    grafo,
    grafo_invertido,
    escuelas_depto: list,
    nodo_cabecera,
    cruces_por_arista: Optional[dict] = None,
    grafo_seguro_invertido=None,
    tolerancia_dedup_m: float = TOLERANCIA_DEDUP_CRUCE_M,
    *,
    geometrias_out: Optional[list] = None,
) -> list:
    """Version batched de `calcular_metricas_escuela` para TODAS las escuelas
    de un mismo departamento (mismo `nodo_cabecera`).

    ## N1 — optimizacion de rendimiento (ver docs/ejecucion-enos/G1/registro.md)

    La version por-escuela original hace, por cada una de las ~2000 escuelas,
    un `nx.shortest_path` punto-a-punto (bidireccional) contra un grafo de
    ~273k nodos / ~590k aristas: ~0.5-1s por escuela, ~1200s acumulados en la
    corrida real. Esta version reemplaza eso por, POR DEPARTAMENTO (25 en
    total, no 2000):

    1. UNA sola busqueda `nx.single_source_dijkstra` desde `nodo_cabecera`
       sobre `grafo_invertido` (= `grafo.reverse(copy=False)`, calculado UNA
       vez para toda la corrida, no por departamento): da de una vez la
       distancia y el camino desde la cabecera hacia TODOS los nodos
       alcanzables. Como el camino en el grafo invertido desde cabecera hacia
       un nodo escuela es exactamente el camino invertido de escuela hacia
       cabecera en el grafo original (mismos pesos, misma direccion logica
       una vez invertida), `list(reversed(rutas_cab[nodo_escuela]))` da el
       mismo camino que `nx.shortest_path(grafo, nodo_escuela, nodo_cabecera,
       weight="length")` hubiera dado por-escuela (ver test de equivalencia
       `TestCalcularMetricasDepartamentoEquivalencia`).
    2. UNA sola busqueda de alcanzabilidad (BFS, `nx.
       single_source_shortest_path_length`, sin pesos porque solo importa si
       hay camino) sobre `grafo_seguro_invertido` (= `grafo_seguro.
       reverse(copy=False)`, tambien calculado UNA vez para toda la corrida)
       para resolver `tiene_alternativa_sin_cruce` de TODAS las escuelas con
       vado de una vez, en vez de un `nx.has_path` por escuela.
    3. Snap a nodo vial: UNA sola llamada vectorizada a `ox.distance.
       nearest_nodes` con listas de lat/lon (en vez de una llamada por
       escuela, que reconstruye el arbol de busqueda cada vez).

    Requiere que el llamador construya `grafo_invertido` y
    `grafo_seguro_invertido` UNA sola vez para toda la corrida (no por
    departamento) y los pase a cada llamada de esta funcion — ver
    `jobs/calcular_aislamiento.py::correr`.

    Devuelve una lista de dicts de metricas, en el mismo orden que
    `escuelas_depto`, con exactamente las mismas claves que
    `calcular_metricas_escuela`.

    `geometrias_out` (keyword-only, opcional, N3): si se pasa una lista, se
    agrega exactamente un dict por escuela, en el mismo orden que
    `escuelas_depto`, con la geometria REALMENTE usada — `{"ruta": {"type":
    "LineString", "coordinates": [...]} | None, "cruces": [{"lon", "lat",
    "clasificacion"}, ...], "motivo_sin_geometria": None | "sin_conexion_red" |
    "ruta_degenerada"}`. Los cruces se producen en la MISMA iteracion que los
    cuenta, por lo que su cantidad siempre coincide con `cruces_agua_count` y
    los de clasificacion "puente" con `cruces_agua_con_puente_count`. Export
    puramente aditivo: con `None` (default) el resultado es identico.
    """
    import networkx as nx
    import osmnx as ox

    cruces_por_arista = cruces_por_arista or {}

    if not escuelas_depto:
        return []

    lons = [e["lon"] for e in escuelas_depto]
    lats = [e["lat"] for e in escuelas_depto]
    nodos_escuela, dists_snap = ox.distance.nearest_nodes(
        grafo, X=lons, Y=lats, return_dist=True
    )

    distancias_cab, rutas_cab = nx.single_source_dijkstra(
        grafo_invertido, nodo_cabecera, weight="length"
    )

    alcanzables_seguro = None
    if grafo_seguro_invertido is not None:
        alcanzables_seguro = set(
            nx.single_source_shortest_path_length(grafo_seguro_invertido, nodo_cabecera)
        )

    resultados = []
    for escuela, nodo_escuela, dist_snap in zip(escuelas_depto, nodos_escuela, dists_snap):
        resultado = _resultado_vacio()
        snap_distancia_m = float(dist_snap)
        resultado["snap_distancia_m"] = snap_distancia_m

        if snap_distancia_m > UMBRAL_SNAP_SIN_CONEXION_M:
            resultado["motivo_sin_datos"] = "sin_conexion_red"
            resultados.append(resultado)
            if geometrias_out is not None:
                geometrias_out.append(
                    {"ruta": None, "cruces": [], "motivo_sin_geometria": "sin_conexion_red"}
                )
            continue

        if nodo_escuela not in distancias_cab:
            resultado["motivo_sin_datos"] = "sin_conexion_red"
            resultados.append(resultado)
            if geometrias_out is not None:
                geometrias_out.append(
                    {"ruta": None, "cruces": [], "motivo_sin_geometria": "sin_conexion_red"}
                )
            continue

        resultado["distancia_cabecera_departamental_m"] = distancias_cab[nodo_escuela]
        ruta_cabecera = list(reversed(rutas_cab[nodo_escuela]))

        tramos_sin_pavimentar = 0
        cruces_con_puente = 0
        cruces_con_vado = 0
        ya_vistos_ruta: list = []
        cruces_export: list = []
        for u, v in zip(ruta_cabecera[:-1], ruta_cabecera[1:]):
            datos_aristas = grafo.get_edge_data(u, v) or {}
            for k, datos in datos_aristas.items():
                if _es_tramo_sin_pavimentar(datos):
                    tramos_sin_pavimentar += 1
                crucesarista = cruces_por_arista.get((u, v, k), [])
                for cruce in _dedupe_cruces(crucesarista, ya_vistos_ruta, tolerancia_dedup_m):
                    if cruce["con_puente"]:
                        cruces_con_puente += 1
                    else:
                        cruces_con_vado += 1
                    if geometrias_out is not None:
                        punto_x, punto_y = cruce["punto"]
                        cruces_export.append(
                            {
                                "lon": round(punto_x, 6),
                                "lat": round(punto_y, 6),
                                "clasificacion": clasificar_cruce(cruce),
                            }
                        )

        cruces_count = cruces_con_puente + cruces_con_vado
        resultado["tramos_sin_pavimentar_count"] = tramos_sin_pavimentar
        resultado["cruces_agua_count"] = cruces_count
        resultado["cruces_agua_con_puente_count"] = cruces_con_puente
        resultado["cruces_agua_con_vado_count"] = cruces_con_vado
        resultado["distancia_via_pavimentada_m"] = resultado["distancia_cabecera_departamental_m"]

        if cruces_con_vado == 0:
            resultado["tiene_alternativa_sin_cruce"] = True
        elif alcanzables_seguro is not None:
            resultado["tiene_alternativa_sin_cruce"] = nodo_escuela in alcanzables_seguro
        else:
            # Fallback sin grafo_seguro_invertido precomputado (compatibilidad):
            # igual de correcto que la version per-escuela, pero mas lento.
            grafo_seguro = construir_grafo_seguro(grafo, cruces_por_arista)
            try:
                resultado["tiene_alternativa_sin_cruce"] = nx.has_path(
                    grafo_seguro, nodo_escuela, nodo_cabecera
                )
            except (nx.NetworkXError, nx.NodeNotFound):
                resultado["tiene_alternativa_sin_cruce"] = False

        if geometrias_out is not None:
            coordenadas = _coordenadas_ruta(grafo, ruta_cabecera)
            if len(coordenadas) < 2:
                ruta_geom = None
                motivo_geom = "ruta_degenerada"
            else:
                ruta_geom = {"type": "LineString", "coordinates": coordenadas}
                motivo_geom = None
            geometrias_out.append(
                {"ruta": ruta_geom, "cruces": cruces_export, "motivo_sin_geometria": motivo_geom}
            )

        resultados.append(resultado)

    return resultados
