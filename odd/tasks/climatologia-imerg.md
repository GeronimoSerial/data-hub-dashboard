# Climatología de precipitación desde NASA IMERG Final diario

## Objetivo
Dar umbrales de precipitación diaria (p90/p95/p99, todos los días y días húmedos) a TODAS las
celdas de 0.1° (`infra_geo_profile.geometry_ref`), no sólo a las ~21 que hoy completó ERA5.

## Problema / por qué
La climatología ERA5 (Open-Meteo) avanza por cupo y cubre ~21/387 celdas. Sin umbral, la lluvia
observada/pronosticada casi no pesa (p. ej. 1801318-00, 31.9 mm/72 h sin umbral de celda).

## Decisiones (autónomas, registradas)
- Fuente: `GPM_3IMERGDF` v07 (Final diario, mm/día). Acceso por el **OPeNDAP cloud de Earthdata**
  (`opendap.earthdata.nasa.gov/collections/<concept>/granules/<id>.dap.csv`) con subset del bbox:
  ~18 KB y ~2 s por día (probado 2026-10-13). El gránulo completo pesa ~30 MB (~270 GB para 25
  años), por eso NO se usa la descarga HDF5 ni h5wasm (no se agrega la dependencia).
- Grilla: mismos índices que `providers/imerg.ts` (lon 1189..1259, lat 580..640); celda vía
  `celdaDeCoordenada` del centro de grilla (misma convención que `sync-imerg`).
- Período SIN fechas fijas: desde 2001-01-01 (primer año completo del registro IMERG) hasta el
  31-dic del último año calendario con Final publicado (Final tiene ~3.5 meses de latencia: a partir
  de mayo es `año-1`, antes `año-2`). Cuando cambia el año el job extiende la serie solo.
- Almacenamiento: `hazard_precipitacion_serie` con clave `imerg:<geometryRef>` (sin migración);
  unidad de reanudación = mes; un día cuenta como hecho si alguna celda tiene dato no nulo.
- Escritura: `hazard_climatology` versión `climatologia-imerg-v1`, celda con >= 10 años completos
  (mismo `calcularUmbralesAcumulados` que ERA5). Sólo ventana diaria: el motor compara siempre
  contra `precipitacion_diaria` (nivel.ts / sync-ensemble.ts), no hay umbrales 24/72 h propios.
- Selección explícita (nivel.ts, sync-ensemble.ts): por celda, si la climatología IMERG está
  completa (p90/p95/p99) se usa sólo IMERG; si no, sólo ERA5; nunca se mezclan percentiles.

## Operación permanente
| Job | Despacho | Cadencia | infra_job_run tipo | Salud |
|---|---|---|---|---|
| `climatologia-imerg` | `node scripts/jobs.mjs climatologia-imerg` | diario 04:20 UTC (cron `20 4 * * *`) | `calculo-climatologia-imerg` | `hazard_source_health` provider `nasa-imerg-climatologia`, TTL 2 días |

- Idempotente: lease por fecha UTC; re-procesar un mes hace upsert de las mismas filas.
- Presupuesto por corrida (`IMERG_CLIMATOLOGIA_DIAS_POR_CORRIDA`, default 1200 días ≈ 45 min),
  secuencial (fair use NASA). Al completar el período la corrida es un no-op que sólo recalcula.
- Fallas: un día que falla corta el mes (no se guarda parcial) y la corrida; salud `degradado`
  con error saneado; sin token → `no_disponible` y job `fallido`. Celdas sin IMERG completo usan
  ERA5; sin ninguna climatología el motor sigue con umbral provisorio o `sin_dato` (nunca bajo).
- Monitoreo: `jobs-esperados.ts` (habilitado, 1 día), `cadencias.ts`, panel de salud, contadores
  `diasDescargados`, `diasPendientes`, `celdasConUmbral`, `diasConError`.

## Tareas
- [x] T1 provider puro `providers/climatologia-imerg.ts` (+test) — delegado (Haiku)
- [x] T2 selección de fuente `peligro/fuente-climatologia.ts` (+test) — delegado (Haiku)
- [x] T3 usar la selección en `nivel.ts` y `sync-ensemble.ts` (+tests) — delegado (Haiku)
- [x] T4 job `jobs/calcular-climatologia-imerg.ts` (+test) — delegado (Haiku)
- [x] T5 registro: jobs.mjs(+test), cadencias, jobs-esperados, timer systemd, DEPLOY.md — delegado
- [x] T6 validación local contra copia de prod + estimación de corrida completa

## Checks
`timeout 300 npx vitest run <archivos>`, `npx tsc --noEmit -p .`, `npx eslint <archivos>`.

## Avance
- T1 fdfa753 · T2 32968e0, a8acc09 · T3 722560f, a2c73e2 · T4 de80dae · T5 08ad350 (inline: ediciones mecánicas).
- Checks: vitest de los archivos tocados en verde (provider 13, fuente 7, nivel 57, sync-ensemble 8, job 6, jobs/cadencias/salud 66, metodología 6); `tsc --noEmit` limpio; eslint limpio.
- T6 (copia de prod 2026-10-13T23:13Z, Postgres 18 local): 2001-2002 = 730 días, 754 requests, 0 errores, 1742 s
  (2,4 s/día), 387/387 celdas; job `completado`, salud `ok`. Percentiles IMERG (2 años, indicativos) vs ERA5
  1991-2020 en las 21 celdas: p90 +5..+30 %, p95 +10..+50 %, p99 +15..+55 % (IMERG resuelve mejor los extremos;
  2 años es poca muestra). Celda de 1801318-00 (-27.6_-56.4): p90 18.8 / p95 31.7 / p99 66.3 mm.
- Estimación corrida completa: ~9.130 días × 2,4 s ≈ 6,1 h → ~8 corridas diarias de 1.200 días (~48 min). No se corrió (> 1 h).
- Pendiente (fuera de alcance): push/PR/deploy y crear la Scheduled Task en Coolify.
