"""Rutas a centros de evacuados sobre grafos sinteticos (sin red ni pyrosm)."""

import networkx as nx

from geo_static.rutas_evacuacion import calcular_rutas_candidatas, nodo_de_snap


def _grafo():
    g = nx.MultiDiGraph()
    for nodo, (x, y) in {1: (-58.0, -28.0), 2: (-58.1, -28.0), 3: (-58.2, -28.0), 4: (-58.3, -28.0), 5: (-59.0, -29.0)}.items():
        g.add_node(nodo, x=x, y=y)
    for u, v, largo in [(1, 2, 1000.0), (2, 3, 2000.0), (3, 4, 3000.0)]:
        g.add_edge(u, v, length=largo, costo=largo)
        g.add_edge(v, u, length=largo, costo=largo)
    return g


def _coords(grafo, nodos):
    return [[grafo.nodes[n]["x"], grafo.nodes[n]["y"]] for n in nodos]


def _largo(grafo, nodos):
    return sum(grafo.get_edge_data(a, b)[0]["length"] for a, b in zip(nodos[:-1], nodos[1:]))


def _calcular(origenes, destinos, **kw):
    return calcular_rutas_candidatas(_grafo(), origenes, destinos, coordenadas_ruta=_coords, longitud_ruta=_largo, **kw)


def test_ordena_candidatos_por_camino_y_excluye_la_propia_escuela():
    r = _calcular({"A": 1}, {"A": (1, "A"), "B": (2, "B"), "C": (3, "C"), "D": (4, "D")})
    assert [c["destino_cue"] for c in r["A"]] == ["B", "C", "D"]
    assert [c["distancia_m"] for c in r["A"]] == [1000.0, 3000.0, 6000.0]
    assert r["A"][0]["ruta"] == {"type": "LineString", "coordinates": [[-58.0, -28.0], [-58.1, -28.0]]}
    assert r["A"][0]["destino_nombre"] == "B"


def test_limita_a_k_candidatos():
    r = _calcular({"A": 1}, {"B": (2, "B"), "C": (3, "C"), "D": (4, "D")}, k=2)
    assert [c["destino_cue"] for c in r["A"]] == ["B", "C"]


def test_corte_de_costo_descarta_destinos_lejanos():
    r = _calcular({"A": 1}, {"B": (2, "B"), "D": (4, "D")}, corte_costo_m=2500.0)
    assert [c["destino_cue"] for c in r["A"]] == ["B"]


def test_destino_inalcanzable_o_origen_fuera_del_grafo_queda_vacio():
    r = _calcular({"A": 1, "X": 99}, {"E": (5, "E")})
    assert r == {"A": [], "X": []}


def test_destino_en_el_mismo_nodo_no_tiene_trazo_dibujable():
    r = _calcular({"A": 1}, {"B": (1, "B"), "C": (2, "C")})
    assert [c["destino_cue"] for c in r["A"]] == ["C"]


def test_nodo_de_snap_elige_el_extremo_mas_cercano():
    assert nodo_de_snap({"u": 10, "v": 20, "frac": 0.2}) == 10
    assert nodo_de_snap({"u": 10, "v": 20, "frac": 0.5}) == 20
