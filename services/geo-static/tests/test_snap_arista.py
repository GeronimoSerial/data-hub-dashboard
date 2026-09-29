"""Tests N3-C: snap de la escuela a la ARISTA mas cercana (no al nodo).

Grafos sinteticos construidos a mano con networkx (nunca red). Todos los
tests comparan contra las formulas documentadas en
`osm_aislamiento.calcular_metricas_departamento` (keyword-only
`indice_aristas`): la escuela se snapea a su arista dirigida mas cercana y
rutea desde el extremo `v` (por la arista) o `u` (por la arista reversa si
existe), eligiendo el menor costo `costo_parcial + distancias_cab[salida]`.
"""

import math

import networkx as nx
from pyproj import Transformer
from shapely.geometry import LineString, MultiLineString, Point
from shapely.ops import transform as shapely_transform

from geo_static.osm_aislamiento import (
    calcular_metricas_departamento,
    construir_arbol_agua,
    construir_cruces_por_arista,
    construir_grafo_seguro,
    construir_indice_aristas,
    snap_a_arista,
)

TRANSFORMER = Transformer.from_crs(4326, 32721, always_xy=True)

# Nodos de referencia (lon, lat) en Corrientes.
A = (-58.90, -27.50)
B = (-58.80, -27.50)
C = (-58.70, -27.45)


def _m(a, b):
    """Distancia en metros (EPSG:32721) entre dos puntos lon/lat."""
    pa = TRANSFORMER.transform(a[0], a[1])
    pb = TRANSFORMER.transform(b[0], b[1])
    return math.dist(pa, pb)


def _largo(coords):
    return sum(_m(p, q) for p, q in zip(coords[:-1], coords[1:]))


def _agregar(g, u, v, coords, **datos):
    for nodo, coord in ((u, coords[0]), (v, coords[-1])):
        if nodo not in g:
            g.add_node(nodo, x=coord[0], y=coord[1])
    g.add_edge(u, v, key=datos.pop("key", 0), geometry=LineString(coords), length=_largo(coords), **datos)


def _bidireccional(g, u, v, coords, **datos):
    _agregar(g, u, v, coords, **datos)
    _agregar(g, v, u, list(reversed(coords)), **datos)


def _escuela(lat, lon, cue="X"):
    return [{"cueAnexo": cue, "lat": lat, "lon": lon}]


def _proyeccion_y_frac(coords, lat, lon):
    """Fraccion normalizada y punto de proyeccion lon/lat de un punto sobre la
    linea dada, calculados de forma independiente al modulo."""
    linea = LineString(coords)
    linea_proyectada = shapely_transform(TRANSFORMER.transform, linea)
    punto = Point(*TRANSFORMER.transform(lon, lat))
    frac = linea_proyectada.project(punto, normalized=True)
    punto_original = linea.interpolate(frac, normalized=True)
    return frac, punto_original, punto.distance(linea_proyectada)


def _patch_nearest_nodes_departamento(monkeypatch, mapeo):
    import osmnx as ox

    def fake_nearest_nodes(grafo, X, Y, return_dist=False):
        if isinstance(X, (list, tuple)):
            nodos, dists = zip(*(mapeo[(x, y)] for x, y in zip(X, Y)))
            return list(nodos), list(dists)
        return mapeo[(X, Y)]

    monkeypatch.setattr(ox.distance, "nearest_nodes", fake_nearest_nodes)


# ---------------------------------------------------------------------------
# Equivalencia con el camino legacy cuando la escuela esta sobre un nodo.
# ---------------------------------------------------------------------------


class TestEquivalenciaConLegacy:
    def test_escuela_exactamente_sobre_un_nodo(self, monkeypatch):
        g = nx.MultiDiGraph()
        _bidireccional(g, "A", "B", [A, B], surface="paved", highway="secondary")
        _bidireccional(g, "B", "C", [B, C], surface="paved", highway="secondary")
        _patch_nearest_nodes_departamento(monkeypatch, {A: ("A", 0.0)})

        escuelas = _escuela(A[1], A[0])
        grafo_invertido = g.reverse(copy=False)

        legacy = calcular_metricas_departamento(
            g, grafo_invertido, escuelas, "C", cruces_por_arista={}
        )
        indice = construir_indice_aristas(g)
        nuevo = calcular_metricas_departamento(
            g, grafo_invertido, escuelas, "C", cruces_por_arista={}, indice_aristas=indice
        )
        assert nuevo == legacy
        assert legacy[0]["motivo_sin_datos"] is None
        assert legacy[0]["distancia_cabecera_departamental_m"] == _m(A, B) + _m(B, C)
        assert legacy[0]["tramos_sin_pavimentar_count"] == 0
        assert legacy[0]["cruces_agua_count"] == 0


# ---------------------------------------------------------------------------
# Arista larga con la escuela cerca del medio.
# ---------------------------------------------------------------------------


