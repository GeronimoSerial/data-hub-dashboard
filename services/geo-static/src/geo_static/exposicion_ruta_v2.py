"""Funciones puras para exposicion historica de inundacion por ruta sobre JRC 90 m.

Muestrea la ruta cada PASO_MUESTREO_M metros, la mapea a pixeles del raster JRC
mediante una transformada afin y lee la profundidad por periodo de retorno en el
centro de cada pixel unico. No modifica el calculo v1 (exposicion_ruta.py).
"""

from __future__ import annotations

from rasterio.transform import rowcol, xy

from .clase_inundacion_v2 import (
    CLASE_ALTO,
    CLASE_BAJO,
    CLASE_MEDIO,
    CLASE_SIN_DATO,
    CLASE_SIN_RIESGO,
    RP_ALTO,
    RP_BAJO,
    RP_MEDIO,
    clasificar_rio,
)
from .exposicion_ruta import densificar_ruta

PASO_MUESTREO_M = 90

# Pixeles minimos con clase igual o peor para que la ruta quede en esa clase.
# 3 pixeles de 90 m (~270 m) evitan marcar un tramo por un solo pixel. Calibrado
# con la ruta control 1801164-00 (Capital), que no debe marcarse por un pixel aislado.
MIN_PIXELES_EXPUESTOS = 3

_ORDEN_CLASE = {CLASE_SIN_RIESGO: 0, CLASE_BAJO: 1, CLASE_MEDIO: 2, CLASE_ALTO: 3}
_CLASES_EXPUESTAS = (CLASE_ALTO, CLASE_MEDIO, CLASE_BAJO)


def densificar_ruta_v2(coordenadas, paso_m: float = PASO_MUESTREO_M) -> list[list[float]]:
    """Agrega muestras lineales para que ningun tramo supere paso_m metros."""
    return densificar_ruta(coordenadas, paso_m=paso_m)


def pixeles_de_ruta(coordenadas, transform) -> list[tuple[int, int]]:
    """Devuelve los pixeles (fila, columna) visitados por la ruta, sin repetir y en orden."""
    resultado: list[tuple[int, int]] = []
    vistos: set[tuple[int, int]] = set()
    for lon, lat in densificar_ruta_v2(coordenadas):
        fila, columna = rowcol(transform, lon, lat)
        pixel = (int(fila), int(columna))
        if pixel not in vistos:
            vistos.add(pixel)
            resultado.append(pixel)
    return resultado


def profundidades_ruta(lector, coordenadas, transform) -> list[dict[int, float | None]]:
    """Profundidad (m) por periodo de retorno en el centro de cada pixel unico de la ruta.

    La lista esta alineada con pixeles_de_ruta(coordenadas, transform). El lector
    solo expone lectura puntual, por eso se muestrea el centro de cada pixel.
    """
    resultado = []
    for fila, columna in pixeles_de_ruta(coordenadas, transform):
        lon, lat = xy(transform, fila, columna, offset="center")
        resultado.append(lector.profundidades(lon, lat))
    return resultado


def _maximo_o_none(profundidades, rp: int) -> float | None:
    valores = [p.get(rp) for p in profundidades if p.get(rp) is not None]
    return max(valores) if valores else None


def _clase_ruta(clases: list[str]) -> str:
    """Clase mas severa X que alcanzan al menos MIN_PIXELES_EXPUESTOS pixeles (X o peor)."""
    con_dato = [clase for clase in clases if clase != CLASE_SIN_DATO]
    if not clases:
        return "sin_ruta"
    if not con_dato:
        return CLASE_SIN_DATO
    for nivel in (CLASE_ALTO, CLASE_MEDIO, CLASE_BAJO):
        peores = sum(_ORDEN_CLASE[clase] >= _ORDEN_CLASE[nivel] for clase in con_dato)
        if peores >= MIN_PIXELES_EXPUESTOS:
            return nivel
    return CLASE_SIN_RIESGO


def resumir_exposicion_v2(
    profundidades: list[dict[int, float | None]],
    margenes: list[dict[int, float | None]] | None = None,
) -> dict:
    """Resume la exposicion de una ruta a partir de profundidades por pixel.

    `margenes` (opcional) va alineado con `profundidades` y se pasa a
    clasificar_rio por pixel. Sin margenes no se aplica bloqueo por terreno.

    La clase de la ruta es la mas severa que alcanzan al menos
    MIN_PIXELES_EXPUESTOS pixeles (alto > medio > bajo); si ninguna clase llega
    a ese minimo, sin_riesgo. Los pixeles sin_dato se cuentan pero se ignoran
    para la clase si hay algun pixel con dato. None significa sin dato; 0.0 es
    un dato valido.
    """
    if margenes is None:
        margenes = [None] * len(profundidades)
    elif len(margenes) != len(profundidades):
        raise ValueError("margenes debe tener la misma longitud que profundidades")

    clases = [clasificar_rio(p, margenes=m) for p, m in zip(profundidades, margenes)]
    con_dato = [clase for clase in clases if clase != CLASE_SIN_DATO]

    return {
        "clase_ruta": _clase_ruta(clases),
        "muestras_total": len(clases),
        "muestras_expuestas": sum(clase in _CLASES_EXPUESTAS for clase in clases),
        "muestras_sin_dato": len(clases) - len(con_dato),
        "profundidad_max_rp10_m": _maximo_o_none(profundidades, RP_ALTO),
        "profundidad_max_rp100_m": _maximo_o_none(profundidades, RP_MEDIO),
        "profundidad_max_rp500_m": _maximo_o_none(profundidades, RP_BAJO),
    }
