"""Tests unitarios del indice de aislamiento (G1). Nunca golpean la red:
el grafo se construye a mano con networkx, sin osmnx.graph_from_bbox.

G1-fix2: el bug corregido era que los cursos de agua (`waterway=river|
stream|canal|drain`) NUNCA aparecen como atributo de una arista vial en OSM
-- son entidades separadas. La version anterior de este modulo buscaba
`datos_arista.get("waterway")` sobre las aristas del camino, que nunca
encuentra nada real (`cruces_agua_count` daba siempre 0 sobre datos reales).
Los tests de `TestCalcularMetricasEscuela` y `TestConstruirCrucesPorArista`
usan geometrias shapely reales y GEOMETRIAS DE AGUA SEPARADAS (nunca un
atributo `waterway` sobre la arista vial) para demostrar que la deteccion
funciona por interseccion espacial, no por atributo -- exactamente el caso
que la logica vieja (dead code, ya eliminado) nunca hubiera detectado.
"""

import csv
import gzip
import json
import math

import pandas as pd
import pytest
from shapely.geometry import LineString, Point
from shapely.ops import transform as shapely_transform

import networkx as nx

from geo_static.osm_aislamiento import (
    CLASIFICACION_PUENTE,
    CLASIFICACION_SIN_EVIDENCIA,
    CLASIFICACION_VADO,
    HIGHWAYS_CONDUCIBLES,
    MOTIVO_RED_NO_CONECTADA,
    MOTIVO_SIN_VIA_CERCANA,
    TOLERANCIA_DEDUP_CRUCE_M,
    _aristas_inseguras,
    _coordenadas_ruta,
    _es_tramo_sin_pavimentar,
    _primer_valor,
    _tiene_ford,
    _tiene_puente,
    asignar_costo,
    calcular_indice_aislamiento,
    calcular_metricas_departamento,
    calcular_metricas_escuela,
    buscar_destinos_mas_cercanos,
    calcular_via_principal,
    clasificar_cruce,
    clasificar_sin_conexion,
    construir_arbol_agua,
    construir_cruces_por_arista,
    construir_grafo_seguro,
    construir_indice_no_conectadas,
    construir_indice_aristas,
    construir_red_local,
)
from _helpers import patch_nearest_nodes

NAN = float("nan")


def grafo_juguete(aristas):
    """Construye un MultiDiGraph local para pruebas de rutas y costos."""
    grafo = nx.MultiDiGraph()
    for u, v, datos in aristas:
        grafo.add_edge(u, v, **datos)
    return grafo


def test_prefiere_ruta_pavimentada_sobre_huella_mas_corta():
    grafo = grafo_juguete([
        ("E", "A", {"length": 4000, "highway": "track"}),
        ("A", "L", {"length": 1000, "highway": "track"}),
        ("E", "B", {"length": 3000, "highway": "primary"}),
        ("B", "L", {"length": 4000, "highway": "primary"}),
    ])
    asignar_costo(grafo)
    ruta = nx.shortest_path(grafo, "E", "L", weight="costo")
    assert ruta == ["E", "B", "L"]


def test_superficie_no_pavimentada_penaliza():
    grafo = grafo_juguete([
        ("E", "L", {"length": 1000, "highway": "secondary", "surface": "dirt"})
    ])
    asignar_costo(grafo)
    assert grafo["E"]["L"][0]["costo"] == pytest.approx(1000 * 1.2 * 1.5)


def test_coordenadas_ruta_usa_paralela_de_menor_costo():
    grafo = nx.MultiDiGraph()
    grafo.add_node("E", x=0.0, y=0.0)
    grafo.add_node("L", x=1.0, y=0.0)
    grafo.add_edge("E", "L", length=200, highway="track", geometry=LineString([(0, 0), (0.5, 0.1), (1, 0)]))
    grafo.add_edge("E", "L", length=500, highway="primary", geometry=LineString([(0, 0), (0.5, 0.2), (1, 0)]))
    asignar_costo(grafo)

    coords = _coordenadas_ruta(grafo, ["E", "L"])

    assert [0.5, 0.2] in coords
    assert [0.5, 0.1] not in coords


def test_calcular_via_principal_resuelve_ref_nombre_y_sin_nombre():
    grafo = grafo_juguete([
        ("E", "A", {"length": 300, "highway": "primary", "ref": "RP13"}),
        ("A", "B", {"length": 200, "highway": "secondary", "ref": "RN12"}),
        ("B", "C", {"length": 100, "highway": "tertiary", "name": "Calle Central"}),
        ("C", "D", {"length": 50, "highway": "residential"}),
    ])

    assert calcular_via_principal(grafo, ["E", "A"]) == {
        "nombre": "Ruta Provincial 13", "tipo": "primary", "pavimentada": True,
    }
    assert calcular_via_principal(grafo, ["A", "B"]) == {
        "nombre": "Ruta Nacional 12", "tipo": "secondary", "pavimentada": True,
    }
    assert calcular_via_principal(grafo, ["B", "C"]) == {
        "nombre": "Calle Central", "tipo": "tertiary", "pavimentada": True,
    }
    assert calcular_via_principal(grafo, ["C", "D"]) == {
        "nombre": None, "tipo": "residential", "pavimentada": True,
    }
    formato_ref = grafo_juguete([
        ("E", "A", {"length": 10, "highway": ["primary", "secondary"], "ref": ["RP-13;RN12"]}),
    ])
    assert calcular_via_principal(formato_ref, ["E", "A"]) == {
        "nombre": "Ruta Provincial 13", "tipo": "primary", "pavimentada": True,
    }
    assert calcular_via_principal(grafo, []) is None
    assert calcular_via_principal(grafo, ["E"]) is None


def test_calcular_via_principal_suma_metros_y_desempata():
    grafo = grafo_juguete([
        ("E", "A", {"length": 5000, "highway": "primary", "ref": "RP13"}),
        ("A", "B", {"length": 1000, "highway": "secondary", "name": "Zeta"}),
        ("B", "C", {"length": 1000, "highway": "secondary", "name": "Zeta"}),
        ("C", "D", {"length": 1000, "highway": "secondary", "name": "Zeta"}),
    ])

    assert calcular_via_principal(grafo, ["E", "A", "B", "C", "D"]) == {
        "nombre": "Ruta Provincial 13", "tipo": "primary", "pavimentada": True,
    }

    empate = grafo_juguete([
        ("E", "A", {"length": 1000, "highway": "secondary", "name": "Zulu"}),
        ("A", "B", {"length": 1000, "highway": "secondary", "name": "Beta"}),
    ])
    assert calcular_via_principal(empate, ["E", "A", "B"])["nombre"] == "Beta"


def test_calcular_via_principal_marca_tramo_track_dirt_no_pavimentado():
    grafo = grafo_juguete([
        ("E", "A", {"length": 1200, "highway": "track", "surface": "dirt", "name": "Camino Rural"}),
        ("A", "B", {"length": 200, "highway": "primary", "ref": "RP13"}),
    ])

    assert calcular_via_principal(grafo, ["E", "A", "B"]) == {
        "nombre": "Camino Rural", "tipo": "track", "pavimentada": False,
    }


def test_distancia_reportada_es_longitud_real_de_ruta_elegida_por_costo(monkeypatch):
    grafo = grafo_juguete([
        ("E", "A", {"length": 4000, "highway": "track"}),
        ("A", "L", {"length": 1000, "highway": "track"}),
        ("E", "B", {"length": 3000, "highway": "secondary"}),
        ("B", "L", {"length": 4000, "highway": "secondary"}),
    ])
    asignar_costo(grafo)
    _patch_nearest_nodes_departamento(monkeypatch, {(0.0, 0.0): ("E", 0.0)})
    escuela = {"lat": 0.0, "lon": 0.0}
    resultado = calcular_metricas_departamento(
        grafo, grafo.reverse(copy=False), [escuela], "L"
    )[0]
    assert resultado["distancia_cabecera_departamental_m"] == 7000


def _grafo_destinos_localidades():
    """Red pequeña con destinos urbanos y un tramo de ruta con geometría."""
    g = nx.MultiDiGraph()
    coords = {
        "E": (-58.90, -27.50), "A": (-58.85, -27.48),
        "L1": (-58.80, -27.45), "B": (-58.92, -27.49),
        "L2": (-58.95, -27.47), "C": (-58.70, -27.40),
    }
    for nodo, (x, y) in coords.items():
        g.add_node(nodo, x=x, y=y)
    # L1 gana por costo aunque la ruta física hacia L2 sea menor.
    aristas = [
        ("E", "A", 1000, "primary"), ("A", "L1", 1000, "primary"),
        ("E", "B", 600, "track"), ("B", "L2", 600, "track"),
        ("L1", "C", 5000, "primary"),
    ]
    for u, v, length, highway in aristas:
        g.add_edge(
            u, v, length=length, highway=highway,
            geometry=LineString([coords[u], coords[v]]),
        )
    asignar_costo(g)
    return g


