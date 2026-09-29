"""Tests N3-D: nodos OSM `ford=yes` en la clasificacion de cruces.

Antes de N3-D `_tiene_ford` solo miraba los tags de la arista y los atributos
del nodo del grafo; `pyrosm` no copia el tag `ford` a los nodos viales, asi
que 4 cruces realmente vadeables quedaban etiquetados `sin_evidencia`. Aca se
modela el nodo `ford=yes` como un Point aparte (lo que devuelve
`construir_geometrias_agua_y_fords_local`) y se verifica que
`construir_cruces_por_arista` lo usa para clasificar el cruce como vado sin
cambiar los conteos (`cruces_agua_con_vado_count` sigue contando vado y
sin_evidencia juntos).
"""

import networkx as nx
import pandas as pd
from pyproj import Transformer
from shapely.geometry import LineString, Point

from geo_static.osm_aislamiento import (
    CLASIFICACION_PUENTE,
    CLASIFICACION_SIN_EVIDENCIA,
    CLASIFICACION_VADO,
    TOLERANCIA_FORD_M,
    WATERWAYS_CRUCE,
    calcular_metricas_escuela,
    clasificar_cruce,
    construir_arbol_agua,
    construir_cruces_por_arista,
    construir_geometrias_agua_y_fords_local,
)

TRANSFORMER = Transformer.from_crs(4326, 32721, always_xy=True)

# Punto de cruce exacto entre la arista A->B y la linea de agua vertical.
LON_CRUCE, LAT_CRUCE = -58.85, -27.475
A = (-58.90, -27.50)
B = (-58.80, -27.45)


def _agua_que_cruza():
    return LineString([(LON_CRUCE, -29.0), (LON_CRUCE, 20.0)])


def _grafo_un_cruce():
    g = nx.MultiDiGraph()
    g.add_node("escuela", x=A[0], y=A[1])
    g.add_node("cabecera", x=B[0], y=B[1])
    g.add_edge(
        "escuela",
        "cabecera",
        key=0,
        length=1.0,
        highway="secondary",
        geometry=LineString([A, B]),
    )
    return g


def _ford_a_metros(dx_m, dy_m):
    """Point lon/lat a `(dx_m, dy_m)` metros del punto de cruce (EPSG:32721)."""
    x, y = TRANSFORMER.transform(LON_CRUCE, LAT_CRUCE)
    lon, lat = TRANSFORMER.transform(x + dx_m, y + dy_m, direction="INVERSE")
    return Point(lon, lat)


def _patch_nearest_nodes(monkeypatch, retorno):
    import osmnx as ox

    def fake_nearest_nodes(grafo, X, Y, return_dist=False):
        assert return_dist is True
        return retorno

    monkeypatch.setattr(ox.distance, "nearest_nodes", fake_nearest_nodes)


def _cruces_con_ford(puntos_ford):
    g = _grafo_un_cruce()
    agua = [_agua_que_cruza()]
    arbol = construir_arbol_agua(agua)
    return construir_cruces_por_arista(g, arbol, agua, puntos_ford=puntos_ford)


class TestFordCercaClasificaVado:
    def test_ford_a_5_m_es_vado(self):
        cruces = _cruces_con_ford([_ford_a_metros(5.0, 0.0)])
        cruce = cruces[("escuela", "cabecera", 0)][0]
        assert cruce["es_ford"] is True
        assert clasificar_cruce(cruce) == CLASIFICACION_VADO

    def test_ford_a_60_m_es_sin_evidencia(self):
        cruces = _cruces_con_ford([_ford_a_metros(60.0, 0.0)])
        cruce = cruces[("escuela", "cabecera", 0)][0]
        assert cruce["es_ford"] is False
        assert clasificar_cruce(cruce) == CLASIFICACION_SIN_EVIDENCIA

    def test_tolerancia_documentada_es_25_m(self):
        assert TOLERANCIA_FORD_M == 25.0

    def test_puente_gana_sobre_ford_punto(self):
        g = _grafo_un_cruce()
        g["escuela"]["cabecera"][0]["bridge"] = "yes"
        agua = [_agua_que_cruza()]
        arbol = construir_arbol_agua(agua)
        cruces = construir_cruces_por_arista(
            g, arbol, agua, puntos_ford=[_ford_a_metros(5.0, 0.0)]
        )
        cruce = cruces[("escuela", "cabecera", 0)][0]
        assert cruce["es_ford"] is True
        assert clasificar_cruce(cruce) == CLASIFICACION_PUENTE


