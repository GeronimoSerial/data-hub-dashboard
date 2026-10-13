# Mapa: peligro visible

## Objective
Surface hazard outputs that are already computed (climatology, forecast vs threshold, IMERG, GloFAS caudal,
Prefectura heights, ensemble P95/P99) in the selected-school UX of the map. No new data sources.

## Problem / why
`FichaTerritorial` (only consumer of `/api/infraestructura/peligro`) is mounted only in `FichaParteModal`, which
no app code imports. `hidro_lectura` has no read path. `hazard_ensemble_prob` only feeds the engine.
User decision 2026-10-13: freeze new sources; make what exists visible first.

## Scope
- Selected school sidebar (`components/mapas/ficha-escuela-panel.tsx`) gains the hazard sheet and river status.
- Radar-meteo school card gains ensemble P95/P99.
Out: new sources, IMERG climatology migration, push/PR/merge/deploy.

## Constraints
- Missing data renders "Sin dato", never as low risk. Show timestamps / data age. Indices are relative.
- UI copy Spanish; code/comments English. Haiku workers implement; one writer at a time.
- No collision with `mapa-ajustes-pr63.md` F1/F2 (sidebar layout): new content must keep `min-width: 0`, no horizontal scroll.

## Checklist
Re-planned 2026-10-13 after addendum 1 (user): the current flood situation must be visible in the map at a glance.
Map-level layers first, on by default in a "Situación actual" group with legend; per-school items after.
- [x] T1 Mount `FichaTerritorial` in `FichaEscuelaPanel`; delete dead `FichaParteModal`. Route: delegated (Haiku). Commit 41aeeb2.
- [x] T2 Climatology thresholds P90/P95/P99 next to current forecast in `FichaTerritorial`. Route: delegated (Haiku) + parent fix. Commit 13b34e2.
- [x] T3a `ultimaLecturaEstacion` + `GET /api/infraestructura/hidrometria/estado?localidad=`. Route: delegated (Haiku). Commit 2f81da5.
- [x] L1a Stations backend: pure `estadoAltura` (evacuacion/alerta/normal/sin_dato, trend) + `GET /api/infraestructura/hidrometria/estaciones` (21 catalog stations with coords + latest reading). Route: delegated (Haiku). Commit 707f532.
- [x] L1b Stations layer: circle markers colored by state, popup (height, trend, alerta/evacuación, medidaEn), toggle in new "Situación actual" group (default on), legend entry. Route: delegated (Haiku). Commit b7bad62.
- [x] L2a IMERG backend: `GET /api/infraestructura/peligro/observado-grilla?horas=24|72` → 0.1° cell squares with sum(valor) per geometry_ref in window (text ISO timestamps, cast/compare as ISO), coverage = granules present / expected (48 or 144), `parcial` flag below 80 % (labeled partial in UI, never as little rain), latest observation time. No observed-rain climatology exists (`precipitacion_observada_satelital` is not in `hazard_climatology`): exceedance marked "Sin umbral". Route: delegated (Haiku). Commit 1717c39.
- [x] L2b IMERG layer: fill by mm class, "Sin dato" style, 24/72 h switch, legend, default on. Route: delegated (Haiku). Commit 13859ae.
- [x] L3a Events data + loader: copy `eventos.geojson`, `eventos.csv`, `evidencias.csv` from 4c7f4b7 (refreshed registry; plus school-median locality fallback added by parent) into `public/data/eventos-inundaciones/`; pure loader placing locality-level events at locality point (`public/data/localities.geojson`) else department centroid, tagging precision; resolves source URL via evidencias. Route: delegated (Haiku). Commit 2f58661.
- [ ] L2c IMERG 72 h validation: verify against new prod dump `prod-20261013T2313Z-post-imerg.dump` (156 granules 2026-10-10T12:00Z..2026-10-13T17:30Z, 4331 cells); expect Corrientes avg ~13 mm / max ~58 mm (72 h from 2026-10-10T17:30Z) and Misiones/Iguazú up to ~162 mm at cells around -25.9_-54.0; daily domain averages 0.5 / 3.2 / 12.0 / 0.9 mm. Label partial windows as partial. Route: parent + worker.
- [ ] L2d HIGH PRIORITY IMERG ingestion fallback: GES DISC OPeNDAP returns 503 for hours; when OPeNDAP fails (5xx/timeout), download granule HDF5 over HTTPS from CMR `links` with the same Bearer token and read `Grid/precipitation[0][lon][lat]` and `Grid/precipitationQualityIndex` (HDF5 reader for Node, e.g. `h5wasm`, dependency justified). Files: `lib/infraestructura/riesgo/jobs/sync-imerg.ts`, `providers/imerg.ts`, `adaptadores-ingesta/imerg.ts`. Gotchas (reference `/home/gero/.cache/imerg-backfill/backfill.py`, validated 4331/4331): lat 580..640, lon 1189..1259; value = mm/h * 0.5; quality rounded to 3 decimals; skip negative fills; geometry_ref via `celdaDeCoordenada` on 2-decimal coordinate. Tests with small HDF5 fixture or mocked reader; existing tests green. Route: delegated.
- [ ] L2e Ingestion starvation guard: failed granules must not consume the per-run budget forever (cap retries per granule per run, or oldest-missing first). Route: delegated.
- [x] L3b Events layer: markers by precision, popup (fecha, tipo, precisión, confianza, fuente link), default on, legend. Route: delegated (Haiku). Commit bc9bc13.
- [ ] L4 Local run + screenshots: restore `/home/gero/backups/data-hub-dashboard/prod-20261013T2302Z.dump` into a throwaway local Postgres 18 container, uncommitted local env file pointing DATABASE_URL at it, never prod; screenshot map; remove container. Expected states (addendum 2): Paso de los Libres, Ituzaingó, Libertador, Iguazú EVACUACIÓN; Alvear, La Cruz, Bompland, Yapeyú ALERTA. Route: parent + worker.
- [ ] T3b River status section in school sidebar (uses T3a route). As time allows.
- [ ] T4 Ensemble P95/P99 in radar school card. As time allows.
- [ ] T5 Seasonal trend: follow-up only (flag default off, route not flag-gated).

