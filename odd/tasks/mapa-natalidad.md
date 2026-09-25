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
  - [x] T5 correction (accepted 2026-09-25): the bbox check let through points far from any departamento as long as they fell inside the province's bounding rectangle. Replaced with point-in-polygon against the union of `public/data/departamentos-corrientes.geojson` (Polygon/MultiPolygon, holes handled) plus a 1km tolerance to the nearest boundary edge for near-coast schools the simplified geometry leaves just outside. New module `lib/mapas/geo.ts` (pure, no new dependency — ray-casting + point-to-segment distance) with `geo.test.ts`.
- [x] T7 **withdrawn (user, 2026-09-25):** matrícula 2023–2026 per establishment extracted from `Mapa_Evolucion_Matricula_2023_2026 (1).html` (enrollment only: no zones, amounts or costs) into a committed snapshot; enrich schools and departamento aggregates on the map — reason: the source HTML only covers a panel of 288 small rural schools (median 6 students), so summing it per departamento/province was misleading. Fully removed from the feature (data file, script, lib module + tests, map choropleth mode/popups, Estadísticas chart) — see "Removal (T7 withdrawn)" below.
- [x] T8 "Estadísticas" tab with recharts (births trend, variation by departamento, offer vs. births cohort — trimmed to Inicial/Primario), mirroring the infra map tabs. Adjusted 2026-09-25 after T7 withdrawal: dropped the matrícula KPI and the "births vs. matrícula"/"oferta by nivel" charts, replaced with a single "oferta de inicial vs. cohorte de Sala de 3" chart (see below) — 3 charts total, not 4.
- [ ] T6 Visual check in `pnpm dev` (needs user login)
- [x] T9 UI polish (user feedback 2026-09-25, direct inline/delegated writer, this session): replaced native `<select>`s (map year selects, Estadísticas departamento selector) with the project's `components/ui/select` primitive; removed the right-side "Métrica / Escuelas / Mapa base" panel — replaced with a compact `SegmentedGroup`/`SegmentedItem` metric switch (new `components/ui/toggle-group.tsx`, `@base-ui/react/toggle-group` + `toggle`, no new dependency) plus the relevant year select(s), integrated under the title panel; dropped the basemap switcher (kept `voyager` as the fixed default) and the "Mostrar escuelas" checkbox + nivel filter (schools always rendered, Inicial stays highlighted); legend `<details>` now has `open` by default (was collapsed) so the choropleth breaks are visible without a click. See "Progress (T9)" below for full detail.

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

## Accepted mid-task changes (2026-09-25, coordinator feedback)
- T5 correction: bbox → point-in-polygon + 1km boundary tolerance for
  coordinate sanitation (see checklist above and `lib/mapas/geo.ts`).
- Departamento popup now opens on **hover** (follows the cursor, closes on
  `mouseleave` of the polygon or of the map container), not click. Click on
  a departamento still works too (touch fallback: no hover on touch, so a
  tap must still open it). Escuela (school) markers stay **click-only**,
  deliberately: ~2,000 points reclustered by MapLibre at different zoom
  levels means "what feature is under the cursor" changes constantly: a
  hover popup there would flicker/recompute on every `mousemove` and be
  unreadable. Documented inline at `handleMouseMove`/`handleClick` in
  `map-natalidad-page.tsx`.
- Departamento popup "Escuelas por nivel" trimmed to **Inicial and Primario
  only** (`NIVELES_POPUP_DEPARTAMENTO`) — Secundario/Superior/Servicios
  Educativos dropped from that summary (not relevant to the births
  comparison). The schools-layer nivel filter on the map is untouched (still
  all 5 niveles).
- Estadísticas tab trimmed to **4 charts** (from the original 5-chart plan):
  dropped the "offer by nivel" chart's Secundario/Superior/Servicios bars —
  folded into a 2-nivel-only "Oferta de inicial y primario" chart. Every
  chart carries a title + one-line "por qué importa" caption tying it back
  to nacidos → inicial/primario planning; nothing else survived the cut
  (see T8 progress below for the final 4).
