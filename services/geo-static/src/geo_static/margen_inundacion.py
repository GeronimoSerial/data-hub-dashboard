"""Margen de terreno frente a la subida de inundacion (JRC ignora defensas).

Para una escuela (lon, lat), con DEM Copernicus GLO-30, GSW occurrence y
profundidades JRC por periodo de retorno:
- ground: p10 del DEM dentro de RADIO_SUELO_M (50 m) de la escuela.
- nivel_rio: p10 del DEM en los pixeles de agua permanente (GSW occ >= 90 y
  <= 100) dentro de RADIO_RIO_M (2 km).
- nivel_rpN: superficie de agua del periodo, mediana de (DEM + profundidad JRC)
  en los pixeles de llanura (GSW occ < 90 o nodata, con profundidad > 0) dentro
  de RADIO_RIO_M, acotada por abajo a nivel_rio. Sin llanura inundada, el
  periodo queda en el cauce y nivel_rpN = nivel_rio.
- margen_rpN = ground - nivel_rpN. Negativo: el suelo queda por debajo del
  nivel de inundacion del periodo.

Version anterior: subida_rpN era la profundidad JRC maxima sobre el propio cauce.
Esa profundidad es la del rio y no una subida sobre las orillas, por lo que los
margenes salian unos 10 m bajos en el Uruguay.

Sin agua permanente dentro de RADIO_RIO_M, o sin terreno valido, todos los
margenes son None (sin evidencia).

`calcular_margenes` es pura (arrays en memoria). `LectorMargen` lee los
rasters en ventanas alrededor de la escuela.
"""

from __future__ import annotations

import math
from collections.abc import Iterable, Iterator
from contextlib import contextmanager
from pathlib import Path

import numpy as np
import rasterio
from rasterio.errors import RasterioError
from rasterio.transform import Affine
from rasterio.windows import Window, from_bounds

RADIO_SUELO_M = 50.0
RADIO_RIO_M = 2000.0
OCURRENCIA_PERMANENTE_MIN_PCT = 90
OCURRENCIA_MAX_PCT = 100
RPS_MARGEN = (10, 100, 500)
METROS_POR_GRADO = 111320.0
RADIO_TIERRA_M = 6371000.0

RUTA_DEM_POR_DEFECTO = Path(".data/dem/glo30.tif")
RUTA_GSW_POR_DEFECTO = Path(".data/gsw/occurrence.tif")
CARPETA_JRC_POR_DEFECTO = Path(".data/jrc_flood")


def distancia_m(lat: float, lon: float, lats: np.ndarray, lons: np.ndarray) -> np.ndarray:
    """Distancia de Haversine (m) desde (lat, lon) a cada punto (lats, lons)."""
    p1 = math.radians(lat)
    p2 = np.radians(lats)
    dp = p2 - p1
    dl = np.radians(lons - lon)
    a = np.sin(dp / 2) ** 2 + math.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    return 2 * RADIO_TIERRA_M * np.arcsin(np.sqrt(a))


def calcular_margenes(
    alturas_suelo: np.ndarray,
    alturas_agua: np.ndarray,
    llanura_por_rp: dict[int, tuple[np.ndarray, np.ndarray] | None],
) -> dict[int, float | None]:
    """Margen (m) por periodo de retorno a partir de alturas ya muestreadas.

    - `alturas_suelo`: alturas DEM del terreno de la escuela (nan = nodata).
    - `alturas_agua`: alturas DEM de los pixeles de agua permanente (nan = nodata).
    - `llanura_por_rp`: por RP, (alturas DEM, profundidades JRC) de los pixeles de
      llanura inundables, alineadas (nan = nodata; profundidad <= 0 o nan = seco).
      None si el RP no tiene raster.

    Devuelve None para un RP cuando falta terreno, agua valida o raster.
    """
    suelo = _p10(alturas_suelo)
    rio = _p10(alturas_agua)
    if suelo is None or rio is None:
        return {rp: None for rp in llanura_por_rp}

    margenes: dict[int, float | None] = {}
    for rp, llanura in llanura_por_rp.items():
        if llanura is None:
            margenes[rp] = None
            continue
        nivel = _nivel_agua_m(*llanura, rio)
        margenes[rp] = suelo - nivel
    return margenes


def _p10(valores: Iterable[float] | np.ndarray) -> float | None:
    arr = np.asarray(valores, dtype=float).ravel()
    arr = arr[np.isfinite(arr)]
    if arr.size == 0:
        return None
    return float(np.percentile(arr, 10))


def _nivel_agua_m(alturas: np.ndarray, profundidades: np.ndarray, rio: float) -> float:
    """Superficie de agua (m) del periodo; queda en el cauce si no hay llanura inundada."""
    alturas_arr = np.asarray(alturas, dtype=float).ravel()
    prof = np.asarray(profundidades, dtype=float).ravel()
    valido = np.isfinite(alturas_arr) & np.isfinite(prof) & (prof > 0)
    if not valido.any():
        return rio
    nivel = float(np.median(alturas_arr[valido] + prof[valido]))
    return max(nivel, rio)


