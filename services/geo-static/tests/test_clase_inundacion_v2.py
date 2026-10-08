from geo_static.clase_inundacion_v2 import (
    UMBRAL_PROFUNDIDAD_M,
    clasificar_rio,
)


def _perfil(rp10, rp100, rp500):
    return {10: rp10, 100: rp100, 500: rp500}


def test_alto_cuando_alcanza_rp10():
    assert clasificar_rio(_perfil(1.2, 2.0, 2.5)) == "alto"


def test_medio_cuando_alcanza_rp100_pero_no_rp10():
    assert clasificar_rio(_perfil(0.0, 0.8, 1.1)) == "medio"


def test_bajo_cuando_solo_alcanza_rp500():
    assert clasificar_rio(_perfil(0.0, 0.0, 0.5)) == "bajo"


def test_sin_riesgo_cuando_no_alcanza_rp500():
    assert clasificar_rio(_perfil(0.0, 0.0, 0.0)) == "sin_riesgo"


def test_umbral_exacto_cuenta_como_alcanzado():
    assert UMBRAL_PROFUNDIDAD_M == 0.15
    assert clasificar_rio(_perfil(0.15, 0.0, 0.0)) == "alto"


def test_debajo_del_umbral_no_cuenta_como_alcanzado():
    assert clasificar_rio(_perfil(0.14, 0.0, 0.0)) == "sin_riesgo"
    assert clasificar_rio(_perfil(0.0, 0.14, 0.0)) == "sin_riesgo"
    assert clasificar_rio(_perfil(0.0, 0.0, 0.14)) == "sin_riesgo"


def test_none_en_cualquier_periodo_es_sin_dato():
    assert clasificar_rio(_perfil(None, 1.0, 1.0)) == "sin_dato"
    assert clasificar_rio(_perfil(1.0, None, 1.0)) == "sin_dato"
    assert clasificar_rio(_perfil(1.0, 1.0, None)) == "sin_dato"


def test_cero_es_no_alcanzado_y_no_sin_dato():
    assert clasificar_rio(_perfil(0.0, 0.0, 0.0)) == "sin_riesgo"


def test_margen_negativo_en_rp10_bloquea_y_baja_a_medio():
    assert clasificar_rio(_perfil(1.2, 2.0, 2.5), {10: 0.5, 100: -0.1, 500: -1.0}) == "medio"


def test_margen_none_no_bloquea_el_periodo():
    assert clasificar_rio(_perfil(1.2, 2.0, 2.5), {10: None, 100: None, 500: None}) == "alto"


def test_margen_negativo_mantiene_el_periodo_alcanzado():
    assert clasificar_rio(_perfil(1.2, 2.0, 2.5), {10: -0.3, 100: 0.4, 500: 0.4}) == "alto"


def test_margen_no_eleva_periodo_que_no_alcanza_profundidad():
    assert clasificar_rio(_perfil(0.1, 0.0, 0.0), {10: -5.0}) == "sin_riesgo"


def test_sin_margenes_comportamiento_original():
    assert clasificar_rio(_perfil(1.2, 2.0, 2.5), None) == "alto"