class TestAristaLarga:
    def test_distancia_parcial_mas_cola_y_ruta_desde_la_proyeccion(self):
        g = nx.MultiDiGraph()
        _bidireccional(g, "A", "B", [A, B], surface="paved", highway="secondary")
        _bidireccional(g, "B", "C", [B, C], surface="paved", highway="secondary")
        indice = construir_indice_aristas(g)

        lat, lon = -27.4995, -58.85
        frac, punto_proyeccion, dist_perp = _proyeccion_y_frac([A, B], lat, lon)
        largo_ab = _largo([A, B])
        largo_bc = _largo([B, C])
        esperado = min(
            (1 - frac) * largo_ab + largo_bc,  # salida por B (cola B->C)
            frac * largo_ab + largo_ab + largo_bc,  # salida por A
        )

        geometrias = []
        metricas = calcular_metricas_departamento(
            g,
            g.reverse(copy=False),
            _escuela(lat, lon),
            "C",
            cruces_por_arista={},
            geometrias_out=geometrias,
            indice_aristas=indice,
        )[0]

        assert metricas["snap_distancia_m"] == dist_perp
        assert metricas["distancia_cabecera_departamental_m"] == esperado
        assert metricas["distancia_via_pavimentada_m"] == esperado

        coords = geometrias[0]["ruta"]["coordinates"]
        # La ruta arranca en el punto de proyeccion, no en la escuela.
        assert coords[0] == [round(punto_proyeccion.x, 6), round(punto_proyeccion.y, 6)]
        assert coords[0] != [round(lon, 6), round(lat, 6)]
        assert coords[-1] == [round(C[0], 6), round(C[1], 6)]

    def test_exactamente_sobre_la_arista_produce_snap_cero(self):
        g = nx.MultiDiGraph()
        _agregar(g, "A", "B", [A, B], surface="paved", highway="secondary")
        _agregar(g, "B", "C", [B, C], surface="paved", highway="secondary")
        indice = construir_indice_aristas(g)
        punto = (-27.50, -58.85)  # sobre la linea A-B en lon/lat
        snap = snap_a_arista(g, indice, *punto)
        # La proyeccion no es del todo conforme en el tramo: sobre una misma
        # latitud queda a menos de 2 m de la recta proyectada.
        assert snap["distancia_m"] < 2.0
        assert snap["u"] == "A" and snap["v"] == "B"
        assert abs(snap["frac"] - 0.5) < 1e-4


# ---------------------------------------------------------------------------
# Salidas: una sola via (one-way) vs. dos vias (cheaper exit gana).
# ---------------------------------------------------------------------------


class TestSalidas:
    def _grafo_one_way(self):
        g = nx.MultiDiGraph()
        _agregar(g, "A", "B", [A, B], surface="paved", highway="secondary")
        _agregar(g, "B", "C", [B, C], surface="paved", highway="secondary")
        return g

    def test_one_way_solo_usa_la_salida_adelante(self):
        g = self._grafo_one_way()
        indice = construir_indice_aristas(g)
        lat, lon = -27.50, -58.85
        frac, _, _ = _proyeccion_y_frac([A, B], lat, lon)
        esperado = (1 - frac) * _largo([A, B]) + _largo([B, C])

        metricas = calcular_metricas_departamento(
            g, g.reverse(copy=False), _escuela(lat, lon), "C",
            cruces_por_arista={}, indice_aristas=indice,
        )[0]

        assert metricas["distancia_cabecera_departamental_m"] == esperado

    def test_two_way_salida_mas_barata_gana_hacia_adelante(self):
        g = nx.MultiDiGraph()
        _bidireccional(g, "A", "B", [A, B], surface="paved", highway="secondary")
        _bidireccional(g, "B", "C", [B, C], surface="paved", highway="secondary")
        indice = construir_indice_aristas(g)
        lat, lon = -27.50, -58.85
        frac, _, _ = _proyeccion_y_frac([A, B], lat, lon)
        esperado = (1 - frac) * _largo([A, B]) + _largo([B, C])

        geometrias = []
        metricas = calcular_metricas_departamento(
            g, g.reverse(copy=False), _escuela(lat, lon), "C",
            cruces_por_arista={}, geometrias_out=geometrias, indice_aristas=indice,
        )[0]

        assert metricas["distancia_cabecera_departamental_m"] == esperado
        # La cola termina en la cabecera C (salida hacia B).
        assert geometrias[0]["ruta"]["coordinates"][-1] == [round(C[0], 6), round(C[1], 6)]

    def test_two_way_salida_mas_barata_gana_hacia_atras(self):
        g = nx.MultiDiGraph()
        _bidireccional(g, "A", "B", [A, B], surface="paved", highway="secondary")
        indice = construir_indice_aristas(g)
        lat, lon = -27.50, -58.85
        frac, _, _ = _proyeccion_y_frac([A, B], lat, lon)
        # La cabecera es A: conviene salir hacia atras (por A) y no hacia B.
        esperado = frac * _largo([A, B])

        geometrias = []
        metricas = calcular_metricas_departamento(
            g, g.reverse(copy=False), _escuela(lat, lon), "A",
            cruces_por_arista={}, geometrias_out=geometrias, indice_aristas=indice,
        )[0]

        assert metricas["distancia_cabecera_departamental_m"] == esperado
        assert geometrias[0]["ruta"]["coordinates"][-1] == [round(A[0], 6), round(A[1], 6)]


