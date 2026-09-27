"""Susceptibilidad estatica de largo plazo via physrisk (OS-Climate, Apache-2.0).

Ver docs/ejecucion-enos/G1/evidencia-physrisk.md para la evidencia de que
peligro (fluvial, viento, calor) tiene cobertura real en el bucket S3 anonimo
de OS-Climate y por que `peligro_inundacion_pluvial` queda siempre en None
(no existe dataset publicado en el inventario embebido de physrisk-lib
1.9.24). Escenario usado: historico/baseline de cada dataset (no proyeccion
futura), coherente con "capa estatica", nunca un pronostico.
"""

from __future__ import annotations

import time
from typing import Optional

PERIODO_RETORNO_DEFECTO_ANIOS = 100

# Bloques de escuelas por request a physrisk. Bajo carga sostenida (2001
# escuelas) el bucket publico degrada la conexion; bloques mas chicos bajan la
# presion por request. Es la unica fuente de verdad, no hardcodear en otro lado.
TAMANO_BLOQUE_LOTE = 50

# Reintentos acotados con backoff exponencial corto (1s/2s) por bloque. La
# lectura sigue siendo secuencial a proposito: nunca threads/async paralelos
# contra el bucket.
MAX_INTENTOS_POR_BLOQUE = 3
BACKOFF_BASE_SEGUNDOS = 1.0

# Rutas Zarr reales verificadas en evidencia-physrisk.md (bucket publico
# os-climate-physical-risk, hazard-indicators/hazard.zarr).
_PATH_INUNDACION_FLUVIAL = "inundation/wri/v2/inunriver_historical_000000000WATCH_1980"
# Evidencia real (2026-09-26, store cacheado, lectura efectiva SIN error de
# conexion): los 7 puntos de Corrientes probados (capital, Goya, Paso de los
# Libres, Santo Tome, Curuzu Cuatia, Mercedes, Saladas) devuelven NaN en todos
# los periodos de retorno del dataset WISC historico, con in_bounds=True. Es
# decir, el viento no tiene cobertura de dato para Corrientes en este dataset.
_PATH_VIENTO = "wind/wisc/v1/max_speed_historical_1999/max_speed"
_PATH_CALOR = "chronic_heat/osc/v2/mean_degree_days_v2_above_32c_ACCESS-CM2_historical_2005"


def clasificar_fuente(valor_disponible: bool) -> str:
    return "physrisk" if valor_disponible else "no_disponible"


def construir_fila_escuela(
    cue_anexo,
    peligro_inundacion_fluvial,
    peligro_inundacion_pluvial,
    peligro_viento,
    peligro_calor,
    periodo_retorno_anios,
    version_job,
    fecha_corrida,
) -> dict:
    hay_dato = any(
        v is not None
        for v in [
            peligro_inundacion_fluvial,
            peligro_inundacion_pluvial,
            peligro_viento,
            peligro_calor,
        ]
    )
    return {
        "cue_anexo": cue_anexo,
        "peligro_inundacion_fluvial": peligro_inundacion_fluvial,
        "peligro_inundacion_pluvial": peligro_inundacion_pluvial,
        "peligro_viento": peligro_viento,
        "peligro_calor": peligro_calor,
        "periodo_retorno_anios": periodo_retorno_anios,
        "fuente": clasificar_fuente(hay_dato),
        "version_job": version_job,
        "fecha_corrida": fecha_corrida,
        "licencia": "Apache-2.0, OS-Climate physrisk",
    }


def intentar_leer_peligro(
    reader,
    path: str,
    lon: float,
    lat: float,
    periodo_retorno_anios: int = PERIODO_RETORNO_DEFECTO_ANIOS,
) -> Optional[float]:
    """Lee un valor de peligro para una coordenada desde un ZarrReader ya creado.

    Aislada como funcion propia para poder mockearla en tests sin red. Nunca
    propaga la excepcion: ante cualquier falla de lectura o NaN (gap de
    grilla del dataset en ese punto, visto realmente con el dataset de viento
    en evidencia-physrisk.md) devuelve None.
    """
    import math

    import numpy as np

    try:
        # ZarrReader.get_curves devuelve (curvas, in_bounds, indices, unidades)
        # -- verificado contra la firma real de physrisk-lib instalada, no en
        # el orden (curvas, return_periods, in_bounds, _) que tenia este
        # modulo antes de G1-fix1 (bug real: el chequeo de limites usaba
        # indices en vez de in_bounds, y la seleccion de periodo de retorno
        # comparaba contra el array de in_bounds). Ver docs/ejecucion-enos/G1/
        # registro.md, seccion G1-fix1.
        curvas, in_bounds, indices, _unidades = reader.get_curves(
            path, longitudes=np.array([lon]), latitudes=np.array([lat])
        )
        if not bool(in_bounds[0]):
            return None
        valores = curvas[0]
        if len(indices) == 1:
            valor = float(valores[0])
        else:
            idx = min(
                range(len(indices)),
                key=lambda i: abs(indices[i] - periodo_retorno_anios),
            )
            valor = float(valores[idx])
        if math.isnan(valor):
            return None
        return valor
    except Exception:
        return None


