"""Lector puntual de profundidades JRC (River Flood Hazard Maps v2.1).

Lee jrc_flood/rp{N}_depth.tif (EPSG:4326, nodata -9999) en un punto y devuelve
la profundidad en metros por periodo de retorno. Convenciones:
- Punto fuera de los limites del raster, fuera de la huella de los tiles
  (tile_extents.geojson), archivo ausente o error de lectura: None.
- Nodata dentro de cobertura: 0.0 (seco).
- Cualquier otro caso: profundidad float.

Si falta tile_extents.geojson no hay forma de verificar cobertura, por lo que
todos los periodos devuelven None.
"""

from __future__ import annotations

import json
import math
from collections.abc import Iterator, Sequence
from contextlib import contextmanager
from pathlib import Path

import rasterio
from rasterio.errors import RasterioError
from rasterio.windows import Window
from shapely.geometry import Point, shape
from shapely.geometry.base import BaseGeometry
from shapely.ops import unary_union

CARPETA_JRC_POR_DEFECTO = Path(".data/jrc_flood")
RPS_POR_DEFECTO = (10, 20, 50, 75, 100, 200, 500)
NODATA_JRC = -9999.0
ARCHIVO_HUELLAS = "tile_extents.geojson"


class LectorJrc:
    """Mantiene abiertos los rasters JRC de una carpeta para lecturas en lote."""

    def __init__(self, carpeta: Path, rps: Sequence[int]) -> None:
        self._rasters: dict[int, rasterio.DatasetReader | None] = {
            rp: _abrir_raster(carpeta / f"rp{rp}_depth.tif") for rp in rps
        }
        self._huella = _cargar_huella(carpeta / ARCHIVO_HUELLAS)

    def profundidades(self, lon: float, lat: float) -> dict[int, float | None]:
        """Profundidad (m) en el punto para cada periodo de retorno configurado."""
        return {rp: self._profundidad(rp, lon, lat) for rp in self._rasters}

    def cerrar(self) -> None:
        for raster in self._rasters.values():
            if raster is not None:
                raster.close()

    def _profundidad(self, rp: int, lon: float, lat: float) -> float | None:
        raster = self._rasters[rp]
        if raster is None or self._huella is None:
            return None
        if not self._huella.covers(Point(lon, lat)):
            return None

        izquierda, abajo, derecha, arriba = raster.bounds
        if not (izquierda <= lon <= derecha and abajo <= lat <= arriba):
            return None

        try:
            fila, col = raster.index(lon, lat)
            fila = min(max(fila, 0), raster.height - 1)
            col = min(max(col, 0), raster.width - 1)
            valor = float(raster.read(1, window=Window(col, fila, 1, 1))[0, 0])
        except (RasterioError, IndexError, ValueError):
            return None

        nodata = raster.nodata if raster.nodata is not None else NODATA_JRC
        if valor == nodata or math.isnan(valor):
            return 0.0
        return valor


def _abrir_raster(ruta: Path) -> rasterio.DatasetReader | None:
    if not ruta.is_file():
        return None
    try:
        return rasterio.open(ruta)
    except RasterioError:
        return None


def _cargar_huella(ruta: Path) -> BaseGeometry | None:
    """Une las geometrias de tile_extents.geojson en una sola huella de cobertura."""
    if not ruta.is_file():
        return None
    try:
        geojson = json.loads(ruta.read_text(encoding="utf-8"))
        geometrias = [shape(f["geometry"]) for f in geojson["features"]]
    except (OSError, ValueError, KeyError, TypeError):
        return None
    return unary_union(geometrias) if geometrias else None


@contextmanager
def abrir_lector(
    carpeta: Path = CARPETA_JRC_POR_DEFECTO,
    rps: Sequence[int] = RPS_POR_DEFECTO,
) -> Iterator[LectorJrc]:
    """Abre los rasters JRC una vez para leer muchos puntos y los cierra al salir."""
    lector = LectorJrc(carpeta, rps)
    try:
        yield lector
    finally:
        lector.cerrar()


def leer_profundidades(
    lon: float,
    lat: float,
    carpeta: Path = CARPETA_JRC_POR_DEFECTO,
    rps: Sequence[int] = RPS_POR_DEFECTO,
) -> dict[int, float | None]:
    """Lee la profundidad (m) en (lon, lat) para cada periodo de retorno.

    Ver la documentacion del modulo para el significado de None y 0.0.
    """
    with abrir_lector(carpeta, rps) as lector:
        return lector.profundidades(lon, lat)