## Acceptance criteria
- Opening the map shows, without clicks: IMERG 24/72 h rain cells, Prefectura stations colored by state, reported events, plus the existing nivel_riesgo choropleth; a legend explains them.
- Missing data renders "Sin dato"; timestamps visible in popups; event precision never finer than the source.
- Replacing the events files in `public/data/eventos-inundaciones/` is enough to refresh the layer.

## Checks
Focused vitest per task; at end `npx tsc --noEmit`, `npm run lint`, relevant vitest suites.

## Progress / evidence
- Addendum 2 (2026-10-13): prod facts; L1a already picks latest per station by `medida_en` desc (707f532).
- Commits: 41aeeb2 (T1), 13b34e2 (T2), 2f81da5 (T3a), 28e1f51 (re-plan), 707f532 (L1a).

## L4 verification (2026-10-13)
- Local throwaway Postgres 18 (`dhd-verif`) restored from `prod-20261013T2313Z-post-imerg.dump`; lib functions run read-only against it:
  - Stations: evacuación = Ituzaingó 4.03, Paso de los Libres 9.33, Iguazú 30.8, Libertador 17.13; alerta = Alvear 10.36, La Cruz 10.32, Yapeyú 9.87, Bompland 9.32; rest normal/rising. Matches addendum 2 and Prefectura's published state.
  - IMERG 24 h: 4331 cells, 0 partial, max 46.3 mm (-28.4_-56.1). 72 h (from 2026-10-10T17:30Z): 4331 cells, 0 partial, max 162 mm at -25.9_-54.0. Matches addendum 3.
  - Events: 25 events → features at station/locality level; Paso de los Libres etc. placed at locality (school median), not department.
- NOT verified: browser screenshots. Creating a local login in the throwaway DB / local auth env was denied by the permission system, and all routes require a session.

## Next step
L2e, then L2d.
