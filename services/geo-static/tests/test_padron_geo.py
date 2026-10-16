"""Tests de `padron_geo` (gate fuera de departamento + sedes oficiales, N3-A).

Nunca golpean la red: los loaders leen fixtures temporales y el test de datos
reales lee unicamente archivos del propio repositorio.
"""

import csv
import json
from pathlib import Path

import networkx as nx
import pytest
from shapely.geometry import box, mapping

from geo_static import padron_geo


class TestNormalizarNombre:
    def test_acentos_y_mayusculas(self):
        assert padron_geo.normalizar_nombre("Concepción") == "CONCEPCION"
        assert padron_geo.normalizar_nombre("CONCEPCION") == "CONCEPCION"

    def test_espacios_dobles_y_bordes(self):
        assert padron_geo.normalizar_nombre("  Paso  de   los Libres ") == "PASO DE LOS LIBRES"


class TestResolverCabeceras:
    def test_sede_oficial_gana(self):
        escuelas = [{"departamento": "Concepción"}]
        oficiales = {"CONCEPCION": (-28.39, -57.88)}
        proxy = {"Concepción": (-28.0, -57.0)}
        assert padron_geo.resolver_cabeceras(escuelas, oficiales, proxy) == {
            "Concepción": (-28.39, -57.88)
        }

    def test_sin_sede_oficial_usa_proxy(self):
        escuelas = [{"departamento": "Capital"}]
        assert padron_geo.resolver_cabeceras(escuelas, {}, {"Capital": (-27.4, -58.8)}) == {
            "Capital": (-27.4, -58.8)
        }

    def test_no_inventa_valor_si_no_hay_ni_sede_ni_proxy(self):
        with pytest.raises(KeyError):
            padron_geo.resolver_cabeceras([{"departamento": "Inexistente"}], {}, {})


class TestDistanciaAPoligono:
    def test_punto_dentro_devuelve_cero(self):
        cuadrado = box(-1, -1, 1, 1)
        assert padron_geo.distancia_a_poligono_km(0.0, 0.0, cuadrado) == 0.0

    def test_punto_sobre_el_borde_devuelve_cero(self):
        cuadrado = box(-1, -1, 1, 1)
        assert padron_geo.distancia_a_poligono_km(1.0, 0.0, cuadrado) == 0.0

    def test_punto_a_01_grado_este_de_un_cuadrado_unitario(self):
        # Cuadrado de 1 grado cerca del ecuador; punto 0.1 grados al este.
        cuadrado = box(0, 0, 1, 1)
        distancia = padron_geo.distancia_a_poligono_km(0.5, 1.1, cuadrado)
        assert distancia == pytest.approx(11.1, abs=0.2)


class TestCoordenadaFueraDeDepartamento:
    def _poligonos(self):
        return {padron_geo.normalizar_nombre("Capital"): box(0, 0, 1, 1)}

    def test_por_debajo_del_umbral_devuelve_none(self):
        # ~1.9 km al este del borde del cuadrado.
        escuela = {"departamento": "Capital", "lat": 0.5, "lon": 1.017}
        assert padron_geo.coordenada_fuera_de_departamento(escuela, self._poligonos()) is None

    def test_por_encima_del_umbral_devuelve_float(self):
        # ~2.5 km al este del borde del cuadrado.
        escuela = {"departamento": "Capital", "lat": 0.5, "lon": 1.0225}
        distancia = padron_geo.coordenada_fuera_de_departamento(escuela, self._poligonos())
        assert isinstance(distancia, float)
        assert distancia > padron_geo.UMBRAL_FUERA_DEPARTAMENTO_KM

    def test_sin_poligono_del_departamento_devuelve_none(self):
        escuela = {"departamento": "Sin Poligono", "lat": 0.5, "lon": 50.0}
        assert padron_geo.coordenada_fuera_de_departamento(escuela, self._poligonos()) is None


class TestLoaders:
    def test_carga_cabeceras_normaliza_claves(self, tmp_path):
        ruta = tmp_path / "cabeceras.json"
        ruta.write_text(
            json.dumps(
                {"cabeceras": [{"departamento": "Concepción", "lat": -28.39, "lon": -57.88}]}
            ),
            encoding="utf-8",
        )
        assert padron_geo.cargar_cabeceras_oficiales(ruta) == {
            "CONCEPCION": (-28.39, -57.88)
        }

    def test_cabeceras_archivo_ausente_devuelve_vacio(self, tmp_path):
        assert padron_geo.cargar_cabeceras_oficiales(tmp_path / "no-existe.json") == {}

    def test_carga_poligonos_normaliza_claves(self, tmp_path):
        ruta = tmp_path / "deptos.geojson"
        ruta.write_text(
            json.dumps(
                {
                    "type": "FeatureCollection",
                    "features": [
                        {
                            "type": "Feature",
                            "properties": {"nombre": "Concepción"},
                            "geometry": mapping(box(-1, -1, 1, 1)),
                        }
                    ],
                }
            ),
            encoding="utf-8",
        )
        poligonos = padron_geo.cargar_poligonos_departamentos(ruta)
        assert set(poligonos) == {"CONCEPCION"}
        assert poligonos["CONCEPCION"].area == pytest.approx(4.0)

    def test_poligonos_archivo_ausente_devuelve_vacio(self, tmp_path):
        assert padron_geo.cargar_poligonos_departamentos(tmp_path / "no-existe.geojson") == {}


