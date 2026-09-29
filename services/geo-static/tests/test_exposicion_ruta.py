import math

from geo_static.exposicion_ruta import (
    PASO_MUESTREO_M,
    celdas_de_ruta,
    celda_de,
    centro_de_celda,
    densificar_ruta,
    detalle_celdas,
    resumir_exposicion,
)


def _distancia_aproximada(a, b):
    lat_media = math.radians((a[1] + b[1]) / 2)
    dx = (b[0] - a[0]) * 111320 * math.cos(lat_media)
    dy = (b[1] - a[1]) * 111320
    return math.hypot(dx, dy)


def test_densificar_arista_larga_respeta_paso():
    puntos = densificar_ruta([[-58.0, -27.0], [-57.966, -27.0]])
    assert len(puntos) >= 7
    assert max(_distancia_aproximada(a, b) for a, b in zip(puntos, puntos[1:])) <= PASO_MUESTREO_M * 1.05


def test_celda_y_centro_son_coherentes():
    celda = celda_de(-58.1234, -27.9876)
    assert celda_de(*centro_de_celda(*celda)) == celda


def test_celdas_de_ruta_deduplica_conservando_orden():
    ruta = [[0.001, 0.001], [0.012, 0.001], [0.001, 0.001]]
    celdas = celdas_de_ruta(ruta)
    assert celdas == list(dict.fromkeys(celdas))
    assert celdas[0] == celda_de(*ruta[0])
    assert celdas[1] == celda_de(*ruta[1])


def test_resumir_exposicion_mezcla_profundidad_cero_y_sin_dato():
    celdas = [(0, 0), (1, 0), (2, 0), (3, 0)]
    resumen = resumir_exposicion(celdas, {(0, 0): 1.2, (1, 0): 0.0, (2, 0): None})
    assert resumen == {
        "celdas_total": 4,
        "celdas_con_dato": 2,
        "celdas_con_profundidad": 1,
        "profundidad_max_m": 1.2,
        "cobertura": 0.5,
        "estado": "con_profundidad",
    }


def test_resumir_estados_y_cobertura():
    assert resumir_exposicion([], {})["estado"] == "sin_ruta"
    assert resumir_exposicion([(0, 0)], {})["estado"] == "sin_dato"
    sin_profundidad = resumir_exposicion([(0, 0), (1, 0)], {(0, 0): 0.0, (1, 0): -0.2})
    assert sin_profundidad["estado"] == "sin_profundidad"
    assert sin_profundidad["cobertura"] == 1.0
    assert sin_profundidad["profundidad_max_m"] == 0.0


def test_ruta_vacia_y_detalle_celdas():
    assert densificar_ruta([]) == []
    assert celdas_de_ruta([]) == []
    assert resumir_exposicion([], {})["cobertura"] == 0.0
    assert detalle_celdas([(0, 0), (1, 0)], {(0, 0): 0.4}) == [
        {"lon": 0.004167, "lat": 0.004167, "profundidad_m": 0.4},
        {"lon": 0.0125, "lat": 0.004167, "profundidad_m": None},
    ]
