# Estado de los datos en el Centro de Situación

## Objective
Show, inside the Centro de Situación, the state of every expected batch job and data source so a failure in
production (e.g. `calcular-hazard-climatologia-caudal` failed on 2026-10-17) is visible without opening admin.

## Problem / why
User: "No es aceptable que falten datos en prod. Si la climatología falla debo enterarme." Job failures, stale
Prefectura readings (> 18 h), IMERG coverage and the age of the vigente risk run were only visible in
`/admin/operacion` as raw tables, or not at all.

## Scope
- Pure classifier `lib/infraestructura/riesgo/estado-datos/clasificar.ts`: `ok | atrasado | fallido | sin_datos |
  deshabilitado` with reason, last success, last attempt, short error, age, expected interval.
- Read model `obtenerEstadoDatos()` reusing `obtenerEstadoOperativo()` (salud.ts) plus one query per table.
- `GET /api/infraestructura/situacion` and the page pass `estadoDatos`; same staff guard as the page.
- Compact "Estado de los datos" panel replacing the old raw "Salud de fuentes" list.
Out: schema migrations, alerting/notifications, push/PR/deploy.

## Constraints
- Missing data never shows as OK; a failed last attempt is `fallido` even with an older success.
- Disabled jobs (and `ENOS_JOBS_ENABLED=false`) show `deshabilitado`, not as a problem.
- Spanish UI copy; status = icon + text + color; no native `<select>`; phone width without horizontal scroll.

## Checklist
- [x] T1 Classifier + read model + API + panel + tests (single work unit). Route: delegated writer (one bounded
  worker, 2+ non-trivial files).

## Acceptance criteria
- A failed climatology job appears first, as "Falló", with its sanitized error.
- Panel collapsed when everything is OK, open and highlighted when anything has a problem.
- Prefectura stations older than 18 h (or without reading) are listed by name.

## Checks
`vitest run --maxWorkers=6 lib/infraestructura/riesgo app components`, `tsc --noEmit`, `eslint`.

## Progress / evidence
- RED observed: `clasificar.test.ts` (module missing), situación route test (`estadoDatos` undefined),
  `panel-estado-datos.test.tsx` (module missing), situación client test (panel absent).
- GREEN: `vitest run --maxWorkers=6 lib/infraestructura/riesgo app components` → 238 files, 2242 passed, 20 skipped.
- `tsc --noEmit` → clean. `eslint lib/infraestructura/riesgo app components` → 1 error + 14 warnings, all in
  untouched files (error: `components/mapas/ficha-escuela-pagina.tsx` set-state-in-effect, pre-existing).
- Native review assessment: not run by the writer (parent owns RDD).
- Commit: this work-unit commit (hash reported to the parent).

## Next step
Decide whether jobs without `infra_job_run` trace (`verificar-radar-meteo`) and INA imports need a freshness
signal; consider notifications (e-mail) for `fallido`.