class TestFordNoneNoCambiaNada:
    def test_puntos_ford_none_identico_al_default(self):
        g = _grafo_un_cruce()
        agua = [_agua_que_cruza()]
        arbol = construir_arbol_agua(agua)
        sin_arg = construir_cruces_por_arista(g, arbol, agua)
        con_none = construir_cruces_por_arista(g, arbol, agua, puntos_ford=None)
        assert sin_arg == con_none
        assert sin_arg[("escuela", "cabecera", 0)][0]["es_ford"] is False

    def test_lista_vacia_identica_a_none(self):
        g = _grafo_un_cruce()
        agua = [_agua_que_cruza()]
        arbol = construir_arbol_agua(agua)
        assert construir_cruces_por_arista(
            g, arbol, agua, puntos_ford=[]
        ) == construir_cruces_por_arista(g, arbol, agua, puntos_ford=None)


class TestConteoNoCambia:
    def test_cruces_agua_con_vado_count_igual_con_y_sin_ford(self, monkeypatch):
        g = _grafo_un_cruce()
        agua = [_agua_que_cruza()]
        arbol = construir_arbol_agua(agua)
        sin_ford = construir_cruces_por_arista(g, arbol, agua)
        con_ford = construir_cruces_por_arista(
            g, arbol, agua, puntos_ford=[_ford_a_metros(5.0, 0.0)]
        )

        _patch_nearest_nodes(monkeypatch, ("escuela", 10.0))
        metricas_sin = calcular_metricas_escuela(
            g, lat=A[1], lon=A[0], nodo_cabecera="cabecera", cruces_por_arista=sin_ford
        )
        metricas_con = calcular_metricas_escuela(
            g, lat=A[1], lon=A[0], nodo_cabecera="cabecera", cruces_por_arista=con_ford
        )

        # La clasificacion cambia (sin_evidencia -> vado) pero el conteo no:
        # `cruces_agua_con_vado_count` cuenta ambas juntas (contrato N3).
        assert metricas_sin["cruces_agua_con_vado_count"] == 1
        assert metricas_con["cruces_agua_con_vado_count"] == 1
        assert metricas_sin["cruces_agua_count"] == metricas_con["cruces_agua_count"] == 1
        assert clasificar_cruce(con_ford[("escuela", "cabecera", 0)][0]) == CLASIFICACION_VADO


