import math

import pytest
from rasterio.transform import from_origin

from geo_static.exposicion_ruta_v2 import (
    MIN_PIXELES_EXPUESTOS,
    PASO_MUESTREO_M,
    densificar_ruta_v2,
    pixeles_de_ruta,
    profundidades_ruta,
    resumir_exposicion_v2,
)

# Transformada sintetica: pixeles de 0.001 grados, esquina superior izquierda (-59, -27).
TRANSFORM = from_origin(-59.0, -27.0, 0.001, 0.001)

ALTO = {10: 1.0, 100: 1.0, 500: 1.0}
MEDIO = {10: 0.0, 100: 0.5, 500: 1.0}
BAJO = {10: 0.0, 100: 0.0, 500: 0.5}
SIN_RIESGO = {10: 0.0, 100: 0.0, 500: 0.0}
SIN_DATO = {10: None, 100: None, 500: None}


def _distancia_m(punto_a, punto_b):
    lon1, lat1 = punto_a
    lon2, lat2 = punto_b
    lat_media = (lat1 + lat2) / 2
    dx = (lon2 - lon1) * 111320 * math.cos(math.radians(lat_media))
    dy = (lat2 - lat1) * 111320
    return math.hypot(dx, dy)


def test_paso_muestreo_es_90_metros():
    assert PASO_MUESTREO_M == 90


def test_densificar_ruta_v2_separa_muestras_a_90_metros_o_menos():
    ruta = [[-59.0, -27.5], [-58.99, -27.5]]  # ~985 m en un solo tramo

    muestras = densificar_ruta_v2(ruta)

    separaciones = [_distancia_m(a, b) for a, b in zip(muestras, muestras[1:])]
    assert len(muestras) > 2
    assert max(separaciones) <= 90 + 1e-6


def test_pixeles_de_ruta_deduplica_muestras_del_mismo_pixel():
    # Ambos extremos caen en el pixel fila 500, columna 0.
    ruta = [[-58.9995, -27.5005], [-58.9992, -27.5008]]

    assert pixeles_de_ruta(ruta, TRANSFORM) == [(500, 0)]


def test_pixeles_de_ruta_conserva_orden_de_primera_aparicion():
    # Va hacia el este y regresa: el regreso no agrega pixeles nuevos.
    ruta = [[-58.9955, -27.5005], [-58.9905, -27.5005], [-58.9955, -27.5005]]

    pixeles = pixeles_de_ruta(ruta, TRANSFORM)

    assert pixeles == [(500, columna) for columna in range(4, 10)]
    assert len(pixeles) == len(set(pixeles))


def test_profundidades_ruta_alinea_con_pixeles_y_muestrea_centros():
    class LectorFalso:
        def __init__(self):
            self.llamadas = []

        def profundidades(self, lon, lat):
            self.llamadas.append((lon, lat))
            return {10: 1.5, 100: None}

    ruta = [[-58.9995, -27.5005], [-58.9992, -27.5008]]
    lector = LectorFalso()

    resultado = profundidades_ruta(lector, ruta, TRANSFORM)

    assert resultado == [{10: 1.5, 100: None}]
    assert len(lector.llamadas) == len(pixeles_de_ruta(ruta, TRANSFORM))
    lon, lat = lector.llamadas[0]
    assert math.isclose(lon, -58.9995, abs_tol=1e-9)
    assert math.isclose(lat, -27.5005, abs_tol=1e-9)


def test_resumir_ruta_sin_pixeles_es_sin_ruta():
    resumen = resumir_exposicion_v2([])

    assert resumen == {
        "clase_ruta": "sin_ruta",
        "muestras_total": 0,
        "muestras_expuestas": 0,
        "muestras_sin_dato": 0,
        "profundidad_max_rp10_m": None,
        "profundidad_max_rp100_m": None,
        "profundidad_max_rp500_m": None,
    }


def test_resumir_ruta_todo_sin_dato_es_sin_dato():
    resumen = resumir_exposicion_v2([SIN_DATO, {10: 1.0}])

    assert resumen["clase_ruta"] == "sin_dato"
    assert resumen["muestras_total"] == 2
    assert resumen["muestras_sin_dato"] == 2
    assert resumen["muestras_expuestas"] == 0


def test_resumir_ruta_dos_pixeles_alto_no_alcanzan_el_minimo():
    resumen = resumir_exposicion_v2([ALTO, ALTO, SIN_RIESGO])

    assert MIN_PIXELES_EXPUESTOS == 3
    assert resumen["clase_ruta"] == "sin_riesgo"
    assert resumen["muestras_expuestas"] == 2


def test_resumir_ruta_tres_pixeles_alto_es_alto():
    resumen = resumir_exposicion_v2([ALTO, ALTO, ALTO, SIN_RIESGO])

    assert resumen["clase_ruta"] == "alto"
    assert resumen["muestras_expuestas"] == 3


def test_resumir_ruta_un_pixel_alto_entre_secos_no_marca_la_ruta():
    resumen = resumir_exposicion_v2([SIN_RIESGO] * 10 + [ALTO])

    assert resumen["clase_ruta"] == "sin_riesgo"
    assert resumen["muestras_expuestas"] == 1


