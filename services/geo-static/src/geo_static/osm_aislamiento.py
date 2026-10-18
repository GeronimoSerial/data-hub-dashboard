"""Indice de aislamiento territorial derivado de OpenStreetMap (batch G1 ENOS).

Ver docs/ejecucion-enos/G1/contrato-datos.md para el contrato de salida y la
escala 0-3 del indice. Este modulo separa deliberadamente el calculo puro
(testeable sin red) de la construccion de la red (que si requiere red/Overpass
via osmnx).

## G1-fix2 — cruces de agua (ver docs/ejecucion-enos/G1/registro.md)

Bug corregido en esta version: en OSM los cursos de agua relevantes para el
indice (`waterway=river|stream|canal`) son ENTIDADES SEPARADAS (ways propios), nunca un
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
   como vado si hay un ford a menos de `TOLERANCIA_FORD_M`; sin esa evidencia,
   el cruce conserva la clase `sin_evidencia`.

## N3-E — orientacion de la geometria al sentido de la arista

Bug corregido: en `construir_indice_aristas` / `_snap_arista_batch` /
`_evaluar_escuela_arista` (N3-C), `frac` es la posicion sobre la geometria de
la arista y se asumia que corria de `u` a `v`. En el grafo real de pyrosm eso
es falso: la copia reversa de una via de doble mano conserva la orientacion de
la copia directa (el primer vertice de `geometry` esta en `v`, verificado en
1801072-00, 1801623-01, 1801078-00, 1801075-00). Con `frac` invertido el costo
parcial `(1 - frac) * length` y el tramo dibujado describen el lado equivocado
de la arista, y la longitud exportada quedaba 3-13 % por encima de
`distancia_cabecera_departamental_m` para ~5-15 % de las escuelas.
`_orientar_geometria` revierte la geometria cuando su primer vertice esta mas
cerca de `v` que de `u` (`shapely.reverse`) ANTES de proyectar; `geometrias` y
`proyectadas` guardan la geometria orientada (0 en `u`, 1 en `v`) y
`indice["pos"]` mapea `(u, v, k)` a su posicion. Una arista cerrada (`u == v`)
se deja como esta.

## N3-G — las entidades ford=yes no se cargaban (lectura combinada)

Bug corregido: `construir_geometrias_agua_y_fords_local` (N3-D) leia cursos de
agua y entidades `ford=yes` con UNA sola llamada
`get_data_by_custom_criteria(custom_filter={"waterway": [...], "ford":
["yes"]}, keep_nodes=True, ...)`. Sobre el extracto real de Corrientes esa
llamada combinada NO devuelve los nodos `ford=yes` (la corrida real logueo
`0 fords (nodos ford=yes)`), mientras que una lectura de una sola clave
(`custom_filter={"ford": ["yes"]}`) devuelve 213 entidades en Corrientes
(202 `Point` y 11 ways). Ahora se hacen DOS lecturas de una clave cada una
(agua y fords por separado), y las geometrías de los ways también se usan
para confirmar cruces.

## Optimizacion de rendimiento (N1) — busquedas batched por departamento

`calcular_metricas_escuela` (per-escuela, se mantiene para compatibilidad y
tests unitarios) hace un `nx.shortest_path` punto-a-punto por escuela contra
el grafo completo: ~0.5-1s por escuela sobre ~590k aristas, ~1200s
acumulados en la corrida real de 2001 escuelas. `calcular_metricas_departamento`
(camino de produccion, ver su docstring) calcula lo mismo para todas las
escuelas de un departamento con una unica busqueda multi-destino compartida
(25 busquedas en total en vez de 2000), documentado en
docs/ejecucion-enos/G1/registro.md.

`UMBRAL_KM_SIN_PAVIMENTAR_NIVEL0` (2 km) y
`UMBRAL_KM_SIN_PAVIMENTAR_NIVEL2` (15 km) fijan los umbrales de longitud
para los niveles 0 y 2. Las longitudes excluyen los ultimos 1.000 m de la
ruta como aproximacion al nucleo urbano del destino, ya que las localidades
solo tienen centroides, no poligonos urbanos. D7 deja
`tiene_alternativa_sin_cruce` en null si la ruta no tiene vados; la
disponibilidad de una ruta completamente pavimentada se informa por separado.
"""

from __future__ import annotations

import math
import re
from typing import Optional

UMBRAL_SNAP_SIN_CONEXION_M = 5000.0
UMBRAL_VIA_PAVIMENTADA_CERCANA_M = 10000.0
UMBRAL_DISTANCIA_RED_PAVIMENTADA_NIVEL0_M = 2000.0
UMBRAL_VIA_NO_ALCANZABLE_M = 30000.0
UMBRAL_KM_SIN_PAVIMENTAR_NIVEL0 = 2.0
UMBRAL_KM_SIN_PAVIMENTAR_NIVEL2 = 15.0
METROS_NUCLEO_URBANO_DESTINO = 1000.0
SUPERFICIES_NO_PAVIMENTADAS = {
    "unpaved", "dirt", "ground", "gravel", "sand",
    "compacted", "fine_gravel", "earth", "mud", "grass",
}
FACTOR_VIA = {
    "motorway": 1.0,
    "trunk": 1.0,
    "primary": 1.0,
    "secondary": 1.2,
    "tertiary": 1.5,
    "unclassified": 2.0,
    "residential": 2.0,
    "track": 3.0,
    "service": 3.0,
}


def asignar_costo(grafo) -> None:
    """Asigna una vez el costo de ruteo a cada arista del grafo.

    Los tipos OSM desconocidos reciben 3.0 (el mayor factor definido), para
    tratarlos de forma conservadora. `length` se conserva para reportar
    distancias físicas.
    """
    for _, _, _, datos in grafo.edges(keys=True, data=True):
        highway = _primer_valor(datos.get("highway"))
        factor = FACTOR_VIA.get(highway, 3.0)
        surface = _primer_valor(datos.get("surface"))
        if highway != "track" and surface in SUPERFICIES_NO_PAVIMENTADAS:
            factor *= 1.5
        datos["costo"] = float(datos.get("length", 0.0)) * factor


def _peso_ruta(grafo) -> str:
    """Usa costo si está completo; preserva `length` en grafos legacy."""
    if all("costo" in datos for _, _, _, datos in grafo.edges(keys=True, data=True)):
        return "costo"
    return "length"


def _longitud_ruta(grafo, ruta) -> float:
    """Suma la longitud real siguiendo la arista de menor costo por tramo."""
    longitud = 0.0
    for u, v in zip(ruta[:-1], ruta[1:]):
        aristas = (grafo.get_edge_data(u, v) or {}).values()
        datos = list(aristas)
        if not datos:
            continue
        elegida = min(datos, key=lambda d: d.get("costo", d.get("length", math.inf)))
        longitud += float(elegida.get("length", 0.0))
    return longitud