def test_destino_urbano_mas_cercano_por_costo_y_longitud_real(monkeypatch):
    g = _grafo_destinos_localidades()
    escuela = {"lat": -27.50, "lon": -58.90, "departamento": "Depto A"}
    _patch_nearest_nodes_departamento(
        monkeypatch, {(-58.90, -27.50): ("E", 0.0)}
    )
    nodos_destino = {"L1": "L1", "L2": "L2"}
    busqueda = buscar_destinos_mas_cercanos(g.reverse(copy=False), nodos_destino)
    geometrias = []
    resultado = calcular_metricas_departamento(
        g, g.reverse(copy=False), [escuela], "C", busqueda_destinos=busqueda,
        geometrias_out=geometrias,
    )[0]
    assert resultado["destino"] == {"nombre": "L1"}
    assert resultado["distancia_cabecera_departamental_m"] == 2000
    assert resultado["distancia_destino_m"] == 2000
    assert geometrias[0]["via_principal"] == {
        "nombre": None, "tipo": "primary", "pavimentada": True,
    }


def test_destino_puede_ser_de_otro_departamento(monkeypatch):
    g = nx.MultiDiGraph()
    g.add_edge("E", "L", length=700, highway="primary")
    asignar_costo(g)
    _patch_nearest_nodes_departamento(monkeypatch, {(-58.90, -27.50): ("E", 0.0)})
    busqueda = buscar_destinos_mas_cercanos(g.reverse(copy=False), {"L": "Localidad vecina"})
    resultado = calcular_metricas_departamento(
        g, g.reverse(copy=False),
        [{"lat": -27.50, "lon": -58.90, "departamento": "Depto A"}], "L",
        busqueda_destinos=busqueda,
    )[0]
    assert resultado["destino"] == {"nombre": "Localidad vecina"}
    assert resultado["distancia_destino_m"] == 700


def test_escuela_sin_camino_a_localidades_queda_sin_conexion(monkeypatch):
    g = nx.MultiDiGraph()
    g.add_edge("E", "A", length=100, highway="primary")
    g.add_node("L")
    asignar_costo(g)
    _patch_nearest_nodes_departamento(monkeypatch, {(-58.90, -27.50): ("E", 0.0)})
    busqueda = buscar_destinos_mas_cercanos(g.reverse(copy=False), {"L": "L1"})
    geometrias = []
    resultado = calcular_metricas_departamento(
        g, g.reverse(copy=False), [{"lat": -27.50, "lon": -58.90}], "L",
        busqueda_destinos=busqueda, geometrias_out=geometrias,
    )[0]
    assert resultado["motivo_sin_datos"] == "sin_conexion_red"
    assert geometrias[0]["motivo_sin_geometria"] == "sin_conexion_red"
    assert geometrias[0]["via_principal"] is None


def test_destino_urbano_por_camino_snap_a_arista():
    g = _grafo_destinos_localidades()
    indice = construir_indice_aristas(g)
    busqueda = buscar_destinos_mas_cercanos(g.reverse(copy=False), {"L1": "L1", "L2": "L2"})
    geometria = []
    resultado = calcular_metricas_departamento(
        g, g.reverse(copy=False), [{"lat": -27.48, "lon": -58.85}], "C",
        busqueda_destinos=busqueda, geometrias_out=geometria, indice_aristas=indice,
    )[0]
    assert resultado["destino"] == {"nombre": "L1"}
    assert resultado["distancia_destino_m"] == resultado["distancia_cabecera_departamental_m"]
    assert geometria[0]["ruta"]["coordinates"][-1] == [-58.80, -27.45]
    assert geometria[0]["destino"] == {"nombre": "L1"}
    assert geometria[0]["distancia_destino_m"] == resultado["distancia_destino_m"]
    assert "via_principal" in geometria[0]


def test_busqueda_destinos_se_calcula_una_vez_para_varios_departamentos(monkeypatch):
    g = nx.MultiDiGraph()
    g.add_edge("E1", "L", length=100, highway="primary")
    g.add_edge("E2", "L", length=200, highway="primary")
    asignar_costo(g)
    _patch_nearest_nodes_departamento(monkeypatch, {
        (-58.90, -27.50): ("E1", 0.0), (-58.80, -27.40): ("E2", 0.0),
    })
    llamadas = 0
    original = nx.multi_source_dijkstra

    def contar(*args, **kwargs):
        nonlocal llamadas
        llamadas += 1
        return original(*args, **kwargs)

    monkeypatch.setattr(nx, "multi_source_dijkstra", contar)
    busqueda = buscar_destinos_mas_cercanos(g.reverse(copy=False), {"L": "L1"})
    for escuela in [
        {"lat": -27.50, "lon": -58.90}, {"lat": -27.40, "lon": -58.80},
    ]:
        calcular_metricas_departamento(
            g, g.reverse(copy=False), [escuela], None, busqueda_destinos=busqueda
        )
    assert llamadas == 1


class TestCalcularIndiceAislamiento:
    def test_puente_con_alternativa_no_es_indice_cero(self):
        # Contrato: 0 exige "sin cruces de agua"; con un cruce con puente y
        # alternativa corresponde 1, nunca 0.
        indice = calcular_indice_aislamiento(
            distancia_via_pavimentada_m=2500,
            tramos_sin_pavimentar_count=1,
            cruces_agua_con_puente_count=1,
            cruces_agua_con_vado_count=0,
            tiene_alternativa_sin_cruce=True,
        )
        assert indice == 1

    def test_vado_sin_alternativa_indice_maximo(self):
        indice = calcular_indice_aislamiento(
            distancia_via_pavimentada_m=8000,
            tramos_sin_pavimentar_count=3,
            cruces_agua_con_puente_count=0,
            cruces_agua_con_vado_count=1,
            tiene_alternativa_sin_cruce=False,
        )
        assert indice == 3

    def test_vado_con_alternativa_indice_medio(self):
        indice = calcular_indice_aislamiento(
            distancia_via_pavimentada_m=4000,
            tramos_sin_pavimentar_count=2,
            cruces_agua_con_puente_count=0,
            cruces_agua_con_vado_count=1,
            tiene_alternativa_sin_cruce=True,
        )
        assert indice == 2

    def test_alternativa_sin_ningun_cruce_indice_cero(self):
        indice = calcular_indice_aislamiento(
            distancia_via_pavimentada_m=1000,
            tramos_sin_pavimentar_count=0,
            cruces_agua_con_puente_count=0,
            cruces_agua_con_vado_count=0,
            tiene_alternativa_sin_cruce=True,
        )
        assert indice == 0

    def test_conteos_none_devuelve_none(self):
        assert calcular_indice_aislamiento(None, None, None, None, None) is None
        assert (
            calcular_indice_aislamiento(1000, None, 0, 0, True) is None
        )

    def test_via_no_alcanzable_indice_maximo(self):
        indice = calcular_indice_aislamiento(
            distancia_via_pavimentada_m=25000,
            tramos_sin_pavimentar_count=0,
            cruces_agua_con_puente_count=0,
            cruces_agua_con_vado_count=0,
            tiene_alternativa_sin_cruce=True,
        )
        assert indice == 3


# ---------------------------------------------------------------------------
# Grafos sinteticos. Las aristas viales NUNCA llevan un atributo `waterway`
# (fiel a la realidad de OSM); los cursos de agua se modelan como geometrias
# shapely aparte, tal como los devuelve `construir_geometrias_agua_local`.
# ---------------------------------------------------------------------------


def _grafo_sintetico_con_puente_y_alternativa():
    """escuela --unpaved--> cruce_puente --paved(bridge)--> cabecera, cruza un
    stream en (-58.85, -27.485) aprox.
    escuela --paved-------------------------------> cabecera (alternativa,
    no cruza agua).
    """
    g = nx.MultiDiGraph()
    for nodo, x, y in [
        ("escuela", -58.90, -27.50),
        ("cruce_puente", -58.85, -27.48),
        ("cabecera", -58.80, -27.45),
    ]:
        g.add_node(nodo, x=x, y=y)

    g.add_edge(
        "escuela",
        "cruce_puente",
        length=1500,
        surface="unpaved",
        highway="track",
        geometry=LineString([(-58.90, -27.50), (-58.85, -27.48)]),
    )
    g.add_edge(
        "cruce_puente",
        "cabecera",
        length=2000,
        bridge="yes",
        highway="secondary",
        geometry=LineString([(-58.85, -27.48), (-58.80, -27.45)]),
    )
    # Alternativa directa pavimentada, sin cruce de agua.
    g.add_edge(
        "escuela",
        "cabecera",
        length=5000,
        surface="paved",
        highway="secondary",
        geometry=LineString([(-58.90, -27.50), (-58.80, -27.45)]),
    )
    return g


def _stream_que_cruza_puente():
    # Perpendicular al tramo cruce_puente->cabecera, lo cruza cerca de su
    # punto medio; no toca la alternativa directa escuela->cabecera.
    return LineString([(-58.83, -29.0), (-58.83, 20.0)])


