# Cuota Open-Meteo (paquete del 2026-10-18)

Producción usaba entre 7.990 y 7.998 de las 8.000 unidades diarias que permite la
guarda interna (`lib/infraestructura/riesgo/providers/cupo-om.ts`, 80% del techo
gratuito de 10.000). El paquete baja el consumo a unas 4.670 unidades por día y,
además, completa el ensemble para las 387 celdas.

## Consumo por job

Unidades por día de la guarda interna (`om_cupo_contador`, bucket `open-meteo-free`).
Una unidad = una ubicación × max(1, variables/10) × max(1, días/14).

| Job | Antes | Después | Qué cambia |
|---|---:|---:|---|
| sync-ensemble | 2.724 | 2.652 | 130 puntos de grilla en vez de 387 celdas; sin reintentos de 429; peso real de 51 miembros |
| sync-pronostico-caudal | ~2.020 | ~552 | 130 puntos ECMWF + 8 de río por corrida; sin reintentos por timeout |
| sync-radar-meteo | 1.912 | 956 | 4 corridas por día en vez de 8 (239 por corrida) |
| sync-radar-ensemble | 510 | 510 | sin cambios |
| climatologia-precipitacion (ERA5) | ~824 (el sobrante) | 0 | fuera del scheduler |
| climatologia-caudal | 0 (completa) | 0 | fuera del scheduler |
| **Total** | **~7.990** | **~4.670** | quedan ~3.330 de margen sobre 8.000 |

El ensemble casi no cambia en la guarda interna, pero sí en Open-Meteo: antes la
guarda contaba 1 variable por ubicación y Open-Meteo cuenta los 51 miembros. El
consumo real del ensemble era de unas 1.224 unidades por corrida sólo en las 240
celdas que llegaban (~4.900 por día), por encima de lo que mostraba la guarda.
Ahora la guarda y Open-Meteo cuentan lo mismo: 130 × 5,1 = 663 por corrida.

## Estimación por cambio

| Cambio | Unidades por día | Cálculo |
|---|---:|---|
| C1. Un request por punto de grilla (ECMWF) | −1.028 | (387 − 130) × 4 corridas |
| C1. Un request por punto de grilla (ensemble) | −1.028 | (387 − 130) × 4, con el peso anterior de 1 |
| C2. 429 sin reintento | −1.176 | 294 unidades quemadas por corrida × 4 |
| C2. Peso real del ensemble (51 miembros) | +2.132 | 130 × 4,1 × 4. Corrige la contabilidad, no agrega llamadas |
| C3. radar-meteo cada 6 h | −956 | 239 × 4 corridas menos |
| C4. Timeout de 30 s | −440 | reintentos por timeout de sync-pronostico-caudal (~110 por corrida) |
| C6. Sin climatologías programadas | −824 | sobrante diario que consumía ERA5 |
| **Neto** | **−3.320** | |

## Qué cambió en el código

- **C1:** `providers/grilla-modelo.ts`. Las celdas de 0,1° caen en 130 puntos de la
  grilla de 0,25° de ECMWF IFS. Se pide un representante por punto y su serie se
  copia a cada celda. En el ensemble, la copia se hace antes de calcular
  probabilidades: cada celda usa su propio umbral. La regla (punto más cercano, con
  2 excepciones junto a Yacyretá) se verificó con respuestas reales del 2026-10-18,
  guardadas en `providers/__fixtures__/grilla-ifs025-celdas-prod-2026-10-18.json`.
  Si la respuesta trae otro punto, las demás celdas de ese punto se piden por
  separado.
- **C2:** con guarda de cupo, un 429 pone la cuenta en cooldown (`Retry-After` o
  60 s) y no se reintenta. Los lotes que faltan se cortan sin gastar cupo.
  `sync-ensemble` espera 12,75 s entre tandas y, si quedan celdas sin dato, termina
  `fallido` con `cobertura_parcial`. Al reintentarlo en el mismo bloque, pide sólo
  las celdas que no tienen filas.
- **C3:** `sync-radar-meteo` corre con `27 3,9,15,21 * * *`. La salud
  `open-meteo-radar` pasa a un TTL de 420 min.
- **C4:** los requests de ECMWF y del ensemble esperan hasta 30 s.
- **C6:** `climatologia-precipitacion` (ERA5) y `climatologia-caudal` salen del
  scheduler. El código queda para corridas manuales.

## Datos

- Las filas de `hazard_ensemble_prob` y `hazard_forecast` mantienen su forma.
  Precipitación, CAPE, ráfagas, viento y miembros del ensemble son idénticos a pedir
  cada celda por separado.
- La temperatura de `hazard_forecast` es la del representante. Open-Meteo corrige la
  temperatura por la elevación de cada coordenada, así que la diferencia entre
  celdas del mismo punto llega a 0,1 °C. Hoy ningún lector usa `temperatura` de
  `hazard_forecast`.
- El ensemble pasa de 240 a 387 celdas con dato por corrida (de 720 a 1.161 filas).
- Umbrales del motor: IMERG (`climatologia-imerg-v1`) está completo para las 387
  celdas, así que no depende de ERA5. ERA5 sólo se usaría para una celda sin IMERG
  completo; hoy hay 21 celdas con ERA5 de respaldo.

## Cambios en Coolify (producción)

Los hace una persona en "Scheduled Tasks" de la aplicación de producción:

| Tarea | Antes | Después |
|---|---|---|
| sync-radar-meteo | `27 */3 * * *` | `27 3,9,15,21 * * *` |
| climatologia-precipitacion | `43 21-23 * * *` | deshabilitar o borrar |
| climatologia-caudal | `41 21-23 * * *` | deshabilitar o borrar |
| sync-ensemble (opcional) | `5 2,8,14,20 * * *` | `5,35 2,8,14,20 * * *`; la de `:35` no gasta cupo si la de `:05` completó |

## Verificación después del deploy

- `infra_job_run` de `sync-hazard-ensemble`: `completado`, `filas` = 1.161, `llamadas` = 7.
- `infra_job_run` de `sync-hazard-pronostico-caudal`: `llamadas` ≈ 14 (6 ECMWF + 8 de río; antes 24).
- `hazard_source_health` `open-meteo-ensemble`: `ok`.
- `om_cupo_contador` del día: ~4.700 al cierre del primer día completo.
