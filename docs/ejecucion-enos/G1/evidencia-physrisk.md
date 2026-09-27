# Evidencia: uso de `physrisk` (OS-Climate) en este entorno

Fecha: 2026-09-26.
Entorno: `services/geo-static/` (uv, Python 3.12, `physrisk-lib==1.9.24`).

## Conclusión

**Parcial, pero usable sin credenciales.** `physrisk` accede de forma anónima
(sin claves) al bucket público S3 `os-climate-physical-risk`
(`hazard-indicators/hazard.zarr`, Apache-2.0). No hace falta ningún token ni
cuenta. Cobertura real para Argentina/Corrientes verificada con una consulta
punto a punto:

| Peligro (contrato G1) | Dataset physrisk | Disponible | Evidencia |
|---|---|---|---|
| `peligro_inundacion_fluvial` | `RiverineInundation` (WRI Aqueduct v2, `inunriver_historical_000000000WATCH_1980`) | Sí | curva por período de retorno consultada para (-27.47, -58.83): valores 0.0 en todos los períodos (2 a 1000 años) — punto sin profundidad de inundación estimada, resultado plausible para el centro de la ciudad de Corrientes. |
| `peligro_inundacion_pluvial` | `PluvialInundation` | **No** | La clase existe en el código de physrisk pero el inventario embebido (`EmbeddedInventory().resources`) no trae NINGÚN recurso con `hazard_type == 'PluvialInundation'`. No hay dataset publicado para esta capa en la versión instalada. |
| `peligro_viento` | `Wind` (`wind/wisc/v1/max_speed_historical_1999`) | Parcial | La consulta para el mismo punto devolvió `NaN` en los 7 períodos de retorno (5 a 500 años) — el dataset WISC no tiene cobertura de grilla en ese punto exacto (gap de dato, no error). Existen otras fuentes de viento en el inventario (`jupiter`, `iris`) sólo con escenarios futuros (ssp1xx/ssp5xx), no histórico/estático. |
| `peligro_calor` | `ChronicHeat` (`chronic_heat/osc/v2/..._ACCESS-CM2_historical_2005`) | Sí | valor real devuelto: 279.16 (días-grado por año sobre 32°C, escenario histórico 2005) para el mismo punto. |

## Cómo se verificó (comandos corridos, sin mockear nada)

```python
from physrisk.data.zarr_reader import ZarrReader
store = ZarrReader.create_s3_zarr_store(lambda k, d=None: d or '')  # anon=True
reader = ZarrReader(store=store)
reader.get_curves('inundation/wri/v2/inunriver_historical_000000000WATCH_1980',
                   longitudes=np.array([-58.83]), latitudes=np.array([-27.47]))
# -> curvas [0,0,0,0,0,0,0,0,0], return_periods [2,5,10,25,50,100,250,500,1000], in_bounds [True]
```

Repetido para `wind/wisc/v1/max_speed_historical_1999/max_speed` (NaN) y
`chronic_heat/osc/v2/mean_degree_days_v2_above_32c_ACCESS-CM2_historical_2005`
(valor real).

## Decisión para G1 v1

- Se usan los 3 peligros disponibles (fluvial, viento, calor) vía sus rutas
  Zarr reales listadas arriba, escenario histórico/baseline (no proyección
  futura: coherente con "capa estática", no pronóstico).
- `peligro_inundacion_pluvial` queda **siempre `None`** con `fuente` calculada
  sobre los que sí estén disponibles (ver `physrisk_susceptibilidad.py`,
  `clasificar_fuente`). No bloquea el batch, tal como autorizó N1.
- Cuando `physrisk` devuelve `NaN` (gap de grilla, como en viento en este
  punto) o lanza una excepción de red/lectura, el job registra `None` para
  ese peligro puntual — nunca crashea el job completo por una escuela.
- Período de retorno reportado: 100 años (el mismo valor se usa para
  documentar `periodo_retorno_anios` en el contrato; para `chronic_heat`, que
  no tiene curva por período de retorno, se documenta igual el campo con
  100 como convención de "largo plazo" y se dejará explícito en el CSV que el
  valor es anual, no de retorno, en la próxima iteración de E6).

## No verificado / pendiente

- No se corrió la extracción completa sobre las ~2001 escuelas con
  coordenadas (esto ocurre en la corrida real documentada en
  `docs/ejecucion-enos/G1/registro.md`), sólo un punto de prueba.
- No se auditó si el dataset WRI Aqueduct v2 (2019) sigue siendo la versión
  vigente recomendada por OS-Climate; queda para el refresco anual.