def _grafo_sintetico_con_vado_sin_alternativa():
    g = nx.MultiDiGraph()
    for nodo, x, y in [
        ("escuela", -58.90, -27.50),
        ("vado", -58.85, -27.48),
        ("cabecera", -58.80, -27.45),
    ]:
        g.add_node(nodo, x=x, y=y)
    g.add_edge(
        "escuela",
        "vado",
        length=1000,
        surface="gravel",
        highway="track",
        geometry=LineString([(-58.90, -27.50), (-58.85, -27.48)]),
    )
    g.add_edge(
        "vado",
        "cabecera",
        length=1500,
        ford="yes",
        highway="unclassified",
        geometry=LineString([(-58.85, -27.48), (-58.80, -27.45)]),
    )
    return g


def _river_que_cruza_vado():
    return LineString([(-58.83, -29.0), (-58.83, 20.0)])


def _grafo_con_nodo_desconectado():
    g = _grafo_sintetico_con_puente_y_alternativa()
    g.add_node("aislado_lejos", x=-50.0, y=-30.0)
    return g


class TestCalcularMetricasEscuela:
    def test_cruce_con_puente_y_alternativa_no_bloquea(self, monkeypatch):
        grafo = _grafo_sintetico_con_puente_y_alternativa()
        patch_nearest_nodes(monkeypatch, ("escuela", 10.0))
        arbol_agua = construir_arbol_agua([_stream_que_cruza_puente()])
        cruces = construir_cruces_por_arista(grafo, arbol_agua, [_stream_que_cruza_puente()])

        metricas = calcular_metricas_escuela(
            grafo, lat=-27.50, lon=-58.90, nodo_cabecera="cabecera",
            cruces_por_arista=cruces,
        )
        assert metricas["motivo_sin_datos"] is None
        assert metricas["cruces_agua_count"] == 1
        assert metricas["cruces_agua_con_puente_count"] == 1
        assert metricas["cruces_agua_con_vado_count"] == 0
        assert metricas["tiene_alternativa_sin_cruce"] is True

    def test_sin_capa_de_agua_el_bug_viejo_no_reaparece_como_falso_cero(
        self, monkeypatch
    ):
        """Regresion directa del bug de G1: si no se pasa `cruces_por_arista`
        (equivalente a que la deteccion fallara), el resultado es 0 cruces --
        nunca se inventa un cruce. Este test documenta el comportamiento por
        ausencia de dato, no confunde "no tengo la capa" con "no hay cruce
        real"; el job de produccion SIEMPRE pasa `cruces_por_arista`."""
        grafo = _grafo_sintetico_con_puente_y_alternativa()
        patch_nearest_nodes(monkeypatch, ("escuela", 10.0))
        metricas = calcular_metricas_escuela(
            grafo, lat=-27.50, lon=-58.90, nodo_cabecera="cabecera",
        )
        assert metricas["cruces_agua_count"] == 0

    def test_vado_sin_alternativa_marca_sin_alternativa(self, monkeypatch):
        grafo = _grafo_sintetico_con_vado_sin_alternativa()
        patch_nearest_nodes(monkeypatch, ("escuela", 5.0))
        agua = [_river_que_cruza_vado()]
        arbol_agua = construir_arbol_agua(agua)
        cruces = construir_cruces_por_arista(grafo, arbol_agua, agua)

        metricas = calcular_metricas_escuela(
            grafo, lat=-27.50, lon=-58.90, nodo_cabecera="cabecera",
            cruces_por_arista=cruces,
        )
        assert metricas["cruces_agua_con_vado_count"] == 1
        assert metricas["tiene_alternativa_sin_cruce"] is False
        indice = calcular_indice_aislamiento(
            metricas["distancia_via_pavimentada_m"],
            metricas["tramos_sin_pavimentar_count"],
            metricas["cruces_agua_con_puente_count"],
            metricas["cruces_agua_con_vado_count"],
            metricas["tiene_alternativa_sin_cruce"],
        )
        assert indice == 3

    def test_cruce_sin_puente_ni_ford_se_trata_como_vado_nunca_seguro(
        self, monkeypatch
    ):
        """Cruce detectado por geometria pero sin tag bridge ni ford (caso
        'sin puente conocido'): nunca se asume seguro, se cuenta junto con
        los vados confirmados (documentado en contrato-datos.md)."""
        g = nx.MultiDiGraph()
        for nodo, x, y in [
            ("escuela", -58.90, -27.50),
            ("cabecera", -58.80, -27.45),
        ]:
            g.add_node(nodo, x=x, y=y)
        g.add_edge(
            "escuela",
            "cabecera",
            length=3000,
            highway="unclassified",
            geometry=LineString([(-58.90, -27.50), (-58.80, -27.45)]),
        )
        agua = [LineString([(-58.85, -29.0), (-58.85, 20.0)])]
        arbol_agua = construir_arbol_agua(agua)
        cruces = construir_cruces_por_arista(g, arbol_agua, agua)
        patch_nearest_nodes(monkeypatch, ("escuela", 5.0))

        metricas = calcular_metricas_escuela(
            g, lat=-27.50, lon=-58.90, nodo_cabecera="cabecera",
            cruces_por_arista=cruces,
        )
        assert metricas["cruces_agua_con_puente_count"] == 0
        assert metricas["cruces_agua_con_vado_count"] == 1
        assert metricas["tiene_alternativa_sin_cruce"] is False

    def test_sin_cruce_de_agua_indice_cero_posible(self, monkeypatch):
        g = nx.MultiDiGraph()
        for nodo, x, y in [
            ("escuela", -58.90, -27.50),
            ("cabecera", -58.85, -27.48),
        ]:
            g.add_node(nodo, x=x, y=y)
        g.add_edge(
            "escuela",
            "cabecera",
            length=1000,
            surface="paved",
            highway="secondary",
            geometry=LineString([(-58.90, -27.50), (-58.85, -27.48)]),
        )
        # Curso de agua lejos, no cruza la ruta.
        agua = [LineString([(0.0, 0.0), (1.0, 1.0)])]
        arbol_agua = construir_arbol_agua(agua)
        cruces = construir_cruces_por_arista(g, arbol_agua, agua)
        patch_nearest_nodes(monkeypatch, ("escuela", 5.0))

        metricas = calcular_metricas_escuela(
            g, lat=-27.50, lon=-58.90, nodo_cabecera="cabecera",
            cruces_por_arista=cruces,
        )
        assert metricas["cruces_agua_count"] == 0
        indice = calcular_indice_aislamiento(
            metricas["distancia_via_pavimentada_m"],
            metricas["tramos_sin_pavimentar_count"],
            metricas["cruces_agua_con_puente_count"],
            metricas["cruces_agua_con_vado_count"],
            metricas["tiene_alternativa_sin_cruce"],
        )
        assert indice == 0

    def test_snap_lejano_marca_sin_conexion_red(self, monkeypatch):
        grafo = _grafo_con_nodo_desconectado()
        patch_nearest_nodes(monkeypatch, ("aislado_lejos", 9000.0))
        metricas = calcular_metricas_escuela(
            grafo, lat=-30.0, lon=-50.0, nodo_cabecera="cabecera"
        )
        assert metricas["motivo_sin_datos"] == "sin_conexion_red"
        assert metricas["distancia_via_pavimentada_m"] is None
        assert metricas["tramos_sin_pavimentar_count"] is None


class TestConstruirCrucesPorArista:
    def test_dedup_mismo_curso_de_agua_cruzado_dos_veces(self):
        """Dos aristas consecutivas de la misma ruta cruzan el MISMO curso de
        agua a menos de la tolerancia de dedup: debe contarse como un unico
        cruce, no dos."""
        g = nx.MultiDiGraph()
        for nodo, x, y in [
            ("escuela", -58.90, -27.50),
            ("medio", -58.851, -27.481),
            ("cabecera", -58.80, -27.45),
        ]:
            g.add_node(nodo, x=x, y=y)
        # Dos tramos muy cortos, ambos cruzan el mismo stream a ~10 m de
        # distancia entre si (muy por debajo de TOLERANCIA_DEDUP_CRUCE_M).
        g.add_edge(
            "escuela", "medio", length=500, bridge="yes", highway="secondary",
            geometry=LineString([(-58.90, -27.50), (-58.849, -27.4805)]),
        )
        g.add_edge(
            "medio", "cabecera", length=2000, bridge="yes", highway="secondary",
            geometry=LineString([(-58.849, -27.4805), (-58.80, -27.45)]),
        )
        agua = [LineString([(-58.85, -29.0), (-58.85, 20.0)])]
        arbol_agua = construir_arbol_agua(agua)
        cruces = construir_cruces_por_arista(g, arbol_agua, agua)

        total_bruto = sum(len(v) for v in cruces.values())
        assert total_bruto >= 1

        ya_vistos = []
        from geo_static.osm_aislamiento import _dedupe_cruces

        contados = 0
        for u, v in [("escuela", "medio"), ("medio", "cabecera")]:
            for k, crucesarista in (
                (k, cruces.get((u, v, k), []))
                for k in g.get_edge_data(u, v)
            ):
                contados += len(_dedupe_cruces(crucesarista, ya_vistos, TOLERANCIA_DEDUP_CRUCE_M))
        assert contados == 1

    def test_sin_geometrias_de_agua_no_detecta_nada(self):
        g = _grafo_sintetico_con_puente_y_alternativa()
        arbol_agua = construir_arbol_agua([])
        cruces = construir_cruces_por_arista(g, arbol_agua, [])
        assert cruces == {}


