import json

import numpy as np
import rasterio
from rasterio.transform import from_bounds

from geo_static.lector_jrc import leer_profundidades

# Raster sintetico 4x4 px sobre lon [-59, -58], lat [-28, -27] (0.25 grados por px).
IZQUIERDA, ABAJO, DERECHA, ARRIBA = -59.0, -28.0, -58.0, -27.0
PUNTO_PROFUNDO = (-58.6, -27.6)  # col 1, fila 2
PUNTO_NODATA = (-58.9, -27.1)  # col 0, fila 0
PUNTO_FUERA = (-60.0, -27.5)


def _escribir_raster(ruta, arreglo):
    with rasterio.open(
        ruta,
        "w",
        driver="GTiff",
        height=4,
        width=4,
        count=1,
        dtype="float32",
        crs="EPSG:4326",
        transform=from_bounds(IZQUIERDA, ABAJO, DERECHA, ARRIBA, 4, 4),
        nodata=-9999.0,
    ) as dst:
        dst.write(arreglo.astype("float32"), 1)


def _preparar_carpeta(tmp_path):
    carpeta = tmp_path / "jrc_flood"
    carpeta.mkdir()
    arreglo = np.full((4, 4), -9999.0)
    arreglo[2, 1] = 0.5
    _escribir_raster(carpeta / "rp10_depth.tif", arreglo)

    huella = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {"id": 1, "name": "S27_W59"},
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [IZQUIERDA, ABAJO],
                            [DERECHA, ABAJO],
                            [DERECHA, ARRIBA],
                            [IZQUIERDA, ARRIBA],
                            [IZQUIERDA, ABAJO],
                        ]
                    ],
                },
            }
        ],
    }
    (carpeta / "tile_extents.geojson").write_text(json.dumps(huella), encoding="utf-8")
    return carpeta


def test_profundidad_valida(tmp_path):
    carpeta = _preparar_carpeta(tmp_path)

    resultado = leer_profundidades(*PUNTO_PROFUNDO, carpeta=carpeta, rps=(10,))

    assert resultado == {10: 0.5}


def test_nodata_dentro_de_cobertura_es_cero(tmp_path):
    carpeta = _preparar_carpeta(tmp_path)

    resultado = leer_profundidades(*PUNTO_NODATA, carpeta=carpeta, rps=(10,))

    assert resultado == {10: 0.0}


def test_fuera_de_limites_es_none(tmp_path):
    carpeta = _preparar_carpeta(tmp_path)

    resultado = leer_profundidades(*PUNTO_FUERA, carpeta=carpeta, rps=(10,))

    assert resultado == {10: None}


def test_archivo_faltante_es_none(tmp_path):
    carpeta = _preparar_carpeta(tmp_path)

    resultado = leer_profundidades(*PUNTO_PROFUNDO, carpeta=carpeta, rps=(10, 100))

    assert resultado == {10: 0.5, 100: None}
