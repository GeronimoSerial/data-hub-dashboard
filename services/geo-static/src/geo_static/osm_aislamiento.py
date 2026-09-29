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

## N3-B — red rural (track + service) y motivos verificables

La red se construye incluyendo `highway=track` y `service` (accesos rurales de
Corrientes, visibles en la cartografia base) ademas de las vias ya
consideradas. `pyrosm.config.osm_filters.driving_filter` excluye `track` y, por
defecto, `service`; con track+service el grafo pasa de 273k/590k a 443k nodos /
940k aristas y 8 de las 16 escuelas antes `sin_conexion_red` quedan a 21-2.217 m
de la red (p. ej. 1801075-00, a 118 m de un track, antes a 2.9 km; 1800521-00, a
26 m, antes a 3.9 km). Las exclusiones de vias privadas / `motor_vehicle=no`
del filtro de pyrosm se conservan.

`pyrosm.to_graph` conserva solo la componente gigante: las vias que existen en
OSM pero pertenecen a un componente aislado no se conectan (nunca se inventa un
enlace). Esas aristas se registran en `aristas_no_conectadas_out` y alimentan
los motivos `red_vial_no_conectada` / `sin_via_osm_cercana`, que reemplazan al
generico `sin_conexion_red` (que queda solo como fallback). Verificado: 3
escuelas de Ituzaingo tienen una `unclassified` sin pavimentar a 34-62 m, pero
esa via pertenece a un componente aislado (126 ways, 122,7 km) separado de la
red principal por 1.405 m.

## N3-C — snap a la arista mas cercana (no al nodo)

Con el grafo real (443k nodos / 940k aristas) sobre las 2001 escuelas, la
distancia de la escuela al NODO mas cercano vs a la ARISTA mas cercana difiere
p50 17 m, p90 59 m, p99 425 m, max 935 m; 112 escuelas > 100 m, 46 > 250 m, 15
> 500 m. Rutear desde el nodo mas cercano arranca a hasta 935 m del camino
donde la escuela realmente esta, sobreestima `snap_distancia_m` y la ruta
dibujada no empieza en el punto del camino mas cercano a la escuela.

`construir_indice_aristas` + `snap_a_arista` (y su version vectorizada por
lote) snapean cada escuela a su ARISTA dirigida mas cercana y rutean desde ahi:
salida por el extremo `v` de la arista por la que snapeo, o por `u` usando la
arista reversa si existe, eligiendo el menor costo `costo_parcial +
distancias_cab[salida]`. Es aditivo: con `indice_aristas=None` (default)
`calcular_metricas_departamento` se comporta EXACTAMENTE como antes.

## N3-D — fords de nodo y proyecciones vectorizadas

Dos cambios independientes:

1. Rendimiento (refactor puro): `construir_indice_aristas` y
   `construir_indice_no_conectadas` proyectaban cada geometria con una llamada
   Python a `shapely.ops.transform` (minutos sobre las 940k aristas reales).
   Ahora usan la forma vectorizada `shapely.transform` sobre el array de
   geometrias (`_proyectar_geometrias`), ~4 s sobre los mismos datos, con
   salidas identicas.
2. Bug de visualizacion: 4 cruces realmente vadeables quedaban etiquetados
   `sin_evidencia` porque su unico tag `ford=yes` estaba en un nodo OSM, no en
   la arista, y `pyrosm` no copia ese tag a los nodos del grafo.
   `construir_geometrias_agua_y_fords_local` lee en UNA sola pasada los cursos
   de agua y los nodos `ford=yes`; `construir_cruces_por_arista` marca el cruce
   como vado si hay un ford a menos de `TOLERANCIA_FORD_M`. Los conteos no
   cambian (`cruces_agua_con_vado_count` sigue contando vado y sin_evidencia
   juntos).

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

# Valores de `highway` considerados conduccibles tras leer el extracto local
# (N3-B). Incluye `track` y `service` ademas de las vias antes consideradas:
# los accesos rurales de Corrientes son mayoritariamente tracks y estan
# visibles en la cartografia base. Se mantienen las exclusiones de vias
# privadas / `motor_vehicle=no` del filtro de pyrosm. Los valores basura que
# aparecen en el extracto ('dummy', 'Charata', 'ladder') no estan en este set y
# se descartan al filtrar las aristas.
HIGHWAYS_CONDUCIBLES = {
    "motorway",
    "motorway_link",
    "trunk",
    "trunk_link",
    "primary",
    "primary_link",
    "secondary",
    "secondary_link",
    "tertiary",
    "tertiary_link",
    "unclassified",
    "residential",
    "living_street",
    "service",
    "road",
    "track",
}