def _km_sin_pavimentar_ruta(tramos: list[tuple[dict, float]]) -> float:
    """Suma km sin pavimentar, descontando el tramo terminal urbano de 1 km.

    `tramos` va en orden escuela-origen a destino; el destino urbano se
    representa por el nodo al que se hizo snap su centroide.
    """
    urbano_restante = METROS_NUCLEO_URBANO_DESTINO
    metros = 0.0
    for datos, longitud in reversed(tramos):
        longitud = max(0.0, float(longitud))
        excluido = min(urbano_restante, longitud)
        urbano_restante -= excluido
        if _es_tramo_sin_pavimentar(datos):
            metros += longitud - excluido
    return metros / 1000.0


def construir_grafo_pavimentado(grafo):
    """Vista del grafo que excluye vias sin pavimentar para D7."""
    import networkx as nx

    return nx.subgraph_view(
        grafo,
        filter_edge=lambda u, v, k: not _es_tramo_sin_pavimentar(
            grafo.get_edge_data(u, v)[k]
        ),
    )


def distancias_hasta_red_pavimentada(grafo) -> dict:
    """Distancia de red desde cada nodo alcanzable hasta la primera via pavimentada.

    Los nodos incidentes a una arista pavimentada son fuentes de distancia cero.
    Se recorre el grafo invertido para medir el camino dirigido desde cada nodo
    hacia alguna de esas fuentes usando longitud fisica, no el costo de ruteo.
    """
    import networkx as nx

    nodos_pavimentados = {
        nodo
        for u, v, datos in grafo.edges(data=True)
        if not _es_tramo_sin_pavimentar(datos)
        for nodo in (u, v)
    }
    if not nodos_pavimentados:
        return {}
    return nx.multi_source_dijkstra_path_length(
        grafo.reverse(copy=False), nodos_pavimentados, weight="length"
    )


def distancia_pavimentada_desde_snap(grafo, snap, distancias_pavimentadas) -> Optional[float]:
    """Distancia real desde un snap de arista hasta la red pavimentada."""
    if not snap or snap["distancia_m"] > UMBRAL_SNAP_SIN_CONEXION_M:
        return None
    u, v, k = snap["u"], snap["v"], snap["k"]
    datos = (grafo.get_edge_data(u, v) or {}).get(k, {})
    if not _es_tramo_sin_pavimentar(datos):
        return 0.0
    frac = float(snap["frac"])
    largo = float(datos.get("length", 0.0))
    opciones = []
    if v in distancias_pavimentadas:
        opciones.append((1.0 - frac) * largo + distancias_pavimentadas[v])
    reversas = grafo.get_edge_data(v, u) or {}
    if reversas and u in distancias_pavimentadas:
        datos_reversa = min(
            reversas.values(),
            key=lambda edge: float(edge.get("length", math.inf)),
        )
        opciones.append(frac * float(datos_reversa.get("length", 0.0)) + distancias_pavimentadas[u])
    return min(opciones) if opciones else None


def _arista_de_menor_costo(grafo, u, v):
    """Devuelve la paralela que representa el tramo elegido por el ruteo."""
    aristas = (grafo.get_edge_data(u, v) or {}).values()
    datos = list(aristas)
    if not datos:
        return None
    return min(datos, key=lambda d: d.get("costo", d.get("length", math.inf)))


def _nombre_via(datos_arista: dict):
    """Resuelve el nombre vial a partir de ref y después name."""
    ref = _primer_valor(datos_arista.get("ref"))
    if ref is not None:
        ref = str(ref).split(";", 1)[0].strip()
        if not ref:
            return _primer_valor(datos_arista.get("name"))
        coincidencia = re.fullmatch(r"(RP|RN)[\s.-]*(\d+)", ref, flags=re.IGNORECASE)
        if coincidencia:
            prefijo, numero = coincidencia.groups()
            clase = "Provincial" if prefijo.upper() == "RP" else "Nacional"
            return f"Ruta {clase} {numero}"
        return ref
    return _primer_valor(datos_arista.get("name"))


def calcular_via_principal(grafo, ruta_nodos) -> Optional[dict]:
    """Devuelve la vía con más metros entre los tramos reales de una ruta.

    Cuenta la arista paralela de menor costo (o menor length en grafos sin
    costo), igual que `_longitud_ruta` y Dijkstra. En rutas snapeadas a una
    arista se omite el tramo parcial desde el punto de snap hasta el extremo:
    la métrica considera solamente los tramos completos representados por
    `ruta_nodos`.
    """
    if len(ruta_nodos) < 2:
        return None

    metros_por_via = {}
    for u, v in zip(ruta_nodos[:-1], ruta_nodos[1:]):
        datos = _arista_de_menor_costo(grafo, u, v)
        if datos is None:
            continue
        nombre = _nombre_via(datos)
        tipo = _primer_valor(datos.get("highway"))
        clave = (nombre, tipo)
        agregado = metros_por_via.setdefault(clave, {"metros": 0.0, "pavimentada": True})
        agregado["metros"] += float(datos.get("length", 0.0))
        agregado["pavimentada"] = agregado["pavimentada"] and not _es_tramo_sin_pavimentar(datos)

    if not metros_por_via:
        return None
    (nombre, tipo), agregado = min(
        metros_por_via.items(),
        key=lambda item: (
            -item[1]["metros"],
            item[0][0] is None,
            item[0][0] or "",
            item[0][1] is None,
            str(item[0][1] or ""),
        ),
    )
    return {"nombre": nombre, "tipo": tipo, "pavimentada": agregado["pavimentada"]}


SUPERFICIES_TIERRA = {"dirt", "earth", "ground", "mud", "sand", "grass"}
SUPERFICIES_RIPIO = {"gravel", "compacted", "fine_gravel"}


def _tipo_superficie(datos_arista: dict) -> str:
    """Clasifica un tramo en `pavimentado`, `ripio` o `tierra`.

    Reusa `_es_tramo_sin_pavimentar` para pavimentado/no pavimentado; entre los
    no pavimentados manda el tag `surface` y, sin él, `highway=track` es tierra.
    """
    if not _es_tramo_sin_pavimentar(datos_arista):
        return "pavimentado"
    surface = _primer_valor(datos_arista.get("surface"))
    if surface in SUPERFICIES_TIERRA:
        return "tierra"
    if surface in SUPERFICIES_RIPIO:
        return "ripio"
    return "tierra" if _primer_valor(datos_arista.get("highway")) == "track" else "ripio"


def calcular_superficies(grafo, ruta_nodos) -> Optional[dict]:
    """Metros por tipo de superficie sobre los mismos tramos que `calcular_via_principal`."""
    if len(ruta_nodos) < 2:
        return None
    metros = {"pavimentado": 0.0, "ripio": 0.0, "tierra": 0.0}
    for u, v in zip(ruta_nodos[:-1], ruta_nodos[1:]):
        datos = _arista_de_menor_costo(grafo, u, v)
        if datos is None:
            continue
        metros[_tipo_superficie(datos)] += float(datos.get("length", 0.0))
    if sum(metros.values()) <= 0:
        return None
    return {tipo: round(valor, 1) for tipo, valor in metros.items()}