def _leer_bloque_con_reintentos(reader, path, bloque_lons, bloque_lats):
    """get_curves para un bloque, con reintentos acotados y backoff exponencial.

    Devuelve la tupla de get_curves o None si se agotan los intentos. La
    excepcion no se propaga: el llamador decide el fallback (None por escuela).
    """
    import numpy as np

    for intento in range(1, MAX_INTENTOS_POR_BLOQUE + 1):
        try:
            return reader.get_curves(
                path, longitudes=np.array(bloque_lons), latitudes=np.array(bloque_lats)
            )
        except Exception:
            if intento >= MAX_INTENTOS_POR_BLOQUE:
                return None
            time.sleep(BACKOFF_BASE_SEGUNDOS * (2 ** (intento - 1)))
    return None


def leer_peligro_lote(
    reader,
    path: str,
    lons: "list[float]",
    lats: "list[float]",
    periodo_retorno_anios: int = PERIODO_RETORNO_DEFECTO_ANIOS,
) -> "list[Optional[float]]":
    """Version en lote de intentar_leer_peligro: una sola llamada de red para
    N coordenadas (get_curves esta pensado para arrays). Muchisimo mas rapido
    que iterar escuela por escuela (~17s/escuela medido vs. lotes en unos pocos
    segundos, ver docs/ejecucion-enos/G1/registro.md).

    Cada bloque se reintenta de forma secuencial (nunca threads/async) con
    backoff acotado antes de devolver None para ese bloque.
    """
    import math

    import numpy as np

    n = len(lons)
    resultado: list[Optional[float]] = []
    # get_curves se rompe (in_bounds con forma inesperada) para lotes grandes;
    # se trocea en bloques (TAMANO_BLOQUE_LOTE) en vez de mandar las ~2000
    # escuelas juntas.
    for inicio in range(0, n, TAMANO_BLOQUE_LOTE):
        bloque_lons = lons[inicio : inicio + TAMANO_BLOQUE_LOTE]
        bloque_lats = lats[inicio : inicio + TAMANO_BLOQUE_LOTE]
        lectura = _leer_bloque_con_reintentos(reader, path, bloque_lons, bloque_lats)
        if lectura is None:
            resultado.extend([None] * len(bloque_lons))
            continue

        # Mismo orden real de get_curves que en intentar_leer_peligro: ver
        # comentario de G1-fix1 arriba.
        curvas, in_bounds, indices, _unidades = lectura
        if len(indices) == 1:
            idx = 0
        else:
            idx = min(
                range(len(indices)),
                key=lambda i: abs(indices[i] - periodo_retorno_anios),
            )

        for i in range(len(bloque_lons)):
            if i >= len(in_bounds) or not bool(in_bounds[i]):
                resultado.append(None)
                continue
            valor = float(curvas[i][idx])
            resultado.append(None if math.isnan(valor) else valor)
    return resultado


def _crear_store_cacheado(cache_dir: str = ".data/physrisk_cache"):
    """Store zarr anonimo contra el bucket publico, con cache local en disco.

    Usa `filecache` de fsspec: cada fragmento leido de S3 se guarda bajo
    `cache_dir` y las corridas posteriores lo leen de disco sin volver a pedir
    el bloque al bucket. Bajo carga sostenida esto evita disparar de nuevo la
    degradacion de conexion del bucket publico.
    """
    import fsspec

    return fsspec.get_mapper(
        "filecache::s3://os-climate-physical-risk/hazard-indicators/hazard.zarr",
        filecache={"cache_storage": cache_dir},
        s3={"anon": True},
    )


def _crear_reader(store=None):
    from physrisk.data.zarr_reader import ZarrReader

    if store is None:
        store = _crear_store_cacheado()
    return ZarrReader(store=store)


def obtener_peligros_escuela(
    lat: float,
    lon: float,
    periodo_retorno_anios: int = PERIODO_RETORNO_DEFECTO_ANIOS,
    reader=None,
) -> dict:
    """Intenta leer los 4 peligros del contrato para una coordenada de escuela.

    `peligro_inundacion_pluvial` es siempre None (sin dataset disponible, ver
    evidencia). Nunca lanza: una escuela sin dato de red o sin cobertura de
    grilla queda con peligros en None, no crashea el job.
    """
    try:
        r = reader if reader is not None else _crear_reader()
    except Exception:
        return {
            "peligro_inundacion_fluvial": None,
            "peligro_inundacion_pluvial": None,
            "peligro_viento": None,
            "peligro_calor": None,
        }

    return {
        "peligro_inundacion_fluvial": intentar_leer_peligro(
            r, _PATH_INUNDACION_FLUVIAL, lon, lat, periodo_retorno_anios
        ),
        "peligro_inundacion_pluvial": None,
        "peligro_viento": intentar_leer_peligro(
            r, _PATH_VIENTO, lon, lat, periodo_retorno_anios
        ),
        "peligro_calor": intentar_leer_peligro(r, _PATH_CALOR, lon, lat, periodo_retorno_anios),
    }
