"""Lector puntual de proximidad a laguna (GSW occurrence + Copernicus DEM GLO-30).

Mantiene abiertos los rasters (ambos EPSG:4326) para lecturas en lote. Para una
escuela (lon, lat):
- distancia_agua_m: distancia al pixel de agua GSW mas cercano dentro de
  RADIO_BUSQUEDA_M.
- altura_sobre_agua_m: p10 del DEM dentro de RADIO_ESCUELA_M de la escuela menos
  p10 del DEM en los pixeles de agua dentro del radio.
- junto_laguna: decision de proximidad (ver proximidad_laguna.junto_laguna).

Si el punto cae fuera de los limites de cualquiera de los dos rasters, devuelve
todo None.
"""

from __future__ import annotations

import math
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

import numpy as np
import rasterio
from rasterio.transform import rowcol, xy
from rasterio.windows import Window

from geo_static.proximidad_laguna import (
    ALTURA_MAX_M,
    DISTANCIA_MAX_M,
    NODATA_GSW,
    OCURRENCIA_MIN_PCT,
    RADIO_BUSQUEDA_M,
    RADIO_ESCUELA_M,
    altura_sobre_agua_m,
    distancia_agua_m,
    junto_laguna,
    metros_por_grado,
)

RUTA_GSW_POR_DEFECTO = Path(".data/gsw/occurrence.tif")
RUTA_DEM_POR_DEFECTO = Path(".data/dem/glo30.tif")


class LectorLaguna:
    """Mantiene abiertos los rasters GSW y DEM para leer muchos puntos."""

    def __init__(
        self,
        ruta_gsw: Path,
        ruta_dem: Path,
        *,
        ocurrencia_min_pct: float = OCURRENCIA_MIN_PCT,
        radio_busqueda_m: float = RADIO_BUSQUEDA_M,
        distancia_max_m: float = DISTANCIA_MAX_M,
        altura_max_m: float = ALTURA_MAX_M,
    ) -> None:
        self._gsw = rasterio.open(ruta_gsw)
        self._dem = rasterio.open(ruta_dem)
        self._ocurrencia_min_pct = ocurrencia_min_pct
        self._radio_m = radio_busqueda_m
        self._distancia_max_m = distancia_max_m
        self._altura_max_m = altura_max_m

    def medir(self, lon: float, lat: float) -> dict:
        """Distancia (m), altura sobre el agua (m) y decision junto_laguna."""
        if not (_dentro(self._gsw, lon, lat) and _dentro(self._dem, lon, lat)):
            return {"distancia_agua_m": None, "altura_sobre_agua_m": None, "junto_laguna": None}

        ocurrencia, centro_fila, centro_col, res_x_m, res_y_m, desplazamiento = self._ventana_gsw(
            lon, lat
        )
        distancia = distancia_agua_m(
            ocurrencia,
            centro_fila,
            centro_col,
            res_x_m,
            res_y_m,
            ocurrencia_min_pct=self._ocurrencia_min_pct,
            radio_m=self._radio_m,
        )
        altura = None
        if distancia is not None:
            agua_fila, agua_col = _pixeles_agua_en_radio(
                ocurrencia,
                centro_fila,
                centro_col,
                res_x_m,
                res_y_m,
                ocurrencia_min_pct=self._ocurrencia_min_pct,
                radio_m=self._radio_m,
            )
            xs, ys = xy(
                self._gsw.transform,
                agua_fila + desplazamiento[0],
                agua_col + desplazamiento[1],
            )
            altura = self._altura(lon, lat, np.asarray(xs), np.asarray(ys))

        return {
            "distancia_agua_m": distancia,
            "altura_sobre_agua_m": altura,
            "junto_laguna": junto_laguna(
                distancia,
                altura,
                distancia_max_m=self._distancia_max_m,
                altura_max_m=self._altura_max_m,
            ),
        }

    def cerrar(self) -> None:
        self._gsw.close()
        self._dem.close()

    def _ventana_gsw(self, lon: float, lat: float):
        """Ventana GSW centrada en el punto, con nodata fuera del raster."""
        mx, my = metros_por_grado(lat)
        res_x, res_y = self._gsw.res
        res_x_m, res_y_m = res_x * mx, res_y * my
        semi_col = math.ceil(self._radio_m / res_x_m)
        semi_fila = math.ceil(self._radio_m / res_y_m)

        fila, col = self._gsw.index(lon, lat)
        fila_ini, col_ini = fila - semi_fila, col - semi_col
        ventana = Window(col_ini, fila_ini, 2 * semi_col + 1, 2 * semi_fila + 1)
        ocurrencia = self._gsw.read(
            1, window=ventana, boundless=True, fill_value=NODATA_GSW
        )
        return ocurrencia, semi_fila, semi_col, res_x_m, res_y_m, (fila_ini, col_ini)

    def _altura(self, lon: float, lat: float, xs: np.ndarray, ys: np.ndarray) -> float | None:
        """Altura de la escuela sobre el agua con p10 del DEM (ver altura_sobre_agua_m).

        Lee una ventana DEM centrada en la escuela con el radio de busqueda; de
        ahi salen el terreno de la escuela (RADIO_ESCUELA_M) y los pixeles de agua.
        """
        if xs.size == 0:
            return None
        dem = self._dem
        mx, my = metros_por_grado(lat)
        res_x, res_y = dem.res
        res_x_m, res_y_m = res_x * mx, res_y * my
        semi_fila = math.ceil(self._radio_m / res_y_m)
        semi_col = math.ceil(self._radio_m / res_x_m)

        fila_c, col_c = dem.index(lon, lat)
        fila_ini, col_ini = fila_c - semi_fila, col_c - semi_col
        bloque = (
            dem.read(
                1,
                window=Window(col_ini, fila_ini, 2 * semi_col + 1, 2 * semi_fila + 1),
                boundless=True,
                masked=True,
            )
            .astype(float)
            .filled(np.nan)
        )

        dy = (np.arange(bloque.shape[0])[:, None] - semi_fila) * res_y_m
        dx = (np.arange(bloque.shape[1])[None, :] - semi_col) * res_x_m
        dem_escuela = bloque[np.hypot(dx, dy) <= RADIO_ESCUELA_M]

        filas, cols = rowcol(dem.transform, xs, ys)
        filas = np.asarray(filas) - fila_ini
        cols = np.asarray(cols) - col_ini
        dentro = (
            (filas >= 0) & (filas < bloque.shape[0]) & (cols >= 0) & (cols < bloque.shape[1])
        )
        dem_agua = bloque[filas[dentro], cols[dentro]]
        return altura_sobre_agua_m(dem_escuela, dem_agua)


