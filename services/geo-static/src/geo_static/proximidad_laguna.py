"""Proximidad a cuerpos de agua (laguna) para la clase de inundacion v2.

Funciones puras sobre arrays numpy: no hacen I/O raster. El llamador debe
entregar la ventana de ocurrencia GSW (0-100, 255 = nodata) y los DEM ya
leidos. Las distancias se expresan en metros; las resoluciones en metros por
pixel (ver metros_por_grado para EPSG:4326).
"""

from __future__ import annotations

import math

import numpy as np

# Radio (metros) alrededor de la escuela donde se busca agua.
RADIO_BUSQUEDA_M = 300

# Radio (metros) alrededor de la escuela cuyo DEM representa el terreno de la escuela.
RADIO_ESCUELA_M = 50

# Ocurrencia GSW (%) minima para considerar un pixel como agua. 255 = nodata.
OCURRENCIA_MIN_PCT = 25
NODATA_GSW = 255

# Percentil del DEM usado para la altura de la escuela y del agua.
PERCENTIL_DEM = 10

# Distancia maxima (metros) al agua y altura maxima (metros) sobre el agua
# para considerar que la escuela esta junto a la laguna.
# GLO-30 es un modelo de superficie (copas de arboles, techos): el p10 se usa
# para acercarse al nivel del suelo. Umbral calibrado con 1801166-00 (4.88 m,
# laguna) y 1801164-00 (13.67 m, no laguna).
DISTANCIA_MAX_M = 300
ALTURA_MAX_M = 6.0


def distancia_agua_m(
    ocurrencia: np.ndarray,
    centro_fila: int,
    centro_col: int,
    res_x_m: float,
    res_y_m: float,
    *,
    ocurrencia_min_pct: float = OCURRENCIA_MIN_PCT,
    radio_m: float = RADIO_BUSQUEDA_M,
) -> float | None:
    """Distancia minima (metros) desde el pixel central a un pixel de agua.

    Busca solo dentro de RADIO_BUSQUEDA_M (ventana recortada a los bordes del
    array). Un pixel es agua si su ocurrencia esta en [OCURRENCIA_MIN_PCT, 255)
    y no es nodata. Devuelve None si no hay agua dentro del radio.
    """
    ocurrencia = np.asarray(ocurrencia)
    alto, ancho = ocurrencia.shape

    semi_fila = math.ceil(radio_m / res_y_m)
    semi_col = math.ceil(radio_m / res_x_m)
    fila_ini = max(0, centro_fila - semi_fila)
    fila_fin = min(alto, centro_fila + semi_fila + 1)
    col_ini = max(0, centro_col - semi_col)
    col_fin = min(ancho, centro_col + semi_col + 1)

    ventana = ocurrencia[fila_ini:fila_fin, col_ini:col_fin]
    es_agua = (ventana >= ocurrencia_min_pct) & (ventana != NODATA_GSW)
    filas, cols = np.nonzero(es_agua)
    if filas.size == 0:
        return None

    dy = (filas + fila_ini - centro_fila) * res_y_m
    dx = (cols + col_ini - centro_col) * res_x_m
    distancias = np.hypot(dx, dy)
    dentro = distancias[distancias <= radio_m]
    if dentro.size == 0:
        return None
    return float(dentro.min())


def altura_sobre_agua_m(
    dem_escuela: np.ndarray,
    dem_agua: np.ndarray,
    *,
    percentil: float = PERCENTIL_DEM,
) -> float | None:
    """Altura (metros) de la escuela sobre el agua, con percentil del DEM.

    dem_escuela: DEM dentro de RADIO_ESCUELA_M de la escuela.
    dem_agua: DEM en los pixeles de agua GSW dentro de RADIO_BUSQUEDA_M.
    Resultado: p(percentil) de dem_escuela menos p(percentil) de dem_agua.
    Ignora NaN. Devuelve None si alguno de los dos conjuntos queda vacio.
    """
    escuela = np.asarray(dem_escuela, dtype=float).ravel()
    escuela = escuela[np.isfinite(escuela)]
    agua = np.asarray(dem_agua, dtype=float).ravel()
    agua = agua[np.isfinite(agua)]
    if escuela.size == 0 or agua.size == 0:
        return None
    return float(np.percentile(escuela, percentil) - np.percentile(agua, percentil))


def junto_laguna(
    distancia: float | None,
    altura: float | None,
    *,
    distancia_max_m: float = DISTANCIA_MAX_M,
    altura_max_m: float = ALTURA_MAX_M,
) -> bool | None:
    """Decide si la escuela esta junto a la laguna.

    - False si no hay agua cercana (distancia None) o la distancia supera
      DISTANCIA_MAX_M, sin importar la altura.
    - None si hay agua cercana pero la altura no se pudo calcular.
    - True si distancia <= DISTANCIA_MAX_M y altura <= ALTURA_MAX_M.
    - False en otro caso (altura por encima del limite).
    """
    if distancia is None or distancia > distancia_max_m:
        return False
    if altura is None:
        return None
    return altura <= altura_max_m


def metros_por_grado(lat: float) -> tuple[float, float]:
    """Metros por grado de longitud (mx) y de latitud (my) en la latitud dada.

    Aproximacion elipsoidal WGS84 para convertir tamanos de pixel EPSG:4326
    (grados) a metros.
    """
    phi = math.radians(lat)
    mx = 111412.84 * math.cos(phi) - 93.5 * math.cos(3 * phi)
    my = 111132.954 - 559.822 * math.cos(2 * phi) + 1.175 * math.cos(4 * phi)
    return mx, my
