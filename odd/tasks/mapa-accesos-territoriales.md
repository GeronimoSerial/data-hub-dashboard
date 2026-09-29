# Mapa de accesos territoriales (physrisk + OSM en /mapas/infraestructura)

Locator: `odd/tasks/mapa-accesos-territoriales.md` · Engram mirror: `odd/mapa-accesos-territoriales/tasks`
Branch: `feat/enos-mapa-accesos` (worktree `~/orca/workspaces/data-hub-dashboard/enos-mapa-accesos`), base `083f569` (feat/renovación).
Dispatch: N2 task_2ebe3c995ebb (N1 integrates after gate). No push, no PR.

## Objective
Show the physrisk static susceptibility and the OSM access isolation per school for the WHOLE padrón on
`/mapas/infraestructura`, and, when a school is selected, draw the real OSM route used by the isolation
calculation plus every water crossing classified as bridge / ford / no evidence.

## Problem / why
- G1 CSVs keep metrics only; the route and crossings existed only in memory inside the job
  (`rutas_cab`, `crucesarista`).
- The map's `riesgo-acceso` layer is built from `dataVisible.partes` (schools with a parte only) and from
  `radarData.escuelas.items`, which is page 1 (50 rows) of a paginated API: most schools never get a point.
- The local OSM extract was missing (verified: no `.pbf`/`.pkl` anywhere on disk).

## Constraints
- Never invent geometry (no straight lines school→cabecera); never change calculation semantics
  (the regenerated CSV must match `aislamiento_osm-v1-2026-09-26.csv`).
- physrisk is a historical/static hazard indicator (return period, unit), never a river/channel nor a forecast.
  Route and crossings are OSM-derived context, never a forecast nor a confirmed building state.
- Respect the map resource ACL (`verificarAccesoLectura`), existing flags (static layers under
  `HAZARD_CONTEXT_ENABLED`, forecast layers keep `RISK_RADAR_ENABLED`), dark mode, lucide icons (no rings).
- Geometry loads on demand per CUE; never all routes up front.
- N2 does not edit source; every code edit goes through N3 (`opencode run`). PBF never enters git.

## Data provenance
- Extract: Geofabrik `south-america/argentina-260926.osm.pbf` (same date as the committed CSV,
  md5 `ddd7a4f8f3184059a647cb261b732f0b`, 431,636,976 bytes), downloaded with N1 authorization to
  `services/geo-static/.data/osm/` (gitignored). `argentina-latest.osm.pbf` is a symlink to it.

## TDD
Mode: off (no project/session TDD config; not chosen by user). Tests ship alongside behavior.
Runners: `pnpm vitest run <files>` (focused), `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build`
(heavy steps under `flock ~/.cache/enos-n3/heavy.lock`); Python: `cd services/geo-static && uv run pytest`.

## Delivery
Strategy: `ask-on-risk`; N1 owns integration. Forecast ~1200 authored lines across tasks (N1 decides slicing;
commits are work units).

## Tasks
- [x] T1 Python export: `osm_aislamiento` collects the exact route (min-length parallel edge geometry) and each
  deduplicated crossing (same loop/dedupe as the metrics) with class `puente|vado|sin_evidencia`; job writes
  `output/accesos_osm_geometria-v1-<fecha>.ndjson.gz`. Metrics untouched. Tests in `tests/test_osm_aislamiento.py`.
  Route: delegated (N3). 
- [x] T2 Persistence: table `infra_acceso_osm_geometria` + drizzle migration + importer `--geometria` + test.
  Route: delegated (N3).
- [x] T3 APIs: `GET /api/mapas/infraestructura/territorio` (compact static layers for all padrón) and
  `GET /api/mapas/infraestructura/accesos/[cueAnexo]/geometria` (GeoJSON, 200 `disponible:false` when absent).
  ACL `verificarAccesoLectura`. Tests. Route: delegated (N3).
- [x] T4 Radar coverage (API part; map wiring in T5a): radar API returns compact `puntos` for the whole filtered universe; map point layers use
  `puntos` + padrón coordinates instead of page 1 + partes. Tests. Route: delegated (N3).
- [x] T5 UI, split into N3 briefs (all delegated, map page edits serialized):
  - [x] T5a map page uses radar `puntos` + padrón coordinates (fix coverage).
  - [x] T5b pure builders/icons `lib/mapas/accesos-capas.ts` + hooks `use-territorio-mapa`, `use-geometria-acceso`.
  - [x] T5c1 `components/mapas/capas-accesos.tsx` (layers + legend) + `AccesosLayerControl`.
  - [x] T5d ficha section `ficha-acceso-territorial.tsx` + `FichaParteModal.accesoTerritorial`.
  - [x] T5c2 map page wiring (gated by HAZARD_CONTEXT_ENABLED, never in Replay).
- [x] T6 Real run: regenerate CSV + geometry from the extract, verify CSV equality, import into demo DB, inspect a
  school with crossings on the map.
- [x] T7 Docs: G1 contract + registro update (provenance, cost, limitations).

## Progress / evidence
- Resumed 2026-09-28 22:20 after Orca restart (N1 msg). PBF resumed from 81 MB; completed 431,636,976 bytes,
  md5 `ddd7a4f8f3184059a647cb261b732f0b` (matches). Symlink `argentina-latest.osm.pbf` created (gitignored).
- T1 `fec7485` (N3; pytest geo-static 61 passed, spot-checked by N2). Metrics loop untouched; crossings exported in the
  same loop/dedupe; route uses min-length parallel edge real geometry.
- T2 `ab9bf73` (N3; vitest importer 16 passed, re-run by N2). Migration 0003 creates only `infra_acceso_osm_geometria`.
- T3 `d3839cc`, T4 `8ce2fe7` (N3; 35 tests passed, re-run by N2). ACL `verificarAccesoLectura` first in both new routes.
- T6 real job running since 22:34 (`systemd-run` unit `enos-job-aislamiento`, heavy lock, log
  `~/.cache/enos-n3/accesos/job-aislamiento.log`).

- T5a `02bc2b1`, T5b `61225e1`, T5c1 `3cc70f7`, T5d `4fc39a2`, T5c2 `dfe9cce`, T8 attribution fix `a8d6060` (all N3,
  focused vitest re-run by N2). `pnpm lint` 0, `tsc --noEmit` 0, `pnpm build` 0.
- T6 `ea711ce`: job 1528.7 s, 2001 rows, 1985 with route, crossings 1645 puente / 6 vado / 1373 sin_evidencia, 0 mismatches
  vs CSV counts. The regenerated CSV differs from the old committed one in 26 rows (index unchanged); the ORIGINAL code
  (083f569) on the same extract gives a byte-identical CSV (`cmp`), so the old CSV was stale, not a semantic change.
  Demo `enos-accesos-3206` (isolated PGlite copy `~/orca/demo-data/enos-accesos`): imports 2001/2001 ×3, map shows static
  layers for the padrón and route+crossings for 1800072-00 (25 crossings: 8 puente, 17 sin evidencia); screenshot
  `~/orca/demo-data/enos-accesos/captura-ruta-1800072-00.jpeg`.
- T7 `73ebfa2`: contrato Archivo 3 + `docs/ejecucion-enos/ACCESOS/registro.md`.
- Full vitest: first run hit the 580 s wrapper under load (4 DB files timed out at 5 s); those 4 files pass alone (16/16).

## Next step
N1 gate/integration. Limitations: 4 padrón schools without location are not in the legend counts; physrisk depth > 0 only
for 67 schools; route starts at snapped road node.