# Motivos por los que una escuela queda sin indice (N3-B). Reemplazan al
# generico `sin_conexion_red` en el camino con extracto local: una via de OSM
# existe cerca pero pertenece a un componente NO conectado a la red principal
# (`red_vial_no_conectada`) o no hay ninguna via conduccible de OSM en el radio
# de snap (`sin_via_osm_cercana`: islas / banados / coordenada mal cargada).
MOTIVO_RED_NO_CONECTADA = "red_vial_no_conectada"
MOTIVO_SIN_VIA_CERCANA = "sin_via_osm_cercana"

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

# Tolerancia (m) para marcar un cruce como vado porque hay un nodo OSM
# `ford=yes` a menos de esa distancia del punto de cruce (N3-D). Evidencia de
# la auditoria del extracto: los 4 cruces mal etiquetados `sin_evidencia` que
# en realidad eran vados tenian su nodo `ford=yes` a 0.0-17.7 m del punto de
# cruce; 25 m cubre ese rango y queda por debajo de los ~30 m de la tolerancia
# de dedupe (TOLERANCIA_DEDUP_CRUCE_M), para no fusionar cruces distintos.
TOLERANCIA_FORD_M = 25.0

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
    aristas_no_conectadas_out: Optional[list] = None,
):
    """Construye la red vial conduccible desde un extracto local .osm.pbf (pyrosm).

    Camino de produccion desde G1-fix1: no golpea la red ni Overpass. El pbf
    (extracto Geofabrik de Argentina) se lee con pyrosm recortando por bbox y
    se devuelve un networkx.MultiDiGraph compatible con osmnx (nodos con x/y,
    aristas con atributos OSM como highway/surface/bridge), apto para
    `ox.distance.nearest_nodes` y el resto del calculo en osm_aislamiento.

    ## N3-B — red rural

    A diferencia de `driving_filter` por defecto, se incluyen `highway=track` y
    `service` (accesos rurales; ver nota de modulo) quitando `track` de la lista
    de exclusión y pidiendo `include_service_roads=True`; las exclusiones de
    vias privadas / `motor_vehicle=no` se conservan. Tras `get_network` se
    filtran las aristas a `HIGHWAYS_CONDUCIBLES`, lo que descarta los valores
    basura del extracto ('dummy', 'Charata', 'ladder').

    `pyrosm.to_graph` conserva solo la componente gigante. Si
    `aristas_no_conectadas_out` es una lista, se le agrega `(geometry, highway)`
    por cada arista conservada cuyo `u` o `v` NO sea nodo del grafo devuelto:
    son las vias conduccibles que existen en OSM pero no estan conectadas a la
    red principal (no se inventa ningun enlace). `u`/`v` son los ids OSM de los
    nodos y coinciden con las claves del grafo (verificado en pyrosm 0.13.1:
    `to_networkx` conserva `from_id_col='u'`/`to_id_col='v'` y usa el id OSM
    como clave de nodo).

    Ojo: pyrosm espera el bbox en orden [oeste, sur, este, norte], distinto
    del orden (norte, sur, este, oeste) que usa el resto del modulo.
    """
    from pyrosm import OSM
    from pyrosm.config.osm_filters import driving_filter, MultiValue

    filtro = driving_filter(include_service_roads=True)
    filtro["highway"] = MultiValue([h for h in filtro["highway"] if h != "track"])

    osm = OSM(
        pbf_path,
        bounding_box=[bbox_oeste, bbox_sur, bbox_este, bbox_norte],
    )
    nodes, edges = osm.get_network(
        network_type="driving",
        custom_filter=filtro,
        filter_type="exclude",
        nodes=True,
        extra_attributes=["surface", "bridge", "tunnel", "ford"],
    )
    edges = edges[edges["highway"].isin(HIGHWAYS_CONDUCIBLES)]
    grafo = osm.to_graph(nodes, edges, graph_type="networkx", osmnx_compatible=True)

    if aristas_no_conectadas_out is not None:
        nodos_grafo = set(grafo.nodes)
        for _, arista in edges.iterrows():
            if arista["u"] not in nodos_grafo or arista["v"] not in nodos_grafo:
                aristas_no_conectadas_out.append(
                    (arista["geometry"], _primer_valor(arista["highway"]))
                )
    return grafo


