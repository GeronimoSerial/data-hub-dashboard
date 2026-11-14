import csv
import inspect
import json
import re
import shutil
from pathlib import Path

import numpy as np
import rasterio
from rasterio.transform import from_origin

from geo_static import region_config
from geo_static.exposicion_rio_dem import abrir_lector_exposicion_rio_dem
from geo_static.fuentes_inundacion import DATA_DIR
from geo_static.jobs import calcular_exposicion_rio_dem as calc
from geo_static.jobs import descargar_fuentes_inundacion as desc

CROP = Path(__file__).parent / "fixtures" / "fabdem" / "fabdem_v1-2_S04W061_crop.tif"
FUENTE_COPERNICUS = "copernicus-glo30+gsw-occurrence"
FUENTE_FABDEM = "fabdem-v1-2+gsw-occurrence"
ESCUELA_LON = -60.01777777777778
ESCUELA_LAT = -3.1194444444444445

MANAOS_CFG = {
    "id": "manaos",
    "fuenteDem": "fabdem",
    "bboxPlausible": {"latMin": -3.7, "latMax": -2.3, "lonMin": -60.8, "lonMax": -59.2},
}


class LectorFalso:
    def medir(self, lon, lat):
        return {"suelo_m": 1.0, "nivel_rio_dem_m": 2.0, "distancia_rio_m": 3.0}


class AbrirRegistrado:
    """Sustituye abrir_lector_exposicion_rio_dem y guarda con que rutas se llamo."""

    def __init__(self):
        self.args = None
        self.kwargs = None

    def __call__(self, *args, **kwargs):
        self.args = args
        self.kwargs = kwargs
        return _ContextoFalso()


class _ContextoFalso:
    def __enter__(self):
        return LectorFalso()

    def __exit__(self, *exc):
        return False


def _config_manaos(tmp_path, monkeypatch):
    (tmp_path / "manaos.json").write_text(json.dumps(MANAOS_CFG), encoding="utf-8")
    monkeypatch.setattr(region_config, "CONFIG_REGIONES_DIR", tmp_path)


def _escuela_unica(monkeypatch):
    monkeypatch.setattr(
        calc,
        "cargar_padron",
        lambda: [{"cueAnexo": "X-1", "lon": ESCUELA_LON, "lat": ESCUELA_LAT}],
    )
    monkeypatch.setattr(calc, "finalizar_corrida", lambda: None)


def _capturar_csv(monkeypatch):
    capturado = {}

    def fake_escribir(path, columnas, filas):
        capturado["path"] = path
        capturado["columnas"] = columnas
        capturado["filas"] = list(filas)
        return path

    monkeypatch.setattr(calc, "escribir_csv", fake_escribir)
    return capturado


def test_corrientes_usa_copernicus_y_rutas_por_defecto(monkeypatch):
    abrir = AbrirRegistrado()
    monkeypatch.setattr(calc, "abrir_lector_exposicion_rio_dem", abrir)
    _escuela_unica(monkeypatch)
    capturado = _capturar_csv(monkeypatch)

    calc.correr("corrientes")

    assert abrir.args == ()
    assert abrir.kwargs == {}
    assert capturado["filas"][0]["fuente"] == FUENTE_COPERNICUS
    assert re.fullmatch(r"exposicion_rio_dem-v1-\d{4}-\d{2}-\d{2}\.csv", capturado["path"].name)


def test_ruta_por_defecto_del_dem_sigue_siendo_glo30():
    defecto = inspect.signature(abrir_lector_exposicion_rio_dem).parameters["ruta_dem"].default

    assert defecto == Path(".data/dem/glo30.tif")


def test_region_fabdem_abre_su_dem_y_su_gsw_y_fuente_propia(monkeypatch, tmp_path):
    _config_manaos(tmp_path, monkeypatch)
    abrir = AbrirRegistrado()
    monkeypatch.setattr(calc, "abrir_lector_exposicion_rio_dem", abrir)
    _escuela_unica(monkeypatch)
    capturado = _capturar_csv(monkeypatch)

    calc.main(["--region", "manaos"])

    assert abrir.args == (Path(".data/manaos/dem/fabdem.tif"), Path(".data/manaos/gsw/occurrence.tif"))
    assert capturado["filas"][0]["fuente"] == FUENTE_FABDEM
    assert re.fullmatch(r"exposicion_rio_dem-v1-\d{4}-\d{2}-\d{2}\.csv", capturado["path"].name)


