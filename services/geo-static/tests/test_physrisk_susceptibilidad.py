import sys
import os

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from geo_static.physrisk_susceptibilidad import (
    MAX_INTENTOS_POR_BLOQUE,
    TAMANO_BLOQUE_LOTE,
    clasificar_fuente,
    construir_fila_escuela,
    intentar_leer_peligro,
    leer_peligro_lote,
    obtener_peligros_escuela,
)


def test_clasificar_fuente():
    assert clasificar_fuente(True) == 'physrisk'
    assert clasificar_fuente(False) == 'no_disponible'


def test_construir_fila_escuela_con_valores():
    fila = construir_fila_escuela(
        cue_anexo='1234567-00',
        peligro_inundacion_fluvial=0.5,
        peligro_inundacion_pluvial=0.2,
        peligro_viento=0.1,
        peligro_calor=0.9,
        periodo_retorno_anios=100,
        version_job='v1',
        fecha_corrida='2026-09-26',
    )
    assert fila['fuente'] == 'physrisk'


def test_construir_fila_escuela_sin_peligros():
    fila = construir_fila_escuela(
        cue_anexo='1234567-00',
        peligro_inundacion_fluvial=None,
        peligro_inundacion_pluvial=None,
        peligro_viento=None,
        peligro_calor=None,
        periodo_retorno_anios=100,
        version_job='v1',
        fecha_corrida='2026-09-26',
    )
    assert fila['fuente'] == 'no_disponible'


def test_construir_fila_escuela_keys_exactas():
    fila = construir_fila_escuela(
        cue_anexo='1234567-00',
        peligro_inundacion_fluvial=0.5,
        peligro_inundacion_pluvial=0.2,
        peligro_viento=0.1,
        peligro_calor=0.9,
        periodo_retorno_anios=100,
        version_job='v1',
        fecha_corrida='2026-09-26',
    )
    assert set(fila.keys()) == {
        'cue_anexo',
        'peligro_inundacion_fluvial',
        'peligro_inundacion_pluvial',
        'peligro_viento',
        'peligro_calor',
        'periodo_retorno_anios',
        'fuente',
        'version_job',
        'fecha_corrida',
        'licencia',
    }
    assert len(fila) == 10


class _ReaderFalso:
    """Simula un ZarrReader sin tocar la red."""

    def __init__(self, curvas, return_periods, in_bounds):
        self._curvas = curvas
        self._return_periods = return_periods
        self._in_bounds = in_bounds

    def get_curves(self, path, longitudes, latitudes, interpolation='floor'):
        # Orden real de ZarrReader.get_curves: (curvas, in_bounds, indices,
        # unidades). Ver comentario de G1-fix1 en physrisk_susceptibilidad.py.
        return self._curvas, self._in_bounds, self._return_periods, 'default'


def test_intentar_leer_peligro_valor_real():
    reader = _ReaderFalso(
        curvas=np.array([[0.0, 1.0, 2.0]]),
        return_periods=np.array([10, 100, 500]),
        in_bounds=np.array([True]),
    )
    valor = intentar_leer_peligro(reader, 'cualquier/path', lon=-58.0, lat=-27.0, periodo_retorno_anios=100)
    assert valor == 1.0


def test_intentar_leer_peligro_nan_devuelve_none():
    reader = _ReaderFalso(
        curvas=np.array([[np.nan, np.nan]]),
        return_periods=np.array([100, 500]),
        in_bounds=np.array([True]),
    )
    assert intentar_leer_peligro(reader, 'cualquier/path', lon=-58.0, lat=-27.0) is None


def test_intentar_leer_peligro_fuera_de_bounds_devuelve_none():
    reader = _ReaderFalso(
        curvas=np.array([[5.0]]),
        return_periods=np.array([100]),
        in_bounds=np.array([False]),
    )
    assert intentar_leer_peligro(reader, 'cualquier/path', lon=0.0, lat=0.0) is None


def test_intentar_leer_peligro_excepcion_no_crashea():
    class ReaderRoto:
        def get_curves(self, *a, **k):
            raise RuntimeError('sin red')

    assert intentar_leer_peligro(ReaderRoto(), 'x', lon=0.0, lat=0.0) is None


