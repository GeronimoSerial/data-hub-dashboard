# Tareas programadas por región

Lista derivada de `lib/infraestructura/riesgo/jobs-esperados.ts` (habilitado,
rol productor) aplicando la regla de `aplicaJobARegion` (réplica en
`scripts/jobs.mjs`, `aplicaJobARegionDespacho`):

- `sync-prefectura-*` aplica sólo si `fuentesRio` incluye `prefectura`.
- `sync-ina-*` aplica sólo si `fuentesRio` incluye `ina`.
- Los demás jobs aplican a todas las regiones.

Un job que no aplica sale con código `2` y el mensaje
`job <id> does not apply to region <id>`. No crear esa tarea en la región.

Cron de Coolify tomado del runbook de producción
(`docs/ejecucion-enos/OPS1/runbook-scheduler.md`). "no registrado" = el runbook
no fija cron para ese job. La zona horaria de las expresiones cron no está registrada en el
runbook: confirmarla en la configuración de Coolify de cada despliegue antes de programar.

## Corrientes (`fuentesRio`: prefectura, ina)

| Job | Cron | Aplica | Nota |
|---|---|---|---|
| sync-radar-meteo | `27 3,9,15,21 * * *` | sí | Salvo `RADAR_SYNC_ENABLED=false` |
| sync-radar-ensemble | `55 3,9,15,21 * * *` | sí | Salvo `RADAR_SYNC_ENABLED=false` |
| verificar-radar-meteo | `30 11 * * *` | sí | No escribe `infra_job_run` |
| sync-smn-alertas | `7-59/15 * * * *` | sí | `fuentesAlertas`: smn |
| sync-imerg | `*/30 * * * *` | sí | Requiere `EARTHDATA_TOKEN` |
| climatologia-imerg | `20 4 * * *` | sí | Requiere `EARTHDATA_TOKEN`; timeout 3600 s |
| calcular-riesgo | `15 2,8,14,20 * * *` | sí | |
| sync-pronostico-caudal | `0 2,8,14,20 * * *` | sí | |
| sync-ensemble | `5,35 2,8,14,20 * * *` | sí | |
| situacion-corte | `20 * * * *` | sí | |
| sonda-cadena-datos | `41 * * * *` | sí | Pendiente de crear en Coolify |
| veredicto-diario | `45 0,6,12,18 * * *` | sí | Requiere `AI_VEREDICTO_ENABLED=true`; pendiente de crear |
| veredicto-cierre | `30 3 * * *` | sí | Pendiente de crear |
| sync-synop-lluvia | `23 * * * *` | sí | Evidencia de lluvia medida |
| importar-exposicion-rio-dem | `50 7 * * *` | sí | Usa la capa DEM del río de Corrientes |
| sync-prefectura-alturas | `17 * * * *` | sí | Requiere `ENOS_JOBS_ENABLED` distinto de `false` |
| sync-prefectura-historico | `35 7 * * *` | sí | |
| sync-ina-serie-diaria | `10 6 * * *` | sí | |
| sync-ina-pronostico | `50 1,7,13,19 * * *` | sí | |

## Manaos (`fuentesRio`: sin prefectura ni ina; ver B11 y B12)

| Job | Cron | Aplica | Nota |
|---|---|---|---|
| sync-radar-meteo | `27 3,9,15,21 * * *` | sí | |
| sync-radar-ensemble | `55 3,9,15,21 * * *` | sí | |
| verificar-radar-meteo | `30 11 * * *` | sí | |
| sync-smn-alertas | `7-59/15 * * * *` | **revisar** | Corrientes usa `smn`. Manaos no declara fuente SMN; la regla de aplicabilidad no lo excluye. No programar hasta confirmar que aplica |
| sync-imerg | `*/30 * * * *` | sí | Requiere `EARTHDATA_TOKEN` |
| climatologia-imerg | `20 4 * * *` | sí | Requiere `EARTHDATA_TOKEN` |
| calcular-riesgo | `15 2,8,14,20 * * *` | sí | Sin ANA, SGB ni INMET hasta B12 |
| sync-pronostico-caudal | `0 2,8,14,20 * * *` | sí | Fuentes de caudal de Manaos: B12 |
| sync-ensemble | `5,35 2,8,14,20 * * *` | sí | |
| situacion-corte | `20 * * * *` | sí | |
| sonda-cadena-datos | `41 * * * *` | sí | Verificar su comportamiento sin Prefectura (la comparación omitida hoy es la de consumidor con Prefectura) |
| veredicto-diario | `45 0,6,12,18 * * *` | sí | Requiere `AI_VEREDICTO_ENABLED=true` |
| veredicto-cierre | `30 3 * * *` | sí | |
| sync-synop-lluvia | `23 * * * *` | **revisar** | Confirmar que las estaciones SYNOP configuradas corresponden a Manaos antes de programar |
| importar-exposicion-rio-dem | `50 7 * * *` | **no programar** | La capa DEM es la del río de Corrientes. Sin archivo de Manaos el job sale `fallido` cada día |
| sync-prefectura-alturas | — | **no** | Excluido por regla (sin `prefectura`) |
| sync-prefectura-historico | — | **no** | Excluido por regla |
| sync-ina-serie-diaria | — | **no** | Excluido por regla (sin `ina`) |
| sync-ina-pronostico | — | **no** | Excluido por regla |

Jobs de Manaos que no existen hasta B12 (ANA, SGB, INMET): no aparecen en esta
lista. Agregarlos sólo cuando su proveedor esté registrado y su job en
`jobs-esperados.ts`.

## Fuera del scheduler (ambas regiones)

| Job | Motivo |
|---|---|
| climatologia-caudal, climatologia-precipitacion | Sólo corrida manual. Cuota Open-Meteo (runbook de producción) |
| episodios-derivados, sync-seasonal | `habilitado: false` (pendiente P-5) |
| importar-altimetria-v04 | `habilitado: false` |

Los jobs de Open-Meteo no corren con `RIESGO_DATOS_ROL=consumidor`
(`JOBS_OPEN_METEO`, `lib/infraestructura/riesgo/providers/rol-entorno.ts`).
