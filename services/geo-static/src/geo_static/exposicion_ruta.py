"""Funciones puras para calcular exposicion historica de inundacion por ruta."""

from __future__ import annotations

import math

from .physrisk_susceptibilidad import _PATH_INUNDACION_FLUVIAL

RESOLUCION_ARCSEC = 30
CELDAS_POR_GRADO = 120
PASO_MUESTREO_M = 400
PERIODO_RETORNO_ANIOS = 100
PATH_INUNDACION_HISTORICA = _PATH_INUNDACION_FLUVIAL


def celda_de(lon: float, lat: float) -> tuple[int, int]:
    """Devuelve los indices de grilla para una coordenada."""
    return math.floor(lon * CELDAS_POR_GRADO), math.floor(lat * CELDAS_POR_GRADO)


def centro_de_celda(ix: int, iy: int) -> tuple[float, float]:
    """Devuelve el centro de una celda de 30 segundos de arco."""
    return (
        round((ix + 0.5) / CELDAS_POR_GRADO, 6),
        round((iy + 0.5) / CELDAS_POR_GRADO, 6),
    )


def densificar_ruta(coordenadas, paso_m: float = PASO_MUESTREO_M) -> list[list[float]]:
    """Agrega muestras lineales a cada segmento para limitar su separacion."""
    if not coordenadas:
        return []
    puntos = [[coordenadas[0][0], coordenadas[0][1]]]
    for inicio, fin in zip(coordenadas, coordenadas[1:]):
        lon1, lat1 = inicio
        lon2, lat2 = fin
        lat_media = (lat1 + lat2) / 2
        metros_lat = (lat2 - lat1) * 111320
        metros_lon = (lon2 - lon1) * 111320 * math.cos(math.radians(lat_media))
        distancia = math.hypot(metros_lon, metros_lat)
        intervalos = max(1, math.ceil(distancia / paso_m))
        for indice in range(1, intervalos + 1):
            fraccion = indice / intervalos
            puntos.append(
                [lon1 + (lon2 - lon1) * fraccion, lat1 + (lat2 - lat1) * fraccion]
            )
    return puntos


def celdas_de_ruta(coordenadas) -> list[tuple[int, int]]:
    """Devuelve las celdas visitadas, unicas y en orden de primera aparicion."""
    resultado = []
    vistas = set()
    for lon, lat in densificar_ruta(coordenadas):
        celda = celda_de(lon, lat)
        if celda not in vistas:
            vistas.add(celda)
            resultado.append(celda)
    return resultado


def resumir_exposicion(celdas, valores) -> dict:
    """Resume cobertura y profundidad sin convertir celdas sin dato en cero."""
    celdas = list(celdas)
    profundidades = [valores[celda] for celda in celdas if valores.get(celda) is not None]
    con_profundidad = sum(valor > 0 for valor in profundidades)
    con_dato = len(profundidades)
    if not celdas:
        estado = "sin_ruta"
    elif con_dato == 0:
        estado = "sin_dato"
    elif con_profundidad:
        estado = "con_profundidad"
    else:
        estado = "sin_profundidad"
    return {
        "celdas_total": len(celdas),
        "celdas_con_dato": con_dato,
        "celdas_con_profundidad": con_profundidad,
        "profundidad_max_m": max(profundidades) if profundidades else None,
        "cobertura": con_dato / len(celdas) if celdas else 0.0,
        "estado": estado,
    }


def detalle_celdas(celdas, valores) -> list[dict]:
    """Devuelve centros de celda y profundidad en el orden recibido."""
    resultado = []
    for ix, iy in celdas:
        lon, lat = centro_de_celda(ix, iy)
        resultado.append(
            {"lon": lon, "lat": lat, "profundidad_m": valores.get((ix, iy))}
        )
    return resultado
