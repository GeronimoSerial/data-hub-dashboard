"""Job reproducible de exposicion historica de inundacion por ruta escolar."""

from __future__ import annotations

from geo_static.datasets import leer_dataset, exportar_archivos, guardar_resultados, finalizar_corrida
import gzip
import json
import sys
import time
from datetime import date
from pathlib import Path

from geo_static.exposicion_ruta import (
    PATH_INUNDACION_HISTORICA,
    PERIODO_RETORNO_ANIOS,
    RESOLUCION_ARCSEC,
    centro_de_celda,
    celdas_de_ruta,
    detalle_celdas,
    resumir_exposicion,
)
from geo_static.physrisk_susceptibilidad import (
    TAMANO_BLOQUE_LOTE,
    _leer_bloque_con_reintentos,
)

VERSION_JOB = "1"
OUTPUT_DIR = Path(__file__).resolve().parents[3] / "output"
CHECKPOINT_DEFAULT = Path(__file__).resolve().parents[3] / ".data" / "exposicion_ruta_celdas.ndjson"
ESCENARIO = "historico WRI Aqueduct v2, WATCH 1980"
LICENCIA = "Apache-2.0, OS-Climate physrisk; WRI Aqueduct"


def leer_rutas(geometria: Path | None = None, limite_escuelas: int | None = None, cues=None) -> list[dict]:
    """Lee geometria NDJSON gzip respetando orden, filtro y limite solicitados."""
    cues = set(cues or [])
    filas = []
    if geometria is None:
        registros = leer_dataset("geo-geometria")
    else:
        with gzip.open(geometria, "rt", encoding="utf-8") as archivo:
            registros = [json.loads(linea) for linea in archivo if linea.strip()]
    for registro in registros:
        if cues and registro.get("cue_anexo") not in cues:
            continue
        filas.append(registro)
        if limite_escuelas and len(filas) >= limite_escuelas:
            break
    return filas


def _leer_checkpoint(checkpoint: Path) -> dict[tuple[int, int], float | None]:
    valores = {}
    if not checkpoint.exists():
        return valores
    with open(checkpoint, encoding="utf-8") as archivo:
        for linea in archivo:
            fila = json.loads(linea)
            valores[(int(fila["ix"]), int(fila["iy"]))] = fila["v"]
    return valores


def _rss_mb() -> float:
    try:
        with open("/proc/self/status", encoding="utf-8") as archivo:
            for linea in archivo:
                if linea.startswith("VmRSS:"):
                    return int(linea.split()[1]) / 1024
    except (OSError, ValueError):
        pass
    return 0.0


def _decodificar_bloque(lectura, cantidad: int) -> list[float | None]:
    import numpy as np

    curvas, in_bounds, indices, _unidades = lectura
    if len(indices) == 1:
        indice = 0
    else:
        indice = min(range(len(indices)), key=lambda i: abs(indices[i] - PERIODO_RETORNO_ANIOS))
    resultado = []
    for i in range(cantidad):
        if i >= len(in_bounds) or not bool(in_bounds[i]):
            resultado.append(None)
            continue
        valor_original = curvas[i][indice]
        if valor_original is None:
            resultado.append(None)
            continue
        valor = float(valor_original)
        resultado.append(None if np.isnan(valor) else valor)
    return resultado


def resolver_celdas(reader, celdas, checkpoint: Path, limites=None, reloj=None) -> dict:
    """Resuelve celdas por lotes y persiste solo bloques completados."""
    limites = limites or {}
    reloj = reloj or time.monotonic
    inicio = reloj()
    checkpoint.parent.mkdir(parents=True, exist_ok=True)
    valores = _leer_checkpoint(checkpoint)
    faltantes = sorted(set(celdas) - valores.keys())
    fallidos = 0
    procesados = 0
    codigo = 0
    with open(checkpoint, "a", encoding="utf-8") as salida:
        for offset in range(0, len(faltantes), TAMANO_BLOQUE_LOTE):
            if limites.get("max_segundos", 0) and reloj() - inicio >= limites["max_segundos"]:
                codigo = 3
                break
            if limites.get("max_rss_mb", 3500) and _rss_mb() > limites.get("max_rss_mb", 3500):
                codigo = 3
                break
            bloque = faltantes[offset : offset + TAMANO_BLOQUE_LOTE]
            centros = [centro_de_celda(*celda) for celda in bloque]
            lectura = _leer_bloque_con_reintentos(
                reader, PATH_INUNDACION_HISTORICA,
                [p[0] for p in centros], [p[1] for p in centros],
            )
            if lectura is None:
                fallidos += 1
            else:
                for (ix, iy), valor in zip(bloque, _decodificar_bloque(lectura, len(bloque))):
                    fila = {"ix": ix, "iy": iy, "v": valor}
                    salida.write(json.dumps(fila, separators=(",", ":")) + "\n")
                    valores[(ix, iy)] = valor
                salida.flush()
            procesados += len(bloque)
            if procesados % (TAMANO_BLOQUE_LOTE * 20) == 0 or procesados >= len(faltantes):
                print(f"[calcular_exposicion_ruta] celdas leidas {len(valores)}/{len(celdas)}, {reloj()-inicio:.1f}s, RSS {_rss_mb():.0f} MB", flush=True)
            pausa = limites.get("pausa_segundos", 0.2)
            if pausa and offset + TAMANO_BLOQUE_LOTE < len(faltantes):
                time.sleep(pausa)
    pendientes = len(set(celdas) - valores.keys())
    if pendientes and codigo == 0:
        codigo = 4 if fallidos else 3
    return {"valores": valores, "pendientes": pendientes, "bloques_fallidos": fallidos, "codigo": codigo}


