# Birth-rate map (mapa de natalidad)

## Objective
New map at `/mapas/natalidad`, same stack as the infrastructure map (MapLibre via
react-map-gl, Corrientes departamentos choropleth), showing live births per
departamento (2014–2023) against the current nivel inicial offer.

## Problem / why
Births in Corrientes fell 32% between 2014 (20,933) and 2023 (14,253). The cohorts
entering Sala de 3/4/5 are shrinking unevenly by departamento; planning needs to see
where the drop meets the existing inicial offer.

## Sources
- Births: public Power BI report "Tendencias demográficas recientes e impactos en las
  ofertas del nivel inicial" (Ministerio de Capital Humano / OEI), table
  `01_NacidosVivos`, filtered to Corrientes (province token `d3a7y9`). Public
  `querydata` API, resource key `ba0ac87a-9eb9-42d6-854c-49f0dfd4f665`, model 5444310.
  Snapshot: `data/natalidad/nacidos-vivos-corrientes.json` (26 codes incl. `18999`
  DESCONOCIDO × 10 years).
- Schools: temporary padrón Postgres (`PADRON_PG_URL`, tables `secciones`, `alumnos`),
  nivel Inicial, ciclo 2026, aggregated per CUE-anexo × sala (no personal data).
  Snapshot: `data/natalidad/inicial-2026-padron.json` (868 CUEs, test CUE
  `1800000-00` excluded). The DB is temporary: the snapshot is the source of truth.
- Coordinates: `public/data/localizaciones.json` (840 of 868 CUEs geolocated).
- Matrícula (official enrollment): pending, the user will try to get it.

## Scope
- `scripts/extract-natalidad.mjs` (+ `pnpm extract:natalidad`), `data/natalidad/**`,
  `public/data/natalidad/**`, `lib/mapas/natalidad*.ts`, `components/mapas/map-natalidad-page.tsx`,
  `app/(hub)/mapas/natalidad/**`, recurso seed registration.

## Constraints
- No new map library. Reuse `lib/mapas/departamentos.ts` geometry and name normalization.
- Static data (like the matrícula map); no runtime dependency on the temporary Postgres.
- UI copy in neutral Spanish, matching the project.
- Access gated by recurso ACL like `/mapas/infraestructura`.

## TDD
Mode: off (no project/session configuration). Runner: `pnpm test` (vitest run).
Checks: `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm lint`, visual check in `pnpm dev`.

## Delivery
Strategy: ask-on-risk. Forecast ~700 authored lines (excluding generated data files).

## Tasks
Route: delegated direct (one Sonnet writer). Trigger: 2+ non-trivial files (script, lib, page, component, seed).

- [x] T1 Data snapshots: births from Power BI + inicial 2026 from padrón (inline, parent)
- [x] T2 Extract script → `public/data/natalidad/` (departamentos series + inicial schools GeoJSON) with pure, tested transforms
- [x] T3 Map page: choropleth (births per year / % change between two years), year controls, departamento popup with series, inicial school markers with salas/secciones, legend; recurso registration + ACL gate
- [x] T4 Tests + checks (`pnpm test`, `tsc`, `lint`) and visual check

## Acceptance
- `/mapas/natalidad` renders the 25 departamentos colored by the selected metric, with values matching the snapshot.
- School markers for geolocated inicial CUEs; popup lists salas and secciones.
- Data provenance (source + year range) visible on the map.

## Progress
- T1 done: 260 births rows, 1,805 school×sala rows.
- T2 done: `lib/mapas/natalidad.ts` (pure transforms: grouping, variation math,
  DESCONOCIDO handling, sala aggregation, feature-collection join, quantile
  and diverging color scales) + `scripts/extract-natalidad.mjs`
  (`pnpm extract:natalidad`, optional `--refresh-pbi`). Output: 25
  departamentos, 0 unmatched against the GeoJSON; 840/868 inicial CUEs
  geolocated (28 without coordinates, reported by the script, never
  silently dropped). `--refresh-pbi` is a best-effort port of `pbi.py`
  (DSR row decoding incl. R/Ø bitmasks) — not exercised against the live
  Power BI endpoint (no outbound-network authorization for that in this
  session); default offline path is what's verified.
- T3 done: `/mapas/natalidad` (ACL gate mirrors `/mapas/infraestructura`),
  choropleth with year/variation metric toggle, departamento popup
  (series, variation, sparkline, inicial offer), inicial school markers
  layer (toggleable), legend with quantile/diverging breaks, title panel
  with provenance + provincial totals. Recurso `recurso-natalidad`
  registered via `lib/mapas/recurso-seed-natalidad.ts`, wired into
  `ensureSeeded()`.
- T4 done: `lib/mapas/natalidad.test.ts` (16 tests) +
  `lib/mapas/recurso-seed-natalidad.test.ts` (2 tests, mirrors the infra
  recurso-seed test). No dedicated component/route test for the new page
  itself (the ACL gate is a direct structural copy of the proven infra
  pattern); flagged as a minor gap.
- Verification: `pnpm extract:natalidad` OK · `pnpm test` 791/791 passed ·
  `pnpm exec tsc --noEmit` clean · `pnpm lint` clean. No visual check run
  in `pnpm dev` (not exercised in this session).