- Parent applied a direct follow-up edit to `map-natalidad-page.tsx` (user
  request): removed the "no discrimina por nivel" caveat trailer from both
  map popups (departamento: "· N escuela(s) con dato · la fuente no
  discrimina por nivel"; escuela: "· total del establecimiento, sin
  desglose por nivel en la fuente"). The caveat stays only in code comments
  and once in the Estadísticas tab's chart-3 caption. Re-verified after this
  edit: `pnpm exec tsc --noEmit` clean, `pnpm lint` clean, `pnpm test`
  835/835 passed.

## Progress (T7 — matrícula)
- `Mapa_Evolucion_Matricula_2023_2026 (1).html` (repo root, untracked, 823KB):
  288 establishments, one popup per CUE-Anexo with `2023..2026` enrollment
  (some `N/D`), `Variación absoluta/porcentual 2023-2026`, `Tendencia`, and a
  `Costo mensual de sueldos` field — **never parsed** (out of scope, verified
  by grep that it's the only monetary field and it's absent from every
  parsed record). **No nivel split in the source** — a single total
  enrollment number per establishment/year, confirmed by grepping the HTML
  for "nivel" keywords (zero hits outside unrelated text). This is stated
  explicitly in the map popups and the Estadísticas captions, never faked.
- New `lib/mapas/matricula.ts` (pure, tested): `parsearMatriculaHtml` (regex
  over the Folium `$(\`...\`)[0]` popup blocks, filtered to blocks containing
  "CUE-Anexo"), `enriquecerEscuelasConMatricula` (join by exact CUE-Anexo
  string, e.g. `1801605-04`), `calcularVariacionMatricula` (null-safe: an
  `N/D` extreme yields `pct: null`, never a fabricated change from a
  substituted 0). `lib/mapas/matricula.test.ts` (12 tests).
- New script `scripts/extract-matricula.mjs` (`pnpm extract:matricula`):
  reads the untracked HTML, writes the committed snapshot
  `data/natalidad/matricula-2023-2026.json` (`[{cueAnexo, anio, matricula}]`,
  1,152 rows = 288 establishments × 4 years, 21 `N/D` cells as `null`).
  `scripts/extract-natalidad.mjs` reads that snapshot (if present — the
  build never fails without it, just logs a warning and omits matrícula) and
  calls `enriquecerEscuelasConMatricula` before building `departamentos.json`.
- Matching: **288/288 matrícula CUEs matched** to `escuelas.geojson`'s
  underlying escuela universe (GEO ∪ padrón) — 0 unmatched from the
  matrícula side. From the other direction: 2,162 total escuelas, 288 with a
  matrícula row (the rest — mostly non-inicial/primario levels and schools
  outside this establishment set — simply have no `matricula` field, which
  is distinct from `matricula: {}`).
- `lib/mapas/natalidad.ts` extended: `EscuelaCompleta.matricula?` (optional,
  so existing fixtures/tests unaffected), new `agruparMatriculaPorDepartamento`
  (sums per departamento + provincia, `null` never treated as 0),
  `DepartamentoNatalidad.matricula` and `DatosNatalidad.provincia.matricula` /
  `meta.fuenteMatricula` / `meta.aniosMatricula`. `construirDatosNatalidad`
  gained an optional `fuenteMatricula` param (defaults to `null`, fully
  backward compatible with the one existing call site).
  `lib/mapas/natalidad.test.ts` gained 4 new test blocks.
- Map enrichment: school popup shows the 2023–2026 series + variación
  (`calcularVariacionMatricula`, labelled "sin desglose por nivel en la
  fuente"); departamento popup shows total matrícula per year + variación +
  escuelas con dato; new choropleth mode "% variación de matrícula
  2023→2026" (reuses the existing diverging `colorVariacion` scale); title
  panel provenance line extended with "Matrícula: evolución 2023–2026
  (fuente: mapa de evolución de matrícula)." when the snapshot is present.

## Progress (T8 — Estadísticas tab)
- New `lib/mapas/estadisticas-natalidad.ts` (pure, tested — no
  React/recharts import): `construirSerieProvincialNacimientos`,
  `construirVariacionNacimientosPorDepartamento` (sorted worst→best,
  `pct: null` sorts last), `construirComparacionNacimientosMatricula`
  (aligns on the first common calendar year, 2023 in practice — explicitly
  labelled as a scale comparison, not a cohort comparison, since the source
  has no nivel split), `construirOfertaInicialPrimario` (Inicial/Primario
  only, never the other 3 niveles), `construirKpis`. All take an optional
  `FiltroDepartamento` ('Todos' | clave). `estadisticas-natalidad.test.ts`
  (10 tests).
- New `components/mapas/estadisticas-natalidad-graficos.tsx`: 4 recharts
  components mirroring `evolucion-graficos.tsx`'s theme (CSS-variable
  palette read at render time, no gradients/shadows, `isAnimationActive:
  false`, `--teal`/`--blue` reused from the map's own inicial/primario
  colors, `--green-dark`/`--red-dark` for the diverging variación bars).
- New `components/mapas/estadisticas-natalidad-panel.tsx`: fetches
  `/data/natalidad/departamentos.json` (same file the map loads — no new
  endpoint), departamento selector, 4 KPI tiles (nacidos último año,
  variación, matrícula último año, escuelas con oferta de inicial), and the
  4 charts each with a title + "por qué importa" line:
  1. Nacidos vivos — tendencia provincial.
  2. Variación de nacidos vivos por departamento.
  3. Nacidos vivos vs. matrícula total (mismo año calendario).
  4. Oferta de inicial y primario (secciones).
- `app/(hub)/mapas/natalidad/map-client.tsx` rewritten with `Mapa`/
  `Estadísticas` tabs (`@/components/ui/tabs`, hash-linkable), mirroring
  `InfraestructuraMapClient` exactly: the map is never unmounted (only
  `[hidden]`), Estadísticas mounts/unmounts on tab switch, recharts is
  dynamically imported (`ssr: false`) so it doesn't inflate the map's
  initial bundle. Reused the existing generic CSS classes
  (`.mapa-pestanas*`, `.evolucion-panel/-vista/-subtitulo/-descripcion`,
  `.grafico-contenedor`) — added only `.natalidad-filtro-departamento` and
  `.natalidad-kpi*` to `app/globals.css`.

## Removal (T7 withdrawn, 2026-09-25)
User decision: matrícula data is useless for this feature — the source HTML
(`Mapa_Evolucion_Matricula_2023_2026 (1).html`, untracked, user's, left
untouched on disk) only covers a panel of 288 small rural establishments
(median 6 students), so summing/averaging it per departamento or province was
misleading. Removed entirely rather than kept behind a flag:
- Deleted: `data/natalidad/matricula-2023-2026.json`,
  `scripts/extract-matricula.mjs`, `lib/mapas/matricula.ts`,
  `lib/mapas/matricula.test.ts`, and the `extract:matricula` script in
  `package.json`.
- `lib/mapas/natalidad.ts` + `.test.ts`: removed `EscuelaCompleta.matricula`,
  `agruparMatriculaPorDepartamento` (+ `AgregacionMatricula`),
  `DepartamentoNatalidad.matricula`, `DatosNatalidad.provincia.matricula`,
  `meta.fuenteMatricula`/`meta.aniosMatricula`, and
  `construirDatosNatalidad`'s `fuenteMatricula` param. Removed the two T7 test
  blocks (`construirDatosNatalidad` matrícula cases) and the
  `agruparMatriculaPorDepartamento` describe block.
- `scripts/extract-natalidad.mjs`: dropped the `matricula.ts` import, the
  `MATRICULA_PATH`/`FUENTE_MATRICULA` constants, and the
  read-snapshot-if-present branch; regenerated
  `public/data/natalidad/{departamentos.json,escuelas.geojson}` — confirmed
  `rg -i matricula` returns nothing in either file.
- `components/mapas/map-natalidad-page.tsx`: removed the `'matricula'`
  `ModoMetrica`, its choropleth branch and legend entry/radio option, the
  matrícula sections in both the departamento and school popups, and the
  matrícula provenance clause in the title panel.
- `lib/mapas/estadisticas-natalidad.ts`: replaced
  `construirComparacionNacimientosMatricula` (nacidos vs. matrícula) and
  `construirOfertaInicialPrimario` (raw escuelas/secciones by nivel, no
  cohort) with a single `construirOfertaInicialVsCohorte`: per-departamento
  secciones de Inicial vs. nacidos vivos del año `max(anioInicio, anioFin -
  3)` — the cohort that turns 3 (enters Sala de 3) this cycle, cohort-year
  alignment returned explicitly as `anioCohorte`. Dropped
  `matriculaUltimoAnio` from `KpisNatalidad`, added `seccionesInicialTotal`.
- `components/mapas/estadisticas-natalidad-graficos.tsx`: replaced
  `GraficoComparacionNacimientosMatricula` + `GraficoOfertaInicialPrimario`
  with one `GraficoOfertaInicialVsCohorte` (grouped bars: nacidos de la
  cohorte vs. secciones de Inicial, by departamento); removed the unused
  `matricula`/`primario` palette entries.
- `components/mapas/estadisticas-natalidad-panel.tsx`: dropped the
  "Matrícula" KPI tile and the two removed charts' sections; added the new
  "Oferta de inicial vs. cohorte de Sala de 3" chart with its title
  (includes `anioCohorte`) and "por qué importa" line.
- Final Estadísticas chart list (3, not 4):
  1. Nacidos vivos — tendencia provincial.
  2. Variación de nacidos vivos por departamento.
  3. Oferta de inicial vs. cohorte de Sala de 3 (secciones vs. nacidos del
     año que hoy entra a Sala de 3).
- `rg -i "matr[ií]cula"` across this feature's files (lib/mapas, components/
  mapas map-natalidad-page/estadisticas-natalidad-*, scripts/extract-
  natalidad.mjs, data/natalidad, public/data/natalidad, package.json) returns
  no matches. `app/globals.css` and other repo files still mention
  "matrícula" only for the unrelated `/mapas/matricula` map — left untouched.

