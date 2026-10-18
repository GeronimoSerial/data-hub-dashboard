"""Tests de la asociacion escuela -> poligono OSM del edificio escolar."""

import pytest
from pyproj import Transformer
from shapely.geometry import box
from shapely.ops import transform

from geo_static.edificio_escolar import (
    ASOCIACION_AMBIGUA,
    ASOCIACION_CERCANIA,
    ASOCIACION_DENTRO,
    ASOCIACION_NOMBRE,
    asociar_edificios,
    nombres_coinciden,
    normalizar_texto,
)

A_LONLAT = Transformer.from_crs(32721, 4326, always_xy=True)
A_METROS = Transformer.from_crs(4326, 32721, always_xy=True)
# Origen metrico cerca de la ciudad de Corrientes.
X0, Y0 = A_METROS.transform(-58.83, -27.47)


def _poligono(osm_id, dx, dy, lado=20.0, nombre=None):
    """Cuadrado de `lado` m cuya esquina SO esta a (dx, dy) m del origen."""
    metrico = box(X0 + dx, Y0 + dy, X0 + dx + lado, Y0 + dy + lado)
    return {"osm_id": osm_id, "nombre": nombre, "geometria": transform(A_LONLAT.transform, metrico)}


def _escuela(cue, dx, dy, nombre="ESCUELA Nº 415"):
    lon, lat = A_LONLAT.transform(X0 + dx, Y0 + dy)
    return {"cueAnexo": cue, "nombre": nombre, "lon": lon, "lat": lat}


class TestNombres:
    def test_normalizar(self):
        assert normalizar_texto('  ESCUELA  Nº 609 "ÁRMADA" ') == "escuela n 609 armada"

    def test_coincidencia_por_numero(self):
        assert nombres_coinciden("ESCUELA Nº 415", "Escuela 415")
        assert nombres_coinciden("ESC.Nº 0415", "Escuela N° 415")
        assert not nombres_coinciden("ESCUELA Nº 415", "Escuela 416")

    def test_coincidencia_por_palabras(self):
        assert nombres_coinciden('ESCUELA Nº 609 "ARMADA ARGENTINA"', "Escuela Armada Argentina")
        assert not nombres_coinciden('ESCUELA Nº 609 "ARMADA ARGENTINA"', "Escuela")
        assert not nombres_coinciden("ESCUELA Nº 609", None)


class TestAsociar:
    def test_dentro(self):
        resultado = asociar_edificios([_escuela("1", 10, 10)], [_poligono(7, 0, 0), _poligono(8, 60, 0)])
        edificio = resultado["1"]
        assert edificio["asociacion"] == ASOCIACION_DENTRO
        assert edificio["distanciaM"] == 0
        assert edificio["osmId"] == 7
        assert edificio["candidatos"] == 1
        assert edificio["poligono"]["type"] == "Polygon"
        lon, lat = edificio["poligono"]["coordinates"][0][0]
        assert lon == round(lon, 6) and lat == round(lat, 6)

    def test_dentro_de_varios_es_ambigua(self):
        resultado = asociar_edificios(
            [_escuela("1", 10, 10)], [_poligono(7, 0, 0), _poligono(8, 5, 5)]
        )
        assert resultado["1"] == {
            "asociacion": ASOCIACION_AMBIGUA, "distanciaM": 0.0, "osmId": None,
            "poligono": None, "candidatos": 2,
        }

    def test_nombre_desempata_entre_cercanos(self):
        poligonos = [_poligono(7, 30, 0, nombre="Escuela 415"), _poligono(8, -50, 0, nombre="Escuela 99")]
        edificio = asociar_edificios([_escuela("1", 0, 10)], poligonos)["1"]
        assert edificio["asociacion"] == ASOCIACION_NOMBRE
        assert edificio["osmId"] == 7
        # distancia metrica al borde, no en grados
        assert edificio["distanciaM"] == pytest.approx(30.0, abs=0.5)

    def test_dos_nombres_coincidentes_es_ambigua(self):
        poligonos = [_poligono(7, 30, 0, nombre="Escuela 415"), _poligono(8, -50, 0, nombre="Esc. 415")]
        edificio = asociar_edificios([_escuela("1", 0, 10)], poligonos)["1"]
        assert edificio["asociacion"] == ASOCIACION_AMBIGUA
        assert edificio["candidatos"] == 2
        assert edificio["poligono"] is None

    def test_cercania_unico(self):
        edificio = asociar_edificios([_escuela("1", 0, 10)], [_poligono(7, 40, 0, nombre="Otra")])["1"]
        assert edificio["asociacion"] == ASOCIACION_CERCANIA
        assert edificio["distanciaM"] == pytest.approx(40.0, abs=0.5)
        assert edificio["osmId"] == 7

    def test_cercania_varios_es_ambigua(self):
        poligonos = [_poligono(7, 40, 0), _poligono(8, -60, 0)]
        edificio = asociar_edificios([_escuela("1", 0, 10)], poligonos)["1"]
        assert edificio["asociacion"] == ASOCIACION_AMBIGUA
        assert edificio["candidatos"] == 2

    def test_sin_candidato_a_menos_de_100_m(self):
        resultado = asociar_edificios([_escuela("1", 0, 0)], [_poligono(7, 150, 0)])
        assert resultado == {"1": None}
        assert asociar_edificios([_escuela("2", 0, 0)], []) == {"2": None}

    def test_poligono_compartido_por_varios_cue(self):
        escuelas = [_escuela("1", 5, 5), _escuela("2", 15, 15, nombre="JARDIN 3")]
        resultado = asociar_edificios(escuelas, [_poligono(7, 0, 0)])
        assert resultado["1"]["osmId"] == resultado["2"]["osmId"] == 7
        assert resultado["1"]["asociacion"] == resultado["2"]["asociacion"] == ASOCIACION_DENTRO

    def test_no_modifica_la_escuela(self):
        escuela = _escuela("1", 10, 10)
        copia = dict(escuela)
        asociar_edificios([escuela], [_poligono(7, 0, 0)])
        assert escuela == copia

    def test_multipolygon(self):
        from shapely.geometry import MultiPolygon

        p1 = _poligono(7, 0, 0)["geometria"]
        p2 = _poligono(7, 100, 100)["geometria"]
        edificio = asociar_edificios(
            [_escuela("1", 10, 10)],
            [{"osm_id": 7, "nombre": None, "geometria": MultiPolygon([p1, p2])}],
        )["1"]
        assert edificio["poligono"]["type"] == "MultiPolygon"


def test_asignar_edificios_en_registros():
    from geo_static.jobs.calcular_aislamiento import _asignar_edificios, _registro_geometria

    registros = [
        _registro_geometria("1", "2026-10-17", None, [], "x"),
        _registro_geometria("2", "2026-10-17", None, [], "x"),
    ]
    assert registros[0]["edificio"] is None
    conteo = _asignar_edificios(
        registros, [_escuela("1", 10, 10), _escuela("2", 500, 500)], poligonos=[_poligono(7, 0, 0)]
    )
    assert registros[0]["edificio"]["osmId"] == 7
    assert registros[1]["edificio"] is None
    assert conteo == {ASOCIACION_DENTRO: 1, None: 1}

