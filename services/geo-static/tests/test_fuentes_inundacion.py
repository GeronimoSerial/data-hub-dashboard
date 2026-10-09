import json
import math

from geo_static.fuentes_inundacion import (
    BBOX_CORRIENTES,
    PERIODOS_RETORNO,
    cargar_extents_jrc,
    debe_descargar,
    escribir_manifest,
    grilla_salida,
    interseca,
    leer_manifest,
    nombre_tile_dem,
    nombre_tile_gsw,
    tiles_dem_para_bbox,
    tiles_gsw_para_bbox,
    tiles_jrc_para_bbox,
    url_gsw,
    url_jrc_profundidad,
    url_dem,
)


def test_bbox_corrientes_es_oeste_sur_este_norte():
    oeste, sur, este, norte = BBOX_CORRIENTES
    assert oeste < este and sur < norte
    assert (oeste, sur, este, norte) == (-59.8, -31.2, -55.5, -27.1)


def test_periodos_retorno_del_jrc():
    assert PERIODOS_RETORNO == (10, 20, 50, 75, 100, 200, 500)


def test_nombre_tile_dem_usa_esquina_suroeste_con_padding():
    assert nombre_tile_dem(-28, -59) == "Copernicus_DSM_COG_10_S28_00_W059_00_DEM"
    assert nombre_tile_dem(-32, -60) == "Copernicus_DSM_COG_10_S32_00_W060_00_DEM"


def test_tiles_dem_cubren_bbox_sin_tile_de_mas():
    tiles = tiles_dem_para_bbox(BBOX_CORRIENTES)
    # lat floor(-31.2)=-32 .. ceil(-27.1)=-27 (exclusivo) -> S32..S28; lon -60..-56
    assert len(tiles) == 5 * 5
    assert "Copernicus_DSM_COG_10_S28_00_W059_00_DEM" in tiles
    assert "Copernicus_DSM_COG_10_S32_00_W060_00_DEM" in tiles
    assert all("S27" not in t and "S33" not in t for t in tiles)
    assert url_dem(tiles[0]).endswith(f"/{tiles[0]}/{tiles[0]}.tif")


def test_nombre_tile_gsw_usa_esquina_superior_izquierda():
    assert nombre_tile_gsw(-60, -20) == "60W_20S"
    assert nombre_tile_gsw(-60, -30) == "60W_30S"


def test_tiles_gsw_para_bbox_son_60W_20S_y_60W_30S():
    assert tiles_gsw_para_bbox(BBOX_CORRIENTES) == ["60W_20S", "60W_30S"]
    assert url_gsw("60W_20S") == (
        "https://storage.googleapis.com/global-surface-water/downloads2021/occurrence/"
        "occurrence_60W_20Sv1_4_2021.tif"
    )


def test_tiles_gsw_no_incluyen_tile_que_solo_toca_el_borde():
    # Una caja que termina exactamente en -30 no debe pedir el tile 30S de abajo.
    assert tiles_gsw_para_bbox((-59.0, -29.5, -58.0, -29.0)) == ["60W_20S"]


def _geojson_jrc():
    def cuadrado(w, s, e, n):
        return {
            "type": "Polygon",
            "coordinates": [[[w, s], [e, s], [e, n], [w, n], [w, s]]],
        }

    return {
        "type": "FeatureCollection",
        "features": [
            {"type": "Feature", "properties": {"id": 85, "name": "S20_W60"},
             "geometry": cuadrado(-60.01, -29.99, -50.01, -19.99)},
            {"type": "Feature", "properties": {"id": 86, "name": "S30_W60"},
             "geometry": cuadrado(-60.01, -39.99, -50.01, -29.99)},
            {"type": "Feature", "properties": {"id": 1, "name": "N70_W180"},
             "geometry": cuadrado(-180.01, 59.99, -170.01, 69.99)},
        ],
    }


def test_cargar_extents_jrc_calcula_bounds_desde_geometria():
    tiles = cargar_extents_jrc(_geojson_jrc())
    assert tiles[0] == {"id": 85, "name": "S20_W60", "bounds": (-60.01, -29.99, -50.01, -19.99)}


def test_tiles_jrc_para_bbox_selecciona_los_dos_tiles_de_corrientes():
    tiles = tiles_jrc_para_bbox(cargar_extents_jrc(_geojson_jrc()), BBOX_CORRIENTES)
    assert [t["name"] for t in tiles] == ["S20_W60", "S30_W60"]


def test_url_jrc_profundidad_patron_real():
    tile = {"id": 85, "name": "S20_W60"}
    assert url_jrc_profundidad(tile, 100) == (
        "https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/CEMS-GLOFAS/flood_hazard/RP100/"
        "ID85_S20_W60_RP100_depth.tif"
    )


def test_interseca_no_cuenta_contacto_en_borde():
    assert interseca((0, 0, 1, 1), (0.5, 0.5, 2, 2))
    assert not interseca((0, 0, 1, 1), (1, 0, 2, 1))


def test_grilla_salida_origen_en_esquina_noroeste_y_tamanos():
    transform, ancho, alto = grilla_salida(BBOX_CORRIENTES, (0.001, 0.001))
    assert transform.c == BBOX_CORRIENTES[0]
    assert transform.f == BBOX_CORRIENTES[3]
    assert ancho == math.ceil(4.3 / 0.001 - 1e-9) == 4300
    assert alto == math.ceil(4.1 / 0.001 - 1e-9) == 4100


def test_debe_descargar_respeta_manifest_archivo_y_force(tmp_path):
    archivo = tmp_path / "gsw" / "occurrence.tif"
    archivo.parent.mkdir()
    manifest = {"entradas": {}}
    assert debe_descargar(manifest, "gsw/occurrence.tif", archivo, force=False)

    archivo.write_bytes(b"x")
    assert debe_descargar(manifest, "gsw/occurrence.tif", archivo, force=False)

    manifest["entradas"]["gsw/occurrence.tif"] = {"archivo": "gsw/occurrence.tif"}
    assert not debe_descargar(manifest, "gsw/occurrence.tif", archivo, force=False)
    assert debe_descargar(manifest, "gsw/occurrence.tif", archivo, force=True)


def test_debe_descargar_sin_archivo_aunque_haya_entrada(tmp_path):
    manifest = {"entradas": {"dem/glo30.tif": {}}}
    assert debe_descargar(manifest, "dem/glo30.tif", tmp_path / "dem" / "glo30.tif", force=False)


def test_manifest_ida_y_vuelta(tmp_path):
    path = tmp_path / "manifest.json"
    assert leer_manifest(path) == {"version": 1, "entradas": {}}

    manifest = {"version": 1, "entradas": {"gsw/occurrence.tif": {"sha256": "abc", "nodata": "NaN"}}}
    escribir_manifest(manifest, path)
    assert json.loads(path.read_text(encoding="utf-8")) == manifest
    assert leer_manifest(path) == manifest
    assert not path.with_name(path.name + ".part").exists()
