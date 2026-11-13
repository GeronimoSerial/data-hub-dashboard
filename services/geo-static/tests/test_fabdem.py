from geo_static.fabdem import (
    BASE_URL,
    LICENCIA_FABDEM,
    NODATA_FABDEM,
    VERSION,
    nombre_tile_fabdem,
    nombre_zip_fabdem,
    tiles_fabdem_para_bbox,
    urls_vsi_fabdem,
    zips_fabdem_para_bbox,
)

BBOX_MANAOS = (-60.8, -3.7, -59.2, -2.3)
BASE = "https://data.bris.ac.uk/datasets/s5hqmjcdj8yo2ibzi9b4ew3sn/"


def test_constantes_de_version_nodata_y_base():
    assert VERSION == "V1-2"
    assert NODATA_FABDEM == -9999.0
    assert BASE_URL == BASE


def test_licencia_incluye_atribucion_obligatoria():
    assert "FABDEM" in LICENCIA_FABDEM
    assert "CC BY-NC-SA 4.0" in LICENCIA_FABDEM
    assert "https://creativecommons.org/licenses/by-nc-sa/4.0/" in LICENCIA_FABDEM
    assert (
        "Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH "
        "2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved."
    ) in LICENCIA_FABDEM


def test_nombre_tile_usa_esquina_suroeste_con_ceros_de_relleno():
    assert nombre_tile_fabdem(-4, -61) == "S04W061_FABDEM_V1-2"
    assert nombre_tile_fabdem(-3, -60) == "S03W060_FABDEM_V1-2"


def test_nombre_tile_en_el_cero_usa_N00_y_E000():
    assert nombre_tile_fabdem(0, 0) == "N00E000_FABDEM_V1-2"
    assert nombre_tile_fabdem(0, -1) == "N00W001_FABDEM_V1-2"
    assert nombre_tile_fabdem(1, 10) == "N01E010_FABDEM_V1-2"


def test_nombre_zip_es_bloque_de_10_grados_de_sw_a_ne():
    assert nombre_zip_fabdem(-4, -61) == "S10W070-N00W060_FABDEM_V1-2.zip"
    assert nombre_zip_fabdem(-3, -60) == "S10W060-N00W050_FABDEM_V1-2.zip"
    assert nombre_zip_fabdem(-4, -60) == "S10W060-N00W050_FABDEM_V1-2.zip"


def test_nombre_zip_en_los_bordes_cero():
    # Lat 0 pertenece al bloque 0..10 (N00-N10); lon 0 al bloque 0..10 (E000-E010).
    assert nombre_zip_fabdem(0, 0) == "N00E000-N10E010_FABDEM_V1-2.zip"
    # Lon -1 pertenece al bloque -10..0 (W010-E000).
    assert nombre_zip_fabdem(0, -1) == "N00W010-N10E000_FABDEM_V1-2.zip"
    # Lat -1 pertenece al bloque -10..0 (S10-N00).
    assert nombre_zip_fabdem(-1, 0) == "S10E000-N00E010_FABDEM_V1-2.zip"


def test_tiles_manaos_son_cuatro_en_orden_lat_luego_lon():
    assert tiles_fabdem_para_bbox(BBOX_MANAOS) == [
        "S04W061_FABDEM_V1-2",
        "S04W060_FABDEM_V1-2",
        "S03W061_FABDEM_V1-2",
        "S03W060_FABDEM_V1-2",
    ]


def test_tiles_cruzan_el_ecuador_y_el_meridiano_cero():
    assert tiles_fabdem_para_bbox((-0.5, -0.5, 0.5, 0.5)) == [
        "S01W001_FABDEM_V1-2",
        "S01E000_FABDEM_V1-2",
        "N00W001_FABDEM_V1-2",
        "N00E000_FABDEM_V1-2",
    ]


def test_urls_vsi_manaos_apuntan_a_los_zips_correctos():
    assert urls_vsi_fabdem(BBOX_MANAOS) == [
        f"/vsizip/vsicurl/{BASE}S10W070-N00W060_FABDEM_V1-2.zip/S04W061_FABDEM_V1-2.tif",
        f"/vsizip/vsicurl/{BASE}S10W060-N00W050_FABDEM_V1-2.zip/S04W060_FABDEM_V1-2.tif",
        f"/vsizip/vsicurl/{BASE}S10W070-N00W060_FABDEM_V1-2.zip/S03W061_FABDEM_V1-2.tif",
        f"/vsizip/vsicurl/{BASE}S10W060-N00W050_FABDEM_V1-2.zip/S03W060_FABDEM_V1-2.tif",
    ]


def test_zips_manaos_son_dos_sin_repetir_en_orden():
    assert zips_fabdem_para_bbox(BBOX_MANAOS) == [
        f"{BASE}S10W070-N00W060_FABDEM_V1-2.zip",
        f"{BASE}S10W060-N00W050_FABDEM_V1-2.zip",
    ]
