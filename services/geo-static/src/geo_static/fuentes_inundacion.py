"""Descarga offline y recorte a Corrientes de las capas fuente del modelo de inundacion v2.

Capas (todas bajo services/geo-static/.data/, gitignored):
- JRC Global River Flood Hazard Maps v2.1 (CEMS/GloFAS): profundidad por periodo
  de retorno, ~90 m -> jrc_flood/rp{N}_depth.tif
- JRC Global Surface Water occurrence v1.4 (2021), ~30 m -> gsw/occurrence.tif
- Copernicus DEM GLO-30 (tiles COG de 1 grado), ~30 m -> dem/glo30.tif
- Alternativa opcional: FABDEM V1-2 (CC BY-NC-SA 4.0), ~30 m -> dem/fabdem.tif
  (fuente_dem="fabdem"; ver fabdem.py)

Las lecturas van por ventanas GDAL (/vsicurl/): solo se transfieren los pixeles
dentro del bbox, nunca los tiles completos. Cada salida se escribe por franjas
(memoria acotada) en un archivo .part que se renombra al terminar, asi una
descarga interrumpida nunca queda marcada como completa. manifest.json guarda por
salida las URLs fuente, sha256, fecha de descarga y licencia.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.transform import from_origin
from rasterio.warp import reproject
from rasterio.windows import Window

from geo_static.fabdem import (
    LICENCIA_FABDEM,
    VERSION as VERSION_FABDEM,
    urls_vsi_fabdem,
    zips_fabdem_para_bbox,
)

FUENTES_DEM = ("copernicus", "fabdem")

# (oeste, sur, este, norte) en grados WGS84.
BBOX_CORRIENTES = (-59.8, -31.2, -55.5, -27.1)
PERIODOS_RETORNO = (10, 20, 50, 75, 100, 200, 500)

DATA_DIR = Path(__file__).resolve().parents[2] / ".data"
MANIFEST_PATH = DATA_DIR / "manifest.json"
MANIFEST_VERSION = 1

JRC_BASE_URL = "https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/CEMS-GLOFAS/flood_hazard"
JRC_EXTENTS_URL = f"{JRC_BASE_URL}/tile_extents.geojson"
GSW_BASE_URL = "https://storage.googleapis.com/global-surface-water/downloads2021/occurrence"
DEM_BASE_URL = "https://copernicus-dem-30m.s3.amazonaws.com"

CRS_SALIDA = "EPSG:4326"
NODATA_JRC = -9999.0
NODATA_GSW = 255
NODATA_DEM = float("nan")

# Franja de filas por escritura: acota la memoria a ~STRIPE_ROWS x ancho x bytes.
STRIPE_ROWS = 1024

LICENCIA_JRC = (
    "JRC/CEMS-GLOFAS open data, sin restricciones de uso "
    "(README.txt, A02; Baugh et al. 2024)"
)
LICENCIA_GSW = (
    "Gratuito, sin restriccion de uso (global-surface-water.appspot.com, License; "
    "Copernicus Programme)"
)
LICENCIA_DEM = (
    "Copernicus DEM GLO-30 Public, gratuito segun la licencia de Copernicus DEM "
    "(spacedata.copernicus.eu, Licencing)"
)


def _fecha_hoy_utc() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def interseca(caja_a: tuple[float, float, float, float], caja_b: tuple[float, float, float, float]) -> bool:
    """Interseccion estricta de dos cajas (oeste, sur, este, norte); tocarse en el borde no cuenta."""
    return (
        caja_a[0] < caja_b[2]
        and caja_a[2] > caja_b[0]
        and caja_a[1] < caja_b[3]
        and caja_a[3] > caja_b[1]
    )


# --- JRC River Flood Hazard -------------------------------------------------


def cargar_extents_jrc(geojson: dict) -> list[dict]:
    """Convierte tile_extents.geojson del JRC en [{id, name, bounds}] sin depender de shapely."""
    tiles = []
    for feature in geojson["features"]:
        xs: list[float] = []
        ys: list[float] = []

        def _recorrer(coords) -> None:
            if isinstance(coords[0], (int, float)):
                xs.append(coords[0])
                ys.append(coords[1])
            else:
                for sub in coords:
                    _recorrer(sub)

        _recorrer(feature["geometry"]["coordinates"])
        tiles.append(
            {
                "id": int(feature["properties"]["id"]),
                "name": str(feature["properties"]["name"]),
                "bounds": (min(xs), min(ys), max(xs), max(ys)),
            }
        )
    return tiles


def tiles_jrc_para_bbox(extents: list[dict], bbox: tuple[float, float, float, float]) -> list[dict]:
    """Tiles JRC cuya extension intersecta el bbox (el JRC usa tiles de 10 grados)."""
    return [t for t in extents if interseca(t["bounds"], bbox)]


def url_jrc_profundidad(tile: dict, periodo: int) -> str:
    # Patron real verificado con HEAD: RP100/ID85_S20_W60_RP100_depth.tif
    return f"{JRC_BASE_URL}/RP{periodo}/ID{tile['id']}_{tile['name']}_RP{periodo}_depth.tif"


# --- JRC Global Surface Water -----------------------------------------------


def nombre_tile_gsw(lon_izq: int, lat_sup: int) -> str:
    """Nombre GSW de un tile de 10 grados indexado por su esquina superior izquierda.

    Ej.: (-60, -20) -> '60W_20S' (archivo occurrence_60W_20Sv1_4_2021.tif).
    """
    letra_lon = "W" if lon_izq < 0 else "E"
    letra_lat = "S" if lat_sup < 0 else "N"
    return f"{abs(lon_izq)}{letra_lon}_{abs(lat_sup)}{letra_lat}"


def tiles_gsw_para_bbox(bbox: tuple[float, float, float, float]) -> list[str]:
    """Nombres de los tiles GSW (10 grados) que cubren el bbox."""
    oeste, sur, este, norte = bbox
    nombres: list[str] = []
    lon_izq = math.floor(oeste / 10) * 10
    while lon_izq < este:
        lat_sup = math.ceil(norte / 10) * 10
        while lat_sup > sur:
            nombres.append(nombre_tile_gsw(lon_izq, lat_sup))
            lat_sup -= 10
        lon_izq += 10
    return nombres


def url_gsw(nombre_tile: str) -> str:
    return f"{GSW_BASE_URL}/occurrence_{nombre_tile}v1_4_2021.tif"


# --- Copernicus DEM GLO-30 --------------------------------------------------


def nombre_tile_dem(lat_sw: int, lon_sw: int) -> str:
    """Nombre Copernicus DEM de un tile de 1 grado indexado por su esquina suroeste.

    Ej.: (-28, -59) -> 'Copernicus_DSM_COG_10_S28_00_W059_00_DEM'.
    """
    letra_lat = "S" if lat_sw < 0 else "N"
    letra_lon = "W" if lon_sw < 0 else "E"
    return (
        f"Copernicus_DSM_COG_10_{letra_lat}{abs(lat_sw):02d}_00_"
        f"{letra_lon}{abs(lon_sw):03d}_00_DEM"
    )


def tiles_dem_para_bbox(bbox: tuple[float, float, float, float]) -> list[str]:
    """Nombres de los tiles DEM de 1 grado que cubren el bbox."""
    oeste, sur, este, norte = bbox
    nombres: list[str] = []
    for lat_sw in range(math.floor(sur), math.ceil(norte)):
        for lon_sw in range(math.floor(oeste), math.ceil(este)):
            nombres.append(nombre_tile_dem(lat_sw, lon_sw))
    return nombres


def url_dem(nombre_tile: str) -> str:
    return f"{DEM_BASE_URL}/{nombre_tile}/{nombre_tile}.tif"


# --- Grilla, manifest y saltos ----------------------------------------------


def grilla_salida(
    bbox: tuple[float, float, float, float], res: tuple[float, float]
) -> tuple[object, int, int]:
    """Transform, ancho y alto de la salida: origen en la esquina NO del bbox y resolucion de la fuente."""
    oeste, sur, este, norte = bbox
    res_x, res_y = abs(res[0]), abs(res[1])
    # El epsilon evita que un error de punto flotante agregue una columna/fila de mas.
    ancho = math.ceil((este - oeste) / res_x - 1e-9)
    alto = math.ceil((norte - sur) / res_y - 1e-9)
    return from_origin(oeste, norte, res_x, res_y), ancho, alto


def leer_manifest(path: Path = MANIFEST_PATH) -> dict:
    if not path.exists():
        return {"version": MANIFEST_VERSION, "entradas": {}}
    return json.loads(path.read_text(encoding="utf-8"))


def escribir_manifest(manifest: dict, path: Path = MANIFEST_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporal = path.with_name(path.name + ".part")
    temporal.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    os.replace(temporal, path)


def debe_descargar(manifest: dict, clave: str, archivo: Path, force: bool) -> bool:
    """Una capa se salta si el archivo y su entrada de manifest existen (salvo --force)."""
    if force:
        return True
    return not (archivo.exists() and clave in manifest.get("entradas", {}))


def sha256_archivo(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for bloque in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(bloque)
    return digest.hexdigest()


def url_existe(url: str) -> bool:
    """HEAD: True si responde 200, False si 404; otros errores se propagan."""
    peticion = urllib.request.Request(url, method="HEAD")
    try:
        with urllib.request.urlopen(peticion, timeout=60) as respuesta:
            return respuesta.status == 200
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return False
        raise


# --- Recorte por franjas ----------------------------------------------------


def recortar_mosaico(
    urls: list[str],
    bbox: tuple[float, float, float, float],
    destino: Path,
    *,
    nodata: float | int,
    dtype: str,
    prefijo_vsi: str = "/vsicurl/",
) -> tuple[int, int]:
    """Mosaico de los tiles remotos recortado al bbox, escrito en `destino` (GeoTIFF deflate, tiled).

    Cada ruta se abre como `prefijo_vsi + url`. Devuelve (ancho, alto) de la salida.
    Las lecturas son ventanas remotas; la escritura va por franjas de STRIPE_ROWS
    filas para acotar la memoria.
    """
    destino.parent.mkdir(parents=True, exist_ok=True)
    parcial = destino.with_name(destino.name + ".part")
    es_flotante = np.issubdtype(np.dtype(dtype), np.floating)

    # Timeouts y reintentos acotados: una lectura remota colgada no debe frenar la corrida.
    with rasterio.Env(
        GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR",
        GDAL_HTTP_TIMEOUT=60,
        GDAL_HTTP_MAX_RETRY=5,
        GDAL_HTTP_RETRY_DELAY=2,
    ):
        fuentes = [rasterio.open(f"{prefijo_vsi}{url}") for url in urls]
        try:
            transform, ancho, alto = grilla_salida(bbox, fuentes[0].res)
            perfil = {
                "driver": "GTiff",
                "dtype": dtype,
                "count": 1,
                "width": ancho,
                "height": alto,
                "crs": CRS_SALIDA,
                "transform": transform,
                "nodata": nodata,
                "tiled": True,
                "blockxsize": 512,
                "blockysize": 512,
                "compress": "deflate",
                "predictor": 3 if es_flotante else 2,
            }
            with rasterio.open(parcial, "w", **perfil) as dst:
                for fila_0 in range(0, alto, STRIPE_ROWS):
                    alto_franja = min(STRIPE_ROWS, alto - fila_0)
                    ventana = Window(0, fila_0, ancho, alto_franja)
                    transform_franja = rasterio.windows.transform(ventana, transform)
                    caja_franja = rasterio.windows.bounds(ventana, transform)
                    franja = np.full((alto_franja, ancho), nodata, dtype=dtype)
                    for fuente in fuentes:
                        if not interseca(tuple(fuente.bounds), caja_franja):
                            continue
                        # init_dest_nodata=False: la franja ya esta inicializada y no
                        # debe borrar lo escrito por una fuente anterior.
                        reproject(
                            source=rasterio.band(fuente, 1),
                            destination=franja,
                            src_nodata=fuente.nodata,
                            dst_transform=transform_franja,
                            dst_crs=CRS_SALIDA,
                            dst_nodata=nodata,
                            resampling=Resampling.nearest,
                            init_dest_nodata=False,
                        )
                    dst.write(franja, 1, window=ventana)
        finally:
            for fuente in fuentes:
                fuente.close()

    os.replace(parcial, destino)
    return ancho, alto


# --- Orquestacion -----------------------------------------------------------


def _entrada_manifest(
    archivo_rel: str,
    *,
    fuente: str,
    urls: list[str],
    omitidos: list[str],
    licencia: str,
    destino: Path,
    bbox: tuple[float, float, float, float],
    ancho: int,
    alto: int,
    dtype: str,
    nodata: float | int,
    extra: dict | None = None,
) -> dict:
    nodata_manifest: float | int | str
    nodata_manifest = "NaN" if isinstance(nodata, float) and math.isnan(nodata) else nodata
    entrada = {
        "archivo": archivo_rel,
        "fuente": fuente,
        "urls": urls,
        "urls_omitidas_404": omitidos,
        "bbox_oeste_sur_este_norte": list(bbox),
        "crs": CRS_SALIDA,
        "ancho": ancho,
        "alto": alto,
        "dtype": dtype,
        "nodata": nodata_manifest,
        "bytes": destino.stat().st_size,
        "sha256": sha256_archivo(destino),
        "fecha_descarga": _fecha_hoy_utc(),
        "licencia": licencia,
    }
    entrada.update(extra or {})
    return entrada


def _resolver_urls(urls: list[str], requeridas: bool) -> tuple[list[str], list[str]]:
    """Separa URLs existentes y 404. Una URL 404 en una capa requerida es error."""
    disponibles: list[str] = []
    omitidas: list[str] = []
    for url in urls:
        if url_existe(url):
            disponibles.append(url)
        else:
            omitidas.append(url)
    if omitidas and requeridas:
        raise FileNotFoundError(f"tiles requeridos no encontrados (404): {omitidas}")
    if not disponibles:
        raise FileNotFoundError("ningun tile disponible para la capa")
    return disponibles, omitidas


def descargar_fuentes(
    force: bool = False,
    progreso: Callable[[str], None] = print,
    *,
    data_dir: Path = DATA_DIR,
    bbox: tuple[float, float, float, float] = BBOX_CORRIENTES,
    fuente_dem: str = "copernicus",
    incluir_jrc_flood: bool = True,
) -> dict:
    """Descarga y recorta las capas fuente. Idempotente salvo `force`. Devuelve el manifest.

    `fuente_dem` elige el DEM: "copernicus" (GLO-30, por defecto) o "fabdem"
    (FABDEM V1-2, dem/fabdem.tif). `incluir_jrc_flood=False` omite el indice JRC
    y las capas de profundidad rp*; GSW y DEM se descargan igual.
    """
    if fuente_dem not in FUENTES_DEM:
        raise ValueError(f"fuente_dem desconocida: {fuente_dem!r}; use uno de {FUENTES_DEM}")

    manifest_path = data_dir / "manifest.json"
    manifest = leer_manifest(manifest_path)
    entradas = manifest.setdefault("entradas", {})

    capas: list[dict] = []
    indice_rel = "jrc_flood/tile_extents.geojson"
    indice = data_dir / indice_rel
    if incluir_jrc_flood:
        # Indice de tiles JRC: se guarda como archivo auxiliar y tambien va al manifest.
        if debe_descargar(manifest, indice_rel, indice, force):
            indice.parent.mkdir(parents=True, exist_ok=True)
            with urllib.request.urlopen(JRC_EXTENTS_URL, timeout=120) as respuesta:
                indice.write_bytes(respuesta.read())
            progreso(f"indice JRC descargado: {indice_rel}")
        extents = cargar_extents_jrc(json.loads(indice.read_text(encoding="utf-8")))

        tiles_jrc = tiles_jrc_para_bbox(extents, bbox)
        for periodo in PERIODOS_RETORNO:
            capas.append(
                {
                    "clave": f"jrc_flood/rp{periodo}_depth.tif",
                    "fuente": f"JRC Global River Flood Hazard Maps v2.1, RP{periodo}",
                    "urls": [url_jrc_profundidad(t, periodo) for t in tiles_jrc],
                    "requeridas": True,
                    "licencia": LICENCIA_JRC,
                    "dtype": "float32",
                    "nodata": NODATA_JRC,
                }
            )
    capas.append(
        {
            "clave": "gsw/occurrence.tif",
            "fuente": "JRC Global Surface Water occurrence v1.4 (2021)",
            "urls": [url_gsw(n) for n in tiles_gsw_para_bbox(bbox)],
            "requeridas": True,
            "licencia": LICENCIA_GSW,
            "dtype": "uint8",
            "nodata": NODATA_GSW,
        }
    )
    if fuente_dem == "fabdem":
        capas.append(
            {
                "clave": "dem/fabdem.tif",
                "fuente": f"FABDEM {VERSION_FABDEM}",
                # Rutas /vsizip/ dentro de zips remotos: no hay HEAD por tile; un tile
                # ausente dentro del zip falla al abrirse en recortar_mosaico.
                "urls": urls_vsi_fabdem(bbox),
                "verificar_http": False,
                "requeridas": True,
                "licencia": LICENCIA_FABDEM,
                "dtype": "float32",
                # Salida con NaN; el nodata -9999 de la fuente lo mapea reproject (src_nodata).
                "nodata": NODATA_DEM,
                "recorte": {"prefijo_vsi": ""},
                "extra": {"version": VERSION_FABDEM, "zips": zips_fabdem_para_bbox(bbox)},
            }
        )
    else:
        capas.append(
            {
                "clave": "dem/glo30.tif",
                "fuente": "Copernicus DEM GLO-30",
                "urls": [url_dem(n) for n in tiles_dem_para_bbox(bbox)],
                # Tiles DEM 404 son celdas de oceano/sin cobertura: se omiten y se registran.
                "requeridas": False,
                "licencia": LICENCIA_DEM,
                "dtype": "float32",
                "nodata": NODATA_DEM,
            }
        )

    for capa in capas:
        clave = capa["clave"]
        archivo = data_dir / clave
        if not debe_descargar(manifest, clave, archivo, force):
            progreso(f"omitida (ya existe): {clave}")
            continue
        if capa.get("verificar_http", True):
            disponibles, omitidas = _resolver_urls(capa["urls"], capa["requeridas"])
        else:
            disponibles, omitidas = list(capa["urls"]), []
        progreso(f"{clave}: {len(disponibles)} tiles" + (f", {len(omitidas)} omitidos (404)" if omitidas else ""))
        ancho, alto = recortar_mosaico(
            disponibles, bbox, archivo, nodata=capa["nodata"], dtype=capa["dtype"], **capa.get("recorte", {})
        )
        entradas[clave] = _entrada_manifest(
            clave,
            fuente=capa["fuente"],
            urls=disponibles,
            omitidos=omitidas,
            licencia=capa["licencia"],
            destino=archivo,
            bbox=bbox,
            ancho=ancho,
            alto=alto,
            dtype=capa["dtype"],
            nodata=capa["nodata"],
            extra=capa.get("extra"),
        )
        escribir_manifest(manifest, manifest_path)
        progreso(f"escrita: {clave} ({ancho}x{alto})")

    if incluir_jrc_flood:
        entradas[indice_rel] = {
            "archivo": indice_rel,
            "fuente": "JRC tile_extents.geojson (indice de tiles)",
            "urls": [JRC_EXTENTS_URL],
            "urls_omitidas_404": [],
            "bytes": indice.stat().st_size,
            "sha256": sha256_archivo(indice),
            "fecha_descarga": _fecha_hoy_utc(),
            "licencia": LICENCIA_JRC,
        }
    escribir_manifest(manifest, manifest_path)
    return manifest
