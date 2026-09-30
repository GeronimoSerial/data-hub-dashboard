# Exactitud geográfica de accesos (posiciones, aislamiento, rutas, cruces)

Locator: `odd/tasks/enos-exactitud-geo.md` · Engram mirror: `odd/enos-exactitud-geo/tasks` (mirrored via `engram save`, #4864, refreshed at close)
Branch: `feat/enos-exactitud-geo` (worktree `~/orca/workspaces/data-hub-dashboard/enos-exactitud-geo`), base `1f00b0a` (feat/enos-mapa-accesos).
Dispatch: N2 task_1e8e3bbdd503 (resumed after Orca restart; earlier N2 outputs adopted). No push, no PR.

## Objective
Audit and correct the accuracy of school positions, the OSM isolation index, the school -> department-seat routes and the
water crossings, for the 2001 schools with coordinates. Every "no route" case gets a verifiable reason.

## Problem / evidence (before)
- 16 schools have `sin_conexion_red`; ALL have a nearest road node > 5 km away in the pyrosm `driving` graph.
- pyrosm `driving_filter` excludes `highway=track` and `service` (verified in `pyrosm.config.osm_filters`), but rural access roads in
  Corrientes are mostly tracks; the user sees them on the base map. Rebuilt graph with tracks+service: 273k -> 443k nodes, 590k -> 940k
  edges (154,546 track + 26,087 service ways-segments); 8 of the 16 then snap at 21-2,217 m.
- "Cabecera" is the centroid of the schools of the locality with most schools, not the seat: Santo Tomé 55.5 km off (Gobernador
  Virasoro), General Paz 43.1, Concepción 27.4 (Santa Rosa), General Alvear 23.2, San Cosme 7.8, San Martín 7.7, Lavalle 8.2,
  Ituzaingó 5.3, Capital 3.0; a wrong padrón coordinate also drags the centroid (General Alvear spread 259 km).
- 7 padrón coordinates fall 3.9-307 km outside their own department polygon (point-in-polygon vs
  `public/data/departamentos-corrientes-georef-2026-09-27.geojson`); four of them share the same longitude -59.4571363 (placeholder
  artifact). They currently get an index (e.g. 1800303-00 index 3) computed at a wrong place.
- Route geometry is NOT truncated: geometry length / `distancia_cabecera_departamental_m` = 0.99998-1.0000 for all 1985 routes
  (`inv_rutas_baseline.json`).

## Constraints
- Real, versioned data only; source + attribution kept (OSM ODbL, Georef); index level semantics 0-3 unchanged; never mix with
  current situation nor physrisk; never invent straight lines or routes through unconnected ways; never relocate a school without
  verification (flag it instead).
- Do not edit UI/copy components (`components/**`), the `enos-mapa-accesos` worktree or the main checkout. No push/PR.
- N2 does not edit source; every code edit goes through N3 (`opencode run`). PBF/pickles never enter git.

## TDD
Mode: off (no project/session TDD config, not chosen by the user; same as `mapa-accesos-territoriales`). Tests ship with behavior.
Runners: `cd services/geo-static && uv run pytest`; TS (only if touched): `pnpm vitest run <files>`, `pnpm lint`,
`pnpm exec tsc --noEmit`, `pnpm build`. Heavy steps under `flock ~/.cache/enos-n3/heavy.lock`.

## Delivery
Strategy `ask-on-risk`; N1 integrates. Forecast < 400 authored lines of code + the regenerated data artifacts (generated files
excluded).

## Tasks (route: all delegated to N3 `opencode run`, N2 only audited/verified/documented; mapping trigger: 4+ files)
- [x] T1 Coordinate gate (>2 km outside dept polygon -> `coordenada_fuera_de_departamento`). `28f937e`, pytest 79 passed. 7 CUEs flagged (test on real data).
- [x] T2 Official department seat from `services/geo-static/data/cabeceras_departamentales.json` (Georef, 25/25). `28f937e`.
- [x] T3 Network with `track`+`service` (+ highway whitelist). `e7506d4`, pytest 86.
- [x] T4 Verifiable reasons (`red_vial_no_conectada`, `sin_via_osm_cercana`) + audit CSV `aislamiento_osm_sin_ruta-v2`. `e7506d4`.
- [x] T5 Edge snap (evidence: node-vs-edge p99 425 m, max 935 m). `5a3ad99`; real-graph validation found an orientation bug -> `1f5df6b`.
- [x] T5b Ford nodes + vectorized projections. `480f8f7`; real run logged 0 fords -> fix `550a661` (263 loaded).
- [x] T6 Real runs (2001 schools): v2 in 1301 s, exit 0; before/after table in `docs/ejecucion-enos/ACCESOS/exactitud-geo.md`; `version_job` 2 (`b917094`); artifacts `8eb8f06`; import into isolated PGlite copy 2001/2001 x2.
- [x] T7 physrisk along-route: technically feasible (arrays), 30 arcsec grid (~0.8x0.9 km), not implemented; docs + contract updated.

## Progress / evidence
- 2026-09-29 00:04 worktree created; earlier N2 session (2dd24ff7) ran the baseline audit, Orca lost its terminal; resumed 00:24 by this dispatch.
- Results: index 1985 -> 1989 of 2001; 16 -> 12 without index (7 gate, 3 not connected, 2 no road); snap p99 4214 -> 165 m; 1989 routes with L/D 0.997-1.0015;
  crossings audited against OSM tags at 402 unique points (206 puente, 192 sin evidencia, 4 vado with ford node).
- Tests: `pytest services/geo-static/tests` 115 passed; vitest focused (importer, territorio-mapa, APIs, adapter) 12 files / 71 tests. No TS touched (lint/tsc/build not needed).
- Incident: run 2 OOM-killed by global memory pressure (job 2.4 GB); relaunched with explicit exit file.
- Assessed review tier: not applicable (RDD not enabled by the user; ordinary policy).
- Audit scratch outputs kept in `~/.cache/enos-exactitud/`; `services/geo-static/inv_rutas_baseline.json` (pre-existing untracked baseline) left in place.

## Next step
N1 integration; UI owner to add copy for the 3 new motives (`components/mapas/capas-accesos.tsx` falls back to the generic text).
