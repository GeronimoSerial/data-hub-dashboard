"""Rutas por camino desde cada escuela hacia sus centros de evacuados candidatos.

Funcion pura sobre un grafo vial de networkx (nodos con x/y, aristas con
`length`/`costo`): no importa pyrosm ni osmnx, asi que se prueba con grafos
sinteticos. La corrida real (`jobs/calcular_ruta_evacuacion.py`) arma el grafo y
los nodos de cada escuela.
"""

from __future__ import annotations

from typing import Callable, Optional

K_CANDIDATOS = 5
# Corte sobre el costo de ruteo (>= longitud fisica): descarta destinos lejanos.
CORTE_COSTO_M = 80_000.0
# Escuelas que comparten nodo de red con el destino no tienen trazo dibujable.
MIN_PUNTOS_RUTA = 2


def nodo_de_snap(snap: dict):
    """Extremo de la arista snapeada mas cercano a la escuela (u si frac < 0.5, si no v)."""
    return snap["v"] if snap["frac"] >= 0.5 else snap["u"]


def calcular_rutas_candidatas(
    grafo,
    origenes: dict,
    destinos: dict,
    k: int = K_CANDIDATOS,
    corte_costo_m: float = CORTE_COSTO_M,
    coordenadas_ruta: Optional[Callable] = None,
    longitud_ruta: Optional[Callable] = None,
) -> dict:
    """Para cada escuela de `origenes` devuelve hasta `k` candidatos ordenados por camino.

    `origenes`: {cue: nodo}. `destinos`: {cue: (nodo, nombre)}, ya filtrados por
    elegibilidad estatica. Una escuela nunca es su propio destino. El resultado es
    {cue: [{"destino_cue", "destino_nombre", "distancia_m", "ruta"}]}; una escuela
    sin destino alcanzable queda con lista vacia (la UI cae a linea recta).
    """
    import networkx as nx

    if coordenadas_ruta is None or longitud_ruta is None:
        from geo_static.osm_aislamiento import _coordenadas_ruta, _longitud_ruta

        coordenadas_ruta = coordenadas_ruta or _coordenadas_ruta
        longitud_ruta = longitud_ruta or _longitud_ruta
    from geo_static.osm_aislamiento import _peso_ruta

    peso = _peso_ruta(grafo)
    destinos_por_nodo: dict = {}
    for cue, (nodo, nombre) in destinos.items():
        destinos_por_nodo.setdefault(nodo, []).append((cue, nombre))

    resultado: dict = {}
    for cue_origen, nodo_origen in sorted(origenes.items()):
        candidatos = []
        if nodo_origen in grafo:
            distancias, rutas = nx.single_source_dijkstra(grafo, nodo_origen, cutoff=corte_costo_m, weight=peso)
            alcanzados = sorted(
                (distancias[n], n) for n in distancias if n in destinos_por_nodo
            )
            for _, nodo in alcanzados:
                for cue_destino, nombre in sorted(destinos_por_nodo[nodo]):
                    if cue_destino == cue_origen:
                        continue
                    coords = coordenadas_ruta(grafo, rutas[nodo])
                    if len(coords) < MIN_PUNTOS_RUTA:
                        continue
                    candidatos.append({
                        "costo": distancias[nodo],
                        "destino_cue": cue_destino,
                        "destino_nombre": nombre,
                        "distancia_m": round(float(longitud_ruta(grafo, rutas[nodo])), 1),
                        "ruta": {"type": "LineString", "coordinates": coords},
                    })
                if len(candidatos) >= k:
                    break
            candidatos = sorted(candidatos, key=lambda c: (c["costo"], c["destino_cue"]))[:k]
        resultado[cue_origen] = [{c: v for c, v in cand.items() if c != "costo"} for cand in candidatos]
    return resultado
