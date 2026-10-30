"""Job offline: rutas por camino hacia centros de evacuados candidatos.

Uso reproducible (desde services/geo-static/, con DATABASE_URL y el extracto
local .data/osm/argentina-latest.osm.pbf, igual que calcular_aislamiento):
    PYTHONPATH=src uv run python -m geo_static.jobs.calcular_ruta_evacuacion

Para cada escuela con coordenadas calcula las rutas OSM hacia sus K destinos mas
cercanos entre las escuelas elegibles por exposicion ESTATICA (sitio, laguna y
ruta de acceso sin exposicion media/alta; el dato ausente no descarta; ver `cargar_elegibles_estaticos` en
lib/infraestructura/evacuacion/calculo.ts). NO mira el riesgo vigente: ese cambia
a diario y lo resuelve el job Node `centros-evacuados`, que elige el primer
candidato que hoy sigue apto. Publica el tipo geo `ruta-evacuacion` (tabla
infra_ruta_evacuacion_osm).

Aproximacion documentada: la ruta arranca y termina en el nodo de la red vial mas
cercano a cada escuela (extremo de la arista mas cercana), no en el portón.
"""

from __future__ import annotations

import time
from datetime import date

from geo_static.datasets import _node, exportar_archivos, finalizar_corrida, guardar_resultados
from geo_static.jobs.calcular_aislamiento import (
    FECHA_EXTRACTO_OSM,
    LICENCIA_OSM,
    OUTPUT_DIR,
    PBF_LOCAL_DEFAULT,
    _bbox_departamento,
)
from geo_static.rutas_evacuacion import calcular_rutas_candidatas, escribir_ndjson_gz, nodo_de_snap

VERSION_JOB = "1"


def correr() -> None:
    from geo_static.osm_aislamiento import (
        _snap_arista_batch,
        asignar_costo,
        construir_indice_aristas,
        construir_red_local,
    )

    if not PBF_LOCAL_DEFAULT.exists():
        raise SystemExit(f"Falta el extracto local {PBF_LOCAL_DEFAULT}")

    t0 = time.monotonic()
    entrada = _node("centros-evacuados-io.mjs", ["leer"])
    escuelas = [e for e in entrada["escuelas"] if e["lat"] is not None and e["lon"] is not None]
    elegibles = set(entrada["elegibles"])
    print(f"[ruta_evacuacion] escuelas: {len(escuelas)}, elegibles estaticas: {len(elegibles)}", flush=True)

    norte, sur, este, oeste = _bbox_departamento([{"lat": e["lat"], "lon": e["lon"]} for e in escuelas])
    grafo = construir_red_local(str(PBF_LOCAL_DEFAULT), norte, sur, este, oeste)
    asignar_costo(grafo)
    indice = construir_indice_aristas(grafo)
    snaps = _snap_arista_batch(grafo, indice, [e["lat"] for e in escuelas], [e["lon"] for e in escuelas])

    origenes = {e["cueAnexo"]: nodo_de_snap(s) for e, s in zip(escuelas, snaps) if s is not None}
    destinos = {
        e["cueAnexo"]: (nodo_de_snap(s), e["nombre"])
        for e, s in zip(escuelas, snaps)
        if s is not None and e["cueAnexo"] in elegibles
    }
    print(f"[ruta_evacuacion] con snap a la red: {len(origenes)}, destinos: {len(destinos)}", flush=True)

    rutas = calcular_rutas_candidatas(grafo, origenes, destinos)
    filas = [
        {
            "cue_anexo": e["cueAnexo"],
            "version_job": VERSION_JOB,
            "fecha_extracto_osm": FECHA_EXTRACTO_OSM,
            "licencia": LICENCIA_OSM,
            "candidatos": rutas.get(e["cueAnexo"], []),
        }
        for e in escuelas
    ]
    con_ruta = sum(1 for f in filas if f["candidatos"])
    print(f"[ruta_evacuacion] escuelas con al menos un candidato: {con_ruta}/{len(filas)}", flush=True)

    fecha = date.today().isoformat()
    if exportar_archivos():
        # GEO_STATIC_EXPORT_FILES=1: ademas deja el archivo versionado importable con
        # `node scripts/importar-geo-static.mjs --ruta-evacuacion <archivo>`.
        salida = OUTPUT_DIR / f"rutas_evacuacion_osm-v{VERSION_JOB}-{fecha}.ndjson.gz"
        escribir_ndjson_gz(filas, salida)
        print(f"[ruta_evacuacion] archivo: {salida}", flush=True)
    guardar_resultados("ruta-evacuacion", filas, "OpenStreetMap", f"v{VERSION_JOB}-{fecha}")
    finalizar_corrida()
    print(f"[ruta_evacuacion] listo en {time.monotonic() - t0:.0f}s", flush=True)


if __name__ == "__main__":
    correr()