def _dentro(raster, lon: float, lat: float) -> bool:
    izquierda, abajo, derecha, arriba = raster.bounds
    return izquierda <= lon <= derecha and abajo <= lat <= arriba


def _pixeles_agua_en_radio(
    ocurrencia: np.ndarray,
    centro_fila: int,
    centro_col: int,
    res_x_m: float,
    res_y_m: float,
    *,
    ocurrencia_min_pct: float = OCURRENCIA_MIN_PCT,
    radio_m: float = RADIO_BUSQUEDA_M,
) -> tuple[np.ndarray, np.ndarray]:
    """Filas y columnas (en la ventana) de pixeles de agua dentro del radio."""
    es_agua = (ocurrencia >= ocurrencia_min_pct) & (ocurrencia != NODATA_GSW)
    filas, cols = np.nonzero(es_agua)
    dy = (filas - centro_fila) * res_y_m
    dx = (cols - centro_col) * res_x_m
    dentro = np.hypot(dx, dy) <= radio_m
    return filas[dentro], cols[dentro]


@contextmanager
def abrir_lector_laguna(
    ruta_gsw: Path = RUTA_GSW_POR_DEFECTO,
    ruta_dem: Path = RUTA_DEM_POR_DEFECTO,
) -> Iterator[LectorLaguna]:
    """Abre GSW y DEM una vez para leer muchos puntos y los cierra al salir."""
    lector = LectorLaguna(ruta_gsw, ruta_dem)
    try:
        yield lector
    finally:
        lector.cerrar()
