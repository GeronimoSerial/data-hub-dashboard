"""Job offline: clase de riesgo de inundacion fluvial v2 por escuela (JRC RP10-RP500).

Uso reproducible (desde services/geo-static/; PYTHONPATH=src es necesario
porque el paquete no se instala editable, ver pyproject.toml [tool.uv]
package = false):
    PYTHONPATH=src uv run python -m geo_static.jobs.calcular_inundacion_v2

Lee el padron desde public/data/localizaciones.json (repo raiz), abre los
rasters JRC de .data/jrc_flood una sola vez, lee la profundidad de cada
escuela por periodo de retorno, clasifica el rio con clasificar_rio y escribe
output/inundacion_v2-v1-<YYYY-MM-DD>.csv. Por escuela tambien lee la proximidad a
laguna (GSW + DEM GLO-30, ver lector_laguna).
"""

from __future__ import annotations

import time
from datetime import date
from pathlib import Path

from geo_static import padron_geo
from geo_static.clase_inundacion_v2 import clasificar_rio
from geo_static.csv_utils import escribir_csv
from geo_static.lector_jrc import RPS_POR_DEFECTO, abrir_lector
from geo_static.lector_laguna import abrir_lector_laguna
from geo_static.margen_inundacion import RPS_MARGEN, abrir_lector_margen

VERSION_JOB = "1"
FUENTE = "JRC Global River Flood Hazard Maps v2.1"
LICENCIA = "JRC/CEMS-GLOFAS open data, sin restricciones de uso (README.txt, A02; Baugh et al. 2024)"

OUTPUT_DIR = Path(__file__).resolve().parents[3] / "output"
cargar_padron = padron_geo.cargar_padron

CONTRATO_COLUMNAS = [
    "cue_anexo",
    "clase_rio",
    *[f"profundidad_rp{rp}_m" for rp in RPS_POR_DEFECTO],
    *[f"margen_rp{rp}_m" for rp in RPS_MARGEN],
    "junto_laguna",
    "distancia_agua_m",
    "altura_sobre_agua_m",
    "version_job",
    "fecha_corrida",
    "fuente",
    "licencia",
]


def construir_fila_escuela(
    escuela: dict,
    lector,
    laguna,
    version_job: str,
    fecha_corrida: str,
    margen=None,
) -> dict:
    """Fila del contrato para una escuela.

    `lector` expone `profundidades(lon, lat)` (JRC); `laguna` expone
    `medir(lon, lat)` (lector_laguna); `margen` (opcional) expone
    `medir(lon, lat)` por RP (margen_inundacion.LectorMargen).
    """
    profundidades = lector.profundidades(escuela["lon"], escuela["lat"])
    proximidad = laguna.medir(escuela["lon"], escuela["lat"])
    margenes = margen.medir(escuela["lon"], escuela["lat"]) if margen is not None else {}
    fila = {
        "cue_anexo": escuela["cueAnexo"],
        "clase_rio": clasificar_rio(profundidades, margenes or None),
        "junto_laguna": proximidad["junto_laguna"],
        "distancia_agua_m": proximidad["distancia_agua_m"],
        "altura_sobre_agua_m": proximidad["altura_sobre_agua_m"],
        "version_job": version_job,
        "fecha_corrida": fecha_corrida,
        "fuente": FUENTE,
        "licencia": LICENCIA,
    }
    for rp in RPS_POR_DEFECTO:
        fila[f"profundidad_rp{rp}_m"] = profundidades.get(rp)
    for rp in RPS_MARGEN:
        fila[f"margen_rp{rp}_m"] = margenes.get(rp)
    return fila


def correr() -> None:
    t0 = time.monotonic()
    escuelas = cargar_padron()
    print(f"[calcular_inundacion_v2] escuelas con coordenadas: {len(escuelas)}", flush=True)

    fecha_corrida = date.today().isoformat()
    filas = []
    with abrir_lector() as lector, abrir_lector_laguna() as laguna, abrir_lector_margen() as margen:
        for escuela in escuelas:
            fila = construir_fila_escuela(
                escuela, lector, laguna, VERSION_JOB, fecha_corrida, margen=margen
            )
            filas.append({k: ("" if v is None else v) for k, v in fila.items()})

    out_path = OUTPUT_DIR / f"inundacion_v2-v{VERSION_JOB}-{fecha_corrida}.csv"
    escribir_csv(out_path, CONTRATO_COLUMNAS, filas)

    distribucion: dict[str, int] = {}
    for fila in filas:
        distribucion[fila["clase_rio"]] = distribucion.get(fila["clase_rio"], 0) + 1
    print(f"[calcular_inundacion_v2] escritas {len(filas)} filas en {out_path}", flush=True)
    print(f"[calcular_inundacion_v2] clases: {distribucion}", flush=True)
    print(f"[calcular_inundacion_v2] tiempo total: {time.monotonic() - t0:.1f}s", flush=True)


if __name__ == "__main__":
    correr()
