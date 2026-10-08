from rasterio.transform import from_origin

from geo_static.exposicion_ruta_v2 import MIN_PIXELES_EXPUESTOS
from geo_static.jobs.calcular_exposicion_ruta_v2 import VERSION_JOB, construir_registro_ruta

TRANSFORM = from_origin(-59.0, -27.0, 0.001, 0.001)
# Tres pixeles distintos (columnas 0, 1 y 2) para cumplir MIN_PIXELES_EXPUESTOS.
RUTA = {"type": "LineString", "coordinates": [[-58.9995, -27.0005], [-58.9975, -27.0005]]}


class LectorStub:
    def __init__(self, profundidades):
        self._profundidades = profundidades

    def profundidades(self, lon, lat):
        return dict(self._profundidades)


class LectorMargenStub:
    """Margen fijo por RP; cuenta las consultas para verificar el cache por pixel."""

    def __init__(self, margenes):
        self._margenes = margenes
        self.consultas = 0

    def medir(self, lon, lat):
        self.consultas += 1
        return dict(self._margenes)


def test_registro_ruta_con_alto_y_identificadores():
    lector = LectorStub({10: 1.0, 100: 1.0, 500: 1.0})
    margen = LectorMargenStub({10: -0.5, 100: -0.5, 500: -0.5})
    registro = construir_registro_ruta(
        {"cue_anexo": "1801164-00", "ruta": RUTA}, lector, margen, TRANSFORM, "2026-10-08", {}
    )

    assert registro["cue_anexo"] == "1801164-00"
    assert registro["version_job"] == VERSION_JOB == 2
    assert registro["clase_ruta"] == "alto"
    assert registro["muestras_total"] == 3
    assert registro["muestras_expuestas"] == registro["muestras_total"]
    assert registro["min_pixeles_expuestos"] == MIN_PIXELES_EXPUESTOS
    assert registro["motivo_sin_dato"] is None
    assert registro["fecha_corrida"] == "2026-10-08"


def test_margen_positivo_no_deja_clasificar_como_alto():
    lector = LectorStub({10: 1.0, 100: 1.0, 500: 1.0})
    margen = LectorMargenStub({10: 2.0, 100: 2.0, 500: 2.0})
    registro = construir_registro_ruta(
        {"cue_anexo": "1801164-00", "ruta": RUTA}, lector, margen, TRANSFORM, "2026-10-08", {}
    )

    assert registro["clase_ruta"] == "sin_riesgo"


def test_margenes_se_cachean_por_pixel_entre_escuelas():
    lector = LectorStub({10: 1.0, 100: 1.0, 500: 1.0})
    margen = LectorMargenStub({10: -0.5, 100: -0.5, 500: -0.5})
    cache: dict = {}
    escuela = {"cue_anexo": "1801164-00", "ruta": RUTA}

    construir_registro_ruta(escuela, lector, margen, TRANSFORM, "2026-10-08", cache)
    construir_registro_ruta(escuela, lector, margen, TRANSFORM, "2026-10-08", cache)

    assert margen.consultas == 3
    assert len(cache) == 3


def test_registro_sin_ruta_es_sin_ruta_y_conserva_motivo():
    lector = LectorStub({10: 1.0, 100: 1.0, 500: 1.0})
    margen = LectorMargenStub({10: -0.5, 100: -0.5, 500: -0.5})
    escuela = {"cue_anexo": "1800001-00", "ruta": None, "motivo_sin_geometria": "sin_via_osm_cercana"}
    registro = construir_registro_ruta(escuela, lector, margen, TRANSFORM, "2026-10-08", {})

    assert registro["clase_ruta"] == "sin_ruta"
    assert registro["muestras_total"] == 0
    assert registro["motivo_sin_dato"] == "sin_via_osm_cercana"
    assert margen.consultas == 0


def test_registro_sin_dato_no_se_convierte_en_cero():
    lector = LectorStub({10: None, 100: None, 500: None})
    margen = LectorMargenStub({10: None, 100: None, 500: None})
    registro = construir_registro_ruta(
        {"cue_anexo": "1801166-00", "ruta": RUTA}, lector, margen, TRANSFORM, "2026-10-08", {}
    )

    assert registro["clase_ruta"] == "sin_dato"
    assert registro["muestras_sin_dato"] == registro["muestras_total"]
