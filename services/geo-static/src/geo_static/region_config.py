"""Configuracion por region para los jobs offline (DEM por region y bbox de descarga).

Lee config/regiones/<id>.json. El campo opcional `fuenteDem` elige el DEM del
job de exposicion al rio: "copernicus" (GLO-30, por defecto) o "fabdem" (FABDEM V1-2).
"""

from __future__ import annotations

import json
import os
from pathlib import Path

# Mismo criterio de resolucion que REPO_ROOT en padron_geo.py: este archivo esta en
# services/geo-static/src/geo_static/region_config.py, por lo que parents[4] es la raiz.
REPO_ROOT = Path(__file__).resolve().parents[4]
CONFIG_REGIONES_DIR = REPO_ROOT / "config" / "regiones"

REGION_POR_DEFECTO = "corrientes"
FUENTE_DEM_POR_DEFECTO = "copernicus"
FUENTES_DEM = ("copernicus", "fabdem")


def region_actual() -> str:
    """Region del entorno (variable REGION); corrientes si no esta definida."""
    return os.environ.get("REGION") or REGION_POR_DEFECTO


def cargar_region(region_id: str, directorio: Path | None = None) -> dict:
    """Carga config/regiones/<region_id>.json; error claro si no existe."""
    base = CONFIG_REGIONES_DIR if directorio is None else directorio
    ruta = base / f"{region_id}.json"
    if not ruta.is_file():
        raise FileNotFoundError(f"region sin configuracion: {region_id} ({ruta})")
    return json.loads(ruta.read_text(encoding="utf-8"))


def fuente_dem(cfg: dict) -> str:
    """DEM de la region: copernicus o fabdem; copernicus si el campo falta."""
    valor = cfg.get("fuenteDem", FUENTE_DEM_POR_DEFECTO)
    if valor not in FUENTES_DEM:
        raise ValueError(f"fuenteDem invalida: {valor!r} (validas: {', '.join(FUENTES_DEM)})")
    return valor


def bbox_region(cfg: dict) -> tuple[float, float, float, float]:
    """Caja plausible de la region como (oeste, sur, este, norte)."""
    caja = cfg["bboxPlausible"]
    return (caja["lonMin"], caja["latMin"], caja["lonMax"], caja["latMax"])
