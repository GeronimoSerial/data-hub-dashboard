# staging-consume-prod

## Objetivo

Staging y dev comparten la IP de salida con producción. Open-Meteo cuenta el
cupo gratuito por IP (<10.000 llamadas/día) y producción ya lo agota. Los
consumidores (staging, dev) deben replicar desde `hub_prod` los datos que
producen los jobs Open-Meteo de producción en lugar de repetir las llamadas.

## Alcance y restricciones

- Sólo réplica, rol de entorno y scheduling. La reducción de consumo propio de
  producción (dedupe de celdas, 429, timeouts, resume ERA5) la hace otro agente
  en `datos-prod`; no se tocan `cliente-http.ts` ni `cupo-om.ts`.
- Sin migraciones de esquema. Sin operaciones remotas (Coolify, SSH, bases):
  sólo scripts e instrucciones.
- Credenciales sólo por variables de entorno; nunca impresas ni commiteadas.

## Inventario de jobs con APIs externas limitadas

Fuentes: `scripts/jobs.mjs`, `lib/infraestructura/riesgo/jobs/*`,
`docs/ejecucion-enos/OPS1/runbook-scheduler.md` (estado al 2026-10-13),
`scripts/configurar-radar-operacion.py`. Estado de staging/dev no verificado en
los servidores (prohibido acceder); el script `inspeccionar` lo lista.

| Job | API | Tablas | Prod | Staging | Dev |
|---|---|---|---|---|---|
| sync-pronostico-caudal | Open-Meteo `api` (ECMWF) + `flood-api` (GloFAS) | `hazard_forecast` (`open-meteo-ecmwf`, `open-meteo-flood`), `hazard_source_health` | Coolify c/6 h | timer en repo, instalación no verificada | no documentado |
| sync-ensemble | Open-Meteo `ensemble-api` | `hazard_ensemble_prob`, `hazard_source_health` | Coolify c/6 h | timer en repo, no verificado | no documentado |
| sync-seasonal | Open-Meteo `seasonal-api` | `hazard_seasonal_trend`, `hazard_source_health` | no programado | timer en repo, no verificado | no documentado |
| climatologia-precipitacion | Open-Meteo `archive-api` (ERA5) | `hazard_precipitacion_serie` (celdas ERA5), `hazard_climatology` | Coolify diario x3 | timer deshabilitado (cupo compartido) | no documentado |
| climatologia-caudal | Open-Meteo `flood-api` | `hazard_climatology` (caudal) | Coolify diario x3 | timer deshabilitado (cupo compartido) | no documentado |
| sync-radar-meteo / sync-radar-ensemble / verificar-radar-meteo | Open-Meteo | `radar_meteo_*` | Coolify | timers activos hasta ejecutar `radar-operacion.yml` | ídem (réplica radar preparada) |
| sync-imerg / climatologia-imerg | NASA Earthdata (cupo por token, no por IP) | `hazard_observation`, `hazard_climatology` (`climatologia-imerg-*`), `hazard_precipitacion_serie` (`imerg:*`) | Coolify | timer deshabilitado | no documentado |
| sync-smn-alertas | SMN CAP (sin cupo) | — | Coolify | activo | — |
| sync-prefectura-* / sync-synop-lluvia | Prefectura / Ogimet | — | Coolify | réplica Prefectura existente | réplica Prefectura existente |
| calcular-riesgo, situacion-corte, veredicto-* | sin API Open-Meteo (leen tablas hazard) | — | Coolify | — | — |

## Decisiones

- Rol `RIESGO_DATOS_ROL` = `productor` | `consumidor`. Explícito gana; un valor
  inválido es `consumidor` (fail-safe); sin valor, se infiere de `DATABASE_URL`:
  `hub_staging`/`hub_dev` ⇒ `consumidor`, cualquier otro ⇒ `productor`
  (producción sigue igual sin configurar nada).
- Guard en `scripts/jobs.mjs` para los 8 jobs Open-Meteo antes de migrar o
  cargar el módulo: `{ejecutado:false, motivo:'rol_consumidor'}`, exit 0.
- `JOBS_ESPERADOS` marca esos jobs `habilitado:false` en rol consumidor
  (`no_programado`, no alarma).
- Réplica `scripts/replicar-riesgo-om.mjs`, standalone como la del radar (no
  depende de `ENOS_JOBS_ENABLED`). Incremental por marca de agua por partición
  (sólo corridas iguales o más nuevas que la última del destino), upsert por
  clave natural, sin purga, conserva el `id` existente del destino.
- Defensa en profundidad dentro de `cupo-om.ts` queda propuesta (fuera de la
  superficie editable): ver "Siguiente paso".

## Checklist

- [x] T1 Rol de entorno + guard en jobs.mjs + JOBS_ESPERADOS por rol (inline; 3 archivos acoplados, contexto ya cargado).
- [ ] T2 Réplica incremental desde hub_prod con tests PGlite + doc `docs/riesgo-om-replicacion.md`.
- [ ] T3 Ops: retirador systemd, configurador Coolify, workflow manual, runbook, doc `docs/riesgo-om-operacion.md`.

## Evidencia

Ver commits y salidas de verificación al cierre (sección siguiente se actualiza por tarea).

## Rollout (manual, por el usuario)

Ver `docs/riesgo-om-operacion.md`.

## Siguiente paso

Hook propuesto para el agente de `datos-prod` en `reservarCupo` de
`lib/infraestructura/riesgo/providers/cupo-om.ts` (primera línea):
`asegurarProductorOpenMeteo()` de `providers/rol-entorno.ts`, que lanza
`RolConsumidorError` en rol consumidor; cubre llamadas fuera de `jobs.mjs`.
