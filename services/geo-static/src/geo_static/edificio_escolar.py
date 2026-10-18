"""Huella del edificio escolar (poligono OSM) asociada a cada escuela.

Candidatos: poligonos OSM con `amenity=school` o `building=school`. La
coordenada de la escuela nunca se modifica; el poligono se guarda aparte en el
campo `edificio` del registro de geometria.

Asociacion, en este orden (el primer paso con algun candidato decide):

a) `dentro`: el punto cae dentro de exactamente un poligono.
b) `nombre`: a <= 100 m hay exactamente un candidato cuyo `name` coincide con
   el nombre de la escuela (ver `nombres_coinciden`).
c) `cercania`: a <= 100 m hay exactamente un candidato.
d) `ambigua`: en el paso que decide califica mas de un candidato; no se elige
   ninguno (`poligono: null`, `osmId: null`, `candidatos: <n>`).
e) sin candidatos: `edificio: null`.

Varias escuelas (CUE) pueden compartir el mismo poligono (edificio compartido
entre niveles); no se deduplica ni penaliza.

Distancias en metros en EPSG:32721 (UTM 21S), el mismo CRS metrico que usa
`osm_aislamiento`.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Optional

CRS_METRICO = 32721
RADIO_ASOCIACION_M = 100.0

ASOCIACION_DENTRO = "dentro"
ASOCIACION_NOMBRE = "nombre"
ASOCIACION_CERCANIA = "cercania"
ASOCIACION_AMBIGUA = "ambigua"

# Palabras genericas que no identifican a una escuela concreta.
PALABRAS_GENERICAS = frozenset({
    "escuela", "esc", "colegio", "jardin", "infantes", "instituto", "inst",
    "centro", "nivel", "inicial", "primaria", "primario", "secundaria",
    "secundario", "tecnica", "tecnico", "normal", "superior", "educativo",
    "educacion", "formacion", "profesional", "integral", "comun", "anexo",
    "jin", "epet", "cfp", "eet", "nro", "numero", "del", "los", "las", "una",
})


def normalizar_texto(texto) -> str:
    """casefold, sin acentos, sin puntuacion, espacios colapsados."""
    if not isinstance(texto, str):
        return ""
    descompuesto = unicodedata.normalize("NFD", texto.casefold())
    sin_acentos = "".join(c for c in descompuesto if unicodedata.category(c) != "Mn")
    return " ".join(re.sub(r"[^0-9a-z]+", " ", sin_acentos).split())


def _tokens(texto) -> tuple[set[str], set[str]]:
    """(numeros, palabras significativas) de un nombre normalizado. Los
    numeros se comparan sin ceros a la izquierda; las palabras exigen >= 3
    letras y no ser genericas."""
    numeros: set[str] = set()
    palabras: set[str] = set()
    for token in normalizar_texto(texto).split():
        if token.isdigit():
            numeros.add(token.lstrip("0") or "0")
        elif len(token) >= 3 and token not in PALABRAS_GENERICAS:
            palabras.add(token)
    return numeros, palabras


def nombres_coinciden(nombre_escuela, nombre_osm) -> bool:
    """Regla de coincidencia de nombres (tokens tras `normalizar_texto`):

    - si ambos nombres tienen numeros, coinciden solo si comparten alguno
      ("Escuela N 415" ~ "Esc. 415"; "Escuela 415" !~ "Escuela 416");
    - si no, coinciden cuando las palabras significativas del nombre OSM son
      no vacias y todas aparecen en el nombre de la escuela
      ("Escuela Armada Argentina" ~ 'ESCUELA Nº 609 "ARMADA ARGENTINA"').
    """
    numeros_e, palabras_e = _tokens(nombre_escuela)
    numeros_o, palabras_o = _tokens(nombre_osm)
    if numeros_e and numeros_o:
        return bool(numeros_e & numeros_o)
    return bool(palabras_o) and palabras_o <= palabras_e


def _redondear_coordenadas(coordenadas):
    if isinstance(coordenadas, (list, tuple)) and coordenadas and isinstance(coordenadas[0], (int, float)):
        return [round(float(coordenadas[0]), 6), round(float(coordenadas[1]), 6)]
    return [_redondear_coordenadas(c) for c in coordenadas]


def poligono_geojson(geometria) -> dict:
    """GeoJSON Polygon/MultiPolygon (lon/lat) con coordenadas a 6 decimales."""
    from shapely.geometry import mapping

    geo = mapping(geometria)
    return {"type": geo["type"], "coordinates": _redondear_coordenadas(geo["coordinates"])}


def cargar_poligonos_escolares(
    pbf_path: str, bbox_norte: float, bbox_sur: float, bbox_este: float, bbox_oeste: float
) -> list[dict]:
    """Lee UNA vez los poligonos `amenity=school` y `building=school` del pbf.

    Dos lecturas de una sola clave (el filtro multi-clave de pyrosm pierde
    elementos, ver N3-G en `osm_aislamiento`), deduplicadas por
    `(osm_type, id)`. Devuelve `[{"osm_id", "nombre", "geometria"}]` con la
    geometria en lon/lat; solo Polygon/MultiPolygon.
    """
    from pyrosm import OSM

    from geo_static.osm_aislamiento import _nombre_desde_fila

    osm = OSM(pbf_path, bounding_box=[bbox_oeste, bbox_sur, bbox_este, bbox_norte])
    poligonos: list[dict] = []
    vistos: set = set()
    for clave in ("amenity", "building"):
        datos = osm.get_data_by_custom_criteria(
            custom_filter={clave: ["school"]},
            osm_keys_to_keep=[clave],
            filter_type="keep",
            keep_nodes=False,
            keep_ways=True,
            keep_relations=True,
        )
        if datos is None or datos.empty:
            continue
        for _, fila in datos.iterrows():
            geometria = fila.get("geometry")
            if geometria is None or geometria.is_empty:
                continue
            if geometria.geom_type not in ("Polygon", "MultiPolygon"):
                continue
            identidad = (fila.get("osm_type"), fila.get("id"))
            if identidad in vistos:
                continue
            vistos.add(identidad)
            osm_id = fila.get("id")
            poligonos.append({
                "osm_id": int(osm_id) if osm_id is not None else None,
                "nombre": _nombre_desde_fila(fila),
                "geometria": geometria,
            })
    return poligonos


def _edificio(asociacion, distancia_m, candidato, candidatos: int) -> dict:
    return {
        "asociacion": asociacion,
        "distanciaM": round(float(distancia_m), 1) if distancia_m is not None else None,
        "osmId": candidato["osm_id"] if candidato else None,
        "poligono": poligono_geojson(candidato["geometria"]) if candidato else None,
        "candidatos": candidatos,
    }


def asociar_edificios(
    escuelas: list[dict], poligonos: list[dict], radio_m: float = RADIO_ASOCIACION_M
) -> dict[str, Optional[dict]]:
    """`{cueAnexo: edificio | None}` para cada escuela (ver docstring de modulo).

    Proyecta poligonos y puntos una sola vez y consulta un STRtree. Para
    `ambigua`, `distanciaM` es la menor distancia entre los candidatos que
    empataron (0 si el punto cae dentro de varios).
    """
    if not escuelas:
        return {}
    if not poligonos:
        return {e["cueAnexo"]: None for e in escuelas}

    from pyproj import Transformer
    from shapely.geometry import Point
    from shapely.ops import transform
    from shapely.strtree import STRtree

    transformer = Transformer.from_crs(4326, CRS_METRICO, always_xy=True)
    proyectados = [transform(transformer.transform, p["geometria"]) for p in poligonos]
    arbol = STRtree(proyectados)

    resultado: dict[str, Optional[dict]] = {}
    for escuela in escuelas:
        x, y = transformer.transform(escuela["lon"], escuela["lat"])
        punto = Point(x, y)
        cercanos = [
            int(i) for i in arbol.query(punto, predicate="dwithin", distance=radio_m)
        ]
        distancias = {i: proyectados[i].distance(punto) for i in cercanos}

        dentro = [i for i in cercanos if proyectados[i].covers(punto)]
        if dentro:
            paso, elegidos = ASOCIACION_DENTRO, dentro
        else:
            por_nombre = [
                i for i in cercanos
                if nombres_coinciden(escuela.get("nombre"), poligonos[i]["nombre"])
            ]
            if por_nombre:
                paso, elegidos = ASOCIACION_NOMBRE, por_nombre
            elif cercanos:
                paso, elegidos = ASOCIACION_CERCANIA, cercanos
            else:
                resultado[escuela["cueAnexo"]] = None
                continue

        if len(elegidos) > 1:
            resultado[escuela["cueAnexo"]] = _edificio(
                ASOCIACION_AMBIGUA, min(distancias[i] for i in elegidos), None, len(elegidos)
            )
            continue
        (unico,) = elegidos
        # Fuera del poligono, `distance` es la distancia al borde.
        distancia = 0.0 if paso == ASOCIACION_DENTRO else distancias[unico]
        resultado[escuela["cueAnexo"]] = _edificio(paso, distancia, poligonos[unico], 1)
    return resultado