class LectorMargen:
    """Mantiene abiertos DEM, GSW y los JRC por RP para medir muchas escuelas."""

    def __init__(
        self,
        ruta_dem: Path = RUTA_DEM_POR_DEFECTO,
        ruta_gsw: Path = RUTA_GSW_POR_DEFECTO,
        carpeta_jrc: Path = CARPETA_JRC_POR_DEFECTO,
        rps: Iterable[int] = RPS_MARGEN,
    ) -> None:
        self._dem = rasterio.open(ruta_dem)
        self._gsw = rasterio.open(ruta_gsw)
        self._jrc = {rp: _abrir_jrc(carpeta_jrc / f"rp{rp}_depth.tif") for rp in rps}

    def medir(self, lon: float, lat: float) -> dict[int, float | None]:
        """Margen (m) en (lon, lat) para cada periodo de retorno configurado."""
        nulos: dict[int, float | None] = {rp: None for rp in self._jrc}
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
        en_radio = distancia_m(lat, lon, ys_w, xs_w) <= RADIO_RIO_M
        xs_w, ys_w = xs_w[en_radio], ys_w[en_radio]
        if xs_w.size == 0:
            return nulos

        llanura = (ocurrencia < OCURRENCIA_PERMANENTE_MIN_PCT) | np.isnan(ocurrencia)
        xs_l, ys_l = xs_o[llanura], ys_o[llanura]
        en_radio_l = distancia_m(lat, lon, ys_l, xs_l) <= RADIO_RIO_M
        xs_l, ys_l = xs_l[en_radio_l], ys_l[en_radio_l]

        alturas_agua = _muestrear_ventana(dem, tr_dem, xs_w, ys_w)
        alturas_llanura = _muestrear_ventana(dem, tr_dem, xs_l, ys_l)
        llanura_por_rp = {
            rp: self._llanura_jrc(jrc, lon, lat, xs_l, ys_l, alturas_llanura)
            for rp, jrc in self._jrc.items()
        }
        return calcular_margenes(alturas_suelo, alturas_agua, llanura_por_rp)

    @staticmethod
    def _profundidad_jrc(
        jrc, lon: float, lat: float, xs: np.ndarray, ys: np.ndarray
    ) -> np.ndarray | None:
        if jrc is None:
            return None
        ventana, tr = _ventana(jrc, lon, lat)
        return _muestrear_ventana(_leer(jrc, ventana), tr, xs, ys)

    @classmethod
    def _llanura_jrc(
        cls,
        jrc,
        lon: float,
        lat: float,
        xs: np.ndarray,
        ys: np.ndarray,
        alturas: np.ndarray,
    ) -> tuple[np.ndarray, np.ndarray] | None:
        """(DEM, profundidad) de los pixeles de llanura mojados por el periodo."""
        profundidades = cls._profundidad_jrc(jrc, lon, lat, xs, ys)
        if profundidades is None:
            return None
        mojado = np.nan_to_num(profundidades, nan=0.0) > 0
        return alturas[mojado], profundidades[mojado]

    def cerrar(self) -> None:
        self._dem.close()
        self._gsw.close()
        for jrc in self._jrc.values():
            if jrc is not None:
                jrc.close()


@contextmanager
def abrir_lector_margen() -> Iterator[LectorMargen]:
    """Abre DEM, GSW y JRC una vez para medir muchas escuelas y los cierra al salir."""
    lector = LectorMargen()
    try:
        yield lector
    finally:
        lector.cerrar()


def _abrir_jrc(ruta: Path) -> rasterio.DatasetReader | None:
    if not ruta.is_file():
        return None
    try:
        return rasterio.open(ruta)
    except RasterioError:
        return None


def _dentro(raster, lon: float, lat: float) -> bool:
    izquierda, abajo, derecha, arriba = raster.bounds
    return izquierda <= lon <= derecha and abajo <= lat <= arriba


def _ventana(src, lon: float, lat: float) -> tuple[Window, Affine]:
    """Ventana de RADIO_RIO_M alrededor del punto y su transformada."""
    dlat = RADIO_RIO_M / METROS_POR_GRADO
    dlon = RADIO_RIO_M / (METROS_POR_GRADO * math.cos(math.radians(lat)))
    ventana = (
        from_bounds(lon - dlon, lat - dlat, lon + dlon, lat + dlat, src.transform)
        .round_offsets()
        .round_lengths()
    )
    return ventana, src.window_transform(ventana)


def _leer(src, ventana: Window) -> np.ndarray:
    """Lee la banda 1 como float con nan en nodata (y fuera de raster)."""
    return (
        src.read(1, window=ventana, boundless=True, masked=True)
        .astype(float)
        .filled(np.nan)
    )


def _centros(tr: Affine, shape: tuple[int, int]) -> tuple[np.ndarray, np.ndarray]:
    filas, cols = np.indices(shape)
    xs = tr.c + (cols + 0.5) * tr.a
    ys = tr.f + (filas + 0.5) * tr.e
    return xs, ys


def _muestrear_ventana(arr: np.ndarray, tr: Affine, xs: np.ndarray, ys: np.ndarray) -> np.ndarray:
    """Valor de `arr` (ventana con transformada `tr`) en cada punto; nan fuera."""
    col = np.floor((xs - tr.c) / tr.a).astype(int)
    fila = np.floor((ys - tr.f) / tr.e).astype(int)
    dentro = (fila >= 0) & (fila < arr.shape[0]) & (col >= 0) & (col < arr.shape[1])
    salida = np.full(xs.shape, np.nan)
    salida[dentro] = arr[fila[dentro], col[dentro]]
    return salida
