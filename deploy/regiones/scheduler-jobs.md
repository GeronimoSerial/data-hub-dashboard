# Tareas programadas por región

Lista derivada de `lib/infraestructura/riesgo/jobs-esperados.ts` (habilitado,
rol productor) aplicando la regla de `aplicaJobARegion` (réplica en
`scripts/jobs.mjs`, `aplicaJobARegionDespacho`):

- `sync-prefectura-*` aplica sólo si `fuentesRio` incluye `prefectura`.
- `sync-ina-*` aplica sólo si `fuentesRio` incluye `ina`.
- `sync-ana-*` aplica sólo si `fuentesRio` incluye `ana`.
- `sync-sgb-*` aplica sólo si `fuentesRio` incluye `sgb`.
- `sync-smn-alertas` aplica sólo si `fuentesAlertas` incluye `smn`.
- `sync-inmet-alertas` aplica sólo si `fuentesAlertas` incluye `inmet`.
- `sync-synop-lluvia` aplica sólo si `fuentesLluvia` incluye `synop`.
- `importar-exposicion-rio-dem` aplica sólo si `capasEstaticas` incluye `exposicion-rio-dem`.
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
| sync-inmet-alertas | `9-59/15 * * * *` | no | Excluido por regla (sin `inmet` en `fuentesAlertas`; Corrientes declara `smn`) |
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
| sync-ana-niveis | — | **no** | Excluido por regla (sin `ana` en `fuentesRio`) |
| sync-sgb-niveis | — | **no** | Excluido por regla (sin `sgb` en `fuentesRio`) |

## Manaos (`fuentesRio`: ana, sgb; ver B11 y B12)

| Job | Cron | Aplica | Nota |
|---|---|---|---|
| sync-radar-meteo | `27 3,9,15,21 * * *` | sí | |
| sync-radar-ensemble | `55 3,9,15,21 * * *` | sí | |
| verificar-radar-meteo | `30 11 * * *` | sí | |
| sync-smn-alertas | — | **no** | Excluido por regla (sin `smn` en `fuentesAlertas`; Manaos declara `inmet`) |
| sync-inmet-alertas | `9-59/15 * * * *` | sí | fuentesAlertas: inmet; API no documentada de INMET; pendiente de crear en Coolify |
| sync-imerg | `*/30 * * * *` | sí | Requiere `EARTHDATA_TOKEN` |
| climatologia-imerg | `20 4 * * *` | sí | Requiere `EARTHDATA_TOKEN` |
| calcular-riesgo | `15 2,8,14,20 * * *` | sí | ANA/SGB niveles disponibles desde B12.2, sin exposición de río hasta que haya datos de ribera (B12.4/B14) |
| sync-pronostico-caudal | `0 2,8,14,20 * * *` | sí | Fuentes de caudal de Manaos: B12 |
| sync-ensemble | `5,35 2,8,14,20 * * *` | sí | |
| situacion-corte | `20 * * * *` | sí | |
| sonda-cadena-datos | `41 * * * *` | sí | Sin `sondaTestigos` ni fuente `prefectura`: no consulta Prefectura y publica `completado` con `sinTestigos: 1`; el Centro la muestra como `sin_datos` («no se verificó»), nunca como verificada |
| veredicto-diario | `45 0,6,12,18 * * *` | sí | Requiere `AI_VEREDICTO_ENABLED=true` |
| veredicto-cierre | `30 3 * * *` | sí | |
| sync-synop-lluvia | — | **no** | Excluido por regla (sin `synop` en `fuentesLluvia`; las estaciones SYNOP son de Corrientes) |
| importar-exposicion-rio-dem | `50 7 * * *` | sí | Capa DEM FABDEM de Manaos. Antes de la primera corrida: `descargar_fuentes_inundacion --region manaos` (en `.data/manaos`) y `calcular_exposicion_rio_dem --region manaos` |
| sync-prefectura-alturas | — | **no** | Excluido por regla (sin `prefectura`) |
| sync-prefectura-historico | — | **no** | Excluido por regla |
| sync-ina-serie-diaria | — | **no** | Excluido por regla (sin `ina`) |
| sync-ina-pronostico | — | **no** | Excluido por regla |
| sync-ana-niveis | `12 * * * *` | sí | fuentesRio: ana; ventana de 48 h por estación telemétrica; pendiente de crear en Coolify |
| sync-sgb-niveis | `27 * * * *` | sí | fuentesRio: sgb; SACE entrega ≈ 30 días de lecturas cada 15 min; pendiente de crear en Coolify |

Los jobs de ANA, SGB e INMET ya existen en el código: los de niveles del río de
Manaos (ANA y SGB) y `sync-inmet-alertas` (avisos de INMET, `fuentesAlertas`)
figuran arriba; sus tareas en Coolify están pendientes de crear.

## Fuera del scheduler (ambas regiones)

| Job | Motivo |
|---|---|
| climatologia-caudal, climatologia-precipitacion | Sólo corrida manual. Cuota Open-Meteo (runbook de producción) |
| episodios-derivados, sync-seasonal | `habilitado: false` (pendiente P-5) |
| importar-altimetria-v04 | `habilitado: false` |

Los jobs de Open-Meteo no corren con `RIESGO_DATOS_ROL=consumidor`
(`JOBS_OPEN_METEO`, `lib/infraestructura/riesgo/providers/rol-entorno.ts`).
