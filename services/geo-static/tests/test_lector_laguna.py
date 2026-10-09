import numpy as np
import pytest
import rasterio
from rasterio.transform import from_origin

from geo_static.lector_laguna import LectorLaguna
from geo_static.proximidad_laguna import metros_por_grado

OESTE, NORTE, PASO = -58.0, -27.5, 0.001
FILAS = COLS = 100


def _escribir_tif(ruta, arr, dtype, nodata):
    with rasterio.open(
        ruta,
        "w",
        driver="GTiff",
        height=FILAS,
        width=COLS,
        count=1,
        dtype=dtype,
        crs="EPSG:4326",
        transform=from_origin(OESTE, NORTE, PASO, PASO),
        nodata=nodata,
    ) as dst:
        dst.write(arr, 1)


def test_distancia_altura_y_junto_laguna_sobre_geotiff_sintetico(tmp_path):
    # Franja de agua (ocurrencia 90) en columnas 0..22; resto seco (0).
    gsw = np.zeros((FILAS, COLS), dtype=np.uint8)
    gsw[:, :23] = 90
    # DEM: agua a 10 m, la escuela (fila 50, col 24) a 11.5 m.
    dem = np.full((FILAS, COLS), 10.0, dtype=np.float32)
    dem[50, 24] = 11.5
    ruta_gsw, ruta_dem = tmp_path / "gsw.tif", tmp_path / "dem.tif"
    _escribir_tif(ruta_gsw, gsw, "uint8", 255)
    _escribir_tif(ruta_dem, dem, "float32", -9999.0)

    # Centro del pixel (fila 50, col 24).
    lon, lat = OESTE + 24.5 * PASO, NORTE - 50.5 * PASO
    lector = LectorLaguna(ruta_gsw, ruta_dem)
    try:
        medicion = lector.medir(lon, lat)
        fuera = lector.medir(-59.0, -27.5)
    finally:
        lector.cerrar()

    mx, _ = metros_por_grado(lat)
    # Agua mas cercana: columna 22, mismo renglon, 2 pixeles al oeste.
    assert medicion["distancia_agua_m"] == pytest.approx(2 * PASO * mx, rel=1e-6)
    assert medicion["altura_sobre_agua_m"] == pytest.approx(1.5)
    assert medicion["junto_laguna"] is True
    assert fuera == {"distancia_agua_m": None, "altura_sobre_agua_m": None, "junto_laguna": None}
