"""Job offline: indice de aislamiento OSM por escuela (batch G1 ENOS).

Uso reproducible (desde services/geo-static/; PYTHONPATH=src es necesario
porque el paquete no se instala editable, ver pyproject.toml [tool.uv]
package = false):
    PYTHONPATH=src uv run python -m geo_static.jobs.calcular_aislamiento

Lee el padron desde public/data/localizaciones.json (repo raiz), construye
UNA red vial 'drive' de OpenStreetMap para el bbox de la provincia de
Corrientes (desde G1-fix1: leyendo el extracto local .data/osm/
argentina-latest.osm.pbf con pyrosm; si el extracto falta, cae al fallback
de Overpass/osmnx por departamento), calcula la cabecera departamental de
forma automatica (la localidad con mas escuelas del padron dentro de cada
departamento — proxy reproducible, sin ingreso manual, documentado en
docs/ejecucion-enos/G1/registro.md) y escribe el CSV versionado del
contrato de datos (docs/ejecucion-enos/G1/contrato-datos.md) en
services/geo-static/output/.
"""

from __future__ import annotations

import csv
import json
import sys
import time
from collections import Counter, defaultdict
from datetime import date, datetime, timezone
from pathlib import Path

VERSION_JOB = "1"
LICENCIA_OSM = "© OpenStreetMap contributors, ODbL"

# bbox aproximado de la provincia de Corrientes, Argentina (norte, sur, este, oeste).
BBOX_CORRIENTES = (-27.15, -30.80, -55.60, -60.35)

REPO_ROOT = Path(__file__).resolve().parents[5]
PADRON_PATH = REPO_ROOT / "public" / "data" / "localizaciones.json"
OUTPUT_DIR = Path(__file__).resolve().parents[3] / "output"

# Extracto Geofabrik de Argentina descargado localmente (gitignorado). Si existe,
# la corrida de produccion construye la red con pyrosm (construir_red_local);
# si no, cae al fallback de Overpass por departamento (G1-fix1).
PBF_LOCAL_DEFAULT = REPO_ROOT / "services" / "geo-static" / ".data" / "osm" / "argentina-latest.osm.pbf"
# Fecha real del extracto en el servidor Geofabrik (formato YYMMDD -> 260926).
# Se fija a mano porque el archivo local se llama 'argentina-latest.osm.pbf' y
# su mtime no es confiable como fecha del dato.
FECHA_EXTRACTO_OSM = "2026-09-26"

CONTRATO_COLUMNAS = [
    "cue_anexo",
    "distancia_via_pavimentada_m",
    "distancia_cabecera_departamental_m",
    "tramos_sin_pavimentar_count",
    "cruces_agua_count",
    "cruces_agua_con_puente_count",
    "cruces_agua_con_vado_count",
    "tiene_alternativa_sin_cruce",
    "indice_aislamiento",
    "motivo_sin_datos",
    "snap_distancia_m",
    "version_job",
    "fecha_extracto_osm",
    "licencia",
]


def cargar_padron() -> list[dict]:
    with open(PADRON_PATH, encoding="utf-8") as f:
        escuelas = json.load(f)
    return [e for e in escuelas if e.get("lat") and e.get("lon")]


def calcular_cabeceras_departamentales(escuelas: list[dict]) -> dict[str, tuple[float, float]]:
    """Cabecera departamental = localidad con mas escuelas del padron dentro
    del departamento (centroide de sus escuelas). Proxy automatico y
    reproducible; ver docstring del modulo."""
    por_departamento: dict[str, Counter] = defaultdict(Counter)
    for e in escuelas:
        por_departamento[e["departamento"]][e["localidad"]] += 1

    cabeceras: dict[str, tuple[float, float]] = {}
    for departamento, contador in por_departamento.items():
        localidad_top = contador.most_common(1)[0][0]
        coords = [
            (e["lat"], e["lon"])
            for e in escuelas
            if e["departamento"] == departamento and e["localidad"] == localidad_top
        ]
        lat = sum(c[0] for c in coords) / len(coords)
        lon = sum(c[1] for c in coords) / len(coords)
        cabeceras[departamento] = (lat, lon)
    return cabeceras


def _bbox_departamento(escuelas_depto: list[dict], margen_grados: float = 0.15) -> tuple[float, float, float, float]:
    lats = [e["lat"] for e in escuelas_depto]
    lons = [e["lon"] for e in escuelas_depto]
    return (
        max(lats) + margen_grados,
        min(lats) - margen_grados,
        max(lons) + margen_grados,
        min(lons) - margen_grados,
    )


def _fila_escuela(escuela: dict, metricas: dict, indice, fecha_extracto: str) -> dict:
    return {
        "cue_anexo": escuela["cueAnexo"],
        **metricas,
        "indice_aislamiento": indice,
        "version_job": VERSION_JOB,
        "fecha_extracto_osm": fecha_extracto,
        "licencia": LICENCIA_OSM,
    }