# ---------------------------------------------------------------------------
# Cruces en el tramo parcial.
# ---------------------------------------------------------------------------


def _agua_vertical(lon):
    return LineString([(lon, -27.60), (lon, -27.40)])


class TestCrucesEnTramoParcial:
    def _grafo(self):
        g = nx.MultiDiGraph()
        _agregar(g, "A", "B", [A, B], surface="paved", highway="secondary")
        _agregar(g, "B", "C", [B, C], surface="paved", highway="secondary")
        return g

    def test_cruce_detras_no_se_cuenta_adelante_si(self):
        g = self._grafo()
        agua = [_agua_vertical(-58.87), _agua_vertical(-58.83)]  # detras / adelante
        arbol = construir_arbol_agua(agua)
        cruces = construir_cruces_por_arista(g, arbol, agua)
        assert len(cruces[("A", "B", 0)]) == 2

        indice = construir_indice_aristas(g)
        geometrias = []
        metricas = calcular_metricas_departamento(
            g, g.reverse(copy=False), _escuela(-27.50, -58.85), "C",
            cruces_por_arista=cruces, geometrias_out=geometrias, indice_aristas=indice,
        )[0]

        # Solo el cruce adelante (lon -58.83) cae dentro del tramo recorrido.
        assert metricas["cruces_agua_count"] == 1
        assert len(geometrias[0]["cruces"]) == metricas["cruces_agua_count"]
        assert geometrias[0]["cruces"][0]["lon"] == -58.83

    def test_vado_adelante_con_salida_fuera_de_alcanzables_seguro(self):
        g = self._grafo()
        # Vado adelante en el tramo parcial (A->B) y vado en la cola (B->C):
        # el grafo seguro queda sin camino B -> cabecera.
        g["B"]["C"][0]["ford"] = "yes"
        agua = [_agua_vertical(-58.83), _agua_vertical(-58.73)]
        arbol = construir_arbol_agua(agua)
        cruces = construir_cruces_por_arista(g, arbol, agua)
        grafo_seguro = construir_grafo_seguro(g, cruces)

        indice = construir_indice_aristas(g)
        metricas = calcular_metricas_departamento(
            g, g.reverse(copy=False), _escuela(-27.50, -58.85), "C",
            cruces_por_arista=cruces,
            grafo_seguro_invertido=grafo_seguro.reverse(copy=False),
            indice_aristas=indice,
        )[0]

        assert metricas["cruces_agua_con_vado_count"] >= 1
        assert metricas["tiene_alternativa_sin_cruce"] is False


# ---------------------------------------------------------------------------
# Longitud de la geometria exportada vs. distancia del tramo parcial.
# ---------------------------------------------------------------------------


class TestLongitudGeometriaCurva:
    def test_geometria_curva_coincide_con_la_distancia(self):
        curva = [(-58.90, -27.50), (-58.86, -27.47), (-58.82, -27.48), (-58.80, -27.45)]
        g = nx.MultiDiGraph()
        _agregar(g, "A", "B", curva, surface="paved", highway="secondary")
        indice = construir_indice_aristas(g)

        lat, lon = -27.484, -58.88
        geometrias = []
        metricas = calcular_metricas_departamento(
            g, g.reverse(copy=False), _escuela(lat, lon), "B",
            cruces_por_arista={}, geometrias_out=geometrias, indice_aristas=indice,
        )[0]

        coords = geometrias[0]["ruta"]["coordinates"]
        assert len(coords) >= 2
        distancia = metricas["distancia_cabecera_departamental_m"]
        largo_exportado = _largo(coords)
        assert abs(largo_exportado - distancia) / distancia < 0.005


# ---------------------------------------------------------------------------
# N3-D: proyeccion vectorizada del indice de aristas.
# ---------------------------------------------------------------------------


class TestProyeccionVectorizadaIndiceAristas:
    def test_proyectadas_igual_a_transform_por_geometria(self):
        """La forma vectorizada de `construir_indice_aristas` (N3-D) proyecta
        de una sola vez el array de geometrias; debe coincidir con la version
        por-geometria (`shapely.ops.transform`) a 1e-6 m."""
        multilinea = MultiLineString(
            [[A, (-58.85, -27.48)], [(-58.84, -27.47), C]]
        )
        g = nx.MultiDiGraph()
        _agregar(g, "A", "B", [A, B], surface="paved", highway="secondary")
        g.add_node("C", x=C[0], y=C[1])
        g.add_edge(
            "B",
            "C",
            key=0,
            geometry=multilinea,
            length=1.0,
            surface="paved",
            highway="secondary",
        )

        indice = construir_indice_aristas(g)

        assert len(indice["geometrias"]) == len(indice["proyectadas"]) == 2
        for proyectada, geometria in zip(indice["proyectadas"], indice["geometrias"]):
            esperada = shapely_transform(TRANSFORMER.transform, geometria)
            assert proyectada.equals_exact(esperada, 1e-6)
