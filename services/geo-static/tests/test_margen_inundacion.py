import numpy as np
import pytest

from geo_static.margen_inundacion import calcular_margenes, distancia_m


def test_margen_usa_p10_del_nivel_de_la_llanura_inundada():
    suelo = np.full(10, 10.0)
    agua = np.full(5, 5.0)
    llanura = {10: (np.array([5.0, 5.0, 5.0]), np.array([1.0, 2.0, 3.0]))}

    # niveles 6, 7 y 8 -> p10 6.2 (suprime copa/edificios del DSM)
    assert calcular_margenes(suelo, agua, llanura) == {10: pytest.approx(3.8)}


def test_copa_del_dsm_no_infla_el_nivel_de_la_llanura():
    suelo = np.full(10, 10.0)
    agua = np.full(5, 5.0)
    # 9 pixeles de llanura a nivel 6 y uno bajo monte (DSM +12 m)
    llanura = {10: (np.array([5.0] * 9 + [17.0]), np.array([1.0] * 10))}

    assert calcular_margenes(suelo, agua, llanura)[10] == pytest.approx(4.0)


def test_margen_negativo_cuando_el_nivel_de_la_llanura_supera_el_suelo():
    suelo = np.full(10, 10.0)
    agua = np.full(5, 5.0)
    llanura = {10: (np.array([5.0]), np.array([6.0]))}

    assert calcular_margenes(suelo, agua, llanura) == {10: pytest.approx(-1.0)}


def test_nan_en_terreno_o_profundidad_se_ignora_en_la_llanura():
    suelo = np.array([10.0, 10.0, np.nan, 10.0, 10.0])
    agua = np.array([5.0, np.nan, 5.0])
    llanura = {10: (np.array([5.0, 5.0, np.nan]), np.array([np.nan, 2.0, 1.0]))}

    # solo el pixel central es valido: nivel 5 + 2 = 7
    assert calcular_margenes(suelo, agua, llanura) == {10: pytest.approx(10.0 - 7.0)}


def test_percentil_10_del_rio_ignora_pixeles_mas_altos():
    suelo = np.full(10, 10.0)
    agua = np.array([1.0] * 2 + [9.0] * 8)
    llanura = {100: (np.array([5.0]), np.array([1.0]))}

    # rio = p10 = 1; nivel = 5 + 1 = 6
    assert calcular_margenes(suelo, agua, llanura) == {100: pytest.approx(10.0 - 6.0)}


def test_sin_pixeles_de_llanura_el_nivel_es_el_del_rio():
    # El cauce (JRC de 14 m) no entra en la llanura: el periodo queda dentro del rio.
    suelo = np.full(10, 10.0)
    agua = np.full(5, 5.0)
    llanura = {10: (np.array([]), np.array([]))}

    assert calcular_margenes(suelo, agua, llanura) == {10: pytest.approx(5.0)}


def test_nivel_de_la_llanura_2_m_sobre_el_rio():
    suelo = np.full(10, 10.0)
    agua = np.full(5, 5.0)
    llanura = {10: (np.array([5.0, 5.0]), np.array([2.0, 2.0]))}

    assert calcular_margenes(suelo, agua, llanura) == {10: pytest.approx(10.0 - (5.0 + 2.0))}


def test_nivel_de_llanura_nunca_queda_por_debajo_del_rio():
    suelo = np.full(10, 10.0)
    agua = np.full(5, 5.0)
    llanura = {10: (np.array([1.0]), np.array([1.0]))}

    # WSE 2 m < rio 5 m -> se acota al rio
    assert calcular_margenes(suelo, agua, llanura) == {10: pytest.approx(5.0)}


def test_raster_ausente_para_un_periodo_da_none_solo_en_ese_periodo():
    suelo = np.full(4, 10.0)
    agua = np.full(2, 5.0)
    llanura = {10: (np.array([5.0]), np.array([1.0])), 100: None}

    assert calcular_margenes(suelo, agua, llanura) == {10: pytest.approx(4.0), 100: None}


def test_sin_agua_permanente_todos_los_margenes_son_none():
    suelo = np.full(10, 10.0)
    llanura = {10: (np.array([5.0]), np.array([1.0])), 100: (np.array([]), np.array([]))}

    assert calcular_margenes(suelo, np.array([]), llanura) == {10: None, 100: None}


def test_sin_terreno_valido_todos_los_margenes_son_none():
    agua = np.full(3, 5.0)
    llanura = {10: (np.array([5.0]), np.array([1.0]))}

    assert calcular_margenes(np.full(4, np.nan), agua, llanura) == {10: None}


def test_distancia_haversine_un_grado_de_latitud_son_unos_111_km():
    d = distancia_m(0.0, 0.0, np.array([1.0]), np.array([0.0]))

    assert d[0] == pytest.approx(111195.0, rel=1e-3)
