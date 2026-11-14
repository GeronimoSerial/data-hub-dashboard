import json

import pytest

from geo_static.region_config import (
    bbox_region,
    cargar_region,
    fuente_dem,
    region_actual,
)


def _escribir_config(directorio, region_id, **campos):
    cfg = {"id": region_id, **campos}
    (directorio / f"{region_id}.json").write_text(json.dumps(cfg), encoding="utf-8")
    return cfg


def test_corrientes_usa_copernicus_y_su_bbox_plausible():
    cfg = cargar_region("corrientes")

    assert fuente_dem(cfg) == "copernicus"
    assert bbox_region(cfg) == (-61, -32, -54, -26)


def test_fuente_dem_fabdem_desde_config(tmp_path):
    cfg = _escribir_config(
        tmp_path,
        "manaos",
        fuenteDem="fabdem",
        bboxPlausible={"latMin": -3.7, "latMax": -2.3, "lonMin": -60.8, "lonMax": -59.2},
    )

    assert fuente_dem(cargar_region("manaos", directorio=tmp_path)) == "fabdem"
    assert bbox_region(cfg) == (-60.8, -3.7, -59.2, -2.3)


def test_fuente_dem_sin_campo_es_copernicus(tmp_path):
    cfg = _escribir_config(tmp_path, "sin-campo")

    assert fuente_dem(cfg) == "copernicus"


def test_fuente_dem_invalida_falla(tmp_path):
    cfg = _escribir_config(tmp_path, "mala", fuenteDem="srtm")

    with pytest.raises(ValueError, match="srtm"):
        fuente_dem(cfg)


def test_region_sin_configuracion_falla_con_mensaje_claro(tmp_path):
    with pytest.raises(FileNotFoundError, match="inexistente"):
        cargar_region("inexistente", directorio=tmp_path)


def test_region_actual_por_defecto_es_corrientes(monkeypatch):
    monkeypatch.delenv("REGION", raising=False)

    assert region_actual() == "corrientes"


def test_region_actual_lee_variable_de_entorno(monkeypatch):
    monkeypatch.setenv("REGION", "manaos")

    assert region_actual() == "manaos"
