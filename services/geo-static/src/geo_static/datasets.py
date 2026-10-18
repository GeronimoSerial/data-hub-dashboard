"""Puente de datos con el repositorio Node: stdin/stdout, sin archivos de datos.

DATABASE_URL selecciona el entorno. Las lecturas se fijan a la primera versión
usada por el proceso; las salidas se publican juntas al finalizar el cálculo.
GEO_STATIC_EXPORT_FILES=1 habilita exportaciones explícitas para diagnóstico.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import uuid
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]
_ENTRADAS: dict[str, dict] = {}
_PENDIENTES: list[dict] = []
_RUN_ID = str(uuid.uuid4())
_INICIADO = datetime.now(timezone.utc).isoformat()


def exportar_archivos() -> bool:
    return os.environ.get("GEO_STATIC_EXPORT_FILES") == "1"


def _node(script: str, args: list[str], entrada=None):
    if not os.environ.get("DATABASE_URL"):
        raise RuntimeError("Falta DATABASE_URL: los datos de infraestructura se leen y guardan en la DB")
    ejecutable = os.environ.get("GEO_STATIC_NODE_BINARY") or shutil.which("node")
    if not ejecutable:
        raise RuntimeError("Configurar GEO_STATIC_NODE_BINARY con Node 24 o superior")
    proceso = subprocess.run(
        [ejecutable, str(REPO_ROOT / "scripts" / script), *args], cwd=REPO_ROOT,
        input=json.dumps(entrada, ensure_ascii=False, allow_nan=False) if entrada is not None else None,
        text=True, capture_output=True, check=False,
    )
    if proceso.returncode:
        # No imprimir credenciales ni filas de alumnos en errores de transporte.
        raise RuntimeError(f"Falló {script}: {proceso.stderr[-1500:]}")
    return json.loads(proceso.stdout)


def leer_dataset(dataset_id: str):
    if dataset_id not in _ENTRADAS:
        _ENTRADAS[dataset_id] = _node("datasets-infraestructura.mjs", ["leer", dataset_id])
    return _ENTRADAS[dataset_id]["documento"]


def versiones_entrada() -> list[str]:
    return [valor["version"]["id"] for valor in _ENTRADAS.values()]


def guardar_resultados(tipo: str, filas: list[dict], fuente: str, revision: str):
    if not filas and tipo != "aislamiento-diagnostico":
        raise ValueError("No se publica una capa vacía")
    _PENDIENTES.append({
        "tipo": tipo, "filas": filas, "fuente": fuente, "revision": revision,
        "fechaFuente": datetime.now(timezone.utc).isoformat(),
        "entradas": versiones_entrada(),
        "metadatos": {"ejecucion": _RUN_ID, "iniciadoEn": _INICIADO},
    })
    return f"db:geo-{tipo} (ejecución {_RUN_ID})"


def finalizar_corrida():
    if not _PENDIENTES:
        return []
    resultado = _node("ingestar-geo-static.mjs", [], _PENDIENTES)
    _PENDIENTES.clear()
    print("[datasets] versiones publicadas: " + json.dumps(resultado), flush=True)
    return resultado


def tipo_desde_nombre(nombre: str) -> str:
    prefijos = {
        "aislamiento_osm_sin_ruta-": "aislamiento-diagnostico",
        "aislamiento_osm-": "aislamiento", "susceptibilidad_estatica-": "susceptibilidad",
        "inundacion_v2-": "inundacion-v2", "exposicion_rio_dem-": "exposicion-rio-dem",
    }
    for prefijo, tipo in prefijos.items():
        if nombre.startswith(prefijo):
            return tipo
    raise ValueError(f"Salida desconocida: {nombre}")
