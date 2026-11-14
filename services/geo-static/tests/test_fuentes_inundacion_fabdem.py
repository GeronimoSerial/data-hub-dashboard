import json
import math
import urllib.request

import pytest

from geo_static import fuentes_inundacion as fi
from geo_static.fabdem import LICENCIA_FABDEM, urls_vsi_fabdem, zips_fabdem_para_bbox
from geo_static.fuentes_inundacion import (
    BBOX_CORRIENTES,
    DEM_BASE_URL,
    PERIODOS_RETORNO,
    leer_manifest,
)

BBOX_MANAOS = (-60.8, -3.7, -59.2, -2.3)
CLAVES_JRC = [f"jrc_flood/rp{p}_depth.tif" for p in PERIODOS_RETORNO]


def _cuadrado(w, s, e, n):
    return {"type": "Polygon", "coordinates": [[[w, s], [e, s], [e, n], [w, n], [w, s]]]}


def _preparar_indice_jrc(data_dir):
    """Deja el indice JRC ya descargado y registrado en el manifest, para no tocar la red."""
    geojson = {
        "type": "FeatureCollection",
        "features": [
            {"type": "Feature", "properties": {"id": 85, "name": "S20_W60"},
             "geometry": _cuadrado(-60.01, -29.99, -50.01, -19.99)},
            {"type": "Feature", "properties": {"id": 86, "name": "S30_W60"},
             "geometry": _cuadrado(-60.01, -39.99, -50.01, -29.99)},
        ],
    }
    indice = data_dir / "jrc_flood" / "tile_extents.geojson"
    indice.parent.mkdir(parents=True, exist_ok=True)
    indice.write_text(json.dumps(geojson), encoding="utf-8")
    manifest = {"version": 1, "entradas": {"jrc_flood/tile_extents.geojson": {"archivo": "x"}}}
    (data_dir / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")


@pytest.fixture
def recortes(monkeypatch):
    """Sustituye recortar_mosaico: registra cada llamada y escribe un archivo de relleno."""
    llamadas = []

    def falso_recorte(urls, bbox, destino, **kwargs):
        llamadas.append({"clave": destino.name, "urls": list(urls), "kwargs": kwargs, "bbox": bbox, "destino": destino})
        destino.parent.mkdir(parents=True, exist_ok=True)
        destino.write_bytes(b"x")
        return 2, 2

    monkeypatch.setattr(fi, "recortar_mosaico", falso_recorte)
    return llamadas


@pytest.fixture
def sin_head(monkeypatch):
    """Un HEAD sobre un tile FABDEM es un fallo: esa capa no debe verificar tiles por HTTP."""

    def solo_gsw(url):
        if "vsizip" in url or "FABDEM" in url:
            raise AssertionError(f"no se esperaba HEAD sobre {url}")
        return True

    monkeypatch.setattr(fi, "url_existe", solo_gsw)


def test_default_planifica_las_mismas_capas_y_claves_que_antes(tmp_path, monkeypatch, recortes):
    _preparar_indice_jrc(tmp_path)
    monkeypatch.setattr(fi, "url_existe", lambda url: True)

    manifest = fi.descargar_fuentes(progreso=lambda m: None, data_dir=tmp_path)

    claves = [llamada["clave"] for llamada in recortes]
    assert claves == [*[c.split("/")[1] for c in CLAVES_JRC], "occurrence.tif", "glo30.tif"]
    assert [c for c in manifest["entradas"] if c != "jrc_flood/tile_extents.geojson"] == [
        *CLAVES_JRC, "gsw/occurrence.tif", "dem/glo30.tif",
    ]
    dem = recortes[-1]
    assert dem["kwargs"] == {"nodata": fi.NODATA_DEM, "dtype": "float32"}
    assert all(url.startswith(f"{DEM_BASE_URL}/") for url in dem["urls"])
    assert "version" not in manifest["entradas"]["dem/glo30.tif"]


def test_prefijo_vsi_por_defecto_sigue_siendo_vsicurl(tmp_path, monkeypatch):
    abiertos = []

    def falso_open(path, *args, **kwargs):
        abiertos.append(path)
        raise RuntimeError("corte de prueba")

    monkeypatch.setattr(fi.rasterio, "open", falso_open)
    with pytest.raises(RuntimeError, match="corte de prueba"):
        fi.recortar_mosaico(["https://x.test/tile.tif"], BBOX_CORRIENTES, tmp_path / "o.tif", nodata=0, dtype="uint8")
    assert abiertos == ["/vsicurl/https://x.test/tile.tif"]


def test_prefijo_vsi_vacio_abre_la_url_tal_cual(tmp_path, monkeypatch):
    abiertos = []

    def falso_open(path, *args, **kwargs):
        abiertos.append(path)
        raise RuntimeError("corte de prueba")

    monkeypatch.setattr(fi.rasterio, "open", falso_open)
    with pytest.raises(RuntimeError, match="corte de prueba"):
        fi.recortar_mosaico(
            ["/vsizip/vsicurl/https://x.test/a.zip/t.tif"],
            BBOX_CORRIENTES,
            tmp_path / "o.tif",
            nodata=0,
            dtype="uint8",
            prefijo_vsi="",
        )
    assert abiertos == ["/vsizip/vsicurl/https://x.test/a.zip/t.tif"]


def test_fabdem_registra_capa_version_zips_y_licencia(tmp_path, monkeypatch, recortes, sin_head):
    monkeypatch.setattr(fi.urllib.request, "urlopen", _urlopen_prohibido)

    manifest = fi.descargar_fuentes(
        progreso=lambda m: None,
        data_dir=tmp_path,
        bbox=BBOX_MANAOS,
        fuente_dem="fabdem",
        incluir_jrc_flood=False,
    )

    assert [llamada["clave"] for llamada in recortes] == ["occurrence.tif", "fabdem.tif"]
    dem = recortes[-1]
    assert dem["urls"] == urls_vsi_fabdem(BBOX_MANAOS)
    assert dem["kwargs"]["prefijo_vsi"] == ""
    assert dem["kwargs"]["dtype"] == "float32"
    assert math.isnan(dem["kwargs"]["nodata"])

    entrada = manifest["entradas"]["dem/fabdem.tif"]
    assert entrada["fuente"] == "FABDEM V1-2"
    assert entrada["licencia"] == LICENCIA_FABDEM
    assert entrada["version"] == "V1-2"
    assert entrada["zips"] == zips_fabdem_para_bbox(BBOX_MANAOS)
    assert entrada["urls"] == urls_vsi_fabdem(BBOX_MANAOS)
    assert entrada["urls_omitidas_404"] == []
    assert entrada["nodata"] == "NaN"
    assert entrada["bbox_oeste_sur_este_norte"] == list(BBOX_MANAOS)
    assert leer_manifest(tmp_path / "manifest.json")["entradas"]["dem/fabdem.tif"] == entrada


def test_fabdem_sin_jrc_no_descarga_indice_ni_capas_rp(tmp_path, monkeypatch, recortes, sin_head):
    monkeypatch.setattr(fi.urllib.request, "urlopen", _urlopen_prohibido)

    manifest = fi.descargar_fuentes(
        progreso=lambda m: None,
        data_dir=tmp_path,
        bbox=BBOX_MANAOS,
        fuente_dem="fabdem",
        incluir_jrc_flood=False,
    )

    assert not any(clave.startswith("jrc_flood") for clave in manifest["entradas"])
    assert not (tmp_path / "jrc_flood").exists()
    assert "dem/glo30.tif" not in manifest["entradas"]


def test_sin_jrc_con_copernicus_solo_gsw_y_dem(tmp_path, monkeypatch, recortes):
    monkeypatch.setattr(fi.urllib.request, "urlopen", _urlopen_prohibido)
    monkeypatch.setattr(fi, "url_existe", lambda url: True)

    manifest = fi.descargar_fuentes(progreso=lambda m: None, data_dir=tmp_path, incluir_jrc_flood=False)

    assert [llamada["clave"] for llamada in recortes] == ["occurrence.tif", "glo30.tif"]
    assert list(manifest["entradas"]) == ["gsw/occurrence.tif", "dem/glo30.tif"]


def test_fuente_dem_desconocida_falla_antes_de_tocar_la_red(tmp_path, monkeypatch, recortes):
    monkeypatch.setattr(fi.urllib.request, "urlopen", _urlopen_prohibido)
    monkeypatch.setattr(fi, "url_existe", _head_prohibido)

    with pytest.raises(ValueError):
        fi.descargar_fuentes(progreso=lambda m: None, data_dir=tmp_path, fuente_dem="srtm")
    assert recortes == []
    assert not (tmp_path / "manifest.json").exists()


def _urlopen_prohibido(*args, **kwargs):
    raise AssertionError("no se esperaba descarga por urlopen")


def _head_prohibido(url):
    raise AssertionError(f"no se esperaba HEAD sobre {url}")