def buscar_destinos_mas_cercanos(
    grafo_invertido, nodos_destino: dict, grafo_seguro_invertido=None,
    grafo_pavimentado_invertido=None,
) -> dict:
    """Busca una sola vez las localidades urbanas mas cercanas por costo.

    En el grafo invertido cada ruta empieza en el nodo localidad y termina en
    el nodo que la consulta. Si dos localidades comparten nodo, el llamador
    debe resolverlo antes de invocar esta funcion.
    """
    import networkx as nx

    fuentes = set(nodos_destino)
    if not fuentes:
        return {
            "distancias": {},
            "rutas": {},
            "nombres": {},
            "alcanzables_seguro": set() if grafo_seguro_invertido is not None else None,
            "alcanzables_pavimentado": set() if grafo_pavimentado_invertido is not None else None,
        }
    distancias, rutas = nx.multi_source_dijkstra(
        grafo_invertido, fuentes, weight=_peso_ruta(grafo_invertido)
    )
    alcanzables_seguro = None
    if grafo_seguro_invertido is not None:
        alcanzables_seguro = set(
            nx.multi_source_dijkstra_path_length(
                grafo_seguro_invertido, fuentes, weight=None
            )
        )
    alcanzables_pavimentado = None
    if grafo_pavimentado_invertido is not None:
        alcanzables_pavimentado = set(
            nx.multi_source_dijkstra_path_length(
                grafo_pavimentado_invertido, fuentes, weight=None
            )
        )
    return {
        "distancias": distancias,
        "rutas": rutas,
        "nombres": dict(nodos_destino),
        "alcanzables_seguro": alcanzables_seguro,
        "alcanzables_pavimentado": alcanzables_pavimentado,
    }
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

# Tipos de waterway considerados cruce relevante. Se excluyen `drain` y
# `ditch`, que no deben afectar el indice de aislamiento.
WATERWAYS_CRUCE = ("river", "stream", "canal")

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

# Clasificacion de un cruce para el export de geometria. Los cruces sin ford
# explicito quedan como `sin_evidencia` y no elevan el indice.
CLASIFICACION_PUENTE = "puente"
CLASIFICACION_VADO = "vado"
CLASIFICACION_VADO_PROBABLE = "vado_probable"
CLASIFICACION_SIN_EVIDENCIA = "sin_evidencia"


def clasificar_cruce(cruce: dict) -> str:
    """Clasifica un cruce para el export de geometria (N3).

    `con_puente` gana sobre `es_ford` (un cruce con puente nunca es vado).
    Si no hay puente ni tag `ford=yes`, devuelve "sin_evidencia".
    """
    if cruce["con_puente"]:
        return CLASIFICACION_PUENTE
    if cruce["es_ford"]:
        return CLASIFICACION_VADO
    if cruce.get("es_ford_probable"):
        return CLASIFICACION_VADO_PROBABLE
    return CLASIFICACION_SIN_EVIDENCIA


def _cruce_export(cruce: dict, punto_x: float, punto_y: float) -> dict:
    """Registro de un cruce para el export de geometria. `nombreCurso` es el
    `name` OSM del curso de agua cruzado y `nombrePuente` el `bridge:name` o
    `name` de la via cuando el cruce es un puente; ambos null si faltan.
    `tipoCurso` es el tag `waterway` del curso e `intermitente` sale de
    `intermittent`/`seasonal` (null = desconocido, ver `_intermitente_desde_fila`)."""
    return {
        "lon": round(punto_x, 6),
        "lat": round(punto_y, 6),
        "clasificacion": clasificar_cruce(cruce),
        "nombreCurso": cruce.get("nombre_curso"),
        "tipoCurso": cruce.get("tipo_curso"),
        "intermitente": cruce.get("intermitente"),
        "nombrePuente": cruce.get("nombre_puente"),
    }


def _nombre_puente(datos_arista: dict):
    """Nombre del puente de una arista: `bridge:name`, o `name` solo si nombra un puente.

    En OSM el `name` de un tramo-puente suele ser el de la calle o ruta
    ("Ruta Nacional 12"), que no identifica al puente.
    """
    nombre = _nombre_osm(datos_arista.get("bridge:name"))
    if nombre:
        return nombre
    nombre = _nombre_osm(datos_arista.get("name"))
    return nombre if nombre and nombre.casefold().startswith("puente") else None


def _nombre_osm(valor):
    """Normaliza un `name` OSM a str no vacio o None."""
    valor = _primer_valor(valor)
    if isinstance(valor, str) and valor.strip():
        return valor.strip()
    return None


def _tag_desde_fila(fila, clave: str):
    """Valor str no vacio del tag `clave` de una fila pyrosm: columna propia o,
    si pyrosm lo dejo dentro de la columna `tags` (dict o JSON), desde ahi."""
    valor = _nombre_osm(fila.get(clave))
    if valor is not None:
        return valor
    tags = fila.get("tags")
    if isinstance(tags, str):
        import json

        try:
            tags = json.loads(tags)
        except ValueError:
            return None
    if isinstance(tags, dict):
        return _nombre_osm(tags.get(clave))
    return None


def _nombre_desde_fila(fila):
    """`name` de una fila pyrosm (columna propia o dentro de `tags`)."""
    return _tag_desde_fila(fila, "name")


def _intermitente_desde_fila(fila):
    """Intermitencia de un curso de agua: True si `intermittent=yes` o
    `seasonal=yes`; False solo si alguno de los dos esta explicitamente en
    `no` (y ninguno en `yes`); None si no hay evidencia. Nunca asume False."""
    valores = [
        (_tag_desde_fila(fila, clave) or "").casefold()
        for clave in ("intermittent", "seasonal")
    ]
    if "yes" in valores:
        return True
    if "no" in valores:
        return False
    return None


def _atributos_agua_desde_fila(fila) -> dict:
    """`tipo_curso` (tag `waterway`) e `intermitente` de una fila de agua."""
    return {
        "tipo_curso": _tag_desde_fila(fila, "waterway"),
        "intermitente": _intermitente_desde_fila(fila),
    }