def construir_indice_no_conectadas(aristas_no_conectadas: list) -> dict:
    """Indice espacial (STRtree) de las vias conduccibles NO conectadas a la red
    principal (N3-B).

    `aristas_no_conectadas` es la lista `(geometry, highway)` que llena
    `construir_red_local`. Se proyecta cada geometria a EPSG:32721 (UTM 21S) y
    se construye un `shapely.strtree.STRtree`; la distorsion de distancia a esta
    escala (5 km) sobre Corrientes es despreciable frente a los umbrales usados.
    Devuelve el arbol junto con las geometrias proyectadas, la clase (`highway`)
    de cada una y el transformador, para reutilizar en cada clasificacion sin
    reproyectar.
    """
    from pyproj import Transformer
    from shapely.strtree import STRtree

    transformer = Transformer.from_crs(4326, 32721, always_xy=True)
    originales = []
    clases = []
    for geometria, highway in aristas_no_conectadas:
        if geometria is None:
            continue
        originales.append(geometria)
        clases.append(highway)
    geometrias = _proyectar_geometrias(originales, transformer)
    return {
        "arbol": STRtree(geometrias),
        "geometrias": geometrias,
        "clases": clases,
        "transformer": transformer,
    }


def clasificar_sin_conexion(
    lat: float,
    lon: float,
    indice,
    umbral_m: float = UMBRAL_SNAP_SIN_CONEXION_M,
) -> tuple[str, dict]:
    """Clasifica por que una escuela quedo `sin_conexion_red` (N3-B).

    - Una via conduccible NO conectada a la red principal a menos de `umbral_m`
      de la escuela -> `MOTIVO_RED_NO_CONECTADA`: hay camino en OSM pero
      pertenece a un componente aislado (la ruta es imposible sin inventar un
      enlace). Los datos incluyen la distancia al punto mas cercano de esa via,
      su clase (`highway`) y ese punto en lon/lat.
    - Caso contrario (o indice vacio) -> `MOTIVO_SIN_VIA_CERCANA`: no hay
      ninguna via conduccible de OSM en el radio de snap.
    """
    sin_via = {"via_no_conectada_m": None, "via_no_conectada_clase": None}
    if indice is None or not indice["geometrias"]:
        return MOTIVO_SIN_VIA_CERCANA, dict(sin_via)

    from shapely.geometry import Point
    from shapely.ops import nearest_points

    transformer = indice["transformer"]
    punto = Point(*transformer.transform(lon, lat))
    idx = indice["arbol"].nearest(punto)
    if idx is None:
        return MOTIVO_SIN_VIA_CERCANA, dict(sin_via)

    geometria = indice["geometrias"][idx]
    distancia_m = float(punto.distance(geometria))
    if distancia_m > umbral_m:
        return MOTIVO_SIN_VIA_CERCANA, dict(sin_via)

    _, punto_cercano = nearest_points(punto, geometria)
    lon_cercano, lat_cercano = transformer.transform(
        punto_cercano.x, punto_cercano.y, direction="INVERSE"
    )
    return MOTIVO_RED_NO_CONECTADA, {
        "via_no_conectada_m": distancia_m,
        "via_no_conectada_clase": indice["clases"][idx],
        "punto_via_lon": float(lon_cercano),
        "punto_via_lat": float(lat_cercano),
    }


