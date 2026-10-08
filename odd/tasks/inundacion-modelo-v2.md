# Flood model v2 (JRC 90 m + surface water + DEM)

Locator: `odd/tasks/inundacion-modelo-v2.md` · Engram mirror: `odd/inundacion-modelo-v2/tasks`
Branch: `feat/inundacion-modelo` (worktree `~/orca/workspaces/data-hub-dashboard/inundacion-modelo`), base `c90852d`.
Status: PLAN — not started. No push, no PR without user decision.

## Objective
Make the per-school flood tag reflect real physical exposure, and stop showing flood risk where the
school is physically safe (height, city position) or showing "Bajo" where it is clearly exposed (lagoon).

## Problem / why
Current model (v1) uses a single variable:
- WRI Aqueduct riverine depth (`inunriver_historical_000000000WATCH_1980`), return period 100 years,
  30 arcsec grid (~1 km cell), read at the school point via physrisk
  (`services/geo-static/src/geo_static/physrisk_susceptibilidad.py`).
- Pluvial is always `None`; no DEM, no defenses, no lagoons/wetlands, no building data.
- UI thresholds (`lib/mapas/accesos-capas.ts` `claseInundacion`): `>0` baja, `>=0.5` media, `>=1` alta.
- `lib/infraestructura/mapa/acceso.ts:88` maps route state `sin_profundidad` (value 0) to "Bajo":
  "not modeled" is shown as "low risk".
- 2026 CSV: 67/2001 schools with depth > 0 (16 baja, 20 media, 31 alta).
- Route exposure (`exposicion_ruta.py`) uses the same ~1 km WRI grid, so route risk inherits the same
  false positives.

Control cases (must be verified on every run):
| CUE | School | v1 result | Reality | v2 expectation |
|---|---|---|---|---|
| `1801164-00` | Inst. Nuestra Señora de la Misericordia, Capital (-27.463806, -58.842318) | 2.91 m (alta) | Does not flood (city position, infrastructure) | Not "Alto"; ideally "Sin riesgo" |
| `1801166-00` | Escuela Nº 422 "Dr. Hugo Gauna", Santa Ana (-27.4312952, -58.6235203) | 0.0 m → "Bajo" | Next to a lagoon, floods with small rises | "Junto a laguna" = yes |

Root causes: (1) ~1 km cell swallows the Paraná floodplain next to the city; (2) the dataset is
river-only, lagoons do not exist for it; (3) value 0 rendered as "Bajo".

## Scope
- New offline job computing river hazard per return period (JRC 90 m) and lagoon/wetland proximity
  (JRC Global Surface Water + Copernicus DEM).
- Route exposure migrated to JRC 90 m with per-return-period classification (included: it removes the
  same 1 km false positives on routes and makes school and route speak the same scale).
- DB migration, import script, UI tags, methodology tab/FAQ.

Out of scope: pluvial modeling, calibration with partes (future; partes validate forward, they do not
correct the current picture), manual overrides.

## Constraints
- UI: flood stays in its own isolated section. Only bare tags; no explanatory phrases, no percentages
  in the review view. All methodology goes to a separate tab or FAQ.
- "Sin dato" is never rendered as "Bajo" or as "Sin riesgo".
- No new manual input: the only manual input in ENOS is the parte.
- Data sources are downloaded once, clipped to Corrientes, cached under `services/geo-static/.data/`
  (gitignored); jobs never re-download on each run. Raw rasters never enter git.
- Remote downloads require explicit user authorization (destination + operation) before T1 runs.
- It is a static historical hazard indicator, never a forecast.

## Data sources
| Source | Use | Resolution | License |
|---|---|---|---|
| JRC Global River Flood Hazard Maps v2.1 (CEMS/GloFAS, LISFLOOD-FP) | River depth for RP 10/20/50/75/100/200/500 | 90 m | Unrestricted use |
| JRC Global Surface Water (1984–present) | Observed water occurrence (lagoons, wetlands) | 30 m | Open |
| Copernicus DEM GLO-30 | School elevation vs water elevation | 30 m | Open (Copernicus) |

Known limitation: GLO-30 vertical error in flat vegetated terrain is ~1–3 m; lagoon thresholds are
approximate and calibrated against control cases.
JRC river maps do not model flood defenses; if `1801164-00` is still flagged at 90 m, add a DEM
height check (T3b).

