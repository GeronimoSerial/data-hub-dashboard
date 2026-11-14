"""Job offline: exposicion estatica al rio desde el DEM por escuela (v1).

Uso reproducible (desde services/geo-static/; PYTHONPATH=src es necesario
porque el paquete no se instala editable, ver pyproject.toml [tool.uv]
package = false):
    PYTHONPATH=src uv run python -m geo_static.jobs.calcular_exposicion_rio_dem
    PYTHONPATH=src uv run python -m geo_static.jobs.calcular_exposicion_rio_dem --region manaos

Lee el padrón publicado desde la DB del entorno, abre el DEM y GSW occurrence una
sola vez y escribe output/exposicion_rio_dem-v<N>-<YYYY-MM-DD>.csv con suelo, nivel
del rio en el DEM y distancia al agua permanente por escuela. Ver
exposicion_rio_dem.py para los supuestos.

El DEM depende de la region (config/regiones/<id>.json, campo fuenteDem):
- copernicus (Corrientes, por defecto): Copernicus GLO-30 desde .data/dem/glo30.tif
  y GSW desde .data/gsw/occurrence.tif, igual que siempre.
- fabdem: FABDEM V1-2 desde .data/<region>/dem/fabdem.tif y GSW desde
  .data/<region>/gsw/occurrence.tif.

Atribucion: FABDEM V1-2 deriva de Copernicus WorldDEM-30 (DLR, Airbus; datos de la
Union Europea y ESA) y se distribuye bajo CC BY-NC-SA 4.0 (uso no comercial). Las
alturas se refieren al geoide EGM2008. Ver tests/fixtures/fabdem/PROVENANCE.md.
"""

from __future__ import annotations

import argparse
import time
from datetime import date
from pathlib import Path

from geo_static import padron_geo
from geo_static.csv_utils import escribir_csv
from geo_static.datasets import finalizar_corrida
from geo_static.exposicion_rio_dem import abrir_lector_exposicion_rio_dem
from geo_static.region_config import cargar_region, fuente_dem, region_actual

VERSION_JOB = "1"
FUENTE = "copernicus-glo30+gsw-occurrence"
FUENTE_FABDEM = "fabdem-v1-2+gsw-occurrence"
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


def construir_fila_escuela(
    escuela: dict,
    lector,
    version_job: str,
    fecha_corrida: str,
    fuente: str = FUENTE,
) -> dict:
    """Fila del contrato para una escuela; `lector` expone `medir(lon, lat)`."""
    exposicion = lector.medir(escuela["lon"], escuela["lat"])
    return {
        "cue_anexo": escuela["cueAnexo"],
        "version_job": version_job,
        "suelo_m": exposicion["suelo_m"],
        "nivel_rio_dem_m": exposicion["nivel_rio_dem_m"],
        "distancia_rio_m": exposicion["distancia_rio_m"],
        "fuente": fuente,
        "fecha_corrida": fecha_corrida,
    }


def rutas_fabdem(region_id: str) -> tuple[Path, Path]:
    """DEM FABDEM y GSW occurrence de una region, relativos a services/geo-static/."""
    base = Path(".data") / region_id
    return base / "dem" / "fabdem.tif", base / "gsw" / "occurrence.tif"


def correr(region_id: str | None = None) -> None:
    t0 = time.monotonic()
    region = region_id or region_actual()
    if fuente_dem(cargar_region(region)) == "copernicus":
        fuente, rutas_lector = FUENTE, ()
    else:
        fuente, rutas_lector = FUENTE_FABDEM, rutas_fabdem(region)

    escuelas = cargar_padron()
    total = len(escuelas)
    print(f"[calcular_exposicion_rio_dem] escuelas con coordenadas: {total}", flush=True)

    fecha_corrida = date.today().isoformat()
    filas = []
    with abrir_lector_exposicion_rio_dem(*rutas_lector) as lector:
        for indice, escuela in enumerate(escuelas, start=1):
            fila = construir_fila_escuela(escuela, lector, VERSION_JOB, fecha_corrida, fuente=fuente)
            filas.append({k: ("" if v is None else v) for k, v in fila.items()})
            if indice % PASO_PROGRESO == 0:
                print(f"[calcular_exposicion_rio_dem] procesadas {indice}/{total}", flush=True)

    out_path = OUTPUT_DIR / f"exposicion_rio_dem-v{VERSION_JOB}-{fecha_corrida}.csv"
    out_path = escribir_csv(out_path, CONTRATO_COLUMNAS, filas)
    print(f"[calcular_exposicion_rio_dem] escritas {len(filas)} filas en {out_path}", flush=True)
    print(f"[calcular_exposicion_rio_dem] tiempo total: {time.monotonic() - t0:.1f}s", flush=True)

    finalizar_corrida()


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--region",
        default=region_actual(),
        help="region de config/regiones (por defecto REGION o corrientes)",
    )
    args = parser.parse_args(argv)
    correr(region_id=args.region)


if __name__ == "__main__":
    main()