## Verification (removal, this session)
- `pnpm extract:natalidad`: OK — 25 departamentos, años 2014-2023; 1,996/2,162
  escuelas geolocated (6 discarded past the 1km boundary tolerance — T5
  correction, unaffected by this removal); output confirmed matrícula-free.
- `pnpm test`: 819/819 passed (100 files).
- `pnpm exec tsc --noEmit`: clean.
- `pnpm lint`: clean.
- No visual check in `pnpm dev` this session (T6 unchanged, still needs
  user login).

## Gaps / follow-ups
- No dedicated component/route test for the Estadísticas tab or the tabs
  wiring itself (same gap flagged in T4 for the map page) — the ACL/tabs
  pattern is a structural copy of the proven infra one, and the underlying
  data transforms are fully unit-tested.
- Matrícula is fully removed from this feature (see "Removal" above); the
  unrelated `/mapas/matricula` map and its data are untouched.

## Progress (T9 — UI polish, user feedback 2026-09-25)
- New `components/ui/toggle-group.tsx`: `SegmentedGroup`/`SegmentedItem`, a
  single-select segmented control wrapping `@base-ui/react/toggle-group` +
  `@base-ui/react/toggle` (both already a transitive dep of `@base-ui/react`,
  used nowhere else in the repo yet — no new package). Follows the existing
  `components/ui/*` wrapper style (thin className-merging wrapper, `cn()`).
  New CSS: `.ui-segmented`/`.ui-segmented__item` in `app/globals.css`
  (mirrors `.ui-button--default`'s `--action` fill + white/black text swap
  for dark mode).
