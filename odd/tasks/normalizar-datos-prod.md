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

## Cuota Open-Meteo

Objetivo: bajar el consumo diario de Open-Meteo (7.990–7.998 de 8.000 desde el
2026-10-13) sin cambiar el scoring ni la forma de los datos persistidos, y
completar el ensemble (sólo 240 de 387 celdas por corrida). Decisión del usuario
del 2026-10-18: usar sólo IMERG y dejar de programar ERA5 (reemplaza el C6
original de reanudar ERA5). Detalle y tabla antes/después:
[docs/datos/cuota-open-meteo.md](../../docs/datos/cuota-open-meteo.md).

- [x] C2. 429 sin reintento: cooldown persistido (`Retry-After` o 60 s), corte de
  lotes, peso del ensemble con 51 miembros, espaciado de lotes — `47840efb`.
- [x] C1. Un request por punto de grilla de 0,25° (ECMWF y ensemble), réplica a
  las celdas antes de calcular probabilidades — `57ad0eb4`.
- [x] C2b. `sync-ensemble` termina `fallido`/`cobertura_parcial` con celdas sin
  dato y reanuda sólo las faltantes; espaciado entre tandas — `c6d36c9d`.
- [x] C4. Timeout de 30 s para ECMWF y ensemble — `e8438ecd`.
- [x] C3. radar-meteo cada 6 h (`27 3,9,15,21`), TTL de salud 420 min — commit de docs/ops de esta sección.
- [x] C6. ERA5 (`climatologia-precipitacion`) y `climatologia-caudal` fuera del
  scheduler en el runbook; código conservado para corridas manuales.
- [ ] C6b. `lib/infraestructura/riesgo/jobs-esperados.ts`: `habilitado: false` para
  las dos climatologías y `intervaloMinutos: 360` para radar-meteo. Fuera de las
  superficies autorizadas de este paquete; pendiente de aprobación.
- [ ] Rollout: deploy y cambios de Coolify (ver abajo).

Evidencia (2026-10-18):

- Prod read-only: ensemble `filas: 720` (240 celdas) y `llamadas: 20` por corrida;
  salud `degradado` con `rate_limited: HTTP 429 en intento 3/3`. IMERG p90/p95/p99
  en 387/387 celdas; ERA5 `climatologia-v1` en 21. radar-meteo `pesoTotal: 239`.
- Open-Meteo público (6 llamadas, fuera del cupo de prod): las 387 celdas caen en
  130 puntos; 385 en el punto más cercano y 2 (`-27.6_-56.4`, `-27.5_-56.6`) en un
  vecino por `cell_selection=land`. Series idénticas por punto salvo
  `temperature_2m` (hasta 0,1 °C, corrección por elevación). Ensemble: 120
  ubicaciones → 200 y 110 más en el mismo minuto → 429 "Minutely API request
  limit exceeded" sin `Retry-After`: Open-Meteo cuenta los 51 miembros.
- Verificación por commit: `vitest run lib/infraestructura/riesgo
  lib/infraestructura/radar-meteo scripts` verde salvo
  `scripts/backup-postgres.test.ts` (falla de entorno previa: falta `podman`);
  `tsc --noEmit` limpio; `eslint` sin errores (1 warning previo en
  `radar-meteo/job-sync.test.ts`).

Uso diario esperado: ~4.670 unidades (ensemble 2.652, pronóstico 552, radar-meteo
956, radar-ensemble 510, climatologías 0).

Rollout:

1. Deploy de la rama a producción.
2. Coolify, Scheduled Tasks de producción: `sync-radar-meteo` `27 */3 * * *` →
   `27 3,9,15,21 * * *`; deshabilitar `climatologia-precipitacion`
   (`43 21-23 * * *`) y `climatologia-caudal` (`41 21-23 * * *`); opcional:
   `sync-ensemble` `5 2,8,14,20 * * *` → `5,35 2,8,14,20 * * *`.
3. Verificar la primera corrida: ensemble `completado` con 1.161 filas y 7
   llamadas; `om_cupo_contador` del día ~4.700.

Riesgos abiertos: una celda nueva junto a agua podría caer en otro punto de
grilla sin que la guarda lo detecte (sólo verifica al representante); la tabla
de excepciones y el fixture se actualizan con una consulta pública. La
temperatura replicada difiere hasta 0,1 °C de la que daría la celda.

Ruta: delegada (writer único), 5 commits.

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