class TestTienePuente:
    def test_bridge_yes(self):
        assert _tiene_puente({"bridge": "yes"}) is True

    def test_bridge_viaduct_no_es_no(self):
        assert _tiene_puente({"bridge": "viaduct"}) is True

    def test_bridge_no_no_es_puente(self):
        assert _tiene_puente({"bridge": "no"}) is False

    def test_sin_bridge_pero_tunnel_culvert_es_puente(self):
        assert _tiene_puente({"tunnel": "culvert"}) is True

    def test_sin_bridge_ni_tunnel_no_es_puente(self):
        assert _tiene_puente({}) is False

    def test_valor_en_lista_usa_primero(self):
        assert _tiene_puente({"bridge": ["yes", "no"]}) is True

    def test_bridge_nan_de_pyrosm_no_es_puente(self):
        """G1-fix2b: regresion directa del bug real. `pyrosm.get_network`
        devuelve `float('nan')` (no `None`, no clave ausente) para un
        atributo no tageado en una arista -- verificado leyendo aristas
        reales de `.data/osm/corrientes_graph.pkl` (`{'bridge': nan, ...}`).
        Antes del fix, `nan not in (None, "", "no")` daba `True` y esta
        arista se contaba como puente, exactamente la causa de que
        `cruces_agua_con_puente_count == cruces_agua_count` para el 100%
        de las escuelas en la corrida `aislamiento_osm-v1-2026-09-26.csv`."""
        assert _tiene_puente({"bridge": NAN, "tunnel": NAN}) is False

    def test_tunnel_nan_de_pyrosm_no_es_culvert(self):
        assert _tiene_puente({"tunnel": NAN}) is False


class TestPrimerValor:
    def test_nan_flotante_se_normaliza_a_none(self):
        assert _primer_valor(NAN) is None

    def test_valor_real_no_se_toca(self):
        assert _primer_valor("yes") == "yes"

    def test_none_sigue_siendo_none(self):
        assert _primer_valor(None) is None

    def test_lista_con_nan_primero_se_normaliza(self):
        assert _primer_valor([NAN, "yes"]) is None


class TestEsTramoSinPavimentar:
    def test_surface_nan_de_pyrosm_no_se_asume_pavimentado(self):
        """G1-fix2b: mismo bug de NaN, aplicado a `surface`. Con la columna
        `surface` de pyrosm en NaN (no tageada), antes del fix `surface is
        not None` daba `True` (nan no es None) y la funcion devolvia
        directamente `nan in SUPERFICIES_NO_PAVIMENTADAS` (`False`) sin
        caer al chequeo de `highway`, tratando de hecho una arista sin dato
        de superficie como si fuera pavimentada."""
        assert _es_tramo_sin_pavimentar({"surface": NAN, "highway": "track"}) is True

    def test_surface_pavimentada_real(self):
        assert _es_tramo_sin_pavimentar({"surface": "paved", "highway": "track"}) is False


class TestReproduccionBugTodosLosCrucesSonPuente:
    """Reproduce a escala minima el sintoma reportado por N1 sobre
    `aislamiento_osm-v1-2026-09-26.csv`: con datos shapely reales que
    imitan exactamente lo que devuelve `pyrosm.get_network` (atributos no
    tageados como `float('nan')`, nunca `None` ni clave ausente), un cruce
    de agua SIN tag de puente ni de vado se clasificaba como puente."""

    def test_cruce_sin_tags_estilo_pyrosm_se_cuenta_como_vado_no_puente(self, monkeypatch):
        g = nx.MultiDiGraph()
        for nodo, x, y in [
            ("escuela", -58.90, -27.50),
            ("cabecera", -58.80, -27.45),
        ]:
            g.add_node(nodo, x=x, y=y)
        # Arista tal como la entrega pyrosm para un camino rural sin ningun
        # tag de bridge/tunnel/ford: esas claves existen en el dict con
        # valor NaN, no estan ausentes.
        g.add_edge(
            "escuela",
            "cabecera",
            length=3000,
            highway="unclassified",
            surface=NAN,
            bridge=NAN,
            tunnel=NAN,
            ford=NAN,
            geometry=LineString([(-58.90, -27.50), (-58.80, -27.45)]),
        )
        agua = [LineString([(-58.85, -29.0), (-58.85, 20.0)])]
        arbol_agua = construir_arbol_agua(agua)
        cruces = construir_cruces_por_arista(g, arbol_agua, agua)
        patch_nearest_nodes(monkeypatch, ("escuela", 5.0))

        metricas = calcular_metricas_escuela(
            g, lat=-27.50, lon=-58.90, nodo_cabecera="cabecera",
            cruces_por_arista=cruces,
        )
        assert metricas["cruces_agua_con_puente_count"] == 0
        assert metricas["cruces_agua_con_vado_count"] == 1
        assert metricas["tiene_alternativa_sin_cruce"] is False


class TestTieneFord:
    def test_ford_en_arista(self):
        g = nx.MultiDiGraph()
        g.add_node("a", x=0, y=0)
        g.add_node("b", x=0, y=0)
        assert _tiene_ford({"ford": "yes"}, g, "a", "b") is True

    def test_ford_en_nodo(self):
        g = nx.MultiDiGraph()
        g.add_node("a", x=0, y=0, ford="yes")
        g.add_node("b", x=0, y=0)
        assert _tiene_ford({}, g, "a", "b") is True

    def test_sin_ford(self):
        g = nx.MultiDiGraph()
        g.add_node("a", x=0, y=0)
        g.add_node("b", x=0, y=0)
        assert _tiene_ford({}, g, "a", "b") is False

    def test_ford_nan_de_pyrosm_en_arista_no_es_ford(self):
        """G1-fix2b: mismo bug de NaN que en `_tiene_puente`, aplicado a
        `ford`."""
        g = nx.MultiDiGraph()
        g.add_node("a", x=0, y=0)
        g.add_node("b", x=0, y=0)
        assert _tiene_ford({"ford": NAN}, g, "a", "b") is False

    def test_ford_nan_de_pyrosm_en_nodo_no_es_ford(self):
        g = nx.MultiDiGraph()
        g.add_node("a", x=0, y=0, ford=NAN)
        g.add_node("b", x=0, y=0)
        assert _tiene_ford({}, g, "a", "b") is False


class TestGrafoSeguro:
    def test_aristas_inseguras_excluye_las_con_puente(self):
        cruces = {
            ("a", "b", 0): [{"agua_idx": 0, "punto": (0, 0), "con_puente": True, "es_ford": False}],
            ("c", "d", 0): [{"agua_idx": 1, "punto": (0, 0), "con_puente": False, "es_ford": True}],
        }
        assert _aristas_inseguras(cruces) == {("c", "d", 0)}

    def test_construir_grafo_seguro_quita_solo_inseguras(self):
        g = nx.MultiDiGraph()
        g.add_node("a", x=0, y=0)
        g.add_node("b", x=0, y=0)
        g.add_node("c", x=0, y=0)
        g.add_edge("a", "b", key=0, length=1)
        g.add_edge("b", "c", key=0, length=1)
        cruces = {
            ("b", "c", 0): [{"agua_idx": 0, "punto": (0, 0), "con_puente": False, "es_ford": True}],
        }
        g_seguro = construir_grafo_seguro(g, cruces)
        assert g_seguro.has_edge("a", "b")
        assert not g_seguro.has_edge("b", "c")
        # El grafo original no se muta.
        assert g.has_edge("b", "c")