def construir_geometrias_agua_y_fords_local(
    pbf_path: str,
    bbox_norte: float,
    bbox_sur: float,
    bbox_este: float,
    bbox_oeste: float,
) -> tuple[list, list]:
    """Extrae, en UNA sola lectura del extracto local .osm.pbf, tanto los
    cursos de agua (`WATERWAYS_CRUCE`, como entidades separadas de la red
    vial; ver nota de modulo G1-fix2) como los nodos `ford=yes` (N3-D).

    Devuelve `(agua, fords)`:

    - `agua`: geometrias shapely LineString/MultiLineString de los ways cuyo
      `waterway` esta en `WATERWAYS_CRUCE` (nunca la red vial).
    - `fords`: geometrias shapely Point (lon/lat) de los nodos cuyo `ford` es
      "yes". Antes de N3-D los vados a nivel de nodo eran invisibles:
      `_tiene_ford` solo miraba los tags de la arista y los atributos del nodo
      del grafo, y `pyrosm` no copia el tag `ford` a los nodos viales.

    El filtro conserva nodes y ways (`keep_nodes=True`, `keep_ways=True` por
    defecto en pyrosm 0.13.1, verificado en `pyrosm/engine/readers.py`). Mismo
    orden de bbox que `construir_red_local`: pyrosm espera
    [oeste, sur, este, norte].
    """
    from pyrosm import OSM

    osm = OSM(
        pbf_path,
        bounding_box=[bbox_oeste, bbox_sur, bbox_este, bbox_norte],
    )
    datos = osm.get_data_by_custom_criteria(
        custom_filter={"waterway": list(WATERWAYS_CRUCE), "ford": ["yes"]},
        osm_keys_to_keep=["waterway", "ford"],
        filter_type="keep",
        keep_nodes=True,
        keep_relations=False,
    )
    agua: list = []
    fords: list = []
    if datos is None or datos.empty:
        return agua, fords
    for _, fila in datos.iterrows():
        geometria = fila.get("geometry")
        if geometria is None or geometria.is_empty:
            continue
        if geometria.geom_type in ("LineString", "MultiLineString"):
            if _primer_valor(fila.get("waterway")) in WATERWAYS_CRUCE:
                agua.append(geometria)
        elif geometria.geom_type == "Point" and _primer_valor(fila.get("ford")) == "yes":
            fords.append(geometria)
    return agua, fords


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

    Se mantiene como envoltorio publico de
    `construir_geometrias_agua_y_fords_local` (N3-D): lee el extracto UNA sola
    vez y descarta los fords. Para obtener tambien los nodos `ford=yes` usar la
    funcion subyacente.

    Mismo orden de bbox que `construir_red_local`: pyrosm espera
    [oeste, sur, este, norte].
    """
    agua, _ = construir_geometrias_agua_y_fords_local(
        pbf_path, bbox_norte, bbox_sur, bbox_este, bbox_oeste
    )
    return agua


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


def _clasificar_fords_cercanos(puntos, puntos_ford, tolerancia_ford_m: float) -> list:
    """Para cada punto de cruce, devuelve `True` si hay un nodo `ford=yes` a
    menos de `tolerancia_ford_m` metros (N3-D).

    Proyecta de una sola vez, con la forma vectorizada de `_proyectar_geometrias`
    (EPSG:32721), tanto los puntos de cruce como los fords, y consulta el
    `STRtree` de fords con `query_nearest(..., max_distance=...)`. Con
    `puntos_ford` vacio o `None` devuelve todos `False`, de modo que el
    comportamiento es identico al anterior a N3-D.
    """
    if not puntos_ford or not puntos:
        return [False] * len(puntos)

    from pyproj import Transformer
    from shapely.strtree import STRtree

    transformer = Transformer.from_crs(4326, 32721, always_xy=True)
    arbol_ford = STRtree(_proyectar_geometrias(list(puntos_ford), transformer))
    puntos_proyectados = _proyectar_geometrias(list(puntos), transformer)
    return [
        bool(len(arbol_ford.query_nearest(punto, max_distance=tolerancia_ford_m)))
        for punto in puntos_proyectados
    ]


def construir_cruces_por_arista(
    grafo,
    arbol_agua,
    geometrias_agua,
    puntos_ford=None,
    tolerancia_ford_m: float = TOLERANCIA_FORD_M,
) -> dict:
    """Clasifica, UNA sola vez para todo el grafo (no por escuela), que
    aristas viales cruzan un curso de agua y con que tipo de cruce.

    Devuelve un dict `{(u, v, k): [ {"agua_idx", "punto", "con_puente",
    "es_ford"}, ... ]}` con una entrada solo para las aristas que
    efectivamente intersectan algun curso de agua. `punto` es un
    `(x, y)` representativo de la interseccion, usado despues para
    deduplicar cruces del mismo curso de agua muy cercanos entre si.

    `puntos_ford` (N3-D): lista opcional de geometrias shapely Point (lon/lat)
    de nodos OSM `ford=yes`. Cuando se pasa, un cruce se marca `es_ford=True`
    tambien si hay un ford a menos de `tolerancia_ford_m` del punto de cruce
    (los nodos `ford=yes` no llegan a los tags de la arista ni a los atributos
    del nodo del grafo, ver nota de modulo N3-D). Con `None`/vacio el
    comportamiento es EXACTAMENTE el anterior.
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

    # Se recolectan primero los puntos de interseccion para proyectarlos y
    # buscar fords en bloque (N3-D), en vez de reproyectar dentro del bucle.
    entradas = []
    for idx_arista, idx_agua in zip(pares_arista, pares_agua):
        u, v, k, datos = claves[idx_arista]
        geom_arista = geometrias_aristas[idx_arista]
        geom_agua = geometrias_agua[idx_agua]
        interseccion = geom_arista.intersection(geom_agua)
        if interseccion.is_empty:
            continue
        entradas.append((u, v, k, datos, int(idx_agua), interseccion.centroid))

    es_ford_cerca = _clasificar_fords_cercanos(
        [entrada[5] for entrada in entradas], puntos_ford, tolerancia_ford_m
    )

    for (u, v, k, datos, idx_agua, punto), cerca in zip(entradas, es_ford_cerca):
        cruces.setdefault((u, v, k), []).append(
            {
                "agua_idx": idx_agua,
                "punto": (punto.x, punto.y),
                "con_puente": _tiene_puente(datos),
                "es_ford": _tiene_ford(datos, grafo, u, v) or cerca,
            }
        )
    return cruces


