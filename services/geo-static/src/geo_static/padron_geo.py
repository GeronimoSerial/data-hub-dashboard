"""Padron geografico: gate de coordenadas fuera de departamento y sedes oficiales.

Este modulo es puro (sin red, sin importar osmnx). Reune dos insumos que el job
`calcular_aislamiento` usa para no calcular metricas en un lugar equivocado:

1. Gate de coordenada fuera de departamento: una escuela cuya coordenada cae
   fuera del poligono de su propio departamento se excluye del calculo.
2. Sedes oficiales: reemplaza el proxy de "centroide de la localidad con mas
   escuelas" por la cabecera departamental real (fuente: Georef Argentina,
   archivo `data/cabeceras_departamentales.json`).
"""

from __future__ import annotations

import json
import unicodedata
from math import asin, cos, radians, sin, sqrt
from pathlib import Path

from shapely.geometry import Point, shape
from shapely.ops import nearest_points

# Evidencia (brief N3-A): 7 escuelas del padron caen entre 3.9 km y 307 km
# FUERA del poligono de su propio departamento, mientras que la siguiente
# distancia mas grande dentro de tolerancia es 1.33 km. El umbral de 2.0 km
# separa con margen ese unico grupo de outliers del resto.
UMBRAL_FUERA_DEPARTAMENTO_KM = 2.0

# Radio medio terrestre (IUGG) en kilometros, usado por la haversine.
R_TIERRA_KM = 6371.0088

# Mismo criterio de resolucion que REPO_ROOT en
# `geo_static/jobs/calcular_aislamiento.py`: este archivo esta en
# services/geo-static/src/geo_static/padron_geo.py, por lo que parents[4] es
# la raiz del repositorio.
REPO_ROOT = Path(__file__).resolve().parents[4]

CABECERAS_PATH = REPO_ROOT / "services" / "geo-static" / "data" / "cabeceras_departamentales.json"
DEPARTAMENTOS_GEOJSON_PATH = (
    REPO_ROOT / "public" / "data" / "departamentos-corrientes-georef-2026-09-27.geojson"
)


def normalizar_nombre(s: str) -> str:
    """Mayusculas, sin acentos (NFD, se descartan marcas Mn) y espacios
    colapsados. Permite comparar nombres de departamento entre fuentes."""
    descompuesto = unicodedata.normalize("NFD", s)
    sin_acentos = "".join(c for c in descompuesto if unicodedata.category(c) != "Mn")
    return " ".join(sin_acentos.upper().split())


def cargar_cabeceras_oficiales(path: str | Path | None = None) -> dict[str, tuple[float, float]]:
    """Cabeceras oficiales normalizadas -> (lat, lon). `{}` si falta el archivo."""
    ruta = Path(path) if path is not None else CABECERAS_PATH
    if not ruta.exists():
        return {}
    with open(ruta, encoding="utf-8") as f:
        datos = json.load(f)
    cabeceras: dict[str, tuple[float, float]] = {}
    for cabecera in datos.get("cabeceras", []):
        cabeceras[normalizar_nombre(cabecera["departamento"])] = (
            cabecera["lat"],
            cabecera["lon"],
        )
    return cabeceras


def resolver_cabeceras(
    escuelas: list[dict],
    oficiales: dict[str, tuple[float, float]],
    proxy: dict[str, tuple[float, float]],
) -> dict[str, tuple[float, float]]:
    """Resuelve la cabecera de cada departamento presente en `escuelas`.

    Usa la sede oficial cuando existe; si no, el proxy (centroide ya
    calculado). Nunca inventa un valor: si no hay sede oficial la clave debe
    existir en `proxy`.
    """
    cabeceras: dict[str, tuple[float, float]] = {}
    for escuela in escuelas:
        departamento = escuela["departamento"]
        clave = normalizar_nombre(departamento)
        if clave in oficiales:
            cabeceras[departamento] = oficiales[clave]
        else:
            cabeceras[departamento] = proxy[departamento]
    return cabeceras


def cargar_poligonos_departamentos(path: str | Path | None = None) -> dict[str, object]:
    """Poligonos de departamento normalizados -> geometria shapely.
    `{}` si falta el archivo."""
    ruta = Path(path) if path is not None else DEPARTAMENTOS_GEOJSON_PATH
    if not ruta.exists():
        return {}
    with open(ruta, encoding="utf-8") as f:
        datos = json.load(f)
    poligonos: dict[str, object] = {}
    for feature in datos.get("features", []):
        nombre = feature["properties"]["nombre"]
        poligonos[normalizar_nombre(nombre)] = shape(feature["geometry"])
    return poligonos


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return 2 * R_TIERRA_KM * asin(sqrt(a))


def distancia_a_poligono_km(lat: float, lon: float, poligono) -> float:
    """0.0 si el poligono contiene o toca el punto; si no, la distancia
    haversine en km entre el punto y el punto mas cercano del poligono."""
    punto = Point(lon, lat)
    if poligono.covers(punto):
        return 0.0
    cercano = nearest_points(poligono, punto)[0]
    return _haversine_km(lat, lon, cercano.y, cercano.x)


def coordenada_fuera_de_departamento(
    escuela: dict,
    poligonos: dict[str, object],
    umbral_km: float = UMBRAL_FUERA_DEPARTAMENTO_KM,
) -> float | None:
    """Devuelve la distancia en km cuando supera `umbral_km`; si no, `None`.

    Tambien devuelve `None` cuando el departamento no tiene poligono: sin
    evidencia geometrica no se marca ninguna escuela.
    """
    poligono = poligonos.get(normalizar_nombre(escuela["departamento"]))
    if poligono is None:
        return None
    distancia = distancia_a_poligono_km(escuela["lat"], escuela["lon"], poligono)
    if distancia > umbral_km:
        return distancia
    return None