def _grafo_multi_departamento_con_cabecera_compartida():
    """4 escuelas, todas con la MISMA cabecera compartida (simula un
    departamento real), una por cada categoria relevante del contrato de
    datos, en ramas espacialmente separadas (offsets de longitud grandes,
    sin relevancia geografica real) para que cada curso de agua sintetico
    cruce solo la arista que le corresponde:

    - escuela_a: cruce con puente + alternativa pavimentada (no bloquea).
    - escuela_b: vado SIN alternativa (cruces_agua_con_vado_count >= 1,
      grafo_seguro sin camino).
    - escuela_c: vado CON alternativa (cruce mas corto via vado, pero existe
      un bypass pavimentado mas largo que si tiene alternativa segura).
    - escuela_d: sin cruce de agua, via pavimentada cercana (indice 0).
    """
    g = nx.MultiDiGraph()
    g.add_node("cabecera", x=-58.80, y=-27.45)

    # escuela_a: puente + alternativa (offset 0, igual a
    # _grafo_sintetico_con_puente_y_alternativa pero con nodos propios).
    g.add_node("escuela_a", x=-58.90, y=-27.50)
    g.add_node("cruce_puente_a", x=-58.85, y=-27.48)
    g.add_edge(
        "escuela_a", "cruce_puente_a", length=1500, surface="unpaved", highway="track",
        geometry=LineString([(-58.90, -27.50), (-58.85, -27.48)]),
    )
    g.add_edge(
        "cruce_puente_a", "cabecera", length=2000, bridge="yes", highway="secondary",
        geometry=LineString([(-58.85, -27.48), (-58.80, -27.45)]),
    )
    g.add_edge(
        "escuela_a", "cabecera", length=5000, surface="paved", highway="secondary",
        geometry=LineString([(-58.90, -27.50), (-58.80, -27.45)]),
    )
    stream_a = LineString([(-58.83, -29.0), (-58.83, 20.0)])

    # escuela_b: vado sin alternativa (offset -20 en longitud).
    g.add_node("escuela_b", x=-78.90, y=-27.50)
    g.add_node("vado_b", x=-78.85, y=-27.48)
    g.add_edge(
        "escuela_b", "vado_b", length=1000, surface="gravel", highway="track",
        geometry=LineString([(-78.90, -27.50), (-78.85, -27.48)]),
    )
    g.add_edge(
        "vado_b", "cabecera", length=1500, ford="yes", highway="unclassified",
        geometry=LineString([(-78.85, -27.48), (-78.80, -27.45)]),
    )
    river_b = LineString([(-78.83, -29.0), (-78.83, 20.0)])

    # escuela_c: vado CON alternativa (offset -40 en longitud). El camino mas
    # corto pasa por el vado (1000+1500=2500 < camino del bypass), pero el
    # bypass pavimentado -- a proposito en dogleg via "bypass_c", nunca en
    # linea recta -- no cruza el rio y queda disponible en grafo_seguro. El
    # rio es un segmento FINITO (no una linea infinita como en las otras
    # ramas) para que solo cruce la arista vado_c->cabecera y no el bypass:
    # una linea recta escuela_c->cabecera cruzaria el rio igual que el vado
    # (mismo problema que se queria evitar), por eso el bypass tiene que
    # esquivarlo geometricamente, no solo taggearse distinto.
    g.add_node("escuela_c", x=-98.90, y=-27.50)
    g.add_node("vado_c", x=-98.85, y=-27.48)
    g.add_node("bypass_c", x=-98.90, y=-27.45)
    g.add_edge(
        "escuela_c", "vado_c", length=1000, surface="gravel", highway="track",
        geometry=LineString([(-98.90, -27.50), (-98.85, -27.48)]),
    )
    g.add_edge(
        "vado_c", "cabecera", length=1500, ford="yes", highway="unclassified",
        geometry=LineString([(-98.85, -27.48), (-98.80, -27.45)]),
    )
    # Bypass en dos tramos, ambos evitando geometricamente el punto de cruce
    # del rio finito (lon -98.83, lat ~-27.46 a -27.50): primero un tramo
    # norte-sur a longitud constante (-98.90, nunca cruza -98.83), despues
    # un tramo este-oeste a latitud -27.45 (fuera del rango del rio finito).
    g.add_edge(
        "escuela_c", "bypass_c", length=2500, surface="paved", highway="secondary",
        geometry=LineString([(-98.90, -27.50), (-98.90, -27.45)]),
    )
    g.add_edge(
        "bypass_c", "cabecera", length=2500, surface="paved", highway="secondary",
        geometry=LineString([(-98.90, -27.45), (-98.80, -27.45)]),
    )
    river_c = LineString([(-98.83, -27.50), (-98.83, -27.46)])

    # escuela_d: sin cruce de agua, via pavimentada cercana (offset -60).
    g.add_node("escuela_d", x=-118.90, y=-27.50)
    g.add_edge(
        "escuela_d", "cabecera", length=1000, surface="paved", highway="secondary",
        geometry=LineString([(-118.90, -27.50), (-118.80, -27.45)]),
    )

    agua = [stream_a, river_b, river_c]
    return g, agua


class TestCalcularMetricasDepartamentoEquivalencia:
    """N1 - optimizacion de rendimiento: `calcular_metricas_departamento`
    (batched, una sola busqueda multi-destino por departamento) debe dar
    EXACTAMENTE el mismo resultado, escuela por escuela, que llamar
    `calcular_metricas_escuela` (per-escuela) una vez por cada escuela --
    ver docstring de `calcular_metricas_departamento` en osm_aislamiento.py.
    """

    def test_resultados_identicos_por_escuela(self, monkeypatch):
        g, agua = _grafo_multi_departamento_con_cabecera_compartida()
        arbol_agua = construir_arbol_agua(agua)
        cruces = construir_cruces_por_arista(g, arbol_agua, agua)
        grafo_seguro = construir_grafo_seguro(g, cruces)

        escuelas = _escuelas_export_departamento()
        mapeo_nodo = {
            (-58.90, -27.50): ("escuela_a", 10.0),
            (-78.90, -27.50): ("escuela_b", 10.0),
            (-98.90, -27.50): ("escuela_c", 10.0),
            (-118.90, -27.50): ("escuela_d", 10.0),
        }

        _patch_nearest_nodes_departamento(monkeypatch, mapeo_nodo)

        # Ground truth: per-escuela, una llamada por escuela.
        esperado = [
            calcular_metricas_escuela(
                g, lat=e["lat"], lon=e["lon"], nodo_cabecera="cabecera",
                cruces_por_arista=cruces, grafo_seguro=grafo_seguro,
            )
            for e in escuelas
        ]

        # Batched: una sola busqueda multi-destino para las 4 escuelas.
        grafo_invertido = g.reverse(copy=False)
        grafo_seguro_invertido = grafo_seguro.reverse(copy=False)
        obtenido = calcular_metricas_departamento(
            g, grafo_invertido, escuelas, "cabecera",
            cruces_por_arista=cruces, grafo_seguro_invertido=grafo_seguro_invertido,
        )

        assert [
            {k: v for k, v in metricas.items() if k not in ("destino", "distancia_destino_m")}
            for metricas in obtenido
        ] == esperado
        # Sanity: se ejercitaron las 4 categorias documentadas (nunca todas
        # "con puente", que era exactamente el bug de G1-fix2b).
        assert esperado[0]["cruces_agua_con_vado_count"] == 0
        assert esperado[0]["tiene_alternativa_sin_cruce"] is True
        assert esperado[1]["cruces_agua_con_vado_count"] == 1
        assert esperado[1]["tiene_alternativa_sin_cruce"] is False
        assert esperado[2]["cruces_agua_con_vado_count"] == 1
        assert esperado[2]["tiene_alternativa_sin_cruce"] is True
        assert esperado[3]["cruces_agua_count"] == 0

        indices = [
            calcular_indice_aislamiento(
                m["distancia_via_pavimentada_m"], m["tramos_sin_pavimentar_count"],
                m["cruces_agua_con_puente_count"], m["cruces_agua_con_vado_count"],
                m["tiene_alternativa_sin_cruce"],
            )
            for m in esperado
        ]
        assert indices == [1, 3, 2, 0]

    def test_lista_vacia_de_escuelas_devuelve_lista_vacia(self):
        g, agua = _grafo_multi_departamento_con_cabecera_compartida()
        arbol_agua = construir_arbol_agua(agua)
        cruces = construir_cruces_por_arista(g, arbol_agua, agua)
        grafo_invertido = g.reverse(copy=False)
        assert calcular_metricas_departamento(g, grafo_invertido, [], "cabecera", cruces_por_arista=cruces) == []


def _aristas_pyrosm(highways: list[str]) -> pd.DataFrame:
    n = len(highways)
    return pd.DataFrame(
        {
            "u": list(range(1, n + 1)),
            "v": list(range(2, n + 2)),
            "highway": highways,
            "geometry": [f"geom-{i}" for i in range(n)],
        }
    )