def test_obtener_peligros_escuela_usa_reader_inyectado_sin_red():
    reader = _ReaderFalso(
        curvas=np.array([[0.3]]),
        return_periods=np.array([1]),
        in_bounds=np.array([True]),
    )
    peligros = obtener_peligros_escuela(lat=-27.0, lon=-58.0, reader=reader)
    assert peligros['peligro_inundacion_pluvial'] is None
    assert peligros['peligro_inundacion_fluvial'] == 0.3
    assert peligros['peligro_viento'] == 0.3
    assert peligros['peligro_calor'] == 0.3


def test_tamano_bloque_por_defecto_es_chico():
    assert TAMANO_BLOQUE_LOTE == 50


class _ReaderFallaIntermitente:
    """Falla las primeras N llamadas y despues responde bien (sin red)."""

    def __init__(self, fallos_iniciales, curvas, return_periods, in_bounds):
        self._fallos_iniciales = fallos_iniciales
        self._llamadas = 0
        self._curvas = curvas
        self._return_periods = return_periods
        self._in_bounds = in_bounds

    def get_curves(self, path, longitudes, latitudes, interpolation='floor'):
        self._llamadas += 1
        if self._llamadas <= self._fallos_iniciales:
            raise ConnectionError('bucket S3 degradado')
        return self._curvas, self._in_bounds, self._return_periods, 'default'


class _ReaderSiempreRoto:
    def __init__(self):
        self._llamadas = 0

    def get_curves(self, path, longitudes, latitudes, interpolation='floor'):
        self._llamadas += 1
        raise ConnectionError('bucket S3 caido')


def test_leer_peligro_lote_reintenta_y_termina_con_datos(monkeypatch):
    monkeypatch.setattr('time.sleep', lambda *_: None)
    reader = _ReaderFallaIntermitente(
        fallos_iniciales=MAX_INTENTOS_POR_BLOQUE - 1,
        curvas=np.array([[0.0, 7.0, 9.0], [0.0, 8.0, 9.0]]),
        return_periods=np.array([10, 100, 500]),
        in_bounds=np.array([True, True]),
    )
    resultado = leer_peligro_lote(reader, 'cualquier/path', lons=[-58.8, -58.9], lats=[-27.4, -27.5])
    assert resultado == [7.0, 8.0]
    assert reader._llamadas == MAX_INTENTOS_POR_BLOQUE


def test_leer_peligro_lote_agota_reintentos_y_cae_a_none(monkeypatch):
    sleeps = []
    monkeypatch.setattr('time.sleep', lambda s: sleeps.append(s))
    reader = _ReaderSiempreRoto()
    resultado = leer_peligro_lote(reader, 'cualquier/path', lons=[-58.8, -58.9], lats=[-27.4, -27.5])
    assert resultado == [None, None]
    assert reader._llamadas == MAX_INTENTOS_POR_BLOQUE
    # Backoff exponencial corto entre intentos: 1s y 2s para 3 intentos.
    assert sleeps == [1.0, 2.0]


def test_reader_inyectado_no_crea_store_cacheado(monkeypatch):
    def _no_debe_crearse(*args, **kwargs):
        raise AssertionError('no debe crearse store cacheado si hay reader inyectado')

    monkeypatch.setattr(
        'geo_static.physrisk_susceptibilidad._crear_store_cacheado', _no_debe_crearse
    )
    reader = _ReaderFalso(
        curvas=np.array([[0.3]]),
        return_periods=np.array([1]),
        in_bounds=np.array([True]),
    )
    peligros = obtener_peligros_escuela(lat=-27.0, lon=-58.0, reader=reader)
    assert peligros['peligro_viento'] == 0.3
    assert leer_peligro_lote(reader, 'cualquier/path', lons=[-58.8], lats=[-27.4]) == [0.3]


def test_crear_reader_usa_store_inyectado_sin_crear_cacheado(monkeypatch):
    def _no_debe_crearse(*args, **kwargs):
        raise AssertionError('no debe crearse store cacheado si se inyecta un store')

    monkeypatch.setattr(
        'geo_static.physrisk_susceptibilidad._crear_store_cacheado', _no_debe_crearse
    )
    capturado = {}

    class _ZarrReaderFalso:
        def __init__(self, store):
            capturado['store'] = store

    monkeypatch.setattr('physrisk.data.zarr_reader.ZarrReader', _ZarrReaderFalso)

    from geo_static.physrisk_susceptibilidad import _crear_reader

    _crear_reader(store='STORE_INYECTADO')
    assert capturado['store'] == 'STORE_INYECTADO'
