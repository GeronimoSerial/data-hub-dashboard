import numpy as np
import pytest
import rasterio
from rasterio.transform import from_origin

from geo_static.exposicion_rio_dem import abrir_lector_exposicion_rio_dem, calcular_exposicion

# Raster sintetico EPSG:4326: 200x200 px de 0.0002 grados (~22 m).
ORIGEN_LON = -60.0
ORIGEN_LAT = -33.0
RESOLUCION = 0.0002
TAMANO = 200


def _centro_lon(col: int) -> float:
    return ORIGEN_LON + (col + 0.5) * RESOLUCION


def _centro_lat(fila: int) -> float:
    return ORIGEN_LAT - (fila + 0.5) * RESOLUCION


def _escribir_raster(path, datos, dtype):
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        height=TAMANO,
        width=TAMANO,
        count=1,
        dtype=dtype,
        crs="EPSG:4326",
        transform=from_origin(ORIGEN_LON, ORIGEN_LAT, RESOLUCION, RESOLUCION),
    ) as dst:
        dst.write(datos, 1)


def _rasters(tmp_path, fila_agua: int):
    """DEM 20 m con una franja de agua a 12 m en `fila_agua`; GSW 100 en esa franja."""
    dem = np.full((TAMANO, TAMANO), 20.0, dtype=np.float32)
    gsw = np.zeros((TAMANO, TAMANO), dtype=np.uint8)
    dem[fila_agua, :] = 12.0
    gsw[fila_agua, :] = 100
    ruta_dem = tmp_path / "dem.tif"
    ruta_gsw = tmp_path / "gsw.tif"
    _escribir_raster(ruta_dem, dem, "float32")
    _escribir_raster(ruta_gsw, gsw, "uint8")
    return ruta_dem, ruta_gsw


def test_calcular_exposicion_usa_p10_y_distancia_minima():
    suelo = np.full(10, 10.0)
    agua = np.full(5, 5.0)
    distancias = np.array([100.0, 50.0, 200.0])

    assert calcular_exposicion(suelo, agua, distancias) == {
        "suelo_m": 10.0,
        "nivel_rio_dem_m": 5.0,
        "distancia_rio_m": 50.0,
    }


def test_calcular_exposicion_sin_agua_deja_nivel_y_distancia_en_none():
    suelo = np.full(3, 10.0)

    assert calcular_exposicion(suelo, np.array([]), np.array([])) == {
        "suelo_m": 10.0,
        "nivel_rio_dem_m": None,
        "distancia_rio_m": None,
    }


def test_calcular_exposicion_ignora_nan_y_redondea_a_dos_decimales():
    suelo = np.array([10.004, np.nan])
    agua = np.array([np.nan, 5.0])
    distancias = np.array([12.3456, np.nan])

    assert calcular_exposicion(suelo, agua, distancias) == {
        "suelo_m": 10.0,
        "nivel_rio_dem_m": 5.0,
        "distancia_rio_m": 12.35,
    }


def test_escuela_junto_al_agua_mide_distancia_y_nivel_del_dem(tmp_path):
    fila_agua = 110
    ruta_dem, ruta_gsw = _rasters(tmp_path, fila_agua)
    # Centro del pixel (100, 100): a 10 pixeles (~223 m) de la franja de agua.
    lon, lat = _centro_lon(100), _centro_lat(100)

    with abrir_lector_exposicion_rio_dem(ruta_dem, ruta_gsw) as lector:
        medicion = lector.medir(lon, lat)

    assert medicion["suelo_m"] == pytest.approx(20.0)
    assert medicion["nivel_rio_dem_m"] == pytest.approx(12.0)
    assert medicion["distancia_rio_m"] == pytest.approx(222.6, rel=0.01)


def test_sin_agua_permanente_en_2_km_nivel_y_distancia_son_none(tmp_path):
    # Franja de agua en la fila 0: a ~2,2 km de la escuela, fuera de RADIO_RIO_M.
    ruta_dem, ruta_gsw = _rasters(tmp_path, fila_agua=0)
    lon, lat = _centro_lon(100), _centro_lat(100)

    with abrir_lector_exposicion_rio_dem(ruta_dem, ruta_gsw) as lector:
        medicion = lector.medir(lon, lat)

    assert medicion == {
        "suelo_m": pytest.approx(20.0),
        "nivel_rio_dem_m": None,
        "distancia_rio_m": None,
    }


def test_fuera_de_los_rasters_todo_es_none(tmp_path):
    ruta_dem, ruta_gsw = _rasters(tmp_path, fila_agua=110)

    with abrir_lector_exposicion_rio_dem(ruta_dem, ruta_gsw) as lector:
        medicion = lector.medir(-61.0, -34.0)

    assert medicion == {
        "suelo_m": None,
        "nivel_rio_dem_m": None,
        "distancia_rio_m": None,
    }