CUE_FUERA_ESPERADOS = {
    "1801031-00",
    "1800282-00",
    "1801929-00",
    "1801532-00",
    "1801833-00",
}


def _escuelas_padron_real():
    with open(padron_geo.REPO_ROOT / "public" / "data" / "localizaciones.json", encoding="utf-8") as f:
        escuelas = json.load(f)
    return [e for e in escuelas if e.get("lat") and e.get("lon")]


class TestDatosReales:
    def test_exactamente_los_5_cues_fuera_de_departamento(self):
        escuelas = _escuelas_padron_real()
        poligonos = padron_geo.cargar_poligonos_departamentos(
            padron_geo.REPO_ROOT / "public/data/departamentos-corrientes-georef-2026-09-27.geojson"
        )
        fuera = {
            e["cueAnexo"]: padron_geo.coordenada_fuera_de_departamento(e, poligonos)
            for e in escuelas
        }
        fuera = {cue: km for cue, km in fuera.items() if km is not None}
        assert set(fuera) == CUE_FUERA_ESPERADOS

    def test_los_25_departamentos_tienen_sede_oficial_dentro_del_poligono(self):
        escuelas = _escuelas_padron_real()
        poligonos = padron_geo.cargar_poligonos_departamentos(
            padron_geo.REPO_ROOT / "public/data/departamentos-corrientes-georef-2026-09-27.geojson"
        )
        oficiales = padron_geo.cargar_cabeceras_oficiales(Path(__file__).parent / "fixtures/cabeceras_departamentales.json")

        departamentos = {e["departamento"] for e in escuelas}
        assert len(departamentos) == 25
        for departamento in departamentos:
            clave = padron_geo.normalizar_nombre(departamento)
            assert clave in oficiales, f"sin sede oficial para {departamento}"
            lat, lon = oficiales[clave]
            assert padron_geo.distancia_a_poligono_km(lat, lon, poligonos[clave]) <= 3.0


class TestJobGateDepartamento:
    def test_escuela_fuera_genera_fila_sin_datos_y_no_cambia_el_conteo(
        self, monkeypatch, tmp_path, capsys
    ):
        import osmnx as ox

        import geo_static.jobs.calcular_aislamiento as job
        import geo_static.osm_aislamiento as osm_mod

        # Sin extracto local: camino fallback por departamento (sin red real,
        # `construir_red` se parchea).
        monkeypatch.setattr(job, "PBF_LOCAL_DEFAULT", tmp_path / "no-existe.osm.pbf")
        monkeypatch.setattr(job, "OUTPUT_DIR", tmp_path / "output")
        monkeypatch.setattr(job, "CABECERAS_PATH", tmp_path / "no-existe.json")

        geojson = tmp_path / "deptos.geojson"
        geojson.write_text(
            json.dumps(
                {
                    "type": "FeatureCollection",
                    "features": [
                        {
                            "type": "Feature",
                            "properties": {"nombre": "Capital"},
                            "geometry": mapping(box(-59.5, -28.0, -58.0, -27.0)),
                        }
                    ],
                }
            ),
            encoding="utf-8",
        )
        monkeypatch.setattr(job, "DEPARTAMENTOS_GEOJSON_PATH", geojson)

        escuelas = [
            {
                "cueAnexo": "DENTRO",
                "lat": -27.50,
                "lon": -58.90,
                "departamento": "Capital",
                "localidad": "Corrientes",
            },
            {
                "cueAnexo": "FUERA",
                "lat": -27.50,
                "lon": -50.00,
                "departamento": "Capital",
                "localidad": "Corrientes",
            },
        ]
        monkeypatch.setattr(job, "cargar_padron", lambda: escuelas)

        g = nx.MultiDiGraph()
        g.add_node("escuela", x=-58.90, y=-27.50)
        g.add_node("cabecera", x=-58.80, y=-27.45)
        g.add_edge("escuela", "cabecera", length=1000, surface="paved", highway="secondary")
        monkeypatch.setattr(osm_mod, "construir_red", lambda *args, **kwargs: g)
        monkeypatch.setattr(
            ox.distance,
            "nearest_nodes",
            lambda grafo, X, Y, return_dist=False: ("escuela", 10.0),
        )

        job.correr()

        csvs = list((tmp_path / "output").glob("*.csv"))
        assert len(csvs) == 1
        with open(csvs[0], encoding="utf-8") as f:
            filas = list(csv.DictReader(f))
        assert len(filas) == 2
        por_cue = {fila["cue_anexo"]: fila for fila in filas}
        assert por_cue["FUERA"]["motivo_sin_datos"] == "coordenada_fuera_de_departamento"
        assert por_cue["FUERA"]["indice_aislamiento"] == ""
        salida = capsys.readouterr().out
        assert "fuera de su departamento" in salida