class TestConstruirGeometriasAguaYFordsLocal:
    """N3-G: cursos de agua y nodos `ford=yes` se leen en DOS llamadas, porque
    el filtro combinado multi-clave de pyrosm no devuelve los nodos."""

    def _fake_osm(self, monkeypatch, filas_agua, filas_ford):
        """FakeOSM que registra cada llamada y arma el frame segun las claves
        del `custom_filter`.

        Reproduce a pyrosm real sobre el extracto de Corrientes: con un filtro
        de MAS de una clave no devuelve los nodos `ford=yes` (solo los ways de
        agua); con una sola clave si devuelve sus elementos.
        """
        registro = {"llamadas": [], "creados": []}

        class FakeOSM:
            def __init__(self, pbf_path, bounding_box):
                self.pbf_path = pbf_path
                self.bounding_box = bounding_box
                registro["creados"].append(self)

            def get_data_by_custom_criteria(self, **kwargs):
                registro["llamadas"].append(kwargs)
                claves = list(kwargs["custom_filter"].keys())
                filas = []
                if "waterway" in claves:
                    filas.extend(filas_agua)
                # Como pyrosm real: un filtro multi-clave NO devuelve los nodos.
                if "ford" in claves and len(claves) == 1:
                    filas.extend(filas_ford)
                if not filas:
                    return pd.DataFrame()
                return pd.DataFrame(filas)

        monkeypatch.setattr("pyrosm.OSM", FakeOSM)
        return registro, FakeOSM

    @staticmethod
    def _fila_agua(waterway, geometry):
        return {"waterway": waterway, "ford": None, "geometry": geometry}

    @staticmethod
    def _fila_ford(ford, geometry):
        return {"waterway": None, "ford": ford, "geometry": geometry}

    def test_dos_llamadas_con_los_argumentos_exactos(self, monkeypatch):
        rio = LineString([(-58.90, -27.50), (-58.80, -27.45)])
        ford = Point(-58.85, -27.475)
        registro, _ = self._fake_osm(
            monkeypatch,
            [self._fila_agua("river", rio)],
            [self._fila_ford("yes", ford)],
        )

        agua, fords = construir_geometrias_agua_y_fords_local(
            "x.osm.pbf", bbox_norte=1.0, bbox_sur=2.0, bbox_este=3.0, bbox_oeste=4.0
        )

        assert len(registro["llamadas"]) == 2
        assert registro["llamadas"][0] == {
            "custom_filter": {"waterway": list(WATERWAYS_CRUCE)},
            "osm_keys_to_keep": ["waterway"],
            "filter_type": "keep",
            "keep_nodes": False,
            "keep_relations": False,
        }
        assert registro["llamadas"][1] == {
            "custom_filter": {"ford": ["yes"]},
            "osm_keys_to_keep": ["ford"],
            "filter_type": "keep",
            "keep_nodes": True,
            "keep_ways": False,
            "keep_relations": False,
        }
        # Ambas lecturas usan el mismo objeto OSM (pyrosm cachea el pbf).
        assert len(registro["creados"]) == 1
        assert registro["creados"][0].pbf_path == "x.osm.pbf"
        # pyrosm espera [oeste, sur, este, norte].
        assert registro["creados"][0].bounding_box == [4.0, 2.0, 3.0, 1.0]
        assert agua == [rio]
        assert fords == [ford]

    def test_separa_agua_fords_y_descarta_no_listados(self, monkeypatch):
        rio = LineString([(-58.90, -27.50), (-58.80, -27.45)])
        ford = Point(-58.85, -27.475)
        zanja = LineString([(-58.90, -27.40), (-58.80, -27.35)])
        otro_punto = Point(-58.90, -27.40)
        self._fake_osm(
            monkeypatch,
            [self._fila_agua("river", rio), self._fila_agua("ditch", zanja)],
            [self._fila_ford("yes", ford), self._fila_ford("no", otro_punto)],
        )

        agua, fords = construir_geometrias_agua_y_fords_local(
            "x.osm.pbf", 1.0, 2.0, 3.0, 4.0
        )

        assert agua == [rio]
        assert fords == [ford]

    def test_frame_de_fords_vacio_devuelve_lista_vacia(self, monkeypatch):
        rio = LineString([(-58.90, -27.50), (-58.80, -27.45)])
        self._fake_osm(monkeypatch, [self._fila_agua("river", rio)], [])

        agua, fords = construir_geometrias_agua_y_fords_local(
            "x.osm.pbf", 1.0, 2.0, 3.0, 4.0
        )

        assert agua == [rio]
        assert fords == []

    def test_frames_none_devuelven_dos_listas_vacias(self, monkeypatch):
        class FakeOSM:
            def __init__(self, pbf_path, bounding_box):
                pass

            def get_data_by_custom_criteria(self, **kwargs):
                return None

        monkeypatch.setattr("pyrosm.OSM", FakeOSM)
        assert construir_geometrias_agua_y_fords_local(
            "x.osm.pbf", 1.0, 2.0, 3.0, 4.0
        ) == ([], [])

    def test_regresion_lectura_combinada_no_devolveria_fords(self, monkeypatch):
        """Con el FakeOSM fiel a pyrosm, la lectura combinada de N3-D se queda
        sin fords; las dos lecturas de una clave los recuperan."""
        rio = LineString([(-58.90, -27.50), (-58.80, -27.45)])
        ford = Point(-58.85, -27.475)
        registro, FakeOSM = self._fake_osm(
            monkeypatch,
            [self._fila_agua("river", rio)],
            [self._fila_ford("yes", ford)],
        )

        combinado = FakeOSM("x.osm.pbf", [4.0, 2.0, 3.0, 1.0])
        datos = combinado.get_data_by_custom_criteria(
            custom_filter={"waterway": list(WATERWAYS_CRUCE), "ford": ["yes"]},
            osm_keys_to_keep=["waterway", "ford"],
            filter_type="keep",
            keep_nodes=True,
            keep_relations=False,
        )
        assert not any(
            geometria.geom_type == "Point" for geometria in datos["geometry"]
        )

        agua, fords = construir_geometrias_agua_y_fords_local(
            "x.osm.pbf", 1.0, 2.0, 3.0, 4.0
        )
        assert agua == [rio]
        assert fords == [ford]
        assert "llamadas" in registro