# ---------------------------------------------------------------------------
# N3-C — snap a la ARISTA mas cercana (no al nodo)
# ---------------------------------------------------------------------------


def _proyectar_geometria(geom, transformer):
    """Proyecta una geometria lon/lat a un CRS metrico con el transformer dado
    (envuelve `shapely.ops.transform`, consistente con el resto del modulo)."""
    from shapely.ops import transform as shapely_transform

    return shapely_transform(transformer.transform, geom)


def _proyectar_geometrias(geometrias, transformer) -> list:
    """Proyecta una LISTA de geometrias lon/lat a un CRS metrico de una sola
    vez, con la forma vectorizada de `shapely.transform` (N3-D): un unico
    llamado sobre el array de coordenadas en vez de una llamada Python
    `shapely.ops.transform` por geometria.

    Equivalente a `[_proyectar_geometria(g, transformer) for g in geometrias]`
    (verificado con `equals_exact(..., 1e-6)`), pero sobre el grafo real
    (940k aristas) pasa de minutos a ~4 s. Devuelve `[]` para una lista vacia.
    """
    import numpy as np
    import shapely

    if not geometrias:
        return []
    return list(
        shapely.transform(
            np.array(geometrias, dtype=object),
            lambda coords: np.column_stack(
                transformer.transform(coords[:, 0], coords[:, 1])
            ),
        )
    )


def construir_indice_aristas(grafo) -> dict:
    """Indice espacial (STRtree) de TODAS las aristas dirigidas, proyectadas a
    EPSG:32721 (UTM 21S), para snapear una escuela a la ARISTA mas cercana en
    vez del NODO mas cercano (N3-C).

    Evidencia (grafo real 443k nodos / 940k aristas, 2001 escuelas): la
    distancia escuela -> nodo vs escuela -> arista difiere p50 17 m, p90 59 m,
    p99 425 m, max 935 m; 112 escuelas > 100 m, 46 > 250 m, 15 > 500 m.

    Se construye UNA sola vez por corrida. Devuelve `claves` (lista de
    `(u, v, k)` en el mismo orden que el arbol), `geometrias` (lon/lat
    originales), `proyectadas` (EPSG:32721) y el `transformer`, para reutilizar
    en cada snap sin reproyectar.
    """
    from pyproj import Transformer
    from shapely.strtree import STRtree

    transformer = Transformer.from_crs(4326, 32721, always_xy=True)
    claves = []
    geometrias = []
    for u, v, k, datos in grafo.edges(keys=True, data=True):
        geometria = _geometria_arista(datos, grafo, u, v)
        claves.append((u, v, k))
        geometrias.append(geometria)
    proyectadas = _proyectar_geometrias(geometrias, transformer)
    return {
        "arbol": STRtree(proyectadas),
        "claves": claves,
        "geometrias": geometrias,
        "proyectadas": proyectadas,
        "transformer": transformer,
    }


