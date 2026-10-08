import numpy as np
import pytest

from geo_static.margen_inundacion import calcular_margenes, distancia_m


def test_margen_positivo_cuando_suelo_queda_sobre_rio_mas_subida():
    suelo = np.full(10, 10.0)
    agua = np.full(5, 5.0)
    prof = {10: np.array([0.0, 0.0, 1.0, 0.0, 0.0])}

    assert calcular_margenes(suelo, agua, prof) == {10: pytest.approx(4.0)}


def test_margen_negativo_cuando_subida_supera_el_resguardo():
    suelo = np.full(10, 10.0)
    agua = np.full(5, 5.0)
    prof = {10: np.array([0.0, 6.0, 0.0])}

    assert calcular_margenes(suelo, agua, prof) == {10: pytest.approx(-1.0)}


def test_nodata_en_profundidad_cuenta_como_cero_y_nan_en_terreno_se_ignora():
    suelo = np.array([10.0, 10.0, np.nan, 10.0, 10.0])
    agua = np.array([5.0, np.nan, 5.0])
    prof = {10: np.array([np.nan, 2.0, np.nan])}

    assert calcular_margenes(suelo, agua, prof) == {10: pytest.approx(10.0 - (5.0 + 2.0))}


def test_percentil_10_del_rio_ignora_pixeles_mas_altos():
    suelo = np.full(10, 10.0)
    agua = np.array([1.0] * 2 + [9.0] * 8)
    prof = {100: np.zeros(10)}

    assert calcular_margenes(suelo, agua, prof) == {100: pytest.approx(10.0 - 1.0)}


def test_sin_agua_permanente_todos_los_margenes_son_none():
    suelo = np.full(10, 10.0)
    prof = {10: np.array([]), 100: np.array([])}

    assert calcular_margenes(suelo, np.array([]), prof) == {10: None, 100: None}


def test_sin_terreno_valido_todos_los_margenes_son_none():
    agua = np.full(3, 5.0)
    prof = {10: np.ones(3)}

    assert calcular_margenes(np.full(4, np.nan), agua, prof) == {10: None}


def test_profundidad_ausente_para_un_periodo_da_none_solo_en_ese_periodo():
    suelo = np.full(4, 10.0)
    agua = np.full(2, 5.0)
    prof = {10: np.array([1.0, 0.0]), 100: None}

    assert calcular_margenes(suelo, agua, prof) == {10: pytest.approx(4.0), 100: None}


def test_distancia_haversine_un_grado_de_latitud_son_unos_111_km():
    d = distancia_m(0.0, 0.0, np.array([1.0]), np.array([0.0]))

    assert d[0] == pytest.approx(111195.0, rel=1e-3)
