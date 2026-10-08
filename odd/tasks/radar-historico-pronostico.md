# radar-historico-pronostico

## Objective
Let users view the radar-meteo forecast as it was published at a past instant, within the last 48 h.

## Problem / why
`/api/infraestructura/radar-meteo` always serves the latest completed run. Past runs already exist in `radar_meteo_run` (one per 3 h slot, retained 14 days; prod verified: 16 completed runs in the last 48 h), so only read access and a selector are missing.

## Scope
- IN: `asOf` query param on the radar-meteo API, a runs-list endpoint, hook support, a run selector in the radar UI.
- OUT (separate future feature): observed rain (IMERG `hazard_observation`) history, new indexes/migrations, any write path.

## Constraints
- No migration. Read-only against `radar_meteo_run` (existing index `(status, fetched_at)`).
- `asOf` run resolution: latest `status='completo'` run with `fetched_at <= asOf`; no run => existing `sinDatos` shape.
- Past runs must not report `frescura.desactualizado` relative to now (return `frescura: null` when `asOf` is set).
- ETag must include the resolved run id and `asOf`.
- One run per request (~0.6 MB); never load all runs at once.
- UI copy follows the existing Spanish copy of the radar UI; code/comments in English.
- Advisory heuristic: ~400 authored changed lines per task; not a cap.

## Execution
- Route: delegated direct. One fresh Haiku per atomic task, each under 100k tokens (user instruction). Haiku never commits; the parent verifies and commits.
- TDD: not explicitly enabled (source: none). Functional checks: `pnpm vitest run <files>` + typecheck. Runner: vitest (`package.json` script `test`).
- Delivery strategy: ask-on-risk (default). Forecast ~500-700 authored changed lines incl. tests; revisit before T3 commit.

## Tasks
- [x] T1 Backend asOf: `obtenerRunRadarMeteoAsOf` in `lib/infraestructura/radar-meteo/job-sync.ts` + `asOf` param in `app/api/infraestructura/radar-meteo/route.ts` + route tests. Route: delegated (writes 2+ files).
- [x] T2 Runs list: `listarRunsRadarMeteoRecientes` in `job-sync.ts` + `app/api/infraestructura/radar-meteo/corridas/route.ts` (id, runAt, fetchedAt for last 48 h, newest first) + tests.
- [x] T3 Hooks: `asOf` option in `use-radar-meteo.ts` (query + cache key) + new `use-corridas-radar-meteo.ts` + tests.
- [x] T4 UI: run selector in `components/mapas/radar-meteo/radar-meteo.tsx` (past-run banner, back to "latest") + test.

## Acceptance
- With `asOf`, API returns the run in effect at that instant; without it, behavior is unchanged.
- Selector lists the runs of the last 48 h and switching reloads the forecast; a visible notice shows when a past run is displayed.
- Existing radar tests still pass.

## Progress / evidence
- T1 commit 3cdd4a8. T2 commit ca9b22c. T3 commit 7556b44.
- T1 (Haiku, 86k tokens): route + job-sync + 5 new tests. Parent re-ran `pnpm vitest run app/api/infraestructura/radar-meteo/route.test.ts`: 12 passed; Haiku reported `pnpm exec tsc --noEmit` exit 0. Note: ETag payload now carries `asOf: null` (one-time cache miss for existing clients, harmless). `obtenerRunRadarMeteoAsOf` SQL itself is only covered through mocks.
- T2 (Haiku, 86k tokens): `listarRunsRadarMeteoRecientes` (selects id/runAt/fetchedAt only, never payload) + `corridas/route.ts` + 4 tests. Parent re-ran `pnpm vitest run app/api/infraestructura/radar-meteo`: 4 files / 23 tests passed; Haiku reported tsc exit 0. Gap: helper SQL/cutoff only covered via mocks.
- T3 (Haiku, 84k tokens): `asOf` option in `useRadarMeteo` + `useCorridasRadarMeteo` + 5 tests. Parent: `pnpm vitest run lib/infraestructura/radar-meteo components/mapas/radar-meteo` => with default timeout 1 unrelated test (`radar-meteo.lluvia.test.tsx > mantiene transparente el paso completamente seco`) times out at 5000 ms in 3/3 runs when BOTH new test files are present; passes with either one alone, passes without both (22 files/104 tests, 2 runs), passes with `--testTimeout=20000` (24 files/109 tests) and alone (3.6 s). Conclusion: CPU-contention flake of a pre-existing 3.6 s test vs the 5 s default (vitest isolates files, no shared state); not a logic regression. Existing test left untouched. tsc exit 0 (Haiku-reported).
- T4 (Haiku, ~110k tokens: slightly OVER the 100k cap): select in `linea-tiempo.tsx`, state/banner/frame anchoring in `radar-meteo.tsx`, 1 CSS rule, 3 new tests, `vi.mock` of the corridas hook in 3 existing test files (assertions untouched). Parent re-ran radar + page tests twice with `--testTimeout=20000`: 30 files / 230 tests passed; tsc exit 0; eslint (Haiku): 0 errors, 1 pre-existing warning in job-sync.test.ts. Parent fix: banner hidden while loading/error because both use `.radar-meteo-estado` at the same absolute position (overlap on every run switch). NOT verified visually (no browser run yet); frame anchoring to the selected instant is untested.
- Visual review (desktop, Claude in Chrome, local PGlite with 16 SYNTHETIC runs; no Open-Meteo/prod calls): selector lists 16 runs; picking `7/10 09:12` reloads the map with a different run, shows the banner "Estás viendo el pronóstico publicado el 7/10 09:12" + "Volver al último", and "Actualizado hace…" disappears. Banner is small/low-contrast but legible. "1 Issue" badge = hydration error on /login caused by a browser extension (`data-keeper-lock-id`), unrelated.
- FINDING (gap): left panel KPIs, "Pronóstico por departamento" ranking and the per-school popup do NOT follow the selected run: `app/api/infraestructura/radar-meteo/resumen/route.ts:18` and `.../escuela/[cueAnexo]/route.ts:27` still call `obtenerUltimoRunRadarMeteo()`. Numbers were identical (13 deptos, Saladas 286,4 mm) for latest vs past run while the map differed.
- Not validated: frame anchoring with real data (synthetic times display +2 h; artifact of fake data).

## Next step
Decide T5 (proposed): make `resumen` and `escuela/[cueAnexo]` accept `asOf` and pass it from `useResumenRadarMeteo`/popup, so the whole radar view is consistent. Then push/PR (user decision).
