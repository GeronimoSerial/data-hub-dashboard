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
- [x] T5 All schools (user request 2026-09-25): markers for every school from `data/natalidad/localizaciones-geo-2025-10-02.json` (converted from `2025-10-02_Localizaciones_(GEO).xlsx`, 2,049 active, 2,002 with coords, 4 outside Corrientes) enriched with padrón 2026 niveles/secciones from `data/natalidad/escuelas-2026-padron.json` (2,041 CUEs, all niveles); nivel filter, per-departamento aggregates by nivel; inicial stays highlighted for the births comparison
- [ ] T6 Visual check in `pnpm dev` (needs user login)

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
- T5 done (all schools, all niveles): `lib/mapas/natalidad.ts` reworked —
  `GeoEscuelaRow`/`PadronRow`/`Nivel`/`NivelOferta`, `agruparPadronPorCue`,
  `inferirNivelesDesdeOferta` (best-effort ofertaTipo→Nivel mapping, `[]`
  for ambiguous offers like "Artística"/"Trayecto técnico"),
  `sanearCoordenadasFueraDeLimites` (bbox check against
  `LIMITES_CORRIENTES_BBOX`), `construirEscuelasCompletas` (GEO⨝padrón join,
  union of both universes — a padrón-only CUE has no coords but still
  counts in departamento aggregates), `construirFeatureCollectionEscuelas`,
  `agruparEscuelasPorDepartamento`. `construirDatosNatalidad` now takes
  `escuelas: EscuelaCompleta[]` instead of inicial-only rows; each
  departamento carries `porNivel` (escuelas+secciones per nivel) plus the
  existing `inicial` (salas breakdown, now derived from the same join).
  Old inicial-only types/functions (`InicialRow`, `LocalizacionRow`,
  `EscuelaInicial`, `agruparInicialPorCue`,
  `construirFeatureCollectionInicial`) removed, superseded.
  `scripts/extract-natalidad.mjs` reads
  `data/natalidad/localizaciones-geo-2025-10-02.json` +
  `data/natalidad/escuelas-2026-padron.json` instead of
  `inicial-2026-padron.json` + `public/data/localizaciones.json` (untouched,
  still used by the infra map); writes `public/data/natalidad/escuelas.geojson`
  (old `inicial.geojson` deleted). `data/natalidad/inicial-2026-padron.json`
  deleted. `components/mapas/map-natalidad-page.tsx` rewritten: nivel
  filter (Todos/Inicial/Primario/Secundario/Superior/Servicios Educativos,
  resolved client-side over the fetched FeatureCollection, not a MapLibre
  filter expression — simpler given the nested `niveles` shape), clustered
  school layer (supercluster, `clusterMaxZoom: 12`, mirrors the infra map's
  pattern) with inicial schools/clusters kept teal (`esInicial` /
  `esInicialEnCluster` via `clusterProperties` max-aggregate) vs. neutral
  gray for the rest, richer school popup (sector, ofertaTipo, domicilio,
  niveles with secciones/cursos, "Sin datos de padrón" fallback),
  departamento popup extended with escuelas+secciones per nivel, title
  panel provenance now reads "… {fuenteLocalizaciones}. {fuenteSecciones}."
  = "Localizaciones: relevamiento GEO 2025-10-02. Secciones: padrón Gestión
  Educativa, ciclo 2026.".
  Counts (`pnpm extract:natalidad` log): GEO 2,049 escuelas, 1,998 with
  valid in-province coordinates (4 discarded for being outside
  `LIMITES_CORRIENTES_BBOX` — 1 clearly wrong latitude, 3 with lon===lat,
  all logged with CUE/nombre/coords); padrón 2,041 unique CUEs; 114 padrón
  CUEs missing from GEO (logged, sample of 10 — kept in departamento
  aggregates with null coords, reported, never silently dropped); 113 GEO
  schools with valid coords and no padrón row (nivel inferred from
  ofertaTipo where the mapping is reliable); `escuelas.geojson` has 1,998
  features out of 2,163 total joined schools (165 without usable
  coordinates).
  Tests: `lib/mapas/natalidad.test.ts` rewritten for the new join
  (`agruparPadronPorCue`, `inferirNivelesDesdeOferta`,
  `sanearCoordenadasFueraDeLimites`, `construirEscuelasCompletas`,
  `construirFeatureCollectionEscuelas`, `agruparEscuelasPorDepartamento`,
  updated `construirDatosNatalidad`); old inicial-only test blocks removed.
  Gaps: nivel inference from ofertaTipo doesn't cover every offer string
  (Especial/Adultos/Trayecto técnico/artística stay unmapped — documented in
  code); the test CUE `1800000-01` ("PRUEBAS POF") from the padrón is not
  filtered out (T5 scope didn't ask for it, unlike the old
  inicial-2026-padron.json which excluded `1800000-00`); no visual check
  in `pnpm dev` for T5 (T6 still pending, needs user login).
- Verification (T5): `pnpm extract:natalidad` OK (see counts above) ·
  `pnpm test` 803/803 passed · `pnpm exec tsc --noEmit` clean · `pnpm lint`
  clean.