def _snap_arista_batch(grafo, indice, lats, lons) -> list:
    """Snap vectorizado de varias escuelas a su arista dirigida mas cercana.

    Hace UNA sola llamada `query_nearest` con todos los puntos proyectados (no
    una por escuela) y devuelve una lista de dicts en el mismo orden que
    `lats`/`lons`; `None` para una escuela sin arista (indice vacio).
    """
    from shapely.geometry import Point

    if not indice["claves"]:
        return [None] * len(lats)
    if not lats:
        return []

    transformer = indice["transformer"]
    puntos = [Point(*transformer.transform(lon, lat)) for lat, lon in zip(lats, lons)]
    indices, distancias = indice["arbol"].query_nearest(puntos, return_distance=True)

    # `query_nearest` con entrada vectorizada devuelve un array de forma
    # (2, n): la fila 0 son los indices de entrada y la fila 1 los del arbol.
    # Con `all_matches=True` (default) una entrada puede repetirse si hay
    # empates; se conserva la de menor distancia.
    mejores: dict = {}
    for col in range(indices.shape[1]):
        idx_entrada = int(indices[0, col])
        idx_arbol = int(indices[1, col])
        distancia = float(distancias[col])
        actual = mejores.get(idx_entrada)
        if actual is None or distancia < actual[1]:
            mejores[idx_entrada] = (idx_arbol, distancia)

    resultados = []
    for i in range(len(lats)):
        mejor = mejores.get(i)
        if mejor is None:
            resultados.append(None)
            continue
        idx_arbol, distancia = mejor
        geometria_proyectada = indice["proyectadas"][idx_arbol]
        geometria = indice["geometrias"][idx_arbol]
        frac = geometria_proyectada.project(puntos[i], normalized=True)
        frac = min(1.0, max(0.0, float(frac)))
        punto_original = geometria.interpolate(frac, normalized=True)
        u, v, k = indice["claves"][idx_arbol]
        resultados.append(
            {
                "u": u,
                "v": v,
                "k": k,
                "frac": frac,
                "distancia_m": distancia,
                "lon": float(punto_original.x),
                "lat": float(punto_original.y),
            }
        )
    return resultados


def snap_a_arista(grafo, indice, lat, lon) -> dict:
    """Snap de UNA escuela a su arista dirigida mas cercana (N3-C).

    Devuelve `{"u","v","k","frac","distancia_m","lon","lat"}`: `frac` es la
    posicion normalizada sobre la arista (0 en `u`, 1 en `v`), `distancia_m` la
    distancia perpendicular en metros (espacio proyectado) y `lon`/`lat` el
    punto de proyeccion sobre la geometria ORIGINAL. Para un lote de escuelas
    usar `_snap_arista_batch` (una sola consulta vectorizada)."""
    return _snap_arista_batch(grafo, indice, [lat], [lon])[0]


def _coordenadas_geometria(geom) -> list:
    """Coordenadas `[lon, lat]` redondeadas a 6 decimales de una geometria
    puntual o lineal, salteando una coordenada igual a la anterior."""
    if geom is None or geom.is_empty:
        return []
    if geom.geom_type == "Point":
        puntos = [geom.coords[0]]
    else:
        puntos = list(geom.coords)
    coords = []
    for lon, lat in puntos:
        coord = [round(lon, 6), round(lat, 6)]
        if coords and coords[-1] == coord:
            continue
        coords.append(coord)
    return coords


def _cruces_en_tramo_parcial(
    indice, geometria_proyectada, frac, sentido_adelante, cruces_arista
) -> list:
    """Cruces de agua de la arista snapeada que caen DENTRO del tramo
    realmente recorrido por la escuela (N3-C): `t >= frac` si sale por `v`
    (sentido adelante), `t <= frac` si sale por `u` (sentido reverso). `t` es
    la posicion normalizada del cruce proyectado sobre la arista."""
    if not cruces_arista:
        return []
    from shapely.geometry import Point

    transformer = indice["transformer"]
    seleccion = []
    for cruce in cruces_arista:
        px, py = cruce["punto"]
        punto = Point(*transformer.transform(px, py))
        t = geometria_proyectada.project(punto, normalized=True)
        if (t >= frac) if sentido_adelante else (t <= frac):
            seleccion.append(cruce)
    return seleccion


