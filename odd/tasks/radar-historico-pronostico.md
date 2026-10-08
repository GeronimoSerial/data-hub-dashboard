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
- [ ] T2 Runs list: `listarRunsRadarMeteoRecientes` in `job-sync.ts` + `app/api/infraestructura/radar-meteo/corridas/route.ts` (id, runAt, fetchedAt for last 48 h, newest first) + tests.
- [ ] T3 Hooks: `asOf` option in `use-radar-meteo.ts` (query + cache key) + new `use-corridas-radar-meteo.ts` + tests.
- [ ] T4 UI: run selector in `components/mapas/radar-meteo/radar-meteo.tsx` (past-run banner, back to "latest") + test.

## Acceptance
- With `asOf`, API returns the run in effect at that instant; without it, behavior is unchanged.
- Selector lists the runs of the last 48 h and switching reloads the forecast; a visible notice shows when a past run is displayed.
- Existing radar tests still pass.

## Progress / evidence
- T1 (Haiku, 86k tokens): route + job-sync + 5 new tests. Parent re-ran `pnpm vitest run app/api/infraestructura/radar-meteo/route.test.ts`: 12 passed; Haiku reported `pnpm exec tsc --noEmit` exit 0. Note: ETag payload now carries `asOf: null` (one-time cache miss for existing clients, harmless). `obtenerRunRadarMeteoAsOf` SQL itself is only covered through mocks.

## Next step
T2.