class TestConstruirRedLocal:
    def test_llama_a_pyrosm_con_bbox_oeste_sur_este_norte(self, monkeypatch):
        llamadas = {}
        grafo_sentinel = object()

        class FakeOSM:
            def __init__(self, pbf_path, bounding_box):
                llamadas["pbf_path"] = pbf_path
                llamadas["bounding_box"] = bounding_box

            def get_network(
                self,
                network_type,
                custom_filter=None,
                filter_type=None,
                nodes=False,
                extra_attributes=None,
            ):
                llamadas["network_type"] = network_type
                llamadas["custom_filter"] = custom_filter
                llamadas["filter_type"] = filter_type
                llamadas["nodes"] = nodes
                llamadas["extra_attributes"] = extra_attributes
                return (
                    pd.DataFrame({"id": [1, 2]}),
                    _aristas_pyrosm(["track", "residential"]),
                )

            def to_graph(self, nodes, edges, graph_type, osmnx_compatible):
                llamadas["to_graph"] = (graph_type, osmnx_compatible, list(edges["highway"]))
                return grafo_sentinel

        monkeypatch.setattr("pyrosm.OSM", FakeOSM)

        resultado = construir_red_local(
            "un_extracto.osm.pbf",
            bbox_norte=1.0,
            bbox_sur=2.0,
            bbox_este=3.0,
            bbox_oeste=4.0,
        )

        assert resultado is grafo_sentinel
        assert llamadas["pbf_path"] == "un_extracto.osm.pbf"
        # pyrosm espera [oeste, sur, este, norte].
        assert llamadas["bounding_box"] == [4.0, 2.0, 3.0, 1.0]
        assert llamadas["network_type"] == "driving"
        assert llamadas["nodes"] is True
        assert llamadas["extra_attributes"] == ["surface", "bridge", "tunnel", "ford"]
        graph_type, osmnx_compatible, _highways = llamadas["to_graph"]
        assert graph_type == "networkx"
        assert osmnx_compatible is True

    def test_track_y_service_no_se_excluyen(self, monkeypatch):
        llamadas = {}

        class FakeOSM:
            def __init__(self, *args, **kwargs):
                pass

            def get_network(self, network_type, custom_filter=None, filter_type=None, **kwargs):
                llamadas["custom_filter"] = custom_filter
                llamadas["filter_type"] = filter_type
                return (pd.DataFrame({"id": [1]}), _aristas_pyrosm(["residential"]))

            def to_graph(self, nodes, edges, graph_type, osmnx_compatible):
                return nx.MultiDiGraph()

        monkeypatch.setattr("pyrosm.OSM", FakeOSM)

        construir_red_local("x.osm.pbf", 1.0, 2.0, 3.0, 4.0)

        filtro = llamadas["custom_filter"]
        assert llamadas["filter_type"] == "exclude"
        # track y service quedan FUERA de la lista de exclusiones (N3-B).
        assert "track" not in filtro["highway"]
        assert "service" not in filtro["highway"]
        # Las exclusiones de vias privadas / motor_vehicle=no se conservan.
        assert "private" in filtro["access"]
        assert "no" in filtro["motor_vehicle"]
        assert "no" in filtro["motorcar"]

    def test_descarta_highway_basura_y_conserva_track(self, monkeypatch):
        capturado = {}

        class FakeOSM:
            def __init__(self, *args, **kwargs):
                pass

            def get_network(self, network_type, custom_filter=None, filter_type=None, **kwargs):
                return (
                    pd.DataFrame({"id": [1, 2, 3, 4, 5]}),
                    _aristas_pyrosm(["track", "residential", "dummy", "Charata", "ladder"]),
                )

            def to_graph(self, nodes, edges, graph_type, osmnx_compatible):
                capturado["highways"] = list(edges["highway"])
                return nx.MultiDiGraph()

        monkeypatch.setattr("pyrosm.OSM", FakeOSM)

        construir_red_local("x.osm.pbf", 1.0, 2.0, 3.0, 4.0)

        assert set(capturado["highways"]) == {"track", "residential"}
        assert set(HIGHWAYS_CONDUCIBLES) >= {"track", "service", "unclassified", "road"}

    def test_aristas_no_conectadas_out_recibe_las_que_faltan_del_grafo(self, monkeypatch):
        class FakeOSM:
            def __init__(self, *args, **kwargs):
                pass

            def get_network(self, network_type, custom_filter=None, filter_type=None, **kwargs):
                return (
                    pd.DataFrame({"id": [1, 2, 3]}),
                    _aristas_pyrosm(["track", "unclassified", "residential"]),
                )

            def to_graph(self, nodes, edges, graph_type, osmnx_compatible):
                # El grafo solo tiene los nodos 1 y 2: la arista que toca el
                # nodo 3 (y las que salen de el) quedan fuera de la red principal.
                g = nx.MultiDiGraph()
                g.add_node(1)
                g.add_node(2)
                return g

        monkeypatch.setattr("pyrosm.OSM", FakeOSM)

        no_conectadas: list = []
        construir_red_local(
            "x.osm.pbf", 1.0, 2.0, 3.0, 4.0, aristas_no_conectadas_out=no_conectadas
        )
        # (1,2) conectada; (2,3) y (3,4) tocan el nodo 3 ausente.
        assert no_conectadas == [("geom-1", "unclassified"), ("geom-2", "residential")]

        # Con aristas_no_conectadas_out=None no se toca ninguna lista ni falla.
        assert construir_red_local("x.osm.pbf", 1.0, 2.0, 3.0, 4.0) is not None


class TestClasificarSinConexion:
    def _distancia_esperada_m(self, lat, lon, way):
        from pyproj import Transformer

        transformer = Transformer.from_crs(4326, 32721, always_xy=True)
        punto = Point(*transformer.transform(lon, lat))
        way_proyectada = shapely_transform(transformer.transform, way)
        return punto.distance(way_proyectada)

    def test_via_no_conectada_a_34_m(self):
        lat, lon = -27.5, -58.9
        # Via vertical a ~34 m al oeste del punto.
        way = LineString([(-58.89965, -27.51), (-58.89965, -27.49)])
        indice = construir_indice_no_conectadas([(way, "unclassified")])

        motivo, datos = clasificar_sin_conexion(lat, lon, indice)

        assert motivo == MOTIVO_RED_NO_CONECTADA
        esperado = self._distancia_esperada_m(lat, lon, way)
        assert abs(datos["via_no_conectada_m"] - esperado) <= 1.0
        assert datos["via_no_conectada_clase"] == "unclassified"
        assert "punto_via_lon" in datos and "punto_via_lat" in datos

    def test_via_a_6_km_es_sin_via_osm_cercana(self):
        # Via vertical ~7 km al oeste: fuera del radio de snap de 5 km.
        way = LineString([(-58.97, -27.51), (-58.97, -27.49)])
        indice = construir_indice_no_conectadas([(way, "unclassified")])

        motivo, datos = clasificar_sin_conexion(-27.5, -58.9, indice)

        assert motivo == MOTIVO_SIN_VIA_CERCANA
        assert datos["via_no_conectada_m"] is None
        assert datos["via_no_conectada_clase"] is None

    def test_indice_vacio_es_sin_via_osm_cercana(self):
        indice = construir_indice_no_conectadas([])
        motivo, datos = clasificar_sin_conexion(-27.5, -58.9, indice)
        assert motivo == MOTIVO_SIN_VIA_CERCANA
        assert datos["via_no_conectada_m"] is None


def _grafo_lineal_escuela_cabecera():
    g = nx.MultiDiGraph()
    g.add_node("escuela", x=-58.90, y=-27.50)
    g.add_node("cabecera", x=-58.80, y=-27.45)
    g.add_edge("escuela", "cabecera", length=1000, surface="paved", highway="primary", ref="RP13")
    return g


def test_registro_geometria_emite_los_campos_aditivos():
    from geo_static.jobs.calcular_aislamiento import _registro_geometria

    registro = _registro_geometria(
        "CUE", "2026-09-26", {"type": "LineString", "coordinates": []}, [], None,
        via_principal={"nombre": "Ruta Provincial 13", "tipo": "primary", "pavimentada": True},
        destino={"nombre": "Destino"}, distancia_destino_m=123.0,
    )

    assert registro["version_job"] == "3"
    assert registro["via_principal"]["nombre"] == "Ruta Provincial 13"
    assert registro["destino"] == {"nombre": "Destino"}
    assert registro["distancia_destino_m"] == 123.0


def _escuelas_sinteticas():
    return [
        {
            "cueAnexo": "CUE-1",
            "lat": -27.50,
            "lon": -58.90,
            "departamento": "Capital",
            "localidad": "Corrientes",
        },
        {
            "cueAnexo": "CUE-2",
            "lat": -27.55,
            "lon": -58.85,
            "departamento": "Capital",
            "localidad": "Corrientes",
        },
    ]


def _bloquear(monkeypatch, modulo, nombre, mensaje):
    def bloqueado(*args, **kwargs):
        raise AssertionError(mensaje)

    monkeypatch.setattr(modulo, nombre, bloqueado)


def _fake_agua_vacia(monkeypatch, modulo):
    monkeypatch.setattr(
        modulo, "construir_geometrias_agua_y_fords_local", lambda *args, **kwargs: ([], [])
    )


def _preparar_job(monkeypatch, tmp_path, pbf_path):
    import geo_static.jobs.calcular_aislamiento as job

    monkeypatch.setattr(job, "PBF_LOCAL_DEFAULT", pbf_path)
    monkeypatch.setattr(job, "OUTPUT_DIR", tmp_path / "output")
    monkeypatch.setattr(job, "cargar_padron", _escuelas_sinteticas)
    # Gate geografico y sedes oficiales: los tests sinteticos conservan su
    # significado original apuntando a archivos ausentes (degradacion gracil:
    # sin poligonos no se excluye nada y sin sedes se usa el proxy).
    monkeypatch.setattr(job, "DEPARTAMENTOS_GEOJSON_PATH", tmp_path / "no-existe.geojson")
    monkeypatch.setattr(job, "CABECERAS_PATH", tmp_path / "no-existe.json")

    import osmnx as ox

    def fake_nearest_nodes(grafo, X, Y, return_dist=False):
        # Soporta tanto la llamada escalar (snap de la cabecera) como la
        # llamada vectorizada (snap batched de todas las escuelas de un
        # departamento, ver calcular_metricas_departamento).
        if isinstance(X, (list, tuple)):
            return (["escuela"] * len(X), [10.0] * len(X))
        return ("escuela", 10.0)

    monkeypatch.setattr(ox.distance, "nearest_nodes", fake_nearest_nodes)
    return job