## Final tags (only thing the user sees)
River flood (smallest return period whose depth > threshold at the school point):
| Tag | Rule |
|---|---|
| Alto | Reached by RP 10 |
| Medio | Reached by RP 100 (not RP 10) |
| Bajo | Reached only by RP 500 |
| Sin riesgo | Not reached by RP 500 |
| Sin dato | No coverage / read error |

Lagoon/wetland: separate tag "Junto a laguna" (yes/no), not mixed into the river scale.
Route: same five classes, computed over the route samples (worst class along the route).

## Tasks

### Phase 1 — Data (offline, `services/geo-static`)
- [x] **T1. Source download + local cache.** Script that fetches JRC flood v2.1 (all RPs), JRC GSW
  occurrence and GLO-30 tiles covering Corrientes, clips to the province bbox, stores under `.data/`
  with checksums and provenance. Needs user authorization before running.
- [x] **T2. River hazard per school.** Pure functions: read depth per RP at school point; classify by
  smallest RP with depth > minimum threshold (start at 0.15 m, documented constant). JRC nodata (-9999)
  inside tile coverage means "not flooded at that RP"; Sin dato only outside coverage/read error.
  Job `calcular_inundacion_v2` writes CSV contract v2.
  - [x] T2a pure classification functions + tests · [x] T2b raster point reader + tests · [x] T2c job + real run on control cases
- [x] **T3. Lagoon/wetland proximity.** Within a radius (start 300 m), find GSW pixels with frequent
  occurrence; compute `distancia_agua_m` and `altura_sobre_agua_m` (GLO-30 school − GLO-30 water edge);
  `junto_laguna` when both under thresholds (start 300 m / 2 m, calibrated with control cases).
- [x] **T3b. (Conditional, triggered: 8 CAPITAL riverfront schools alto at 90 m) DEM height check for river class.** Only if `1801164-00` is still flagged:
  compare school elevation against local water surface (flooded pixel terrain + depth).
- [x] **T4. CSV contract v2.** Columns: `cue_anexo`, `clase_rio`, `profundidad_rp10_m` … `profundidad_rp500_m`,
  `junto_laguna`, `distancia_agua_m`, `altura_sobre_agua_m`, `version_job`, `fecha_corrida`, `fuente`, `licencia`.
- Checks: `uv run pytest` (classification, null handling, thresholds); real run asserting both control
  cases; class distribution report v1 vs v2.

### Phase 2 — Route exposure on JRC 90 m
- [x] **T5. Route sampling at 90 m.** `exposicion_ruta.py`: densify step ≤ 90 m (today 400 m over 1 km
  cells), read JRC depth per RP per sample, deduplicate by 90 m pixel.
- [x] **T6. Route classification.** Per route: worst class along the route (same five classes), plus
  count of exposed samples; keep `sin_ruta` / `sin_dato` as no-data (never 0). Bump `VERSION_JOB` to 2.
- Checks: `uv run pytest`; real run on control cases; v1 vs v2 route distribution.

### Phase 3 — DB and import
- [x] **T7. Migration.** Drizzle migration for school flood v2 and route exposure v2 columns;
  update `lib/db/schema.ts`. v1 columns kept until UI switch is verified, then dropped in a follow-up.
- [x] **T8. Import.** `scripts/importar-geo-static.mjs`: zod schema for contract v2 (school + route),
  upsert, tests in `scripts/importar-geo-static.test.ts`.
- Checks: `pnpm vitest run scripts/importar-geo-static.test.ts`, `pnpm exec tsc --noEmit`.

### Phase 4 — UI (isolated flood section)
- [x] **T9. Classification swap.** Replace `claseInundacion` (`lib/mapas/accesos-capas.ts`) with the
  RP-based class; update `lib/infraestructura/mapa/planificacion.ts` and the legend.
- [x] **T10. Route risk.** Rewrite `nivelRiesgo` (`lib/infraestructura/mapa/acceso.ts`) on the route
  class; remove the "0 → Bajo" mapping.
- [ ] **T11. Lagoon tag.** "Junto a laguna" tag in the school card and map, bare label, no explanation.
- [ ] **T12. Methodology tab/FAQ.** Single place explaining sources, return periods, thresholds,
  limitations (no defenses, DEM vertical error, static not forecast).
- Checks: `pnpm vitest run` on touched components, `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build`;
  visual review (desktop) of map + card for both control cases via Claude in Chrome.

### Phase 5 — Later (not in this plan)
- Forward calibration with partes: compare predicted class vs reported floods per season.
- Drop v1 columns and WRI paths once v2 is verified in staging.

