from pathlib import Path

import numpy as np
import rasterio

from geo_static.exposicion_rio_dem import abrir_lector_exposicion_rio_dem

# Recorte real de FABDEM V1-2 (S04W061), 64x64 px, ver fixtures/fabdem/PROVENANCE.md.
CROP = Path(__file__).parent / "fixtures" / "fabdem" / "fabdem_v1-2_S04W061_crop.tif"

# Pixel (fila 30, columna 40) del recorte: centro de la escuela de prueba.
ESCUELA_LON = -60.01777777777778
ESCUELA_LAT = -3.1194444444444445
# Franja de agua permanente (GSW 95) en la fila 10, toda la columna.
FILA_AGUA = 10

# Valores calculados aparte con numpy sobre el recorte (haversine, p10 sobre
# pixeles dentro de 50 m y de 2 km), redondeados a 2 decimales como el lector.
SUELO_ESPERADO = 48.67
NIVEL_ESPERADO = 37.49
DISTANCIA_ESPERADA = 617.75


def _gsw_sintetico(tmp_path: Path, perfil: dict) -> Path:
    gsw = np.zeros((perfil["height"], perfil["width"]), dtype=np.uint8)
    gsw[FILA_AGUA, :] = 95
    ruta = tmp_path / "gsw.tif"
    perfil_gsw = {**perfil, "dtype": "uint8", "nodata": 255, "count": 1, "driver": "GTiff"}
    with rasterio.open(ruta, "w", **perfil_gsw) as dst:
        dst.write(gsw, 1)
    return ruta


def _perfil_crop() -> dict:
    with rasterio.open(CROP) as src:
        return src.profile.copy()


def test_medir_con_fabdem_real_da_valores_literales(tmp_path):
    gsw = _gsw_sintetico(tmp_path, _perfil_crop())

    with abrir_lector_exposicion_rio_dem(CROP, gsw) as lector:
        medicion = lector.medir(ESCUELA_LON, ESCUELA_LAT)

    assert medicion == {
        "suelo_m": SUELO_ESPERADO,
        "nivel_rio_dem_m": NIVEL_ESPERADO,
        "distancia_rio_m": DISTANCIA_ESPERADA,
    }


def test_medir_con_nodata_en_el_terreno_deja_suelo_nulo(tmp_path):
    perfil = _perfil_crop()
    with rasterio.open(CROP) as src:
        dem = src.read(1)
    # Bloque de 11x11 px alrededor de la escuela: todo el terreno dentro de 50 m es nodata.
    dem[25:36, 35:46] = -9999.0
    dem_nodata = tmp_path / "dem_nodata.tif"
    with rasterio.open(dem_nodata, "w", **perfil) as dst:
        dst.write(dem, 1)
    gsw = _gsw_sintetico(tmp_path, perfil)

    with abrir_lector_exposicion_rio_dem(dem_nodata, gsw) as lector:
        medicion = lector.medir(ESCUELA_LON, ESCUELA_LAT)

    assert medicion == {
        "suelo_m": None,
        "nivel_rio_dem_m": NIVEL_ESPERADO,
        "distancia_rio_m": DISTANCIA_ESPERADA,
    }


def test_medir_fuera_del_raster_devuelve_todo_nulo(tmp_path):
    gsw = _gsw_sintetico(tmp_path, _perfil_crop())

    with abrir_lector_exposicion_rio_dem(CROP, gsw) as lector:
        medicion = lector.medir(-59.0, -3.12)

    assert medicion == {
        "suelo_m": None,
        "nivel_rio_dem_m": None,
        "distancia_rio_m": None,
    }