class TestCorrerSeleccionDeRed:
    def test_sin_pbf_local_usa_fallback_overpass(self, monkeypatch, tmp_path, capsys):
        import geo_static.osm_aislamiento as osm_mod

        pbf_inexistente = tmp_path / "no-existe.osm.pbf"
        job = _preparar_job(monkeypatch, tmp_path, pbf_inexistente)

        def fake_construir_red(norte, sur, este, oeste):
            return _grafo_lineal_escuela_cabecera()

        monkeypatch.setattr(osm_mod, "construir_red", fake_construir_red)

        _bloquear(
            monkeypatch, osm_mod, "construir_red_local",
            "construir_red_local no debe usarse sin extracto local",
        )
        _bloquear(
            monkeypatch, osm_mod, "construir_geometrias_agua_y_fords_local",
            "el camino sin extracto local no debe intentar cargar la capa de agua",
        )

        llamado_pyrosm = {"n": 0}

        class FakeOSM:
            def __init__(self, *args, **kwargs):
                llamado_pyrosm["n"] += 1
                raise AssertionError("pyrosm no debe usarse en el fallback")

        monkeypatch.setattr("pyrosm.OSM", FakeOSM)

        job.correr()

        assert llamado_pyrosm["n"] == 0
        salida = capsys.readouterr().out
        assert "FALLBACK" in salida
        csvs = list((tmp_path / "output").glob("*.csv"))
        assert len(csvs) == 1

    def test_con_pbf_local_usa_red_unica_pyrosm_y_capa_de_agua(self, monkeypatch, tmp_path, capsys):
        import geo_static.osm_aislamiento as osm_mod

        pbf_falso = tmp_path / "existe.osm.pbf"
        pbf_falso.write_bytes(b"")
        job = _preparar_job(monkeypatch, tmp_path, pbf_falso)

        def fake_construir_red_local(
            pbf_path, norte, sur, este, oeste, aristas_no_conectadas_out=None
        ):
            assert pbf_path == str(pbf_falso)
            return _grafo_lineal_escuela_cabecera()

        monkeypatch.setattr(osm_mod, "construir_red_local", fake_construir_red_local)

        _bloquear(
            monkeypatch, osm_mod, "construir_red",
            "construir_red (Overpass) no debe usarse con extracto local",
        )

        llamadas_agua = {"n": 0}

        def fake_construir_geometrias_agua_local(pbf_path, norte, sur, este, oeste):
            llamadas_agua["n"] += 1
            assert pbf_path == str(pbf_falso)
            return ([], [])

        monkeypatch.setattr(
            osm_mod, "construir_geometrias_agua_y_fords_local", fake_construir_geometrias_agua_local
        )

        job.correr(departamentos=["Capital"])

        assert llamadas_agua["n"] == 1
        nombres_csv = sorted(p.name for p in (tmp_path / "output").glob("*.csv"))
        assert f"aislamiento_osm-v{job.VERSION_JOB}-2026-09-26.csv" in nombres_csv
        assert f"aislamiento_osm_sin_ruta-v{job.VERSION_JOB}-2026-09-26.csv" in nombres_csv
        salida = capsys.readouterr().out
        assert "extracto local detectado" in salida
        assert "capa de agua" in salida
        assert "0 fords (nodos ford=yes)" in salida

    def test_salidas_versionadas_y_version_job(self, monkeypatch, tmp_path):
        """Las tres salidas del camino PBF llevan `-v{VERSION_JOB}-` y el campo
        `version_job` (columna del CSV y campo del NDJSON de geometria) vale
        `VERSION_JOB`, no un literal hardcodeado."""
        import geo_static.osm_aislamiento as osm_mod

        pbf_falso = tmp_path / "existe.osm.pbf"
        pbf_falso.write_bytes(b"")
        job = _preparar_job(monkeypatch, tmp_path, pbf_falso)

        monkeypatch.setattr(
            osm_mod, "construir_red_local", lambda *a, **k: _grafo_lineal_escuela_cabecera()
        )
        monkeypatch.setattr(
            osm_mod, "construir_geometrias_agua_y_fords_local", lambda *a, **k: ([], [])
        )

        job.correr(departamentos=["Capital"])

        output = tmp_path / "output"
        nombres = sorted(p.name for p in output.iterdir())
        assert f"aislamiento_osm-v{job.VERSION_JOB}-2026-09-26.csv" in nombres
        assert f"aislamiento_osm_sin_ruta-v{job.VERSION_JOB}-2026-09-26.csv" in nombres
        assert f"accesos_osm_geometria-v{job.VERSION_JOB}-2026-09-26.ndjson.gz" in nombres

        with open(
            output / f"aislamiento_osm-v{job.VERSION_JOB}-2026-09-26.csv", encoding="utf-8"
        ) as f:
            filas = list(csv.DictReader(f))
        assert filas
        assert {fila["version_job"] for fila in filas} == {job.VERSION_JOB}

        with gzip.open(
            output / f"accesos_osm_geometria-v{job.VERSION_JOB}-2026-09-26.ndjson.gz",
            "rt",
            encoding="utf-8",
        ) as f:
            registros = [json.loads(line) for line in f]
        assert registros
        assert job.VERSION_JOB == "3"
        assert {registro["version_job"] for registro in registros} == {job.VERSION_JOB}
        assert all(
            {"via_principal", "destino", "distancia_destino_m"}.issubset(registro)
            for registro in registros
        )
        assert all(registro["via_principal"] is None for registro in registros)
        with open(
            output / f"aislamiento_osm-v{job.VERSION_JOB}-2026-09-26.csv", encoding="utf-8"
        ) as archivo_csv:
            encabezados = next(csv.reader(archivo_csv))
        assert not {"via_principal", "destino", "distancia_destino_m"}.intersection(encabezados)


class TestCorrerSinRuta:
    """N3-B: el job reemplaza `sin_conexion_red` por un motivo verificable y
    escribe la auditoria `aislamiento_osm_sin_ruta-*.csv` (solo camino PBF)."""

    def test_motivos_y_auditoria_sin_ruta(self, monkeypatch, tmp_path, capsys):
        import geo_static.osm_aislamiento as osm_mod

        pbf_falso = tmp_path / "existe.osm.pbf"
        pbf_falso.write_bytes(b"")
        job = _preparar_job(monkeypatch, tmp_path, pbf_falso)

        # Via aislada a ~34 m de CUE-1 y a ~7 km de CUE-2.
        via_aislada = LineString([(-58.89965, -27.51), (-58.89965, -27.49)])

        def fake_construir_red_local(
            pbf_path, norte, sur, este, oeste, aristas_no_conectadas_out=None
        ):
            if aristas_no_conectadas_out is not None:
                aristas_no_conectadas_out.append((via_aislada, "unclassified"))
            return _grafo_lineal_escuela_cabecera()

        monkeypatch.setattr(osm_mod, "construir_red_local", fake_construir_red_local)

        _fake_agua_vacia(monkeypatch, osm_mod)

        # Toda escuela snapea a > 5 km; el punto de la via aislada a 200 m de la red.
        import osmnx as ox

        def fake_nearest_nodes(grafo, X, Y, return_dist=False):
            if isinstance(X, (list, tuple)):
                nodos = ["escuela"] * len(X)
                return (nodos, [6000.0] * len(X)) if return_dist else nodos
            return ("escuela", 200.0) if return_dist else "escuela"

        monkeypatch.setattr(ox.distance, "nearest_nodes", fake_nearest_nodes)

        job.correr(departamentos=["Capital"])

        csv_path = tmp_path / "output" / f"aislamiento_osm_sin_ruta-v{job.VERSION_JOB}-2026-09-26.csv"
        assert csv_path.exists()
        with open(csv_path, encoding="utf-8") as f:
            reader = csv.DictReader(f)
            filas = list(reader)
        assert reader.fieldnames == job.COLUMNAS_SIN_RUTA
        motivos = {fila["cue_anexo"]: fila["motivo_sin_datos"] for fila in filas}
        assert motivos == {
            "CUE-1": MOTIVO_RED_NO_CONECTADA,
            "CUE-2": MOTIVO_SIN_VIA_CERCANA,
        }
        fila1 = next(f for f in filas if f["cue_anexo"] == "CUE-1")
        assert fila1["via_no_conectada_clase"] == "unclassified"
        assert float(fila1["via_no_conectada_m"]) == 34.6
        assert float(fila1["via_a_red_principal_m"]) == 200.0

        # El NDJSON de geometria lleva el mismo motivo.
        nd_path = tmp_path / "output" / f"accesos_osm_geometria-v{job.VERSION_JOB}-2026-09-26.ndjson.gz"
        with gzip.open(nd_path, "rt", encoding="utf-8") as f:
            registros = {json.loads(line)["cue_anexo"]: json.loads(line) for line in f}
        assert registros["CUE-1"]["motivo_sin_geometria"] == MOTIVO_RED_NO_CONECTADA
        assert registros["CUE-2"]["motivo_sin_geometria"] == MOTIVO_SIN_VIA_CERCANA
        assert "red_vial_no_conectada" in capsys.readouterr().out


def _mapeo_export_departamento():
    return {
        (-58.90, -27.50): ("escuela_a", 10.0),
        (-78.90, -27.50): ("escuela_b", 10.0),
        (-98.90, -27.50): ("escuela_c", 10.0),
        (-118.90, -27.50): ("escuela_d", 10.0),
    }


