import numpy as np
import pytest

from geo_static.proximidad_laguna import (
    ALTURA_MAX_M,
    DISTANCIA_MAX_M,
    altura_sobre_agua_m,
    distancia_agua_m,
    junto_laguna,
    metros_por_grado,
)


def _seco(n: int = 7) -> np.ndarray:
    return np.zeros((n, n), dtype=np.uint8)


def test_distancia_none_sin_agua():
    assert distancia_agua_m(_seco(), 3, 3, 10.0, 10.0) is None


def test_distancia_horizontal():
    ocu = _seco()
    ocu[3, 6] = 100
    assert distancia_agua_m(ocu, 3, 3, 10.0, 10.0) == pytest.approx(30.0)


def test_distancia_diagonal():
    ocu = _seco()
    ocu[4, 4] = 100
    assert distancia_agua_m(ocu, 3, 3, 10.0, 10.0) == pytest.approx(14.142135, rel=1e-6)


def test_distancia_centro_es_agua():
    ocu = _seco()
    ocu[3, 3] = 80
    assert distancia_agua_m(ocu, 3, 3, 10.0, 10.0) == 0.0


def test_distancia_umbral_ocurrencia_25_cuenta_y_24_no():
    ocu = _seco()
    ocu[3, 4] = 24
    assert distancia_agua_m(ocu, 3, 3, 10.0, 10.0) is None
    ocu[3, 4] = 25
    assert distancia_agua_m(ocu, 3, 3, 10.0, 10.0) == pytest.approx(10.0)


def test_distancia_nodata_255_no_es_agua():
    ocu = _seco()
    ocu[3, 4] = 255
    assert distancia_agua_m(ocu, 3, 3, 10.0, 10.0) is None


def test_distancia_usa_el_minimo():
    ocu = _seco()
    ocu[3, 6] = 100  # 30 m
    ocu[3, 1] = 100  # 20 m
    assert distancia_agua_m(ocu, 3, 3, 10.0, 10.0) == pytest.approx(20.0)


def test_distancia_resoluciones_distintas_por_eje():
    ocu = _seco()
    ocu[4, 3] = 100  # una fila abajo: res_y = 20 -> 20 m
    ocu[3, 5] = 100  # dos columnas a la derecha: res_x = 10 -> 20 m
    assert distancia_agua_m(ocu, 3, 3, 10.0, 20.0) == pytest.approx(20.0)


def test_distancia_fuera_del_radio_es_none():
    ocu = np.zeros((100, 100), dtype=np.uint8)
    ocu[50, 90] = 100  # 400 m a la derecha con res 10
    assert distancia_agua_m(ocu, 50, 50, 10.0, 10.0) is None


def test_distancia_dentro_del_radio_se_detecta():
    ocu = np.zeros((100, 100), dtype=np.uint8)
    ocu[50, 80] = 100  # 300 m exactos
    assert distancia_agua_m(ocu, 50, 50, 10.0, 10.0) == pytest.approx(300.0)


def test_distancia_ventana_recortada_en_borde():
    ocu = _seco()
    ocu[0, 2] = 100
    assert distancia_agua_m(ocu, 0, 0, 10.0, 10.0) == pytest.approx(20.0)


def test_altura_diferencia_de_p10_escuela_y_agua():
    escuela = np.array([105.0, 106.0, 107.0, 108.0, 109.0, 110.0, 111.0, 112.0, 113.0, 114.0])
    agua = np.array([100.0, 100.0, 101.0])
    # p10 escuela = 105.9 (interpolado), p10 agua = 100.0
    assert altura_sobre_agua_m(escuela, agua) == pytest.approx(5.9)


def test_altura_usa_p10_y_no_la_mediana_de_la_escuela():
    # Un pixel bajo y nueve altos (copas/techos): p10 cae en la zona baja-alta, no en la mediana.
    escuela = np.array([100.0] + [200.0] * 9)
    assert altura_sobre_agua_m(escuela, np.array([100.0])) == pytest.approx(90.0)


def test_altura_none_si_escuela_vacia():
    assert altura_sobre_agua_m(np.array([]), np.array([100.0])) is None


def test_altura_none_si_agua_vacia():
    assert altura_sobre_agua_m(np.array([105.0]), np.array([])) is None


def test_altura_ignora_nan_en_ambos_conjuntos():
    escuela = np.array([np.nan, 105.0, np.nan])
    agua = np.array([np.nan, 100.0, np.nan])
    assert altura_sobre_agua_m(escuela, agua) == pytest.approx(5.0)


def test_altura_none_si_algun_conjunto_todo_nan():
    assert altura_sobre_agua_m(np.array([np.nan, np.nan]), np.array([100.0])) is None
    assert altura_sobre_agua_m(np.array([101.0]), np.array([np.nan, np.nan])) is None


def test_junto_laguna_true_dentro_de_limites():
    assert junto_laguna(10.0, 1.0) is True


def test_junto_laguna_true_en_limites_exactos():
    assert junto_laguna(DISTANCIA_MAX_M, ALTURA_MAX_M) is True


def test_junto_laguna_false_altura_sobre_limite():
    assert junto_laguna(10.0, ALTURA_MAX_M + 0.5) is False


def test_junto_laguna_false_sin_agua_cercana():
    assert junto_laguna(None, 0.5) is False
    assert junto_laguna(None, None) is False


def test_junto_laguna_false_distancia_excedida_aunque_altura_none():
    assert junto_laguna(DISTANCIA_MAX_M + 1, None) is False


def test_junto_laguna_none_si_altura_desconocida():
    assert junto_laguna(10.0, None) is None


def test_metros_por_grado_ecuador():
    mx, my = metros_por_grado(0.0)
    assert mx == pytest.approx(111319.3, rel=1e-4)
    assert my == pytest.approx(110574.3, rel=1e-4)


def test_metros_por_grado_lon_se_reduce_con_latitud():
    mx_eq, my_eq = metros_por_grado(0.0)
    mx_60, my_60 = metros_por_grado(60.0)
    assert mx_60 == pytest.approx(mx_eq * 0.5, rel=1e-2)
    assert my_60 == pytest.approx(my_eq, rel=1e-2)
