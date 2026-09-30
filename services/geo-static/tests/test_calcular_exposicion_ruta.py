import gzip
import json

import numpy as np

from geo_static.jobs import calcular_exposicion_ruta as job


class Reader:
    def __init__(self, valores=None, falla=False):
        self.valores = valores or {}
        self.falla = falla
        self.llamadas = 0

    def get_curves(self, path, longitudes, latitudes):
        self.llamadas += 1
        if self.falla:
            raise OSError("red")
        values = [self.valores.get((round(float(x), 6), round(float(y), 6)), np.nan) for x, y in zip(longitudes, latitudes)]
        return np.array([[v] for v in values]), np.ones(len(values), dtype=bool), [100], "m"


def test_dedup_global_y_checkpoints_no_relee(tmp_path):
    celda = (0, 0)
    cp = tmp_path / "checkpoint.ndjson"
    reader = Reader({(0.004167, 0.004167): 2.5})
    una_lectura = job.resolver_celdas(reader, [celda, celda], cp, {"pausa_segundos": 0})
    assert una_lectura["pendientes"] == 0
    assert reader.llamadas == 1
    reanudada = job.resolver_celdas(reader, [celda], cp, {"pausa_segundos": 0})
    assert reader.llamadas == 1
    assert reanudada["valores"][celda] == 2.5


def test_bloque_fallido_no_se_anota_y_codigo_4(tmp_path, monkeypatch):
    monkeypatch.setattr(job, "TAMANO_BLOQUE_LOTE", 1)
    monkeypatch.setattr(job, "_leer_bloque_con_reintentos", lambda *args: None)
    cp = tmp_path / "checkpoint.ndjson"
    resultado = job.resolver_celdas(Reader(), [(0, 0)], cp, {"pausa_segundos": 0})
    assert resultado["codigo"] == 4
    assert resultado["pendientes"] == 1
    assert cp.read_text() == ""


def test_tope_de_tiempo_codigo_3(tmp_path, monkeypatch):
    ticks = iter([0, 2])
    monkeypatch.setattr(job, "_rss_mb", lambda: 1)
    resultado = job.resolver_celdas(Reader(), [(0, 0)], tmp_path / "cp", {
        "max_segundos": 1, "max_rss_mb": 3500, "pausa_segundos": 0,
    }, reloj=lambda: next(ticks))
    assert resultado["codigo"] == 3
    assert resultado["pendientes"] == 1


def test_filas_sin_ruta_profundidad_y_sin_dato():
    escuelas = [
        {"cue_anexo": "sin", "ruta": None, "motivo_sin_geometria": "sin_via"},
        {"cue_anexo": "agua", "ruta": {"type": "LineString", "coordinates": [[0, 0], [0, 0]]}},
        {"cue_anexo": "na", "ruta": {"type": "LineString", "coordinates": [[0.01, 0.01], [0.01, 0.01]]}},
    ]
    valores = {(0, 0): 3.0, (1, 1): None}
    filas = job.construir_filas(escuelas, valores, "2026-09-29")
    assert filas[0]["estado"] == "sin_ruta"
    assert filas[0]["celdas"] == [] and filas[0]["profundidad_max_m"] is None
    assert filas[0]["motivo_sin_dato"] == "sin_via"
    assert filas[1]["estado"] == "con_profundidad"
    assert filas[1]["profundidad_max_m"] == 3.0
    assert filas[2]["estado"] == "sin_dato"
    assert filas[2]["cobertura"] == 0
    assert filas[2]["profundidad_max_m"] is None


def test_lee_ndjson_gzip_y_escribe_salida(tmp_path):
    source = tmp_path / "geo.ndjson.gz"
    with gzip.open(source, "wt", encoding="utf-8") as f:
        f.write(json.dumps({"cue_anexo": "a", "ruta": None}) + "\n")
    assert job.leer_rutas(source)[0]["cue_anexo"] == "a"
    out = job.escribir_salida([], tmp_path, "2026-09-29")
    assert gzip.open(out, "rt", encoding="utf-8").read() == ""
