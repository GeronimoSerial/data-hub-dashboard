"""Carga localidades urbanas versionadas para la provincia de Corrientes."""

from __future__ import annotations

import json
from geo_static.datasets import leer_dataset
from pathlib import Path


def cargar_localidades_urbanas(path: str | Path | None = None) -> list[dict]:
    """Devuelve localidades con población municipal igual o superior a 2.000."""
    if path is None:
        datos = leer_dataset("localidades-urbanas")
    else:
        ruta = Path(path)
        if not ruta.is_file():
            raise FileNotFoundError(f"No se encontró el archivo de localidades: {ruta}")
        with ruta.open(encoding="utf-8") as archivo:
            datos = json.load(archivo)

    return [
        localidad
        for localidad in datos.get("localidades", [])
        if localidad.get("poblacion", 0) >= 2000
    ]
