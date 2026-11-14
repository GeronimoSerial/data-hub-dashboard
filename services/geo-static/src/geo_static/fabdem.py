"""FABDEM V1-2 (University of Bristol / Fathom): DEM alternativo al Copernicus GLO-30.

Tiles de 1 grado, float32 EPSG:4326, nodata -9999, datum vertical EGM2008. Se
distribuyen dentro de zips de 10 grados (esquina SO a NE). Las lecturas van por
GDAL remoto: /vsizip/vsicurl/<url del zip>/<miembro>.tif.

Licencia CC BY-NC-SA 4.0: uso no comercial, con atribucion y misma licencia.
Funciones puras: no hay red al importar ni al llamarlas.
"""

from __future__ import annotations

import math

BASE_URL = "https://data.bris.ac.uk/datasets/s5hqmjcdj8yo2ibzi9b4ew3sn/"
VERSION = "V1-2"
NODATA_FABDEM = -9999.0

LICENCIA_FABDEM = (
    "FABDEM V1-2 (University of Bristol / Fathom), CC BY-NC-SA 4.0 "
    "(https://creativecommons.org/licenses/by-nc-sa/4.0/). "
    "FABDEM is produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and "
    "© Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the "
    "European Union and ESA; all rights reserved. "
    "Readme: https://data.bris.ac.uk/datasets/s5hqmjcdj8yo2ibzi9b4ew3sn/readme.txt"
)


def _etiqueta_lat(lat: int) -> str:
    return ("S" if lat < 0 else "N") + f"{abs(lat):02d}"


def _etiqueta_lon(lon: int) -> str:
    return ("W" if lon < 0 else "E") + f"{abs(lon):03d}"


def nombre_tile_fabdem(lat_sw: int, lon_sw: int) -> str:
    """Nombre del tile de 1 grado indexado por su esquina SO. Ej.: (-4, -61) -> 'S04W061_FABDEM_V1-2'."""
    return f"{_etiqueta_lat(lat_sw)}{_etiqueta_lon(lon_sw)}_FABDEM_{VERSION}"


def nombre_zip_fabdem(lat_sw: int, lon_sw: int) -> str:
    """Nombre del zip de 10 grados que contiene el tile de 1 grado (lat_sw, lon_sw).

    Ej.: (-4, -61) -> 'S10W070-N00W060_FABDEM_V1-2.zip'.
    """
    lat_0 = (lat_sw // 10) * 10
    lon_0 = (lon_sw // 10) * 10
    return (
        f"{_etiqueta_lat(lat_0)}{_etiqueta_lon(lon_0)}-"
        f"{_etiqueta_lat(lat_0 + 10)}{_etiqueta_lon(lon_0 + 10)}_FABDEM_{VERSION}.zip"
    )


def _pares_para_bbox(bbox: tuple[float, float, float, float]) -> list[tuple[int, int]]:
    """(lat_sw, lon_sw) de cada tile de 1 grado que cubre el bbox, en orden lat y luego lon."""
    oeste, sur, este, norte = bbox
    return [
        (lat_sw, lon_sw)
        for lat_sw in range(math.floor(sur), math.ceil(norte))
        for lon_sw in range(math.floor(oeste), math.ceil(este))
    ]


def tiles_fabdem_para_bbox(bbox: tuple[float, float, float, float]) -> list[str]:
    """Nombres de los tiles FABDEM de 1 grado que cubren el bbox (oeste, sur, este, norte)."""
    return [nombre_tile_fabdem(lat_sw, lon_sw) for lat_sw, lon_sw in _pares_para_bbox(bbox)]


def url_zip_fabdem(lat_sw: int, lon_sw: int) -> str:
    return f"{BASE_URL}{nombre_zip_fabdem(lat_sw, lon_sw)}"


def zips_fabdem_para_bbox(bbox: tuple[float, float, float, float]) -> list[str]:
    """URLs de los zips de 10 grados que contienen tiles del bbox, sin repetir y en orden."""
    urls: list[str] = []
    for lat_sw, lon_sw in _pares_para_bbox(bbox):
        url = url_zip_fabdem(lat_sw, lon_sw)
        if url not in urls:
            urls.append(url)
    return urls


def urls_vsi_fabdem(bbox: tuple[float, float, float, float]) -> list[str]:
    """Rutas GDAL /vsizip/vsicurl/ de cada tile del bbox, en el mismo orden que tiles_fabdem_para_bbox."""
    return [
        f"/vsizip/vsicurl/{url_zip_fabdem(lat_sw, lon_sw)}/{nombre_tile_fabdem(lat_sw, lon_sw)}.tif"
        for lat_sw, lon_sw in _pares_para_bbox(bbox)
    ]