def construir_filas(escuelas: list[dict], valores: dict, fecha_corrida: str) -> list[dict]:
    filas = []
    for escuela in escuelas:
        ruta = escuela.get("ruta")
        celdas = celdas_de_ruta(ruta["coordinates"]) if ruta and ruta.get("coordinates") else []
        resumen = resumir_exposicion(celdas, valores)
        filas.append({
            "cue_anexo": escuela.get("cue_anexo"), "version_job": VERSION_JOB,
            **resumen,
            "motivo_sin_dato": escuela.get("motivo_sin_geometria") if not celdas else None,
            "periodo_retorno_anios": PERIODO_RETORNO_ANIOS,
            "resolucion_arcsec": RESOLUCION_ARCSEC, "escenario": ESCENARIO,
            "fuente": "physrisk", "licencia": LICENCIA,
            "fecha_corrida": fecha_corrida,
            "celdas": detalle_celdas(celdas, valores),
        })
    return filas


def escribir_salida(filas: list[dict], salida_dir: Path, fecha_corrida: str) -> Path:
    if not exportar_archivos():
        return guardar_resultados("exposicion-ruta", filas, "physrisk", f"v{VERSION_JOB}-{fecha_corrida}")
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
    from geo_static.physrisk_susceptibilidad import _crear_reader

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--max-segundos", type=float, default=0)
    parser.add_argument("--max-rss-mb", type=float, default=3500)
    parser.add_argument("--pausa-segundos", type=float, default=0.2)
    parser.add_argument("--limite-escuelas", type=int)
    parser.add_argument("--cues")
    parser.add_argument("--geometria", type=Path, default=None)
    parser.add_argument("--salida-dir", type=Path, default=OUTPUT_DIR)
    parser.add_argument("--checkpoint", type=Path, default=CHECKPOINT_DEFAULT)
    args = parser.parse_args(argv)
    inicio = time.monotonic()
    escuelas = leer_rutas(args.geometria, args.limite_escuelas, args.cues.split(",") if args.cues else None)
    por_escuela = [(e.get("cue_anexo"), celdas_de_ruta(e["ruta"]["coordinates"]) if e.get("ruta") else []) for e in escuelas]
    unicas = set(c for _, celdas in por_escuela for c in celdas)
    try:
        reader = _crear_reader()
    except Exception as exc:
        print(f"[calcular_exposicion_ruta] no se pudo crear el reader: {exc!r}", flush=True)
        return 4
    resultado = resolver_celdas(reader, unicas, args.checkpoint, {
        "max_segundos": args.max_segundos, "max_rss_mb": args.max_rss_mb,
        "pausa_segundos": args.pausa_segundos,
    })
    if resultado["pendientes"]:
        print(f"[calcular_exposicion_ruta] quedan {resultado['pendientes']} celdas sin resolver", flush=True)
        return resultado["codigo"]
    filas = construir_filas(escuelas, resultado["valores"], date.today().isoformat())
    destino = escribir_salida(filas, args.salida_dir, date.today().isoformat())
    con_dato = sum(f["celdas_con_dato"] > 0 for f in filas)
    con_profundidad = sum(f["celdas_con_profundidad"] > 0 for f in filas)
    sin_ruta = sum(f["estado"] == "sin_ruta" for f in filas)
    print(f"[calcular_exposicion_ruta] escuelas {len(filas)}, sin_ruta {sin_ruta}, con datos {con_dato}, con_profundidad {con_profundidad}, celdas unicas {len(unicas)}, {time.monotonic()-inicio:.1f}s; salida {destino}", flush=True)
    finalizar_corrida()
    return 0


if __name__ == "__main__":
    sys.exit(main())