## Acceptance criteria
- `1801164-00` is not "Alto".
- `1801166-00` has "Junto a laguna".
- No school or route with no data is shown as "Bajo" or "Sin riesgo".
- Flood section shows only tags; methodology lives only in its tab/FAQ.
- Class distribution v2 reviewed and justified against v1.

## TDD
Mode: not resolved (no project/session config found yet). Tests ship alongside behavior.
Runners: Python `cd services/geo-static && uv run pytest`; TS `pnpm vitest run <files>`, `pnpm lint`,
`pnpm exec tsc --noEmit`, `pnpm build`.

## Delivery
Strategy: `ask-on-risk`, chain = `feature-branch-chain` (user, 2026-10-08). Forecast ~1300 authored lines (Phase 1 ~450, Phase 2 ~250, Phase 3 ~200,
Phase 4 ~400) → exceeds 400; chain strategy to be chosen before the first commit. Natural slices:
Phase 1, Phase 2, Phase 3, Phase 4.

## Execution rules
Each atomic sub-task runs in a fresh Haiku subagent, sized under 100k tokens; orchestrator reviews and
sends fixes to another fresh Haiku.

## Progress
- 2026-10-07: T1 done (route: delegated Haiku, uncommitted). 7 RP rasters + GSW + GLO-30 in `.data/`,
  manifest written, `uv run pytest` 158 passed. Finding: JRC nodata = dry; both control points dry at RP100;
  GSW 0 at both points (lagoon tag must use distance). Santa Ana relies on T3.
- 2026-10-07: analysis done, plan written. Next step: user authorization for T1 downloads.
- 2026-10-08: Phase 1 done (all delegated, fresh Haiku per sub-task, uncommitted). Lagoon metric changed after
  calibration: occ>=25, radius 300 m, altura = p10 DEM within 50 m of school − p10 DEM of water pixels, max 6 m
  (GLO-30 is a DSM; point value inflated by roofs/trees). Result `output/inundacion_v2-v1-2026-10-08.csv`:
  river sin_riesgo 1820 / alto 75 / medio 58 / bajo 48; junto_laguna 131. Controls: 1801164-00 sin_riesgo,
  no lagoon (13.7 m); 1801166-00 junto_laguna (4.88 m). `uv run pytest` 199 passed.
  Pending: sample review of river alto/medio vs v1; chain strategy before first commit.
- 2026-10-08: T3b done. Terrain margin = p10 GLO-30 within 50 m − (p10 GLO-30 of GSW occ>=90 within 2 km + max JRC
  depth there). A RP counts only if depth >= 0.15 and margin < 0; no permanent water nearby → margin None, never
  blocks. Result: alto 48 / medio 61 / bajo 50 / sin_riesgo 1842; CAPITAL alto 0; 1801114-00 bajo. 212 passed.
  Limitation for FAQ: compares GLO-30 vs JRC's own terrain, not an observed flood surface.
- 2026-10-08: T5 done (90 m sampling, 217 passed). T6 first run gave route alto 889/2001 (worst single pixel).
  Variant analysis on 300 routes: user chose C = per-pixel terrain margin + a class needs >= 3 pixels (~270 m).
  Lagoon-cut access (San Cosme 1801166-00) is not captured by JRC: future "route next to lagoon" tag (Phase 5).
  Next: T6c rule C in summary, T6d job integration + full run (~35 min).
- Demo: http://localhost:3210 (systemd unit enos-inundacion-demo, DATA_DIR=.data-demo, v1 data only).
- 2026-10-08: Phase 2 done. Route v2 (rule C + per-pixel margin): alto 677 / medio 75 / bajo 51 / sin_riesgo 1186 /
  sin_ruta 12 (`output/exposicion_ruta_inundacion-v2-2026-10-08.ndjson.gz`, 959 s). Controls: 1801164-00 route
  sin_riesgo; 1801166-00 route sin_riesgo (lagoon access not modelled). 242 passed. Still uncommitted.
- 2026-10-08: local commits d5b1286 (Phase 1) and d5a34f6 (Phase 2) on feat/inundacion-v2-datos. No push/PR yet.
- 2026-10-08: Phase 3 done. T7 ba0c48a (17 nullable columns). T8 importer updates v2 columns by cue_anexo (no row inserts); demo DB imported 2001/2001 both layers; vitest 32 passed, tsc ok.
