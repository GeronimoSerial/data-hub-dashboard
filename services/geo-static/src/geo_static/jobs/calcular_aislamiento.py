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

Ademas del CSV, el camino con extracto local exporta la geometria REAL de la
ruta escuela -> cabecera y de los cruces de agua usados, como NDJSON gzip
versionado en `output/accesos_osm_geometria-v{VERSION_JOB}-{fecha}.ndjson.gz`.
Es un artifact puramente aditivo (no cambia ninguna metrica del CSV) e
importable con `node scripts/importar-geo-static.mjs --geometria <file>`.

N3-A: las escuelas cuya coordenada cae a mas de 2.0 km fuera del poligono de
su propio departamento se excluyen del calculo (fila sin datos, motivo
"coordenada_fuera_de_departamento"). Las cabeceras departamentales usan la
sede oficial de Georef Argentina (`data/cabeceras_departamentales.json`) y
caen al proxy (centroide) solo cuando no hay sede oficial.

N3-B: en el camino con extracto local la red incluye tracks y service (ver
osm_aislamiento.py) y las escuelas sin indice se clasifican con un motivo
verificable ("red_vial_no_conectada" si hay una via de OSM cerca pero en un
componente aislado, "sin_via_osm_cercana" si no hay ninguna via conduccible en
el radio). La auditoria se escribe en
`output/aislamiento_osm_sin_ruta-v{VERSION_JOB}-{fecha}.csv`. "sin_conexion_red"
queda solo como fallback (excepcion por departamento o red por Overpass).
"""

from __future__ import annotations

import csv
import gzip
import json
import sys
import time
from collections import Counter, defaultdict
from datetime import date, datetime, timezone
from pathlib import Path

from geo_static import padron_geo

VERSION_JOB = "1"
LICENCIA_OSM = "© OpenStreetMap contributors, ODbL"

# bbox aproximado de la provincia de Corrientes, Argentina (norte, sur, este, oeste).
BBOX_CORRIENTES = (-27.15, -30.80, -55.60, -60.35)

REPO_ROOT = Path(__file__).resolve().parents[5]
PADRON_PATH = REPO_ROOT / "public" / "data" / "localizaciones.json"
OUTPUT_DIR = Path(__file__).resolve().parents[3] / "output"

# Insumos del gate geografico y de las sedes oficiales (N3-A). Se exponen como
# constantes de modulo para que los tests puedan apuntarlas a fixtures
# temporales; `correr` las consume siempre via estos nombres globales.
DEPARTAMENTOS_GEOJSON_PATH = padron_geo.DEPARTAMENTOS_GEOJSON_PATH
CABECERAS_PATH = padron_geo.CABECERAS_PATH

# Extracto Geofabrik de Argentina descargado localmente (gitignorado). Si existe,
# la corrida de produccion construye la red con pyrosm (construir_red_local);
# si no, cae al fallback de Overpass por departamento (G1-fix1).
PBF_LOCAL_DEFAULT = REPO_ROOT / "services" / "geo-static" / ".data" / "osm" / "argentina-latest.osm.pbf"
# Fecha real del extracto en el servidor Geofabrik (formato YYMMDD -> 260926).
# Se fija a mano porque el archivo local se llama 'argentina-latest.osm.pbf' y
# su mtime no es confiable como fecha del dato.
FECHA_EXTRACTO_OSM = "2026-09-26"

# Fuente del poligono departamental del gate geografico (N3-A), fecha con la que
# se publica la fuente de las escuelas sin ruta en la auditoria N3-B.
FUENTE_GEOREF_DEPARTAMENTOS = "Georef departamentos 2026-09-27"

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

# Auditoria de escuelas SIN indice (N3-B). Una fila por escuela sin indice con
# el motivo verificable y las distancias que lo sustentan.
COLUMNAS_SIN_RUTA = [
    "cue_anexo",
    "nombre",
    "departamento",
    "localidad",
    "lat",
    "lon",
    "motivo_sin_datos",
    "snap_nodo_red_m",
    "via_no_conectada_m",
    "via_no_conectada_clase",
    "via_a_red_principal_m",
    "distancia_poligono_departamento_km",
    "fuente",
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


def _fila_sin_datos(
    escuela: dict, fecha_extracto: str, motivo: str = "sin_conexion_red"
) -> dict:
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
        "motivo_sin_datos": motivo,
        "snap_distancia_m": None,
        "version_job": VERSION_JOB,
        "fecha_extracto_osm": fecha_extracto,
        "licencia": LICENCIA_OSM,
    }


def _escribir_geometria_ndjson(registros: list[dict], fecha_extracto: str) -> Path:
    """Escribe los registros de geometria como NDJSON gzip versionado.

    Ordena por `cue_anexo` para un diff estable y usa `gzip.GzipFile(mtime=0)`
    para que una misma entrada produzca un archivo byte-a-byte identico. Se
    escribe a un `.tmp` y recien despues se renombra al path final.
    """
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUTPUT_DIR / f"accesos_osm_geometria-v{VERSION_JOB}-{fecha_extracto}.ndjson.gz"
    tmp_path = out_path.with_suffix(out_path.suffix + ".tmp")

    registros_ordenados = sorted(registros, key=lambda registro: registro["cue_anexo"])
    with open(tmp_path, "wb") as f:
        with gzip.GzipFile(fileobj=f, mode="wb", mtime=0) as gz:
            for registro in registros_ordenados:
                linea = json.dumps(registro, ensure_ascii=False, separators=(",", ":"))
                gz.write((linea + "\n").encode("utf-8"))

    tmp_path.replace(out_path)
    return out_path


def _redondear(valor, decimales: int):
    """Redondea un float a `decimales`; devuelve "" para un valor ausente
    (vacio del CSV)."""
    if valor is None:
        return ""
    return round(float(valor), decimales)


def _escribir_csv_sin_ruta(
    filas: list[dict],
    escuelas_por_cue: dict[str, dict],
    info_sin_ruta: dict[str, dict],
    km_fuera: dict[str, float],
    fecha_extracto: str,
) -> tuple[Path, list[dict]]:
    """Escribe el CSV de auditoria de escuelas SIN indice (N3-B).

    Una fila por escuela sin `indice_aislamiento`, ordenada por `cue_anexo`, con
    el motivo verificable (`red_vial_no_conectada` / `sin_via_osm_cercana`, y los
    del gate o fallback) y las distancias que lo sustentan. Devuelve el path y
    las filas escritas (para el resumen por motivo). `distancia_poligono_
    departamento_km` solo se completa para `coordenada_fuera_de_departamento`.
    """
    rows = []
    for fila in filas:
        if fila.get("indice_aislamiento") is not None:
            continue
        escuela = escuelas_por_cue.get(fila["cue_anexo"], {})
        motivo = fila.get("motivo_sin_datos") or ""
        info = info_sin_ruta.get(fila["cue_anexo"], {})
        fuera_de_departamento = motivo == "coordenada_fuera_de_departamento"
        fuente = f"OpenStreetMap extracto {fecha_extracto}"
        if fuera_de_departamento:
            fuente = f"{fuente} + {FUENTE_GEOREF_DEPARTAMENTOS}"
        rows.append(
            {
                "cue_anexo": fila["cue_anexo"],
                "nombre": escuela.get("nombre", ""),
                "departamento": escuela.get("departamento", ""),
                "localidad": escuela.get("localidad", ""),
                "lat": _redondear(escuela.get("lat"), 6),
                "lon": _redondear(escuela.get("lon"), 6),
                "motivo_sin_datos": motivo,
                "snap_nodo_red_m": _redondear(fila.get("snap_distancia_m"), 1),
                "via_no_conectada_m": _redondear(info.get("via_no_conectada_m"), 1),
                "via_no_conectada_clase": info.get("via_no_conectada_clase") or "",
                "via_a_red_principal_m": _redondear(info.get("via_a_red_principal_m"), 1),
                "distancia_poligono_departamento_km": (
                    _redondear(km_fuera.get(fila["cue_anexo"]), 1)
                    if fuera_de_departamento
                    else ""
                ),
                "fuente": fuente,
                "licencia": LICENCIA_OSM,
            }
        )
    rows.sort(key=lambda row: row["cue_anexo"])

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUTPUT_DIR / f"aislamiento_osm_sin_ruta-v{VERSION_JOB}-{fecha_extracto}.csv"
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=COLUMNAS_SIN_RUTA)
        writer.writeheader()
        writer.writerows(rows)
    return out_path, rows


def correr(limite_escuelas: int | None = None, departamentos: list[str] | None = None) -> None:
    from geo_static.osm_aislamiento import (
        MOTIVO_RED_NO_CONECTADA,
        calcular_indice_aislamiento,
        calcular_metricas_departamento,
        calcular_metricas_escuela,
        clasificar_sin_conexion,
        construir_arbol_agua,
        construir_cruces_por_arista,
        construir_geometrias_agua_y_fords_local,
        construir_grafo_seguro,
        construir_indice_aristas,
        construir_indice_no_conectadas,
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
    escuelas_por_cue = {e["cueAnexo"]: e for e in escuelas}

    poligonos = padron_geo.cargar_poligonos_departamentos(DEPARTAMENTOS_GEOJSON_PATH)
    oficiales = padron_geo.cargar_cabeceras_oficiales(CABECERAS_PATH)

    escuelas_validas: list[dict] = []
    escuelas_fuera: list[dict] = []
    km_fuera: dict[str, float] = {}
    for e in escuelas:
        distancia_fuera = padron_geo.coordenada_fuera_de_departamento(e, poligonos)
        if distancia_fuera is None:
            escuelas_validas.append(e)
        else:
            escuelas_fuera.append(e)
            km_fuera[e["cueAnexo"]] = distancia_fuera

    print(
        f"[calcular_aislamiento] escuelas con coordenada fuera de su departamento "
        f"(> {padron_geo.UMBRAL_FUERA_DEPARTAMENTO_KM} km): {len(escuelas_fuera)} "
        "(excluidas del cálculo)",
        flush=True,
    )
    for cue, km in sorted(km_fuera.items()):
        print(f"[calcular_aislamiento]   {cue}: {km:.1f} km", flush=True)

    cabeceras = padron_geo.resolver_cabeceras(
        escuelas_validas, oficiales, calcular_cabeceras_departamentales(escuelas_validas)
    )
    sedes_oficiales = sum(
        1 for depto in cabeceras if padron_geo.normalizar_nombre(depto) in oficiales
    )
    print(
        f"[calcular_aislamiento] cabeceras departamentales resueltas: {len(cabeceras)} "
        f"(sede oficial: {sedes_oficiales}, proxy: {len(cabeceras) - sedes_oficiales})",
        flush=True,
    )

    por_depto: dict[str, list[dict]] = defaultdict(list)
    for e in escuelas_validas:
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
        # N3-B: se recorta con las escuelas validas (una coordenada fuera de su
        # departamento no debe agrandar el bbox de la red).
        norte, sur, este, oeste = _bbox_departamento(escuelas_validas)
        aristas_no_conectadas: list = []
        grafo = construir_red_local(
            str(PBF_LOCAL_DEFAULT),
            norte,
            sur,
            este,
            oeste,
            aristas_no_conectadas_out=aristas_no_conectadas,
        )
        indice_no_conectadas = construir_indice_no_conectadas(aristas_no_conectadas)
        print(
            f"[calcular_aislamiento] red local construida: {len(grafo.nodes)} nodos, "
            f"{len(grafo.edges)} aristas, {len(aristas_no_conectadas)} aristas no conectadas",
            flush=True,
        )

        # N3-C: indice espacial de aristas (proyectadas) para snapear cada
        # escuela a la ARISTA mas cercana en vez del nodo mas cercano. Se
        # construye UNA sola vez para toda la corrida (ver osm_aislamiento.py).
        t_aristas0 = time.monotonic()
        indice_aristas = construir_indice_aristas(grafo)
        print(
            f"[calcular_aislamiento] indice de aristas (N3-C): "
            f"{len(indice_aristas['claves'])} aristas, {time.monotonic() - t_aristas0:.1f}s",
            flush=True,
        )

        t_agua0 = time.monotonic()
        geometrias_agua, puntos_ford = construir_geometrias_agua_y_fords_local(
            str(PBF_LOCAL_DEFAULT), norte, sur, este, oeste
        )
        arbol_agua = construir_arbol_agua(geometrias_agua)
        cruces_por_arista = construir_cruces_por_arista(
            grafo, arbol_agua, geometrias_agua, puntos_ford
        )
        grafo_seguro = construir_grafo_seguro(grafo, cruces_por_arista)
        print(
            f"[calcular_aislamiento] capa de agua: {len(geometrias_agua)} cursos de agua, "
            f"{len(puntos_ford)} fords (nodos ford=yes), "
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

        registros_geometria: list[dict] = []
        # N3-B: datos de la via no conectada por escuela, para la auditoria.
        info_sin_ruta: dict[str, dict] = {}

        for depto, escuelas_depto in por_depto.items():
            t_depto0 = time.monotonic()
            try:
                lat_cab, lon_cab = cabeceras[depto]
                nodo_cabecera = ox.distance.nearest_nodes(grafo, X=lon_cab, Y=lat_cab)
                geometrias_depto: list[dict] = []
                lista_metricas = calcular_metricas_departamento(
                    grafo,
                    grafo_invertido,
                    escuelas_depto,
                    nodo_cabecera,
                    cruces_por_arista=cruces_por_arista,
                    grafo_seguro_invertido=grafo_seguro_invertido,
                    geometrias_out=geometrias_depto,
                    indice_aristas=indice_aristas,
                )
                for escuela, metricas, geometria in zip(
                    escuelas_depto, lista_metricas, geometrias_depto
                ):
                    # N3-B: `sin_conexion_red` (snap > 5 km o nodo inalcanzable)
                    # se reemplaza por un motivo verificable segun la via de OSM
                    # mas cercana. La fila del CSV y el motivo del registro de
                    # geometria quedan con el motivo concreto.
                    if metricas["motivo_sin_datos"] == "sin_conexion_red":
                        motivo, info = clasificar_sin_conexion(
                            escuela["lat"], escuela["lon"], indice_no_conectadas
                        )
                        metricas["motivo_sin_datos"] = motivo
                        geometria["motivo_sin_geometria"] = motivo
                        info["via_a_red_principal_m"] = None
                        if motivo == MOTIVO_RED_NO_CONECTADA:
                            # Evidencia: la via existe cerca, pero la red
                            # principal esta a X m (no se inventa el enlace).
                            _, distancia_red = ox.distance.nearest_nodes(
                                grafo,
                                X=info["punto_via_lon"],
                                Y=info["punto_via_lat"],
                                return_dist=True,
                            )
                            info["via_a_red_principal_m"] = float(distancia_red)
                        info_sin_ruta[escuela["cueAnexo"]] = info

                    indice = calcular_indice_aislamiento(
                        metricas["distancia_via_pavimentada_m"],
                        metricas["tramos_sin_pavimentar_count"],
                        metricas["cruces_agua_con_puente_count"],
                        metricas["cruces_agua_con_vado_count"],
                        metricas["tiene_alternativa_sin_cruce"],
                    )
                    filas.append(_fila_escuela(escuela, metricas, indice, fecha_extracto))
                    registros_geometria.append(
                        {
                            "cue_anexo": escuela["cueAnexo"],
                            "version_job": VERSION_JOB,
                            "fecha_extracto_osm": fecha_extracto,
                            "licencia": LICENCIA_OSM,
                            "ruta": geometria["ruta"],
                            "cruces": geometria["cruces"],
                            "motivo_sin_geometria": geometria["motivo_sin_geometria"],
                        }
                    )
            except Exception as exc:
                print(
                    f"[calcular_aislamiento] {depto}: fallo el calculo sobre la red local ({exc!r})",
                    flush=True,
                )
                for e in escuelas_depto:
                    filas.append(_fila_sin_datos(e, fecha_extracto))
                    registros_geometria.append(
                        {
                            "cue_anexo": e["cueAnexo"],
                            "version_job": VERSION_JOB,
                            "fecha_extracto_osm": fecha_extracto,
                            "licencia": LICENCIA_OSM,
                            "ruta": None,
                            "cruces": [],
                            "motivo_sin_geometria": "sin_conexion_red",
                        }
                    )
                continue

            t_depto1 = time.monotonic()
            tiempos_por_depto[depto] = t_depto1 - t_depto0
            print(
                f"[calcular_aislamiento] {depto}: {len(escuelas_depto)} escuelas, "
                f"{len(grafo.nodes)} nodos, {len(grafo.edges)} aristas, {t_depto1 - t_depto0:.1f}s",
                flush=True,
            )

        # Escuelas excluidas por el gate geografico: fila sin datos y registro
        # de geometria sin ruta, con motivo propio (N3-A).
        for e in escuelas_fuera:
            filas.append(
                _fila_sin_datos(
                    e, fecha_extracto, motivo="coordenada_fuera_de_departamento"
                )
            )
            registros_geometria.append(
                {
                    "cue_anexo": e["cueAnexo"],
                    "version_job": VERSION_JOB,
                    "fecha_extracto_osm": fecha_extracto,
                    "licencia": LICENCIA_OSM,
                    "ruta": None,
                    "cruces": [],
                    "motivo_sin_geometria": "coordenada_fuera_de_departamento",
                }
            )

        ruta_geom_path = _escribir_geometria_ndjson(registros_geometria, fecha_extracto)
        con_ruta = sum(1 for r in registros_geometria if r["ruta"] is not None)
        cruces_por_clase = Counter(
            cruce["clasificacion"]
            for registro in registros_geometria
            for cruce in registro["cruces"]
        )
        print(
            f"[calcular_aislamiento] geometria exportada en {ruta_geom_path}: "
            f"{len(registros_geometria)} registros, {con_ruta} con ruta, "
            f"cruces por clase: {dict(cruces_por_clase)}",
            flush=True,
        )

        # N3-B: auditoria de escuelas sin indice (motivo verificable + distancias).
        ruta_sin_ruta_path, filas_sin_ruta = _escribir_csv_sin_ruta(
            filas,
            escuelas_por_cue,
            info_sin_ruta,
            km_fuera,
            fecha_extracto,
        )
        motivos_sin_ruta = Counter(row["motivo_sin_datos"] for row in filas_sin_ruta)
        print(
            f"[calcular_aislamiento] escuelas sin indice exportadas en {ruta_sin_ruta_path}: "
            f"{len(filas_sin_ruta)} filas, motivos: {dict(motivos_sin_ruta)}",
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
        print(
            "[calcular_aislamiento] export de geometria OMITIDO: requiere el "
            "extracto local .osm.pbf (no hay capa de agua en el fallback Overpass); "
            "no se escribe accesos_osm_geometria-*.ndjson.gz",
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

        # Escuelas excluidas por el gate geografico (N3-A): solo fila sin datos.
        for e in escuelas_fuera:
            filas.append(
                _fila_sin_datos(
                    e, fecha_extracto, motivo="coordenada_fuera_de_departamento"
                )
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