def _fila_sin_datos(escuela: dict, fecha_extracto: str) -> dict:
    return {
        "cue_anexo": escuela["cueAnexo"],
        "distancia_via_pavimentada_m": None,
        "distancia_cabecera_departamental_m": None,
        "tramos_sin_pavimentar_count": None,
        "cruces_agua_count": None,
        "cruces_agua_con_puente_count": None,
        "cruces_agua_con_vado_count": None,
        "tiene_alternativa_sin_cruce": None,
        "indice_aislamiento": None,
        "motivo_sin_datos": "sin_conexion_red",
        "snap_distancia_m": None,
        "version_job": VERSION_JOB,
        "fecha_extracto_osm": fecha_extracto,
        "licencia": LICENCIA_OSM,
    }


def correr(limite_escuelas: int | None = None, departamentos: list[str] | None = None) -> None:
    from geo_static.osm_aislamiento import (
        calcular_indice_aislamiento,
        calcular_metricas_departamento,
        calcular_metricas_escuela,
        construir_arbol_agua,
        construir_cruces_por_arista,
        construir_geometrias_agua_local,
        construir_grafo_seguro,
        construir_red,
        construir_red_local,
    )
    import osmnx as ox

    t0 = time.monotonic()
    escuelas = cargar_padron()
    if departamentos:
        escuelas = [e for e in escuelas if e["departamento"] in departamentos]
    if limite_escuelas:
        escuelas = escuelas[:limite_escuelas]
    print(f"[calcular_aislamiento] escuelas con coordenadas: {len(escuelas)}", flush=True)

    cabeceras = calcular_cabeceras_departamentales(escuelas)
    print(f"[calcular_aislamiento] cabeceras departamentales calculadas: {len(cabeceras)}", flush=True)

    por_depto: dict[str, list[dict]] = defaultdict(list)
    for e in escuelas:
        por_depto[e["departamento"]].append(e)

    filas = []
    importado_en = datetime.now(timezone.utc).isoformat()
    tiempos_por_depto = {}

    if PBF_LOCAL_DEFAULT.exists():
        # Camino de produccion (G1-fix1): UNA red para toda la provincia desde
        # el extracto local, no una por departamento.
        fecha_extracto = FECHA_EXTRACTO_OSM
        print(
            f"[calcular_aislamiento] extracto local detectado en {PBF_LOCAL_DEFAULT} "
            f"(fecha {fecha_extracto}); se construye UNA red para toda la provincia con pyrosm",
            flush=True,
        )
        norte, sur, este, oeste = _bbox_departamento(escuelas)
        grafo = construir_red_local(str(PBF_LOCAL_DEFAULT), norte, sur, este, oeste)
        print(
            f"[calcular_aislamiento] red local construida: {len(grafo.nodes)} nodos, "
            f"{len(grafo.edges)} aristas",
            flush=True,
        )

        t_agua0 = time.monotonic()
        geometrias_agua = construir_geometrias_agua_local(
            str(PBF_LOCAL_DEFAULT), norte, sur, este, oeste
        )
        arbol_agua = construir_arbol_agua(geometrias_agua)
        cruces_por_arista = construir_cruces_por_arista(grafo, arbol_agua, geometrias_agua)
        grafo_seguro = construir_grafo_seguro(grafo, cruces_por_arista)
        print(
            f"[calcular_aislamiento] capa de agua: {len(geometrias_agua)} cursos de agua, "
            f"{len(cruces_por_arista)} aristas con cruce detectado, "
            f"{time.monotonic() - t_agua0:.1f}s",
            flush=True,
        )

        # N1 - optimizacion de rendimiento (ver docs/ejecucion-enos/G1/registro.md
        # y docstring de calcular_metricas_departamento): los grafos invertidos se
        # construyen UNA sola vez para toda la corrida (no por departamento), para
        # que cada departamento resuelva sus escuelas con una unica busqueda
        # multi-destino en vez de un shortest_path/has_path por escuela.
        grafo_invertido = grafo.reverse(copy=False)
        grafo_seguro_invertido = grafo_seguro.reverse(copy=False)

        for depto, escuelas_depto in por_depto.items():
            t_depto0 = time.monotonic()
            try:
                lat_cab, lon_cab = cabeceras[depto]
                nodo_cabecera = ox.distance.nearest_nodes(grafo, X=lon_cab, Y=lat_cab)
                lista_metricas = calcular_metricas_departamento(
                    grafo,
                    grafo_invertido,
                    escuelas_depto,
                    nodo_cabecera,
                    cruces_por_arista=cruces_por_arista,
                    grafo_seguro_invertido=grafo_seguro_invertido,
                )
                for escuela, metricas in zip(escuelas_depto, lista_metricas):
                    indice = calcular_indice_aislamiento(
                        metricas["distancia_via_pavimentada_m"],
                        metricas["tramos_sin_pavimentar_count"],
                        metricas["cruces_agua_con_puente_count"],
                        metricas["cruces_agua_con_vado_count"],
                        metricas["tiene_alternativa_sin_cruce"],
                    )
                    filas.append(_fila_escuela(escuela, metricas, indice, fecha_extracto))
            except Exception as exc:
                print(
                    f"[calcular_aislamiento] {depto}: fallo el calculo sobre la red local ({exc!r})",
                    flush=True,
                )
                for e in escuelas_depto:
                    filas.append(_fila_sin_datos(e, fecha_extracto))
                continue

            t_depto1 = time.monotonic()
            tiempos_por_depto[depto] = t_depto1 - t_depto0
            print(
                f"[calcular_aislamiento] {depto}: {len(escuelas_depto)} escuelas, "
                f"{len(grafo.nodes)} nodos, {len(grafo.edges)} aristas, {t_depto1 - t_depto0:.1f}s",
                flush=True,
            )
    else:
        # Fallback documentado (comportamiento anterior a G1-fix1): red por
        # departamento via Overpass/osmnx. Solo se usa si falta el extracto local.
        fecha_extracto = date.today().isoformat()
        print(
            f"[calcular_aislamiento] extracto local NO encontrado en {PBF_LOCAL_DEFAULT}; "
            "FALLBACK a Overpass por departamento con construir_red "
            "(sin capa de cruces de agua: la extraccion de waterways de "
            "G1-fix2 solo esta implementada contra el extracto pbf local, "
            "no contra Overpass; en este camino cruces_agua_count queda en "
            "0 para todas las escuelas, documentado)",
            flush=True,
        )

        for depto, escuelas_depto in por_depto.items():
            t_depto0 = time.monotonic()
            norte, sur, este, oeste = _bbox_departamento(escuelas_depto)
            try:
                grafo = construir_red(norte, sur, este, oeste)
            except Exception as exc:
                print(f"[calcular_aislamiento] {depto}: fallo la descarga de red ({exc!r})", flush=True)
                for e in escuelas_depto:
                    filas.append(_fila_sin_datos(e, fecha_extracto))
                continue

            lat_cab, lon_cab = cabeceras[depto]
            nodo_cabecera = ox.distance.nearest_nodes(grafo, X=lon_cab, Y=lat_cab)

            for escuela in escuelas_depto:
                metricas = calcular_metricas_escuela(
                    grafo, escuela["lat"], escuela["lon"], nodo_cabecera
                )
                indice = calcular_indice_aislamiento(
                    metricas["distancia_via_pavimentada_m"],
                    metricas["tramos_sin_pavimentar_count"],
                    metricas["cruces_agua_con_puente_count"],
                    metricas["cruces_agua_con_vado_count"],
                    metricas["tiene_alternativa_sin_cruce"],
                )
                filas.append(_fila_escuela(escuela, metricas, indice, fecha_extracto))

            t_depto1 = time.monotonic()
            tiempos_por_depto[depto] = t_depto1 - t_depto0
            print(
                f"[calcular_aislamiento] {depto}: {len(escuelas_depto)} escuelas, "
                f"{len(grafo.nodes)} nodos, {len(grafo.edges)} aristas, {t_depto1 - t_depto0:.1f}s",
                flush=True,
            )

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUTPUT_DIR / f"aislamiento_osm-v{VERSION_JOB}-{fecha_extracto}.csv"
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CONTRATO_COLUMNAS)
        writer.writeheader()
        for fila in filas:
            fila_final = {k: fila.get(k, "") for k in CONTRATO_COLUMNAS}
            for k, v in fila_final.items():
                if v is None:
                    fila_final[k] = ""
                elif isinstance(v, bool):
                    fila_final[k] = int(v)
            writer.writerow(fila_final)

    t1 = time.monotonic()
    con_indice = sum(1 for f in filas if f["indice_aislamiento"] is not None)
    sin_datos = sum(1 for f in filas if f["motivo_sin_datos"])
    print(f"[calcular_aislamiento] escritas {len(filas)} filas en {out_path}", flush=True)
    print(
        f"[calcular_aislamiento] con indice: {con_indice} ({100 * con_indice / len(filas):.1f}%), "
        f"sin datos de red: {sin_datos}, tiempo total: {t1 - t0:.1f}s",
        flush=True,
    )


if __name__ == "__main__":
    # Uso: PYTHONPATH=src uv run python -m geo_static.jobs.calcular_aislamiento [DEPTO1,DEPTO2,...]
    # Sin argumentos corre los 25 departamentos de Corrientes.
    departamentos = sys.argv[1].split(",") if len(sys.argv) > 1 else None
    correr(departamentos=departamentos)
