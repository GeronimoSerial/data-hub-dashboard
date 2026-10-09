from geo_static.jobs.calcular_inundacion_v2 import (
    CONTRATO_COLUMNAS,
    construir_fila_escuela,
)


class LectorFalso:
    def __init__(self, profundidades):
        self._profundidades = profundidades
        self.llamadas = []

    def profundidades(self, lon, lat):
        self.llamadas.append((lon, lat))
        return self._profundidades


class LagunaFalsa:
    def __init__(self, medicion):
        self._medicion = medicion
        self.llamadas = []

    def medir(self, lon, lat):
        self.llamadas.append((lon, lat))
        return self._medicion


SIN_LAGUNA = {"distancia_agua_m": None, "altura_sobre_agua_m": None, "junto_laguna": None}


def test_fila_con_profundidades_y_clase_alto():
    escuela = {"cueAnexo": "1801164-00", "lon": -58.0, "lat": -27.5}
    profundidades = {10: 0.5, 20: 0.8, 50: 1.0, 75: 1.1, 100: 1.2, 200: 1.3, 500: 1.5}
    lector = LectorFalso(profundidades)
    laguna = LagunaFalsa(
        {"distancia_agua_m": 120.5, "altura_sobre_agua_m": 1.2, "junto_laguna": True}
    )

    fila = construir_fila_escuela(escuela, lector, laguna, "1", "2026-10-07")

    assert lector.llamadas == [(-58.0, -27.5)]
    assert laguna.llamadas == [(-58.0, -27.5)]
    assert fila["cue_anexo"] == "1801164-00"
    assert fila["clase_rio"] == "alto"
    assert fila["profundidad_rp10_m"] == 0.5
    assert fila["profundidad_rp500_m"] == 1.5
    assert fila["junto_laguna"] is True
    assert fila["distancia_agua_m"] == 120.5
    assert fila["altura_sobre_agua_m"] == 1.2
    assert fila["version_job"] == "1"
    assert fila["fecha_corrida"] == "2026-10-07"
    assert fila["fuente"] == "JRC Global River Flood Hazard Maps v2.1"
    assert set(fila) == set(CONTRATO_COLUMNAS)


def test_columnas_laguna_van_despues_de_profundidades():
    i_margen = CONTRATO_COLUMNAS.index("margen_rp500_m")
    assert CONTRATO_COLUMNAS[i_margen + 1 : i_margen + 4] == [
        "junto_laguna",
        "distancia_agua_m",
        "altura_sobre_agua_m",
    ]


def test_fuera_de_cobertura_queda_sin_dato_y_none():
    escuela = {"cueAnexo": "1801166-00", "lon": -60.0, "lat": -30.0}
    lector = LectorFalso({rp: None for rp in (10, 20, 50, 75, 100, 200, 500)})
    laguna = LagunaFalsa(SIN_LAGUNA)

    fila = construir_fila_escuela(escuela, lector, laguna, "1", "2026-10-07")

    assert fila["clase_rio"] == "sin_dato"
    assert fila["profundidad_rp100_m"] is None
    assert fila["junto_laguna"] is None
    assert fila["distancia_agua_m"] is None
    assert fila["altura_sobre_agua_m"] is None
    assert set(fila) == set(CONTRATO_COLUMNAS)