def test_resumir_ruta_dos_alto_y_un_medio_es_medio():
    # alto no llega a 3 pixeles, pero alto o peor de medio (3) si.
    assert resumir_exposicion_v2([ALTO, ALTO, MEDIO])["clase_ruta"] == "medio"


def test_resumir_ruta_dos_medio_y_un_bajo_es_bajo():
    assert resumir_exposicion_v2([MEDIO, MEDIO, BAJO])["clase_ruta"] == "bajo"


def test_resumir_ruta_dos_medio_no_alcanzan_el_minimo_de_bajo():
    resumen = resumir_exposicion_v2([MEDIO, MEDIO, SIN_RIESGO])

    assert resumen["clase_ruta"] == "sin_riesgo"
    assert resumen["muestras_expuestas"] == 2


def test_resumir_ruta_tres_bajo_es_bajo():
    assert resumir_exposicion_v2([BAJO, BAJO, BAJO])["clase_ruta"] == "bajo"


def test_resumir_ruta_solo_sin_riesgo_no_es_expuesta():
    resumen = resumir_exposicion_v2([SIN_RIESGO, SIN_RIESGO])

    assert resumen["clase_ruta"] == "sin_riesgo"
    assert resumen["muestras_expuestas"] == 0
    assert resumen["muestras_sin_dato"] == 0


def test_resumir_ruta_ignora_sin_dato_al_contar_el_minimo():
    resumen = resumir_exposicion_v2([SIN_DATO, BAJO, BAJO, BAJO])

    assert resumen["clase_ruta"] == "bajo"
    assert resumen["muestras_total"] == 4
    assert resumen["muestras_sin_dato"] == 1
    assert resumen["muestras_expuestas"] == 3


def test_resumir_ruta_sin_dato_no_suma_para_el_minimo():
    resumen = resumir_exposicion_v2([SIN_DATO, SIN_DATO, ALTO, ALTO])

    assert resumen["clase_ruta"] == "sin_riesgo"
    assert resumen["muestras_sin_dato"] == 2


def test_resumir_ruta_margenes_bloquean_alto_y_medio_y_dejan_bajo():
    # Margen negativo solo en RP500: el pixel queda bajo, no alto ni medio.
    margen_bloquea_10_100 = {10: 0.5, 100: 0.5, 500: -0.1}
    pixeles = [ALTO, ALTO, ALTO]
    margenes = [margen_bloquea_10_100] * 3

    resumen = resumir_exposicion_v2(pixeles, margenes=margenes)

    assert resumen["clase_ruta"] == "bajo"
    assert resumen["muestras_expuestas"] == 3


def test_resumir_ruta_margenes_bloquean_todo_y_ruta_queda_sin_riesgo():
    bloqueado = {10: 0.5, 100: 0.5, 500: 0.5}

    resumen = resumir_exposicion_v2([ALTO, ALTO, ALTO], margenes=[bloqueado] * 3)

    assert resumen["clase_ruta"] == "sin_riesgo"
    assert resumen["muestras_expuestas"] == 0


def test_resumir_ruta_sin_margenes_no_bloquea_alto():
    resumen = resumir_exposicion_v2([ALTO, ALTO, ALTO], margenes=None)

    assert resumen["clase_ruta"] == "alto"


def test_resumir_ruta_margen_none_no_bloquea():
    margen_sin_evidencia = {10: None, 100: None, 500: None}

    resumen = resumir_exposicion_v2([ALTO, ALTO, ALTO], margenes=[margen_sin_evidencia] * 3)

    assert resumen["clase_ruta"] == "alto"


def test_resumir_ruta_margenes_distinta_longitud_falla():
    with pytest.raises(ValueError):
        resumir_exposicion_v2([ALTO, ALTO], margenes=[{10: 0.5, 100: 0.5, 500: 0.5}])


def test_resumir_ruta_profundidad_cero_es_dato_no_sin_dato():
    resumen = resumir_exposicion_v2([{10: 0.0, 100: 0.0, 500: 0.0}])

    assert resumen["clase_ruta"] == "sin_riesgo"
    assert resumen["muestras_sin_dato"] == 0
    assert resumen["profundidad_max_rp10_m"] == 0.0
    assert resumen["profundidad_max_rp100_m"] == 0.0
    assert resumen["profundidad_max_rp500_m"] == 0.0


def test_resumir_ruta_profundidad_max_por_periodo_ignora_none():
    pixeles = [
        {10: None, 100: 0.3, 500: 0.9},
        {10: 2.0, 100: None, 500: 0.4},
        {10: 1.0, 100: 0.1, 500: None},
    ]

    resumen = resumir_exposicion_v2(pixeles)

    assert resumen["profundidad_max_rp10_m"] == 2.0
    assert resumen["profundidad_max_rp100_m"] == 0.3
    assert resumen["profundidad_max_rp500_m"] == 0.9


def test_resumir_ruta_profundidad_max_none_sin_datos_en_ningun_pixel():
    resumen = resumir_exposicion_v2([SIN_DATO, SIN_DATO])

    assert resumen["profundidad_max_rp10_m"] is None
    assert resumen["profundidad_max_rp100_m"] is None
    assert resumen["profundidad_max_rp500_m"] is None
