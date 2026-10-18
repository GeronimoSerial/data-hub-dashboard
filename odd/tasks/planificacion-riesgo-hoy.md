# Planificación: riesgo hoy + aislamiento + historial

Locator: `odd/tasks/planificacion-riesgo-hoy.md` · Engram: `odd/planificacion-riesgo-hoy/tasks`
Branch: `feat/planificacion-riesgo-hoy` (worktree `planificacion-v2`, from `origin/main` 11bef2e2)

## Objective
Restructure the Planificación tab of `/mapas/infraestructura` into three clear sections:
**Riesgo hoy** (engine v0.4 forecast), **Aislamiento**, **Historial**. Remove the `inundacion` view.

## Why
The tab mixed structural views with no live forecast; engine risk only showed inside Radar (behind `riskRadarEnabled`).
Prod check (2026-10-18, read-only): aislamiento ~2,000 schools evaluated / ~430 medio-alto; susceptibilidad
clase_rio only 145 schools (superseded by engine); `infra_parte` has 1 row — historial loads this week, empty list is expected.

## Scope / constraints
- Extract the inline risk block of `components/mapas/panel-radar.tsx:104-167` into a reusable `EscuelasEnRiesgo`; Radar keeps using it.
- Planificación sub-tabs: `riesgo` (default) | `aisladas` | `historial`. Riesgo has its own horizon selector.
- `useRadar` also fetches when Planificación is active; Riesgo hoy does not depend on `riskRadarEnabled`.
- Map colours and legend follow the active sub-tab (riesgo → engine level colours).
- Historial empty state must read clearly (no data yet), not as an error.
- Old URL/state values `inundacion` map to `riesgo`.
- Delivery strategy: ask-on-risk; forecast ~350 authored lines.

## Tasks
- [x] T1 Extract `EscuelasEnRiesgo` from PanelRadar (no behaviour change) — route: delegated — `c08ca2b9`
- [x] T2 Planificación sub-tabs riesgo/aisladas/historial, drop inundacion, fetch + horizon, map colours/legend, empty historial — route: delegated — `ed0d6a06`
- [x] T3 Checks: typecheck, lint, affected tests
- [x] T4 Aislamiento section redesign: per-school detail (km + destination locality name, km unpaved, fords without bridge, no alternative), summary, sort, "¿Cómo funciona?" tooltip → Metodología aislamiento section. No dates in copy. Note: `distancia_cabecera_departamental_m` is actually routed distance to nearest urban locality (2,000+ hab., 51 towns); destination name lives in `infra_acceso_osm_geometria.destino_nombre` (prod check 2026-10-18: distances match for 1,989 schools) — route: delegated

## Checks
`pnpm typecheck`, `pnpm lint`, vitest on `components/mapas` and `lib/infraestructura/mapa`.

## Progress
- T1 `c08ca2b9`: `components/mapas/escuelas-en-riesgo.tsx` holds the risk block; PanelRadar renders it unchanged (panel-radar tests 19/19).
- T2 `ed0d6a06`: vistas `riesgo` (default) | `aisladas` (label "Aislamiento") | `historial`. `parsearVistaPlanificacion` maps legacy `inundacion` → `riesgo` for URL and snapshot; snapshot fallback and the URL default-omission now use `riesgo`. Horizon UI shared via `components/mapas/selector-horizonte-motor.tsx` (Radar + Riesgo hoy). `useRadar` is enabled whenever Planificación is active; Riesgo hoy colours points with `coloresRadar` and the legend reuses the radar scale at the selected horizon; the overlay "escuelas en riesgo" layer is suppressed there to avoid double drawing. Junto-laguna planning logic and legend entry removed (`COLOR_JUNTO_LAGUNA` kept: still used by `capa-puntos-nivel`). Historial empty list reads "Todavía no hay situaciones registradas para estos filtros.". Ficha planning rows list only structural views (`VISTAS_ESTRUCTURALES`).
- Test-first: RED observed for planificacion, estado-retorno, panel-planificacion and leyenda tests before implementation; map-page integration tests were adapted after implementation.
- T4 `50c312a3`: `AislamientoEscuelaMapa` gains optional `distanciaLocalidadM`, `kmSinPavimentar`, `distanciaViaPavimentadaM`, `destinoNombre` (destino = latest `version_job` per cue from `infra_acceso_osm_geometria`, column-limited select, degrades to null on failure). New `components/mapas/escuelas-aisladas.tsx` + pure helpers `lib/infraestructura/mapa/escuelas-aisladas.ts` (detail line, sort distancia/tierra/vados, summary). "¿Cómo funciona?" is a base-ui Popover (hover/focus/click) linking `#metodologia/metodologia-aislamiento`; Metodología gains that anchor block with the 0–3 rules and the "localidad cabecera" wording fixed. Test-first: RED observed for territorio-mapa, escuelas-aisladas and panel-planificacion tests.

## Verification (2026-10-18)
- T4: `tsc --noEmit -p .` pass; `eslint components/mapas lib/infraestructura app/(hub)/mapas` 0 errors, 13 warnings; `vitest run components/mapas lib/infraestructura/mapa lib/infraestructura/territorio-mapa.test.ts app/(hub)/mapas` 69 files / 720 tests passed. Full `lib/infraestructura` run hit 5 s timeouts in unrelated DB/crypto tests under load (impacto, rotacion-clave pass in isolation).
- `tsc --noEmit -p .`: pass (pnpm wrapper fails its deps-status check with the symlinked node_modules; binaries run directly).
- `eslint .`: 0 errors, 17 warnings (pre-existing kinds: unused vars, exhaustive-deps, import() types).
- `vitest run components/mapas lib/infraestructura/mapa`: 64 files, 663 tests passed.

## Next step
Native review / PR decision by the user (not pushed).