def _evaluar_escuela_arista(
    grafo,
    snap,
    distancias_cab,
    rutas_cab,
    alcanzables_seguro,
    cruces_por_arista,
    indice,
    tolerancia_dedup_m,
    nodo_cabecera,
) -> tuple:
    """Metricas y registro de geometria de UNA escuela snapeada a su arista.

    Modela las dos salidas posibles desde la posicion `frac` de la arista
    dirigida `E=(u,v,k)`: hacia `v` por `E` (siempre permitida) o hacia `u` por
    la arista reversa `Er=(v,u,kr)` (si existe), eligiendo la de menor costo
    total `costo_parcial + distancias_cab[salida]`. Devuelve
    `(resultado, registro_geometria)`. Si ningun extremo esta en
    `distancias_cab` la escuela queda `sin_conexion_red`, igual que hoy.
    """
    import networkx as nx
    from shapely.ops import substring

    resultado = _resultado_vacio()
    geometria = {"ruta": None, "cruces": [], "motivo_sin_geometria": None}
    resultado["snap_distancia_m"] = snap["distancia_m"]

    if snap["distancia_m"] > UMBRAL_SNAP_SIN_CONEXION_M:
        resultado["motivo_sin_datos"] = "sin_conexion_red"
        geometria["motivo_sin_geometria"] = "sin_conexion_red"
        return resultado, geometria

    u, v, k = snap["u"], snap["v"], snap["k"]
    frac = snap["frac"]
    datos_e = (grafo.get_edge_data(u, v) or {}).get(k, {})
    geometria_e = _geometria_arista(datos_e, grafo, u, v)

    opciones = []
    if v in distancias_cab:
        opciones.append(
            {
                "exit": v,
                "costo": (1.0 - frac) * float(datos_e.get("length", 0.0)),
                "datos": datos_e,
                "clave": (u, v, k),
                "sentido_adelante": True,
            }
        )

    datos_aristas_er = grafo.get_edge_data(v, u) or {}
    if datos_aristas_er and u in distancias_cab:
        kr = min(
            datos_aristas_er,
            key=lambda kk: datos_aristas_er[kk].get("length", math.inf),
        )
        datos_er = datos_aristas_er[kr]
        opciones.append(
            {
                "exit": u,
                "costo": frac * float(datos_er.get("length", 0.0)),
                "datos": datos_er,
                "clave": (v, u, kr),
                "sentido_adelante": False,
            }
        )

    if not opciones:
        resultado["motivo_sin_datos"] = "sin_conexion_red"
        geometria["motivo_sin_geometria"] = "sin_conexion_red"
        return resultado, geometria

    mejor = min(opciones, key=lambda op: op["costo"] + distancias_cab[op["exit"]])
    costo_total = mejor["costo"] + distancias_cab[mejor["exit"]]
    resultado["distancia_cabecera_departamental_m"] = costo_total
    resultado["distancia_via_pavimentada_m"] = costo_total

    ruta_desde_exit = list(reversed(rutas_cab[mejor["exit"]]))

    tramos_sin_pavimentar = 0
    cruces_con_puente = 0
    cruces_con_vado = 0
    ya_vistos_ruta: list = []
    cruces_export: list = []
    parcial_todos_puente = True

    if _es_tramo_sin_pavimentar(mejor["datos"]):
        tramos_sin_pavimentar += 1

    geometria_proyectada_e = _proyectar_geometria(geometria_e, indice["transformer"])
    cruces_parciales = _cruces_en_tramo_parcial(
        indice,
        geometria_proyectada_e,
        frac,
        mejor["sentido_adelante"],
        cruces_por_arista.get(mejor["clave"], []),
    )
    for cruce in _dedupe_cruces(cruces_parciales, ya_vistos_ruta, tolerancia_dedup_m):
        if cruce["con_puente"]:
            cruces_con_puente += 1
        else:
            cruces_con_vado += 1
            parcial_todos_puente = False
        punto_x, punto_y = cruce["punto"]
        cruces_export.append(
            {
                "lon": round(punto_x, 6),
                "lat": round(punto_y, 6),
                "clasificacion": clasificar_cruce(cruce),
            }
        )

    for a, b in zip(ruta_desde_exit[:-1], ruta_desde_exit[1:]):
        datos_aristas = grafo.get_edge_data(a, b) or {}
        for kk, datos in datos_aristas.items():
            if _es_tramo_sin_pavimentar(datos):
                tramos_sin_pavimentar += 1
            crucesarista = cruces_por_arista.get((a, b, kk), [])
            for cruce in _dedupe_cruces(crucesarista, ya_vistos_ruta, tolerancia_dedup_m):
                if cruce["con_puente"]:
                    cruces_con_puente += 1
                else:
                    cruces_con_vado += 1
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

    if cruces_con_vado == 0:
        resultado["tiene_alternativa_sin_cruce"] = True
    elif alcanzables_seguro is not None:
        resultado["tiene_alternativa_sin_cruce"] = (
            mejor["exit"] in alcanzables_seguro and parcial_todos_puente
        )
    else:
        grafo_seguro = construir_grafo_seguro(grafo, cruces_por_arista)
        try:
            resultado["tiene_alternativa_sin_cruce"] = nx.has_path(
                grafo_seguro, mejor["exit"], nodo_cabecera
            )
        except (nx.NetworkXError, nx.NodeNotFound):
            resultado["tiene_alternativa_sin_cruce"] = False

    # Geometria: tramo parcial (desde el punto de proyeccion hasta el extremo
    # de salida) + ruta desde el nodo de salida. Nunca se dibuja un segmento
    # recto escuela -> via.
    if mejor["sentido_adelante"]:
        parcial = substring(geometria_e, frac, 1, normalized=True)
    else:
        parcial = substring(geometria_e, frac, 0, normalized=True)
    coordenadas = _coordenadas_geometria(parcial)
    for coord in _coordenadas_ruta(grafo, ruta_desde_exit):
        if coordenadas and coordenadas[-1] == coord:
            continue
        coordenadas.append(coord)
    if len(coordenadas) < 2:
        geometria["ruta"] = None
        geometria["motivo_sin_geometria"] = "ruta_degenerada"
    else:
        geometria["ruta"] = {"type": "LineString", "coordinates": coordenadas}
    geometria["cruces"] = cruces_export
    return resultado, geometria


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
    indice_aristas: Optional[dict] = None,
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

    ## N3-C — snap a la arista mas cercana (keyword-only `indice_aristas`)

    Cuando `indice_aristas` (resultado de `construir_indice_aristas`) se pasa,
    cada escuela se snapea a su ARISTA dirigida mas cercana en vez del nodo mas
    cercano y se rutea desde ahi (salida por `v`, o por `u` via la arista
    reversa si existe, eligiendo el menor costo). Evidencia sobre el grafo real
    (443k nodos / 940k aristas, 2001 escuelas): la distancia al nodo vs a la
    arista difiere p50 17 m, p90 59 m, p99 425 m, max 935 m. Con `None` la
    funcion se comporta EXACTAMENTE como antes.
    """
    import networkx as nx
    import osmnx as ox

    cruces_por_arista = cruces_por_arista or {}

    if not escuelas_depto:
        return []

    if indice_aristas is not None:
        return _calcular_metricas_departamento_por_arista(
            grafo,
            grafo_invertido,
            escuelas_depto,
            nodo_cabecera,
            cruces_por_arista,
            grafo_seguro_invertido,
            tolerancia_dedup_m,
            geometrias_out,
            indice_aristas,
        )

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


def _calcular_metricas_departamento_por_arista(
    grafo,
    grafo_invertido,
    escuelas_depto: list,
    nodo_cabecera,
    cruces_por_arista: dict,
    grafo_seguro_invertido,
    tolerancia_dedup_m: float,
    geometrias_out: Optional[list],
    indice_aristas: dict,
) -> list:
    """Camino N3-C de `calcular_metricas_departamento`: snap a la ARISTA mas
    cercana (una sola consulta vectorizada para todas las escuelas) y ruteo
    desde el extremo de la arista elegido. `distancias_cab`/`rutas_cab` ya
    vienen del Dijkstra invertido desde la sede (distancia/camino de cada nodo
    hacia la sede), por lo que el costo de cada salida es `costo_parcial +
    distancias_cab[salida]`.

    Devuelve una lista de dicts en el mismo orden que `escuelas_depto` con las
    mismas claves que `calcular_metricas_escuela`; si `geometrias_out` no es
    `None`, agrega un registro de geometria por escuela (mismo formato que el
    camino batched)."""
    import networkx as nx

    lats = [e["lat"] for e in escuelas_depto]
    lons = [e["lon"] for e in escuelas_depto]
    snaps = _snap_arista_batch(grafo, indice_aristas, lats, lons)

    distancias_cab, rutas_cab = nx.single_source_dijkstra(
        grafo_invertido, nodo_cabecera, weight="length"
    )

    alcanzables_seguro = None
    if grafo_seguro_invertido is not None:
        alcanzables_seguro = set(
            nx.single_source_shortest_path_length(grafo_seguro_invertido, nodo_cabecera)
        )

    resultados = []
    for escuela, snap in zip(escuelas_depto, snaps):
        if snap is None:
            resultado = _resultado_vacio()
            resultado["motivo_sin_datos"] = "sin_conexion_red"
            resultados.append(resultado)
            if geometrias_out is not None:
                geometrias_out.append(
                    {"ruta": None, "cruces": [], "motivo_sin_geometria": "sin_conexion_red"}
                )
            continue

        resultado, geometria = _evaluar_escuela_arista(
            grafo,
            snap,
            distancias_cab,
            rutas_cab,
            alcanzables_seguro,
            cruces_por_arista,
            indice_aristas,
            tolerancia_dedup_m,
            nodo_cabecera,
        )
        resultados.append(resultado)
        if geometrias_out is not None:
            geometrias_out.append(geometria)
    return resultados