- `components/mapas/map-natalidad-page.tsx`:
  - Removed `Checkbox`, `RadioGroup`/`RadioItem`, `BasemapControl` imports
    and the entire right-side `styles.controlsStack` panel (Métrica /
    Escuelas / Mapa base cards).
  - `modo`/`anioSeleccionado`/`anioVariacionA`/`anioVariacionB` now render as
    a `SegmentedGroup` (Nacidos en el año | Variación %) plus the relevant
    `AnioSelect`(s) (new local component, `components/ui/select` styled with
    the existing compact `.map-filtro-campo`/`.map-filtro-label`/
    `.map-filtro-input` classes), integrated inside the title panel via new
    `.natalidad-metrica-control`/`.natalidad-anio-par` CSS.
  - Removed `basemap` state — `mapStyle` is now the constant
    `BASEMAPS.voyager.styleUrl` (kept default, no switcher).
  - Removed `capaEscuelasVisible`/`filtroNivel` state and the `FiltroNivel`
    type: the escuelas `<Source>` always renders (no gate), `NIVELES` import
    dropped. Inicial highlight (teal) and the legend entry explaining it are
    unchanged.
  - Legend `<details>` gained the `open` attribute (was collapsed by
    default) — the choropleth breaks and the escuela color legend are
    visible without clicking "Referencias"; kept as `<details>` (not a plain
    div) so it's still collapsible, consistent with the infra map's pattern.
- `components/mapas/estadisticas-natalidad-panel.tsx`: departamento
  `<select>` replaced with `components/ui/select`
  (`Select`/`SelectTrigger`/`SelectContent`/`SelectItem`), same
  `.map-filtro-campo`/`.map-filtro-label`/`.map-filtro-input` styling as the
  map's year selects, for a consistent look across the two tabs.
- No changes to `app/(hub)/mapas/natalidad/map-client.tsx` (tabs wiring
  untouched) or `estadisticas-natalidad-graficos.tsx` (charts untouched).
- Hover departamento popup, click escuela popup, fullscreen button and all
  other behaviour unchanged.
- Verification: `pnpm exec tsc --noEmit` clean · `pnpm lint` clean ·
  `pnpm test` 819/819 passed (100 files). No visual check run in `pnpm dev`
  this session (dev server was already running per instructions; login
  required, left to the parent — same gap as T6).
- Gaps: no dedicated component test added for the new segmented
  control/selects (same pre-existing gap as T4/T8 — no component/route test
  for this page); light/dark mode and 375px-width visual check not run
  (needs the parent's browser-based check).
