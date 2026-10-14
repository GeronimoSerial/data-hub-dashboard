"""Exposicion estatica al rio desde el DEM (entrada del motor de exposicion dinamica).

Para una escuela (lon, lat), con DEM Copernicus GLO-30 y GSW occurrence:
- suelo_m: p10 del DEM dentro de RADIO_SUELO_M (50 m) de la escuela.
- nivel_rio_dem_m: p10 del DEM en los pixeles de agua permanente (GSW occ >= 90 y
  <= 100) dentro de RADIO_RIO_M (2 km).
- distancia_rio_m: distancia minima (m) a esos pixeles de agua permanente.

El motor dinamico compara el suelo con la superficie del agua, que es el nivel
del rio en el DEM mas la anomalia actual del limnimetro. Este job solo aporta la
parte estatica de esa comparacion.

Supuestos:
- La superficie de agua de Copernicus GLO-30 se aproxima al nivel tipico del rio.
- El error vertical del DEM es de unos 2 m; el valor es orientativo, no topografico.
- El agua permanente mas cercana puede ser una laguna. El motor solo usa este
  valor para escuelas mapeadas a un tramo de rio.

`calcular_exposicion` es pura (arrays en memoria). `LectorExposicionRioDem` lee
los rasters en ventanas alrededor de la escuela.
"""

from __future__ import annotations

from collections.abc import Iterable, Iterator
from contextlib import contextmanager
from pathlib import Path

import numpy as np
import rasterio

from geo_static.margen_inundacion import (
    OCURRENCIA_MAX_PCT,
    OCURRENCIA_PERMANENTE_MIN_PCT,
    RADIO_RIO_M,
    RADIO_SUELO_M,
    RUTA_DEM_POR_DEFECTO,
    RUTA_GSW_POR_DEFECTO,
    _centros,
    _dentro,
    _leer,
    _muestrear_ventana,
    _p10,
    _ventana,
    distancia_m,
)


def calcular_exposicion(
    alturas_suelo: Iterable[float] | np.ndarray,
    alturas_agua: Iterable[float] | np.ndarray,
    distancias_agua_m: Iterable[float] | np.ndarray,
) -> dict[str, float | None]:
    """Suelo, nivel del rio en el DEM (m) y distancia al agua permanente (m).

    - `alturas_suelo`: alturas DEM del terreno de la escuela (nan = nodata).
    - `alturas_agua`: alturas DEM de los pixeles de agua permanente (nan = nodata).
    - `distancias_agua_m`: distancia (m) de cada pixel de agua permanente a la escuela.

    Sin pixeles de agua validos, nivel y distancia son None. Sin terreno valido,
    suelo es None.
    """
    distancias = np.asarray(distancias_agua_m, dtype=float).ravel()
    distancias = distancias[np.isfinite(distancias)]
    distancia = float(distancias.min()) if distancias.size else None
    nivel = _p10(alturas_agua)
    suelo = _p10(alturas_suelo)
    return {
        "suelo_m": _redondear(suelo),
        "nivel_rio_dem_m": _redondear(nivel),
        "distancia_rio_m": _redondear(distancia),
    }


def _redondear(valor: float | None) -> float | None:
    return None if valor is None else round(valor, 2)


class LectorExposicionRioDem:
    """Mantiene abiertos DEM y GSW para medir muchas escuelas."""

    def __init__(
        self,
        ruta_dem: Path = RUTA_DEM_POR_DEFECTO,
        ruta_gsw: Path = RUTA_GSW_POR_DEFECTO,
    ) -> None:
        self._dem = rasterio.open(ruta_dem)
        self._gsw = rasterio.open(ruta_gsw)

    def medir(self, lon: float, lat: float) -> dict[str, float | None]:
        """Exposicion estatica (m) en (lon, lat); todos None fuera del raster."""
        nulos: dict[str, float | None] = {
            "suelo_m": None,
            "nivel_rio_dem_m": None,
            "distancia_rio_m": None,
        }
        if not (_dentro(self._dem, lon, lat) and _dentro(self._gsw, lon, lat)):
            return nulos

        ventana_dem, tr_dem = _ventana(self._dem, lon, lat)
        dem = _leer(self._dem, ventana_dem)
        xs_d, ys_d = _centros(tr_dem, dem.shape)
        alturas_suelo = dem[distancia_m(lat, lon, ys_d, xs_d) <= RADIO_SUELO_M]

        ventana_gsw, tr_gsw = _ventana(self._gsw, lon, lat)
        ocurrencia = _leer(self._gsw, ventana_gsw)
        xs_o, ys_o = _centros(tr_gsw, ocurrencia.shape)
        agua = (ocurrencia >= OCURRENCIA_PERMANENTE_MIN_PCT) & (
            ocurrencia <= OCURRENCIA_MAX_PCT
        )
        xs_w, ys_w = xs_o[agua], ys_o[agua]
        distancias = distancia_m(lat, lon, ys_w, xs_w)
        en_radio = distancias <= RADIO_RIO_M
        xs_w, ys_w = xs_w[en_radio], ys_w[en_radio]
        distancias = distancias[en_radio]

        alturas_agua = _muestrear_ventana(dem, tr_dem, xs_w, ys_w)
        return calcular_exposicion(alturas_suelo, alturas_agua, distancias)

    def cerrar(self) -> None:
        self._dem.close()
        self._gsw.close()


@contextmanager
def abrir_lector_exposicion_rio_dem(
    ruta_dem: Path = RUTA_DEM_POR_DEFECTO,
    ruta_gsw: Path = RUTA_GSW_POR_DEFECTO,
) -> Iterator[LectorExposicionRioDem]:
    """Abre DEM y GSW una vez para medir muchas escuelas y los cierra al salir."""
    lector = LectorExposicionRioDem(ruta_dem, ruta_gsw)
    try:
        yield lector
    finally:
        lector.cerrar()
