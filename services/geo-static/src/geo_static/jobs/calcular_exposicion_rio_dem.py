"""Job offline: exposicion estatica al rio desde el DEM por escuela (v1).

Uso reproducible (desde services/geo-static/; PYTHONPATH=src es necesario
porque el paquete no se instala editable, ver pyproject.toml [tool.uv]
package = false):
    PYTHONPATH=src uv run python -m geo_static.jobs.calcular_exposicion_rio_dem

Lee el padron desde public/data/localizaciones.json (repo raiz), abre el DEM
GLO-30 y GSW occurrence una sola vez y escribe
output/exposicion_rio_dem-v1-<YYYY-MM-DD>.csv con suelo, nivel del rio en el DEM
y distancia al agua permanente por escuela. Ver exposicion_rio_dem.py para los
supuestos.
"""

from __future__ import annotations

import time
from datetime import date
from pathlib import Path

from geo_static import padron_geo
from geo_static.csv_utils import escribir_csv
from geo_static.exposicion_rio_dem import abrir_lector_exposicion_rio_dem

VERSION_JOB = "1"
FUENTE = "copernicus-glo30+gsw-occurrence"
PASO_PROGRESO = 500

OUTPUT_DIR = Path(__file__).resolve().parents[3] / "output"
cargar_padron = padron_geo.cargar_padron

CONTRATO_COLUMNAS = [
    "cue_anexo",
    "version_job",
    "suelo_m",
    "nivel_rio_dem_m",
    "distancia_rio_m",
    "fuente",
    "fecha_corrida",
]


def construir_fila_escuela(escuela: dict, lector, version_job: str, fecha_corrida: str) -> dict:
    """Fila del contrato para una escuela; `lector` expone `medir(lon, lat)`."""
    exposicion = lector.medir(escuela["lon"], escuela["lat"])
    return {
        "cue_anexo": escuela["cueAnexo"],
        "version_job": version_job,
        "suelo_m": exposicion["suelo_m"],
        "nivel_rio_dem_m": exposicion["nivel_rio_dem_m"],
        "distancia_rio_m": exposicion["distancia_rio_m"],
        "fuente": FUENTE,
        "fecha_corrida": fecha_corrida,
    }


def correr() -> None:
    t0 = time.monotonic()
    escuelas = cargar_padron()
    total = len(escuelas)
    print(f"[calcular_exposicion_rio_dem] escuelas con coordenadas: {total}", flush=True)

    fecha_corrida = date.today().isoformat()
    filas = []
    with abrir_lector_exposicion_rio_dem() as lector:
        for indice, escuela in enumerate(escuelas, start=1):
            fila = construir_fila_escuela(escuela, lector, VERSION_JOB, fecha_corrida)
            filas.append({k: ("" if v is None else v) for k, v in fila.items()})
            if indice % PASO_PROGRESO == 0:
                print(f"[calcular_exposicion_rio_dem] procesadas {indice}/{total}", flush=True)

    out_path = OUTPUT_DIR / f"exposicion_rio_dem-v{VERSION_JOB}-{fecha_corrida}.csv"
    escribir_csv(out_path, CONTRATO_COLUMNAS, filas)
    print(f"[calcular_exposicion_rio_dem] escritas {len(filas)} filas en {out_path}", flush=True)
    print(f"[calcular_exposicion_rio_dem] tiempo total: {time.monotonic() - t0:.1f}s", flush=True)


if __name__ == "__main__":
    correr()
