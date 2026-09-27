"""Job offline: susceptibilidad estatica physrisk por escuela (batch G1 ENOS).

Uso reproducible (desde services/geo-static/; PYTHONPATH=src es necesario
porque el paquete no se instala editable, ver pyproject.toml [tool.uv]
package = false):
    PYTHONPATH=src uv run python -m geo_static.jobs.calcular_susceptibilidad

Lee el padron desde public/data/localizaciones.json (repo raiz), consulta
physrisk (bucket S3 publico y anonimo os-climate-physical-risk, ver
docs/ejecucion-enos/G1/evidencia-physrisk.md) para cada escuela y escribe el
CSV versionado del contrato de datos.
"""

from __future__ import annotations

import csv
import json
import time
from datetime import date, datetime, timezone
from pathlib import Path

from geo_static.physrisk_susceptibilidad import (
    PERIODO_RETORNO_DEFECTO_ANIOS,
    _PATH_CALOR,
    _PATH_INUNDACION_FLUVIAL,
    _PATH_VIENTO,
    construir_fila_escuela,
    leer_peligro_lote,
)

VERSION_JOB = "1"

REPO_ROOT = Path(__file__).resolve().parents[5]
PADRON_PATH = REPO_ROOT / "public" / "data" / "localizaciones.json"
OUTPUT_DIR = Path(__file__).resolve().parents[3] / "output"

CONTRATO_COLUMNAS = [
    "cue_anexo",
    "peligro_inundacion_fluvial",
    "peligro_inundacion_pluvial",
    "peligro_viento",
    "peligro_calor",
    "periodo_retorno_anios",
    "fuente",
    "version_job",
    "fecha_corrida",
    "licencia",
]


def cargar_padron() -> list[dict]:
    with open(PADRON_PATH, encoding="utf-8") as f:
        escuelas = json.load(f)
    return [e for e in escuelas if e.get("lat") and e.get("lon")]


def correr() -> None:
    from geo_static.physrisk_susceptibilidad import _crear_reader

    t0 = time.monotonic()
    escuelas = cargar_padron()
    print(f"[calcular_susceptibilidad] escuelas con coordenadas: {len(escuelas)}", flush=True)

    try:
        reader = _crear_reader()
    except Exception as exc:
        print(f"[calcular_susceptibilidad] no se pudo crear el reader de physrisk: {exc!r}", flush=True)
        reader = None

    fecha_corrida = date.today().isoformat()
    lons = [e["lon"] for e in escuelas]
    lats = [e["lat"] for e in escuelas]

    if reader is not None:
        t_fluvial0 = time.monotonic()
        fluvial = leer_peligro_lote(reader, _PATH_INUNDACION_FLUVIAL, lons, lats)
        print(f"[calcular_susceptibilidad] fluvial en lote: {time.monotonic() - t_fluvial0:.1f}s", flush=True)
        viento = leer_peligro_lote(reader, _PATH_VIENTO, lons, lats)
        calor = leer_peligro_lote(reader, _PATH_CALOR, lons, lats)
    else:
        fluvial = [None] * len(escuelas)
        viento = [None] * len(escuelas)
        calor = [None] * len(escuelas)

    filas = []
    for i, escuela in enumerate(escuelas):
        fila = construir_fila_escuela(
            cue_anexo=escuela["cueAnexo"],
            peligro_inundacion_fluvial=fluvial[i],
            peligro_inundacion_pluvial=None,
            peligro_viento=viento[i],
            peligro_calor=calor[i],
            periodo_retorno_anios=PERIODO_RETORNO_DEFECTO_ANIOS,
            version_job=VERSION_JOB,
            fecha_corrida=fecha_corrida,
        )
        filas.append(fila)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUTPUT_DIR / f"susceptibilidad_estatica-v{VERSION_JOB}-{fecha_corrida[:4]}.csv"
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CONTRATO_COLUMNAS)
        writer.writeheader()
        for fila in filas:
            fila_final = {k: ("" if fila.get(k) is None else fila.get(k)) for k in CONTRATO_COLUMNAS}
            writer.writerow(fila_final)

    t1 = time.monotonic()
    con_physrisk = sum(1 for f in filas if f["fuente"] == "physrisk")
    print(f"[calcular_susceptibilidad] escritas {len(filas)} filas en {out_path}", flush=True)
    print(
        f"[calcular_susceptibilidad] con datos physrisk: {con_physrisk} "
        f"({100 * con_physrisk / len(filas):.1f}%), tiempo total: {t1 - t0:.1f}s",
        flush=True,
    )


if __name__ == "__main__":
    correr()
