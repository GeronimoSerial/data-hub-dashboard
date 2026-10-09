"""Job de exposicion historica de inundacion por ruta escolar sobre JRC 90 m (v2)."""

from __future__ import annotations

import gzip
import json
import sys
import time
from contextlib import ExitStack
from datetime import date
from pathlib import Path

import rasterio
from rasterio.transform import xy

from geo_static.exposicion_ruta_v2 import (
    MIN_PIXELES_EXPUESTOS,
    PASO_MUESTREO_M,
    pixeles_de_ruta,
    profundidades_ruta,
    resumir_exposicion_v2,
)
from geo_static.jobs.calcular_exposicion_ruta import leer_rutas
from geo_static.lector_jrc import RPS_POR_DEFECTO, abrir_lector
from geo_static.margen_inundacion import LectorMargen

VERSION_JOB = 2
RAIZ = Path(__file__).resolve().parents[3]
GEOMETRIA_DEFAULT = RAIZ / "output" / "accesos_osm_geometria-v3-2026-09-26.ndjson.gz"
OUTPUT_DIR = RAIZ / "output"
CARPETA_JRC = RAIZ / ".data" / "jrc_flood"
RUTA_DEM = RAIZ / ".data" / "dem" / "glo30.tif"
RUTA_GSW = RAIZ / ".data" / "gsw" / "occurrence.tif"
FUENTE = "JRC River Flood Hazard Maps v2.1"


def margenes_ruta(lector_margen, coordenadas, transform, cache: dict) -> list[dict[int, float | None]]:
    """Margen (m) por RP en el centro de cada pixel unico de la ruta, alineado con pixeles_de_ruta.

    `cache` se comparte entre escuelas: un pixel ya medido no vuelve a leer los rasters.
    """
    margenes = []
    for fila, columna in pixeles_de_ruta(coordenadas, transform):
        clave = (fila, columna)
        if clave not in cache:
            lon, lat = xy(transform, fila, columna, offset="center")
            cache[clave] = lector_margen.medir(lon, lat)
        margenes.append(cache[clave])
    return margenes


def construir_registro_ruta(
    escuela: dict, lector, lector_margen, transform, fecha_corrida: str, cache_margen: dict
) -> dict:
    """Resume la exposicion de una escuela. Sin ruta produce clase_ruta 'sin_ruta'."""
    ruta = escuela.get("ruta")
    coordenadas = ruta["coordinates"] if ruta and ruta.get("coordinates") else []
    profundidades = profundidades_ruta(lector, coordenadas, transform) if coordenadas else []
    margenes = margenes_ruta(lector_margen, coordenadas, transform, cache_margen) if coordenadas else []
    return {
        "cue_anexo": escuela.get("cue_anexo"),
        "version_job": VERSION_JOB,
        **resumir_exposicion_v2(profundidades, margenes),
        "min_pixeles_expuestos": MIN_PIXELES_EXPUESTOS,
        "motivo_sin_dato": escuela.get("motivo_sin_geometria") if not coordenadas else None,
        "paso_muestreo_m": PASO_MUESTREO_M,
        "fuente": FUENTE,
        "fecha_corrida": fecha_corrida,
    }


def escribir_salida(filas: list[dict], salida_dir: Path, fecha_corrida: str) -> Path:
    salida_dir.mkdir(parents=True, exist_ok=True)
    destino = salida_dir / f"exposicion_ruta_inundacion-v{VERSION_JOB}-{fecha_corrida}.ndjson.gz"
    temporal = destino.with_suffix(destino.suffix + ".tmp")
    with open(temporal, "wb") as archivo:
        with gzip.GzipFile(fileobj=archivo, mode="wb", mtime=0) as gz:
            for fila in filas:
                gz.write((json.dumps(fila, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8"))
    temporal.replace(destino)
    return destino


def main(argv=None) -> int:
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limite-escuelas", type=int)
    parser.add_argument("--cues")
    parser.add_argument("--geometria", type=Path, default=GEOMETRIA_DEFAULT)
    parser.add_argument("--salida-dir", type=Path, default=OUTPUT_DIR)
    parser.add_argument("--carpeta-jrc", type=Path, default=CARPETA_JRC)
    args = parser.parse_args(argv)
    inicio = time.monotonic()
    fecha = date.today().isoformat()
    escuelas = leer_rutas(args.geometria, args.limite_escuelas, args.cues.split(",") if args.cues else None)
    filas = []
    cache_margen: dict = {}
    with ExitStack() as pila:
        raster = pila.enter_context(rasterio.open(args.carpeta_jrc / "rp10_depth.tif"))
        lector = pila.enter_context(abrir_lector(args.carpeta_jrc, RPS_POR_DEFECTO))
        lector_margen = LectorMargen(ruta_dem=RUTA_DEM, ruta_gsw=RUTA_GSW, carpeta_jrc=args.carpeta_jrc)
        pila.callback(lector_margen.cerrar)
        for i, escuela in enumerate(escuelas, 1):
            filas.append(construir_registro_ruta(escuela, lector, lector_margen, raster.transform, fecha, cache_margen))
            if i % 250 == 0:
                print(f"[calcular_exposicion_ruta_v2] escuelas {i}/{len(escuelas)}, {time.monotonic()-inicio:.1f}s", flush=True)
    destino = escribir_salida(filas, args.salida_dir, fecha)
    sin_ruta = sum(f["clase_ruta"] == "sin_ruta" for f in filas)
    print(f"[calcular_exposicion_ruta_v2] escuelas {len(filas)}, sin_ruta {sin_ruta}, {time.monotonic()-inicio:.1f}s; salida {destino}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