def _coordenadas_ruta(grafo, ruta_nodos) -> list[list[float]]:
    """Coordenadas [lon, lat] de la geometria REALMENTE usada por la ruta.

    Para cada par consecutivo (u, v) elige, entre las aristas paralelas
    `grafo.get_edge_data(u, v)`, la de menor `costo` (la que usa Dijkstra) y
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
        datos = _arista_de_menor_costo(grafo, u, v)
        if datos is None:
            continue
        geometria = _geometria_arista(datos, grafo, u, v)
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
    *,
    tramos_sin_pavimentar_km: Optional[float] = None,
    tiene_alternativa_pavimentada: Optional[bool] = None,
    distancia_cabecera_departamental_m: Optional[float] = None,
) -> Optional[int]:
    """Escala 0-3 documentada en el contrato de datos de G1.

    Devuelve None cuando faltan datos suficientes (nunca asume "seguro").
    """
    if (
        tramos_sin_pavimentar_count is None
        or cruces_agua_con_puente_count is None
        or cruces_agua_con_vado_count is None
    ):
        return None

    if cruces_agua_con_vado_count >= 1:
        # Vado (sin puente): riesgo alto salvo que haya alternativa que lo evite.
        return 2 if tiene_alternativa_sin_cruce else 3

    if distancia_via_pavimentada_m is None:
        return None
    distancia_localidad = (
        distancia_cabecera_departamental_m
        if distancia_cabecera_departamental_m is not None
        else distancia_via_pavimentada_m
    )
    # Nivel 3 por lejania se mide contra la localidad, no contra el pavimento.
    if distancia_localidad > UMBRAL_VIA_NO_ALCANZABLE_M:
        return 3

    if (
        tramos_sin_pavimentar_km is not None
        and tramos_sin_pavimentar_km >= UMBRAL_KM_SIN_PAVIMENTAR_NIVEL2
        and not tiene_alternativa_pavimentada
    ):
        return 2
    if (
        tramos_sin_pavimentar_km is None
        and tramos_sin_pavimentar_count >= 5
        and not tiene_alternativa_sin_cruce
    ):
        return 2

    limite_sin_pavimentar = (
        tramos_sin_pavimentar_km <= UMBRAL_KM_SIN_PAVIMENTAR_NIVEL0
        if tramos_sin_pavimentar_km is not None
        else tramos_sin_pavimentar_count <= 1
    )

    # Puentes y cruces sin evidencia explicita no cuentan como aislamiento.
    sin_cruces_relevantes = cruces_agua_con_vado_count == 0
    via_cercana = (
        distancia_via_pavimentada_m <= UMBRAL_DISTANCIA_RED_PAVIMENTADA_NIVEL0_M
        and distancia_localidad <= UMBRAL_VIA_PAVIMENTADA_CERCANA_M
    )
    if sin_cruces_relevantes and via_cercana and limite_sin_pavimentar:
        return 0

    if tiene_alternativa_pavimentada:
        return 1

    if tiene_alternativa_sin_cruce:
        return 1

    # Caso residual (sin vados ni tramo largo sin pavimentar, pero fuera del
    # nivel 0): aislamiento bajo. El nivel 2 queda reservado a vados o a
    # >= UMBRAL_KM_SIN_PAVIMENTAR_NIVEL2 sin alternativa pavimentada.
    return 1


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
        extra_attributes=["surface", "bridge", "tunnel", "ford", "bridge:name"],
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
    nombres_agua_out: Optional[list] = None,
    atributos_agua_out: Optional[list] = None,
) -> tuple[list, list]:
    """Extrae del extracto local .osm.pbf los cursos de agua (`WATERWAYS_CRUCE`,
    como entidades separadas de la red vial; ver nota de modulo G1-fix2) y los
    entidades `ford=yes` (nodos y ways).

    Devuelve `(agua, fords)`:

    - `agua`: geometrias shapely LineString/MultiLineString de los ways cuyo
      `waterway` esta en `WATERWAYS_CRUCE` (nunca la red vial).
    - `fords`: geometrias shapely Point/LineString (lon/lat) de las entidades
      cuyo `ford` es "yes". Los ways se incluyen aunque no formen parte de la
      red drive, para no perder evidencia explícita.

    `nombres_agua_out`: lista opcional que recibe, en paralelo a `agua`, el
    `name` OSM de cada curso de agua (None si falta).

    `atributos_agua_out`: lista opcional que recibe, en paralelo a `agua`, un
    dict `{"tipo_curso", "intermitente"}` por curso (ver
    `_atributos_agua_desde_fila`). pyrosm deja `intermittent`/`seasonal` (y
    todo tag que no es `waterway` ni columna propia) dentro de la columna
    `tags` en JSON; verificado contra el extracto real, de ahi se leen.

    ## N3-G — DOS lecturas, no una

    Hasta N3-D esta funcion hacia UNA sola lectura combinada
    (`custom_filter={"waterway": [...], "ford": ["yes"]}`, `keep_nodes=True`).
    Bug verificado con el extracto real de Corrientes: el filtro multi-clave
    NO devuelve los nodos `ford=yes` (la corrida real logueo
    `0 fords (nodos ford=yes)`), mientras que una lectura de una sola clave
    (`custom_filter={"ford": ["yes"]}`) devuelve entidades `Point` y ways.
    Por eso ahora se hacen DOS lecturas
    independientes sobre el mismo objeto `OSM` (pyrosm cachea los elementos
    leidos en `_read_pbf`, asi que no re-lee el pbf):

    a) agua: exactamente como antes de N3-D (`custom_filter={"waterway":
       list(WATERWAYS_CRUCE)}`, `osm_keys_to_keep=["waterway"]`,
       `filter_type="keep"`, `keep_nodes=False`, `keep_relations=False`) ->
       LineString/MultiLineString.
    b) fords: `custom_filter={"ford": ["yes"]}`, `osm_keys_to_keep=["ford"]`,
       `filter_type="keep"`, `keep_nodes=True`, `keep_ways=True`,
       `keep_relations=False` -> Point/LineString/MultiLineString cuyo `ford`
       es "yes" (via `_primer_valor`). Se maneja `None`/frame vacio.

    La segunda pasada recorre los elementos del bbox buscando `ford=yes`;
    recupera los nodos y ways que el filtro combinado descartaba.

    Mismo orden de bbox que `construir_red_local`: pyrosm espera
    [oeste, sur, este, norte].
    """
    from pyrosm import OSM

    osm = OSM(
        pbf_path,
        bounding_box=[bbox_oeste, bbox_sur, bbox_este, bbox_norte],
    )

    agua: list = []
    fords: list = []

    datos_agua = osm.get_data_by_custom_criteria(
        custom_filter={"waterway": list(WATERWAYS_CRUCE)},
        osm_keys_to_keep=["waterway"],
        filter_type="keep",
        keep_nodes=False,
        keep_relations=False,
    )
    if datos_agua is not None and not datos_agua.empty:
        for _, fila in datos_agua.iterrows():
            geometria = fila.get("geometry")
            if geometria is None or geometria.is_empty:
                continue
            if geometria.geom_type in ("LineString", "MultiLineString"):
                if _primer_valor(fila.get("waterway")) in WATERWAYS_CRUCE:
                    agua.append(geometria)
                    if nombres_agua_out is not None:
                        nombres_agua_out.append(_nombre_desde_fila(fila))
                    if atributos_agua_out is not None:
                        atributos_agua_out.append(_atributos_agua_desde_fila(fila))

    datos_ford = osm.get_data_by_custom_criteria(
        custom_filter={"ford": ["yes"]},
        osm_keys_to_keep=["ford"],
        filter_type="keep",
        keep_nodes=True,
        keep_ways=True,
        keep_relations=False,
    )
    if datos_ford is not None and not datos_ford.empty:
        for _, fila in datos_ford.iterrows():
            geometria = fila.get("geometry")
            if geometria is None or geometria.is_empty:
                continue
            if (
                geometria.geom_type in ("Point", "LineString", "MultiLineString")
                and _primer_valor(fila.get("ford")) == "yes"
            ):
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
    `construir_geometrias_agua_y_fords_local` (N3-D/N3-G) y descarta los fords.
    Para obtener tambien los nodos `ford=yes` usar la funcion subyacente (dos
    lecturas, ver su docstring).

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


def _tiene_tunel(datos_arista: dict) -> bool:
    """Indica cualquier `tunnel=*` distinto de `no` o vacio."""
    tunnel = _primer_valor(datos_arista.get("tunnel"))
    return tunnel not in (None, "", "no")


def _tiene_ford(datos_arista: dict, grafo, u, v) -> bool:
    """Confirma vado solo ante `ford=yes` en la arista o sus nodos."""
    ford_arista = _primer_valor(datos_arista.get("ford"))
    if ford_arista == "yes":
        return True
    for nodo in (u, v):
        datos_nodo = grafo.nodes.get(nodo, {})
        ford_nodo = _primer_valor(datos_nodo.get("ford"))
        if ford_nodo == "yes":
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
    nombres_agua=None,
    atributos_agua=None,
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

    `nombres_agua`: lista opcional paralela a `geometrias_agua` con el `name`
    de cada curso; alimenta `nombre_curso`. `nombre_puente` sale de la arista
    (`bridge:name`/`name`) solo cuando el cruce es un puente.

    `atributos_agua`: lista opcional paralela a `geometrias_agua` con dicts
    `{"tipo_curso", "intermitente"}`; sin ella ambos quedan None.
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
        explicito = _tiene_ford(datos, grafo, u, v) or cerca
        con_puente = _tiene_puente(datos)
        atributos = (
            atributos_agua[idx_agua]
            if atributos_agua is not None and idx_agua < len(atributos_agua)
            else {}
        )
        cruces.setdefault((u, v, k), []).append(
            {
                "nombre_curso": (
                    nombres_agua[idx_agua]
                    if nombres_agua is not None and idx_agua < len(nombres_agua)
                    else None
                ),
                "nombre_puente": _nombre_puente(datos) if con_puente else None,
                "tipo_curso": atributos.get("tipo_curso"),
                "intermitente": atributos.get("intermitente"),
                "agua_idx": idx_agua,
                "punto": (punto.x, punto.y),
                "con_puente": _tiene_puente(datos),
                "es_ford": explicito,
                "es_ford_probable": (
                    not explicito and not _tiene_puente(datos)
                    and not _tiene_tunel(datos)
                    and _es_tramo_sin_pavimentar(datos)
                ),
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


def _orientar_geometria(geometria, grafo, u, v):
    """Orienta la geometria de la arista dirigida `(u, v)` para que su primer
    vertice quede en `u` (N3-E).

    En el grafo real de pyrosm la copia reversa de una via de doble mano
    conserva la orientacion de la copia directa: el atributo `geometry` de la
    arista `(v, u)` sigue yendo de `u` a `v`. Como `frac` (posicion sobre la
    geometria) se interpreta despues como 0 en `u` y 1 en `v`, una geometria
    mal orientada describe el lado equivocado de la arista: el costo parcial
    `(1 - frac) * length` y el tramo dibujado quedan invertidos.

    Se compara la distancia del primer vertice de la geometria a `u` y a `v`
    con las coordenadas de nodo (`grafo.nodes[n]["x"/"y"]`) y se revierte con
    `shapely.reverse` cuando el primer vertice esta mas cerca de `v`. Una
    arista cerrada (`u == v`) o con extremos coincidentes se deja como esta
    (no hay orientacion preferida). Devuelve la geometria original si no se
    puede orientar (nodo ausente o geometria vacia).
    """
    if geometria is None or geometria.is_empty or u == v:
        return geometria
    if u not in grafo.nodes or v not in grafo.nodes:
        return geometria

    import shapely

    coordenadas = shapely.get_coordinates(geometria)
    if coordenadas.shape[0] == 0:
        return geometria
    primero = coordenadas[0]
    ux, uy = grafo.nodes[u]["x"], grafo.nodes[u]["y"]
    vx, vy = grafo.nodes[v]["x"], grafo.nodes[v]["y"]
    dist_u = (primero[0] - ux) ** 2 + (primero[1] - uy) ** 2
    dist_v = (primero[0] - vx) ** 2 + (primero[1] - vy) ** 2
    if dist_v < dist_u:
        return shapely.reverse(geometria)
    return geometria


def construir_indice_aristas(grafo) -> dict:
    """Indice espacial (STRtree) de TODAS las aristas dirigidas, proyectadas a
    EPSG:32721 (UTM 21S), para snapear una escuela a la ARISTA mas cercana en
    vez del NODO mas cercano (N3-C).

    Evidencia (grafo real 443k nodos / 940k aristas, 2001 escuelas): la
    distancia escuela -> nodo vs escuela -> arista difiere p50 17 m, p90 59 m,
    p99 425 m, max 935 m; 112 escuelas > 100 m, 46 > 250 m, 15 > 500 m.

    ## N3-E — geometria orientada al sentido de la arista

    Cada geometria se orienta a su arista dirigida `(u, v)` con
    `_orientar_geometria` ANTES de proyectar: en el grafo real la copia reversa
    de una via de doble mano conserva la orientacion de la copia directa, y sin
    orientar `frac` describe el lado equivocado (costo parcial y tramo dibujado
    invertidos; la longitud exportada quedaba 3-13 % por encima de
    `distancia_cabecera_departamental_m` para ~5-15 % de las escuelas). Asi
    `geometrias` y `proyectadas` guardan la geometria ORIENTADA (0 en `u`, 1 en
    `v`).

    Se construye UNA sola vez por corrida. Devuelve `claves` (lista de
    `(u, v, k)` en el mismo orden que el arbol), `pos` (dict `(u, v, k) ->
    indice` para recuperar la geometria orientada de una arista), `geometrias`
    (lon/lat orientadas), `proyectadas` (EPSG:32721) y el `transformer`, para
    reutilizar en cada snap sin reproyectar.
    """
    from pyproj import Transformer
    from shapely.strtree import STRtree

    transformer = Transformer.from_crs(4326, 32721, always_xy=True)
    claves = []
    geometrias = []
    pos = {}
    for u, v, k, datos in grafo.edges(keys=True, data=True):
        geometria = _orientar_geometria(
            _geometria_arista(datos, grafo, u, v), grafo, u, v
        )
        pos[(u, v, k)] = len(claves)
        claves.append((u, v, k))
        geometrias.append(geometria)
    proyectadas = _proyectar_geometrias(geometrias, transformer)
    return {
        "arbol": STRtree(proyectadas),
        "claves": claves,
        "geometrias": geometrias,
        "proyectadas": proyectadas,
        "pos": pos,
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
    nombres_destino=None,
    alcanzables_pavimentado=None,
    distancias_via_pavimentada=None,
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
    geometria = {
        "ruta": None, "cruces": [], "motivo_sin_geometria": None,
        "destino": None, "distancia_destino_m": None, "via_principal": None,
        "superficies": None,
    }
    resultado["snap_distancia_m"] = snap["distancia_m"]

    if snap["distancia_m"] > UMBRAL_SNAP_SIN_CONEXION_M:
        resultado["motivo_sin_datos"] = "sin_conexion_red"
        geometria["motivo_sin_geometria"] = "sin_conexion_red"
        return resultado, geometria

    u, v, k = snap["u"], snap["v"], snap["k"]
    frac = snap["frac"]
    datos_e = (grafo.get_edge_data(u, v) or {}).get(k, {})
    # N3-E: usar la geometria ORIENTADA al sentido de la arista (guardada en el
    # indice), no la cruda de OSM. Sin esto `frac` (medido sobre la geometria)
    # describe el lado equivocado de la arista en la copia reversa de una via
    # de doble mano: el substring parcial, la proyeccion de los cruces (`t`) y
    # el costo parcial quedan invertidos.
    pos_e = indice["pos"][(u, v, k)]
    geometria_e = indice["geometrias"][pos_e]
    geometria_proyectada_e = indice["proyectadas"][pos_e]

    opciones = []
    if v in distancias_cab:
        opciones.append(
            {
                "exit": v,
                "costo": (1.0 - frac) * float(datos_e.get("costo", datos_e.get("length", 0.0))),
                "datos": datos_e,
                "clave": (u, v, k),
                "sentido_adelante": True,
            }
        )

    datos_aristas_er = grafo.get_edge_data(v, u) or {}
    if datos_aristas_er and u in distancias_cab:
        kr = min(
            datos_aristas_er,
            key=lambda kk: datos_aristas_er[kk].get(
                "costo", datos_aristas_er[kk].get("length", math.inf)
            ),
        )
        datos_er = datos_aristas_er[kr]
        opciones.append(
            {
                "exit": u,
                "costo": frac * float(datos_er.get("costo", datos_er.get("length", 0.0))),
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
    ruta_desde_exit = list(reversed(rutas_cab[mejor["exit"]]))
    distancia_parcial = (1.0 - frac if mejor["sentido_adelante"] else frac) * float(
        mejor["datos"].get("length", 0.0)
    )
    distancia_real = distancia_parcial + _longitud_ruta(grafo, ruta_desde_exit)
    resultado["distancia_cabecera_departamental_m"] = distancia_real
    nodo_destino = rutas_cab[mejor["exit"]][0]
    nombre_destino = (nombres_destino or {}).get(nodo_destino)
    if nombre_destino is not None:
        resultado["destino"] = {"nombre": nombre_destino}
        resultado["distancia_destino_m"] = distancia_real
        geometria["destino"] = resultado["destino"]
        geometria["distancia_destino_m"] = distancia_real
    resultado["distancia_via_pavimentada_m"] = distancia_pavimentada_desde_snap(
        grafo, snap, distancias_via_pavimentada or {}
    )

    tramos_sin_pavimentar = 0
    tramos_longitud = []
    cruces_con_puente = 0
    cruces_con_vado = 0
    cruces_vado_explicito = 0
    cruces_vado_probable = 0
    cruces_sin_evidencia = 0
    ya_vistos_ruta: list = []
    cruces_export: list = []
    parcial_todos_puente = True

    if _es_tramo_sin_pavimentar(mejor["datos"]):
        tramos_sin_pavimentar += 1
    tramos_longitud.append((mejor["datos"], distancia_parcial))

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
        elif cruce["es_ford"]:
            cruces_con_vado += 1
            cruces_vado_explicito += 1
            parcial_todos_puente = False
        elif cruce.get("es_ford_probable"):
            cruces_con_vado += 1
            cruces_vado_probable += 1
            parcial_todos_puente = False
        else:
            cruces_sin_evidencia += 1
        punto_x, punto_y = cruce["punto"]
        cruces_export.append(
            _cruce_export(cruce, punto_x, punto_y)
        )

    for a, b in zip(ruta_desde_exit[:-1], ruta_desde_exit[1:]):
        datos_aristas = grafo.get_edge_data(a, b) or {}
        elegida = _arista_de_menor_costo(grafo, a, b)
        if elegida is not None:
            tramos_longitud.append((elegida, float(elegida.get("length", 0.0))))
        for kk, datos in datos_aristas.items():
            if _es_tramo_sin_pavimentar(datos):
                tramos_sin_pavimentar += 1
            crucesarista = cruces_por_arista.get((a, b, kk), [])
            for cruce in _dedupe_cruces(crucesarista, ya_vistos_ruta, tolerancia_dedup_m):
                if cruce["con_puente"]:
                    cruces_con_puente += 1
                elif cruce["es_ford"]:
                    cruces_con_vado += 1
                    cruces_vado_explicito += 1
                elif cruce.get("es_ford_probable"):
                    cruces_con_vado += 1
                    cruces_vado_probable += 1
                else:
                    cruces_sin_evidencia += 1
                punto_x, punto_y = cruce["punto"]
                cruces_export.append(
                    _cruce_export(cruce, punto_x, punto_y)
                )

    cruces_count = cruces_con_puente + cruces_con_vado + cruces_sin_evidencia
    resultado["tramos_sin_pavimentar_count"] = tramos_sin_pavimentar
    resultado["tramos_sin_pavimentar_km"] = _km_sin_pavimentar_ruta(tramos_longitud)
    resultado["cruces_agua_count"] = cruces_count
    resultado["cruces_agua_con_puente_count"] = cruces_con_puente
    resultado["cruces_agua_con_vado_count"] = cruces_con_vado
    resultado["cruces_agua_con_vado_explicito_count"] = cruces_vado_explicito
    resultado["cruces_agua_con_vado_probable_count"] = cruces_vado_probable
    resultado["cruces_agua_sin_evidencia_count"] = cruces_sin_evidencia

    if cruces_con_vado == 0:
        resultado["tiene_alternativa_sin_cruce"] = None
    elif alcanzables_seguro is not None:
        resultado["tiene_alternativa_sin_cruce"] = (
            mejor["exit"] in alcanzables_seguro and parcial_todos_puente
        )
    else:
        grafo_seguro = construir_grafo_seguro(grafo, cruces_por_arista)
        try:
            resultado["tiene_alternativa_sin_cruce"] = nx.has_path(
                grafo_seguro, mejor["exit"], nodo_destino
            )
        except (nx.NetworkXError, nx.NodeNotFound):
            resultado["tiene_alternativa_sin_cruce"] = False

    try:
        tramo_parcial_pavimentado = (
            distancia_parcial <= 0 or not _es_tramo_sin_pavimentar(mejor["datos"])
        )
        resultado["tiene_alternativa_pavimentada"] = tramo_parcial_pavimentado and (
            mejor["exit"] in alcanzables_pavimentado
            if alcanzables_pavimentado is not None
            else nx.has_path(construir_grafo_pavimentado(grafo), mejor["exit"], nodo_destino)
        )
    except (nx.NetworkXError, nx.NodeNotFound):
        resultado["tiene_alternativa_pavimentada"] = False

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
    geometria["via_principal"] = calcular_via_principal(grafo, ruta_desde_exit)
    geometria["superficies"] = calcular_superficies(grafo, ruta_desde_exit)
    geometria["cruces"] = cruces_export
    return resultado, geometria


def _aristas_inseguras(cruces_por_arista: dict) -> set:
    """Aristas con vado explicito/probable y sin puente confirmado."""
    return {
        clave
        for clave, crucesarista in cruces_por_arista.items()
        if any(
            not c["con_puente"]
            and (c["es_ford"] or c.get("es_ford_probable"))
            for c in crucesarista
        )
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

    peso_ruta = _peso_ruta(grafo)

    resultado = {
        "distancia_via_pavimentada_m": None,
        "distancia_cabecera_departamental_m": None,
        "tramos_sin_pavimentar_count": None,
        "tramos_sin_pavimentar_km": None,
        "cruces_agua_count": None,
        "cruces_agua_con_puente_count": None,
        "cruces_agua_con_vado_count": None,
        "cruces_agua_con_vado_explicito_count": None,
        "cruces_agua_con_vado_probable_count": None,
        "cruces_agua_sin_evidencia_count": None,
        "tiene_alternativa_sin_cruce": None,
        "tiene_alternativa_pavimentada": None,
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
            grafo, nodo_escuela, nodo_cabecera, weight=peso_ruta
        )
        resultado["distancia_cabecera_departamental_m"] = _longitud_ruta(
            grafo, ruta_cabecera
        )
    except (nx.NetworkXNoPath, nx.NodeNotFound):
        resultado["motivo_sin_datos"] = "sin_conexion_red"
        return resultado

    cruces_por_arista = cruces_por_arista or {}
    tramos_sin_pavimentar = 0
    tramos_longitud = []
    cruces_con_puente = 0
    cruces_con_vado = 0
    cruces_vado_explicito = 0
    cruces_vado_probable = 0
    cruces_sin_evidencia = 0
    ya_vistos_ruta: list = []
    for u, v in zip(ruta_cabecera[:-1], ruta_cabecera[1:]):
        datos_aristas = grafo.get_edge_data(u, v) or {}
        elegida = _arista_de_menor_costo(grafo, u, v)
        if elegida is not None:
            tramos_longitud.append((elegida, float(elegida.get("length", 0.0))))
        for k, datos in datos_aristas.items():
            if _es_tramo_sin_pavimentar(datos):
                tramos_sin_pavimentar += 1
            crucesarista = cruces_por_arista.get((u, v, k), [])
            for cruce in _dedupe_cruces(crucesarista, ya_vistos_ruta, tolerancia_dedup_m):
                if cruce["con_puente"]:
                    cruces_con_puente += 1
                elif cruce["es_ford"]:
                    cruces_con_vado += 1
                    cruces_vado_explicito += 1
                elif cruce.get("es_ford_probable"):
                    cruces_con_vado += 1
                    cruces_vado_probable += 1
                else:
                    cruces_sin_evidencia += 1

    cruces_count = cruces_con_puente + cruces_con_vado + cruces_sin_evidencia

    resultado["tramos_sin_pavimentar_count"] = tramos_sin_pavimentar
    resultado["tramos_sin_pavimentar_km"] = _km_sin_pavimentar_ruta(tramos_longitud)
    resultado["cruces_agua_count"] = cruces_count
    resultado["cruces_agua_con_puente_count"] = cruces_con_puente
    resultado["cruces_agua_con_vado_count"] = cruces_con_vado
    resultado["cruces_agua_con_vado_explicito_count"] = cruces_vado_explicito
    resultado["cruces_agua_con_vado_probable_count"] = cruces_vado_probable
    resultado["cruces_agua_sin_evidencia_count"] = cruces_sin_evidencia

    resultado["distancia_via_pavimentada_m"] = distancias_hasta_red_pavimentada(
        grafo
    ).get(nodo_escuela)

    if cruces_con_vado == 0:
        resultado["tiene_alternativa_sin_cruce"] = None
    else:
        tiene_alternativa = False
        try:
            if grafo_seguro is None:
                grafo_seguro = construir_grafo_seguro(grafo, cruces_por_arista)
            tiene_alternativa = nx.has_path(grafo_seguro, nodo_escuela, nodo_cabecera)
        except (nx.NetworkXError, nx.NodeNotFound):
            tiene_alternativa = False
        resultado["tiene_alternativa_sin_cruce"] = tiene_alternativa

    try:
        resultado["tiene_alternativa_pavimentada"] = nx.has_path(
            construir_grafo_pavimentado(grafo), nodo_escuela, nodo_cabecera
        )
    except (nx.NetworkXError, nx.NodeNotFound):
        resultado["tiene_alternativa_pavimentada"] = False

    return resultado


def _resultado_vacio() -> dict:
    return {
        "distancia_via_pavimentada_m": None,
        "distancia_cabecera_departamental_m": None,
        "destino": None,
        "distancia_destino_m": None,
        "tramos_sin_pavimentar_count": None,
        "tramos_sin_pavimentar_km": None,
        "cruces_agua_count": None,
        "cruces_agua_con_puente_count": None,
        "cruces_agua_con_vado_count": None,
        "cruces_agua_con_vado_explicito_count": None,
        "cruces_agua_con_vado_probable_count": None,
        "cruces_agua_sin_evidencia_count": None,
        "tiene_alternativa_sin_cruce": None,
        "tiene_alternativa_pavimentada": None,
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
    busqueda_destinos: Optional[dict] = None,
    distancias_via_pavimentada: Optional[dict] = None,
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

    peso_ruta = _peso_ruta(grafo)

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
            busqueda_destinos,
            distancias_via_pavimentada,
        )

    lons = [e["lon"] for e in escuelas_depto]
    lats = [e["lat"] for e in escuelas_depto]
    nodos_escuela, dists_snap = ox.distance.nearest_nodes(
        grafo, X=lons, Y=lats, return_dist=True
    )

    nombres_destino = None
    if busqueda_destinos is not None:
        distancias_cab = busqueda_destinos["distancias"]
        rutas_cab = busqueda_destinos["rutas"]
        nombres_destino = busqueda_destinos["nombres"]
        alcanzables_seguro = busqueda_destinos["alcanzables_seguro"]
        alcanzables_pavimentado = busqueda_destinos.get("alcanzables_pavimentado")
    else:
        distancias_cab, rutas_cab = nx.single_source_dijkstra(
            grafo_invertido, nodo_cabecera, weight=peso_ruta
        )
        alcanzables_seguro = None
        alcanzables_pavimentado = None
        if grafo_seguro_invertido is not None:
            alcanzables_seguro = set(
                nx.single_source_shortest_path_length(grafo_seguro_invertido, nodo_cabecera)
            )
    if distancias_via_pavimentada is None:
        distancias_via_pavimentada = distancias_hasta_red_pavimentada(grafo)

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
                    {
                        "ruta": None, "cruces": [],
                        "motivo_sin_geometria": "sin_conexion_red",
                        "destino": None, "distancia_destino_m": None,
                        "via_principal": None,
                    }
                )
            continue

        if nodo_escuela not in distancias_cab:
            resultado["motivo_sin_datos"] = "sin_conexion_red"
            resultados.append(resultado)
            if geometrias_out is not None:
                geometrias_out.append(
                    {
                        "ruta": None, "cruces": [],
                        "motivo_sin_geometria": "sin_conexion_red",
                        "destino": None, "distancia_destino_m": None,
                        "via_principal": None,
                    }
                )
            continue

        ruta_cabecera = list(reversed(rutas_cab[nodo_escuela]))
        resultado["distancia_cabecera_departamental_m"] = _longitud_ruta(
            grafo, ruta_cabecera
        )
        nodo_destino = rutas_cab[nodo_escuela][0]
        nombre_destino = (nombres_destino or {}).get(nodo_destino)
        if nombre_destino is not None:
            resultado["destino"] = {"nombre": nombre_destino}
            resultado["distancia_destino_m"] = resultado["distancia_cabecera_departamental_m"]

        tramos_sin_pavimentar = 0
        tramos_longitud = []
        cruces_con_puente = 0
        cruces_con_vado = 0
        cruces_vado_explicito = 0
        cruces_vado_probable = 0
        cruces_sin_evidencia = 0
        ya_vistos_ruta: list = []
        cruces_export: list = []
        for u, v in zip(ruta_cabecera[:-1], ruta_cabecera[1:]):
            datos_aristas = grafo.get_edge_data(u, v) or {}
            elegida = _arista_de_menor_costo(grafo, u, v)
            if elegida is not None:
                tramos_longitud.append((elegida, float(elegida.get("length", 0.0))))
            for k, datos in datos_aristas.items():
                if _es_tramo_sin_pavimentar(datos):
                    tramos_sin_pavimentar += 1
                crucesarista = cruces_por_arista.get((u, v, k), [])
                for cruce in _dedupe_cruces(crucesarista, ya_vistos_ruta, tolerancia_dedup_m):
                    if cruce["con_puente"]:
                        cruces_con_puente += 1
                    elif cruce["es_ford"]:
                        cruces_con_vado += 1
                        cruces_vado_explicito += 1
                    elif cruce.get("es_ford_probable"):
                        cruces_con_vado += 1
                        cruces_vado_probable += 1
                    else:
                        cruces_sin_evidencia += 1
                    if geometrias_out is not None:
                        punto_x, punto_y = cruce["punto"]
                        cruces_export.append(
                            _cruce_export(cruce, punto_x, punto_y)
                        )

        cruces_count = cruces_con_puente + cruces_con_vado + cruces_sin_evidencia
        resultado["tramos_sin_pavimentar_count"] = tramos_sin_pavimentar
        resultado["tramos_sin_pavimentar_km"] = _km_sin_pavimentar_ruta(tramos_longitud)
        resultado["cruces_agua_count"] = cruces_count
        resultado["cruces_agua_con_puente_count"] = cruces_con_puente
        resultado["cruces_agua_con_vado_count"] = cruces_con_vado
        resultado["cruces_agua_con_vado_explicito_count"] = cruces_vado_explicito
        resultado["cruces_agua_con_vado_probable_count"] = cruces_vado_probable
        resultado["cruces_agua_sin_evidencia_count"] = cruces_sin_evidencia
        resultado["distancia_via_pavimentada_m"] = distancias_via_pavimentada.get(
            nodo_escuela
        )

        if cruces_con_vado == 0:
            resultado["tiene_alternativa_sin_cruce"] = None
        elif alcanzables_seguro is not None:
            resultado["tiene_alternativa_sin_cruce"] = nodo_escuela in alcanzables_seguro
        else:
            # Fallback sin grafo_seguro_invertido precomputado (compatibilidad):
            # igual de correcto que la version per-escuela, pero mas lento.
            grafo_seguro = construir_grafo_seguro(grafo, cruces_por_arista)
            try:
                resultado["tiene_alternativa_sin_cruce"] = nx.has_path(
                    grafo_seguro, nodo_escuela, nodo_destino
                )
            except (nx.NetworkXError, nx.NodeNotFound):
                resultado["tiene_alternativa_sin_cruce"] = False

        try:
            resultado["tiene_alternativa_pavimentada"] = (
                nodo_escuela in alcanzables_pavimentado
                if alcanzables_pavimentado is not None
                else nx.has_path(
                    construir_grafo_pavimentado(grafo), nodo_escuela, nodo_destino
                )
            )
        except (nx.NetworkXError, nx.NodeNotFound):
            resultado["tiene_alternativa_pavimentada"] = False

        if geometrias_out is not None:
            coordenadas = _coordenadas_ruta(grafo, ruta_cabecera)
            if len(coordenadas) < 2:
                ruta_geom = None
                motivo_geom = "ruta_degenerada"
            else:
                ruta_geom = {"type": "LineString", "coordinates": coordenadas}
                motivo_geom = None
            geometrias_out.append(
                {
                    "ruta": ruta_geom, "cruces": cruces_export,
                    "motivo_sin_geometria": motivo_geom,
                    "destino": resultado["destino"],
                    "distancia_destino_m": resultado["distancia_destino_m"],
                    "via_principal": calcular_via_principal(grafo, ruta_cabecera),
                }
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
    busqueda_destinos: Optional[dict],
    distancias_via_pavimentada: Optional[dict],
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

    peso_ruta = _peso_ruta(grafo)
    lats = [e["lat"] for e in escuelas_depto]
    lons = [e["lon"] for e in escuelas_depto]
    snaps = _snap_arista_batch(grafo, indice_aristas, lats, lons)

    if busqueda_destinos is not None:
        distancias_cab = busqueda_destinos["distancias"]
        rutas_cab = busqueda_destinos["rutas"]
        nombres_destino = busqueda_destinos["nombres"]
        alcanzables_seguro = busqueda_destinos["alcanzables_seguro"]
        alcanzables_pavimentado = busqueda_destinos.get("alcanzables_pavimentado")
    else:
        distancias_cab, rutas_cab = nx.single_source_dijkstra(
            grafo_invertido, nodo_cabecera, weight=peso_ruta
        )
        nombres_destino = None
        alcanzables_seguro = None
        alcanzables_pavimentado = None
        if grafo_seguro_invertido is not None:
            alcanzables_seguro = set(
                nx.single_source_shortest_path_length(grafo_seguro_invertido, nodo_cabecera)
            )
    if distancias_via_pavimentada is None:
        distancias_via_pavimentada = distancias_hasta_red_pavimentada(grafo)

    resultados = []
    for escuela, snap in zip(escuelas_depto, snaps):
        if snap is None:
            resultado = _resultado_vacio()
            resultado["motivo_sin_datos"] = "sin_conexion_red"
            resultados.append(resultado)
            if geometrias_out is not None:
                geometrias_out.append(
                    {"ruta": None, "cruces": [], "motivo_sin_geometria": "sin_conexion_red",
                     "destino": None, "distancia_destino_m": None, "via_principal": None}
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
            nombres_destino,
            alcanzables_pavimentado,
            distancias_via_pavimentada,
        )
        resultados.append(resultado)
        if geometrias_out is not None:
            geometrias_out.append(geometria)
    return resultados