def _escuelas_export_departamento():
    """Shared school coordinates for department batching and geometry exports."""
    return [
        {"cueAnexo": "A", "lat": -27.50, "lon": -58.90},
        {"cueAnexo": "B", "lat": -27.50, "lon": -78.90},
        {"cueAnexo": "C", "lat": -27.50, "lon": -98.90},
        {"cueAnexo": "D", "lat": -27.50, "lon": -118.90},
    ]


def _patch_nearest_nodes_departamento(monkeypatch, mapeo):
    """`nearest_nodes` vectorizado: en `calcular_metricas_departamento` se llama
    con listas (X=lons, Y=lats), asi que el mapeo se indexa por (lon, lat)."""
    import osmnx as ox

    def fake_nearest_nodes(grafo, X, Y, return_dist=False):
        if isinstance(X, (list, tuple)):
            nodos, dists = zip(*(mapeo[(x, y)] for x, y in zip(X, Y)))
            return list(nodos), list(dists)
        return mapeo[(X, Y)]

    monkeypatch.setattr(ox.distance, "nearest_nodes", fake_nearest_nodes)


def _grafo_paralelas_con_vertices_intermedios():
    g = nx.MultiDiGraph()
    g.add_node("escuela", x=-58.90, y=-27.50)
    g.add_node("cabecera", x=-58.80, y=-27.45)
    # Arista paralela mas LARGA (Dijkstra no la usa).
    g.add_edge(
        "escuela", "cabecera", key=0, length=3000, surface="paved", highway="secondary",
        geometry=LineString([(-58.90, -27.50), (-58.86, -27.47), (-58.80, -27.45)]),
    )
    # Arista paralela mas CORTA (la que usa Dijkstra) con vertice intermedio.
    g.add_edge(
        "escuela", "cabecera", key=1, length=2000, surface="paved", highway="secondary",
        geometry=LineString([(-58.90, -27.50), (-58.88, -27.44), (-58.80, -27.45)]),
    )
    return g


class TestExportarGeometria:
    def test_clasificar_cruce_tres_clases(self):
        assert clasificar_cruce({"con_puente": True, "es_ford": False}) == CLASIFICACION_PUENTE
        assert clasificar_cruce({"con_puente": False, "es_ford": True}) == CLASIFICACION_VADO
        assert (
            clasificar_cruce({"con_puente": False, "es_ford": False})
            == CLASIFICACION_SIN_EVIDENCIA
        )

    def test_con_puente_gana_sobre_ford(self):
        assert clasificar_cruce({"con_puente": True, "es_ford": True}) == CLASIFICACION_PUENTE

    def _preparar_departamento(self, monkeypatch):
        g, agua = _grafo_multi_departamento_con_cabecera_compartida()
        arbol_agua = construir_arbol_agua(agua)
        cruces = construir_cruces_por_arista(g, arbol_agua, agua)
        grafo_seguro = construir_grafo_seguro(g, cruces)
        _patch_nearest_nodes_departamento(monkeypatch, _mapeo_export_departamento())
        return g, grafo_seguro, cruces

    def test_cruces_exportados_coinciden_con_metricas_y_no_cambian_resultado(self, monkeypatch):
        g, grafo_seguro, cruces = self._preparar_departamento(monkeypatch)
        escuelas = _escuelas_export_departamento()
        grafo_invertido = g.reverse(copy=False)
        grafo_seguro_invertido = grafo_seguro.reverse(copy=False)

        sin_geometria = calcular_metricas_departamento(
            g, grafo_invertido, escuelas, "cabecera",
            cruces_por_arista=cruces, grafo_seguro_invertido=grafo_seguro_invertido,
        )
        geometrias = []
        con_geometria = calcular_metricas_departamento(
            g, grafo_invertido, escuelas, "cabecera",
            cruces_por_arista=cruces, grafo_seguro_invertido=grafo_seguro_invertido,
            geometrias_out=geometrias,
        )

        # El export es aditivo: las metricas son identicas.
        assert con_geometria == sin_geometria
        assert len(geometrias) == len(escuelas)
        for metricas, geometria in zip(sin_geometria, geometrias):
            assert len(geometria["cruces"]) == metricas["cruces_agua_count"]
            puentes = sum(
                1 for c in geometria["cruces"] if c["clasificacion"] == CLASIFICACION_PUENTE
            )
            assert puentes == metricas["cruces_agua_con_puente_count"]
            vados_o_sin_evidencia = sum(
                1
                for c in geometria["cruces"]
                if c["clasificacion"] in (CLASIFICACION_VADO, CLASIFICACION_SIN_EVIDENCIA)
            )
            assert vados_o_sin_evidencia == metricas["cruces_agua_con_vado_count"]
        # La escuela A (unica con puente) ejercita la clasificacion "puente".
        assert any(
            c["clasificacion"] == CLASIFICACION_PUENTE for c in geometrias[0]["cruces"]
        )

    def test_ruta_usa_geometria_real_vertices_y_arista_paralela_mas_corta(self, monkeypatch):
        g = _grafo_paralelas_con_vertices_intermedios()
        _patch_nearest_nodes_departamento(monkeypatch, {(-58.90, -27.50): ("escuela", 10.0)})
        escuelas = [{"cueAnexo": "X", "lat": -27.50, "lon": -58.90}]
        geometrias = []
        calcular_metricas_departamento(
            g, g.reverse(copy=False), escuelas, "cabecera", geometrias_out=geometrias,
        )

        ruta = geometrias[0]["ruta"]
        assert ruta is not None
        assert ruta["type"] == "LineString"
        coordenadas = ruta["coordinates"]
        # Empieza en el nodo de snap de la escuela y termina en la cabecera.
        assert coordenadas[0] == [-58.90, -27.50]
        assert coordenadas[-1] == [-58.80, -27.45]
        # La arista usada aporta su vertice intermedio (no solo los extremos).
        assert [-58.88, -27.44] in coordenadas
        # La geometria de la arista paralela mas larga NO se usa.
        assert [-58.86, -27.47] not in coordenadas
        assert len(coordenadas) == 3

    def test_escuela_sin_conexion_red_recibe_ruta_none(self, monkeypatch):
        g = _grafo_con_nodo_desconectado()
        _patch_nearest_nodes_departamento(monkeypatch, {(-50.0, -30.0): ("aislado_lejos", 9000.0)})
        escuelas = [{"cueAnexo": "Z", "lat": -30.0, "lon": -50.0}]
        geometrias = []
        calcular_metricas_departamento(
            g, g.reverse(copy=False), escuelas, "cabecera", geometrias_out=geometrias,
        )
        assert geometrias[0]["ruta"] is None
        assert geometrias[0]["cruces"] == []
        assert geometrias[0]["motivo_sin_geometria"] == "sin_conexion_red"

    def test_ruta_degenerada_cuando_la_escuela_es_la_cabecera(self, monkeypatch):
        g = nx.MultiDiGraph()
        g.add_node("cabecera", x=-58.80, y=-27.45)
        _patch_nearest_nodes_departamento(monkeypatch, {(-58.80, -27.45): ("cabecera", 5.0)})
        escuelas = [{"cueAnexo": "C", "lat": -27.45, "lon": -58.80}]
        geometrias = []
        calcular_metricas_departamento(
            g, g.reverse(copy=False), escuelas, "cabecera", geometrias_out=geometrias,
        )
        assert geometrias[0]["ruta"] is None
        assert geometrias[0]["motivo_sin_geometria"] == "ruta_degenerada"


class TestConstruirIndiceNoConectadasVectorizado:
    """N3-D: `construir_indice_no_conectadas` proyecta con la forma vectorizada
    de shapely; el resultado debe ser identico al de `shapely.ops.transform`
    por geometria (a 1e-6 m)."""

    def _transformer(self):
        from pyproj import Transformer

        return Transformer.from_crs(4326, 32721, always_xy=True)

    def test_geometrias_igual_a_transform_por_geometria(self):
        from shapely.geometry import MultiLineString

        transformer = self._transformer()
        aristas = [
            (LineString([(-58.90, -27.50), (-58.80, -27.45)]), "track"),
            (
                MultiLineString(
                    [
                        [(-58.90, -27.50), (-58.85, -27.48)],
                        [(-58.84, -27.47), (-58.80, -27.45)],
                    ]
                ),
                "unclassified",
            ),
        ]
        indice = construir_indice_no_conectadas(aristas)
        assert indice["clases"] == ["track", "unclassified"]
        assert len(indice["geometrias"]) == 2
        for proyectada, (geometria, _) in zip(indice["geometrias"], aristas):
            esperada = shapely_transform(transformer.transform, geometria)
            assert proyectada.equals_exact(esperada, 1e-6)

    def test_geometria_none_se_descarta(self):
        aristas = [
            (None, "track"),
            (LineString([(-58.90, -27.50), (-58.80, -27.45)]), "residential"),
        ]
        indice = construir_indice_no_conectadas(aristas)
        assert indice["clases"] == ["residential"]
        assert len(indice["geometrias"]) == 1