def test_fila_fabdem_tiene_las_7_columnas_del_contrato():
    fila = calc.construir_fila_escuela(
        {"cueAnexo": "X-1", "lon": 0.0, "lat": 0.0},
        LectorFalso(),
        "1",
        "2026-11-13",
        fuente=FUENTE_FABDEM,
    )

    assert list(fila) == calc.CONTRATO_COLUMNAS
    assert fila == {
        "cue_anexo": "X-1",
        "version_job": "1",
        "suelo_m": 1.0,
        "nivel_rio_dem_m": 2.0,
        "distancia_rio_m": 3.0,
        "fuente": FUENTE_FABDEM,
        "fecha_corrida": "2026-11-13",
    }


def test_fila_sin_fuente_explicita_sigue_usando_copernicus():
    fila = calc.construir_fila_escuela({"cueAnexo": "X-1", "lon": 0.0, "lat": 0.0}, LectorFalso(), "1", "2026-11-13")

    assert fila["fuente"] == FUENTE_COPERNICUS


def test_fabdem_end_to_end_escribe_csv_con_valores_del_recorte(monkeypatch, tmp_path):
    _config_manaos(tmp_path, monkeypatch)
    trabajo = tmp_path / "trabajo"
    trabajo.mkdir()
    monkeypatch.chdir(trabajo)
    dem_dir = trabajo / ".data" / "manaos" / "dem"
    gsw_dir = trabajo / ".data" / "manaos" / "gsw"
    dem_dir.mkdir(parents=True)
    gsw_dir.mkdir(parents=True)
    shutil.copy(CROP, dem_dir / "fabdem.tif")
    with rasterio.open(CROP) as src:
        perfil = src.profile.copy()
    gsw = np.zeros((64, 64), dtype=np.uint8)
    gsw[10, :] = 95
    perfil_gsw = {**perfil, "dtype": "uint8", "nodata": 255, "count": 1, "driver": "GTiff"}
    with rasterio.open(gsw_dir / "occurrence.tif", "w", **perfil_gsw) as dst:
        dst.write(gsw, 1)
    salida = trabajo / "output"
    monkeypatch.setattr(calc, "OUTPUT_DIR", salida)
    _escuela_unica(monkeypatch)

    calc.correr("manaos")

    archivos = list(salida.glob("exposicion_rio_dem-v1-*.csv"))
    assert len(archivos) == 1
    with archivos[0].open(encoding="utf-8") as archivo:
        filas = list(csv.DictReader(archivo))
    assert list(filas[0]) == calc.CONTRATO_COLUMNAS
    assert filas[0]["cue_anexo"] == "X-1"
    assert filas[0]["suelo_m"] == "48.67"
    assert filas[0]["nivel_rio_dem_m"] == "37.49"
    assert filas[0]["distancia_rio_m"] == "617.75"
    assert filas[0]["fuente"] == FUENTE_FABDEM


def test_descargar_corrientes_llama_descargar_fuentes_como_hoy(monkeypatch):
    llamadas = []

    def fake_descargar(**kwargs):
        llamadas.append(kwargs)
        return {"entradas": []}

    monkeypatch.setattr(desc, "descargar_fuentes", fake_descargar)

    desc.correr(force=False, region_id="corrientes")

    assert len(llamadas) == 1
    assert set(llamadas[0]) == {"force", "progreso"}
    assert llamadas[0]["force"] is False


def test_descargar_fabdem_usa_carpeta_bbox_y_fuente_de_la_region(monkeypatch, tmp_path):
    _config_manaos(tmp_path, monkeypatch)
    llamadas = []

    def fake_descargar(**kwargs):
        llamadas.append(kwargs)
        return {"entradas": []}

    monkeypatch.setattr(desc, "descargar_fuentes", fake_descargar)

    desc.correr(force=True, region_id="manaos")

    assert len(llamadas) == 1
    llamada = llamadas[0]
    assert set(llamada) == {"force", "progreso", "data_dir", "bbox", "fuente_dem", "incluir_jrc_flood"}
    assert llamada["force"] is True
    assert llamada["data_dir"] == DATA_DIR / "manaos"
    assert DATA_DIR.name == ".data"
    assert llamada["bbox"] == (-60.8, -3.7, -59.2, -2.3)
    assert llamada["fuente_dem"] == "fabdem"
    assert llamada["incluir_jrc_flood"] is False


def test_main_de_descarga_toma_la_region_del_entorno(monkeypatch, tmp_path):
    _config_manaos(tmp_path, monkeypatch)
    monkeypatch.setenv("REGION", "manaos")
    llamadas = []
    monkeypatch.setattr(desc, "descargar_fuentes", lambda **kwargs: llamadas.append(kwargs) or {"entradas": []})

    desc.main([])

    assert llamadas[0]["fuente_dem"] == "fabdem"
    assert llamadas[0]["data_dir"] == DATA_DIR / "manaos"
