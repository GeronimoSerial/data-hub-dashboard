# normalizar-datos-prod

## Objetivo

Corregir los huecos de datos de la base de producción del sistema de riesgo de
inundación escolar (Corrientes) detectados por las auditorías del 2026-10-18,
sin DDL, sin borrar filas y sin tocar corridas de riesgo, OSM v4 ni usuarios.

## Alcance autorizado

- Escritura en Postgres de producción sólo para los arreglos A–F.
- Prohibido: DDL/migraciones, DELETE, `infra_risk_run`/`infra_risk_snapshot`/
  `infra_risk_factor`, disparar o publicar corridas de riesgo,
  `infra_aislamiento_osm`/`infra_acceso_osm_geometria`, auth/usuarios.
- B y C: ejecutar sólo lo que no cambie la salida operativa del motor v0.3;
  lo demás queda preparado y documentado.

## Protocolo por arreglo

Diagnóstico read-only (`default_transaction_read_only=on`) → plan → backup →
dry run → transacción única → verificación → rollback documentado. Nunca se
ejecutó `migrarDb()` ni scripts que lo llamen (`datasets-infraestructura.mjs`,
`ingestar-geo-static.mjs`, `importar-geo-static.mjs`) contra producción: los
runners importan las funciones del proyecto directamente.

Backups y salidas: `/tmp/claude-1000/-home-gero-orca-workspaces-data-hub-dashboard-refactor/a13c37fd-886c-4e65-a97c-a45b1726f214/scratchpad/datos-prod/{backup,out}/`.

## Checklist

- [x] A. Climatología de caudal: código corregido (`faf21469`) y 24 filas escritas en prod.
- [x] B. Puntos de río: versión nueva guardada SIN publicar (cambia 133 escuelas en v0.3).
- [x] C. Distancia al agua: código corregido (`8abc263e`); CSV preparado, NO importado (cambia 31 escuelas).
- [x] D. IMERG: código corregido (`907c64af`); sin escritura en prod (no hay mezcla hoy; ver abajo).
- [x] E. Referencias Prefectura: no contaminadas; sin cambios.
- [x] F. Otras tablas vacías: reportadas, sin escritura.

## A. Climatología de caudal

- Causa: el bucket diario `open-meteo-free` llega a ~7.990/8.000 unidades por los
  jobs operativos desde 2026-10-13. El job pedía los 8 puntos en un solo lote, todo
  o nada (~2.087 unidades), y nunca completaba (intento 18, `cupo_agotado`).
  Además, un fallo parcial quedaba `completado` y bloqueaba el reintento
  (`lib/infraestructura/riesgo/jobs/calcular-climatologia-caudal.ts`).
- Fix: una llamada por punto, cursor resumable (se omiten los puntos con
  p90/p95/p99 ya guardados), corte ante cupo "sin red" y `fallido` mientras
  quede algún punto pendiente. Tests: 8/8.
- Prod: series GloFAS 2015-2024 bajadas desde esta máquina (no desde la IP de
  producción, por eso sin reservar cupo en `om_cupo_contador`), 3.653 días por
  punto. Luego se corrió `ejecutarCalculoClimatologiaCaudal` con esas series.
  - `hazard_climatology`: 4.770 → 4.794 (+24 `caudal_diario`, versión `caudal-climatologia-v0.1`).
  - `infra_job_run`: 1 fila, intento 19, `completado`.
- Verificación: `obtenerNivelCaudal` devuelve nivel para los 8 puntos (naranja
  en Ituzaingó y en los 3 del Uruguay); `leerCaudalDia` clasifica por percentil.
- Backup: `backup/A-*.json`. Rollback: requiere DELETE (no autorizado), es decir
  `hazard_climatology` con variable `caudal_diario` y versión `caudal-climatologia-v0.1`,
  más restaurar el job-run desde `A-infra_job_run-caudal.json`.

## B. Puntos de río

- Ver `docs/datos/puntos-rio-cauce-2026-10-18.md`.
- Prod: `guardarVersion(..., publicar=false)`. `infra_dataset_version` 67 → 68,
  `infra_dataset_registro` 29.534 → 29.542, `infra_dataset_publicacion` 26 sin
  cambio (puntos-rio sigue en `41de1aaf…`). `infra_geo_rio` sin recalcular (2.005).
- Backup: `backup/B-*.json`. Rollback: no hace falta (versión inerte).

## C. Distancia y altura sobre el agua

- Causa: `RADIO_BUSQUEDA_M = 300` (`services/geo-static/src/geo_static/proximidad_laguna.py`)
  frente a `DISTANCIA_AGUA_MAX_M = 1000` del motor. No faltan teselas: el GSW y el DEM cubren toda la provincia.
- Fix: radio extendido de 1.000 m sólo cuando no hay agua a 300 m;
  `junto_laguna` sin cambios. pytest: 285 ok; falla 1 test preexistente de OSM,
  ajeno a este cambio.
- Preparado: `out/geo-static/inundacion_v2-v1-2026-10-18.csv`. No importado.
- Backup: `backup/C-infra_susceptibilidad_estatica.json`.

## D. IMERG con dos períodos

- Causa: el job guarda cada período (2001-2010, 2001-2014, …) con la misma
  versión. `reducirClimatologiaObservada` (`motor/adaptadores/lluvia.ts`) agrupa
  por versión y se queda con el último valor leído por percentil, que depende del
  orden físico. `nivel.ts` ordena por `periodoHasta` y no está afectado.
- Hoy: 0 de 387 celdas mezcladas (el orden de lectura favorece 2001-2014).
- Fix: versión por período (`climatologia-imerg-v1-<desde>-<hasta>`).
- Sin escritura en prod: el job de prod (código viejo, 04:20 UTC) reescribe las
  filas `v1` con un `calculado_en` más nuevo todos los días, así que una versión
  escrita a mano dejaría de elegirse en menos de un día. Se corrige solo con la
  primera corrida tras el deploy. Fix recomendado en el lector (fuera de
  alcance): agrupar también por período en `lib/infraestructura/riesgo/motor/adaptadores/lluvia.ts`.

## E. Referencias Prefectura

- Serie de 365 días (metadatos de la versión publicada `prefectura-referencias`):
  pocos picos aislados (Itatí −2,6 m, Mocoretá 3,42 m). Filtrarlos mueve
  p10/p50/p90 como máximo 2,5 cm. Empedrado: 1,85/2,62/3,60 m, limpio. Los
  valores 12,44/0,58/12,89 eran de la serie INA, no de Prefectura.

## F. Otras entradas

- `hazard_seasonal_trend` = 0 y `infra_episodio_*` = 0: sin cron en prod.
- ERA5 `climatologia-v1`: 21 celdas (126 filas). La progresiva no avanza
  (0 celdas por día) por el mismo cupo diario de Open-Meteo.
- Sin escritura: requieren cupo de Open-Meteo o decisiones de scheduling.

## Ruta por tarea

| Tarea | Ruta | Motivo |
|---|---|---|
| A, D | inline (writer único delegado) | job y test acotados |
| B, C | inline | análisis y dataset/geo-static |
| E, F | inline | análisis read-only |

## Próximo paso

Deploy de `faf21469` (caudal resumible) y `907c64af` (IMERG por período). Decisión
del motor sobre B y C: publicar la versión de puntos y recalcular
`infra_geo_rio`, e importar el CSV de C.
