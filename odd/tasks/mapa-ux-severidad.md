# Map UX: demo data, severity pulse, layout fixes

## Objective
Give the infrastructure map realistic local demo data and fix its UI problems:
oversized severity circles, nested scrollbars, overlapping panels, and missing
interaction states.

## Scope
- Stage 0: local environment (`.env.local`, `DATA_DIR=.data`), extended demo seed
  (`scripts/seed-demo-partes.mjs`) covering every severity, category, establishment
  state, service state, unreported schools, and several periods; baseline screenshots.
- Stage 1: `components/mapas/**`, `components/infraestructura/**` (map-facing panels),
  `app/(hub)/mapas/**`, `app/globals.css` map section, `lib/infraestructura/**` only
  when a pure helper is needed.

## Constraints
- Problem data lives in SQLite `hub.sqlite` (DATA_DIR). No Postgres, no production data.
- Demo rows keep the `demo-` prefix and stay removable with `--limpiar`.
- Respect `prefers-reduced-motion` for any animation.
- No new map library; stay on maplibre-gl + react-map-gl.
- UI copy stays in the existing project language (Spanish, neutral).

## TDD
Mode: off (no project/session configuration). Runner: `pnpm test` (vitest run).
Functional checks: `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm lint`, visual check in `pnpm dev`.

## Delivery
Strategy: ask-on-risk. Forecast ~600 authored lines across stage 0 + 1.

## Tasks
Route: three-level orchestration (root Opus → Sonnet leader via Orca → DeepSeek via opencode). Trigger: user request; 4+ files, 2+ non-trivial writes.

- [x] T0.1 Local env + seed coverage + baseline screenshots
- [x] T1.1 Severity: fixed small dot + animated pulse ring for severe cases, clustering at low zoom
- [x] T1.2 Single scroll container in left stack; search results without nested scroll
- [ ] T1.3 Panel overlap: controls/fullscreen/attribution/left stack on short and narrow viewports
- [ ] T1.4 Interaction: touch/keyboard department info, map loading/empty states, keyboard selection
- [ ] T1.5 Tests for severity paint expressions and clustering; before/after screenshots

## Progress
- 2026-09-22: exploration done; plan approved by user; stages 0–1 delegated.
- 2026-09-22: T0.1 done.
  - `.env.local` created locally (gitignored) with generated dev-only secrets.
  - `scripts/seed-demo-partes.mjs` extended (level-3, deepseek-v4-flash; leader
    reviewed diff + ran checks): added `CANT_SERVICIO_RESTAURADO` (6 servicios
    suspendidos con `retiradaEn` a mitad de período) y `CANT_AFECTACION_RETIRADA`
    (~12 afectaciones retiradas en partes con 2+, en fechas 5-30 días atrás),
    en un PRNG secundario para no alterar el stream/determinismo existente.
    Scope correction (confirmed with root): dropped the "3+ periods incl.
    historico" sub-requirement — `lib/infraestructura/evolucion.ts` only reads
    the single vigente period and builds its trend from `retiradaEn` spread
    within it; historico `infra_periodo` rows would be inert (no UI reads
    them). Verified the day-by-day curve now rises AND dips (e.g. 16→15→17→16
    around 09-09..09-13) instead of monotonically climbing.
  - Seed run twice: identical counts both times (idempotent). `--limpiar`
    verified working. Counts: 150 establecimientos/26 departamentos, 50
    partes, 97 afectaciones, 21 servicio_alcance rows, 92 movimientos;
    listarPartesVigentes(): 47 escuelas, suspendido=5, parcial=10, evacuadas=6,
    centros=4, sinReportar=8 — covers every SEVERIDADES value (cycled),
    both categorias, all 3 estadoEstablecimiento values, servicio
    suspendido/parcial/restaurado, sin-reportar, spread across departments.
  - Checks: `pnpm test` 731/731 passed; `pnpm exec tsc --noEmit` and
    `pnpm lint` both show pre-existing, unrelated failures confirmed present
    on the unmodified tree too (stashed our diff to verify) — not introduced
    by this change.
  - Baseline screenshots captured (logged in as seeded admin) at
    `.data/screenshots/before/`: `{1440x900,1024x768,390x844}-{operativa,evolucion}.jpg`.
    Observations: severity circles vary wildly in size by alumnosAlcanzados
    (tiny dots next to near-black giant circles) — confirms T1.1. At
    1024x768 the left stack's "Indicadores consolidados" box has its own
    inner scrollbar while the filter panel below it also scrolls
    independently — nested-scroll evidence for T1.2. At 390x844 the
    "Mapa base / Capas" control panel renders directly on top of the
    "Indicadores consolidados" panel, fully unreadable overlap — clear
    T1.3 evidence on narrow viewports. Evolución tab confirmed working with
    a real rise/fall trend from the new seed data.

- 2026-09-22: T1.1 done.
  - New pure module `lib/mapas/severidad-visual.ts` (+ colocated tests):
    `RADIO_DOT_BASE=6` fixed dot radius, `esSeveridadPulsante` (Alta/Crítica
    only), `radioMaximoPulso` (Crítica=16 > Alta=12 > base for others),
    `calcularRadioPulso`/`calcularOpacidadPulso` (clamped linear interpolation
    driving the pulse), `DURACION_PULSO_MS=1600`.
  - `components/mapas/map-infraestructura-page.tsx`: circlePaintPartes/
    circlePaintSinReportar no longer scale by `alumnosAlcanzados` (deleted
    RADIO_PISO/RADIO_TECHO/ALUMNOS_TECHO + the sqrt-interpolate expression);
    dot radius is the flat constant. Added `infra-partes-pulso` circle layer
    (filtered to unclustered + `esSevero`), driven every rAF frame via
    `map.setPaintProperty` (never a React re-render), with a
    prefers-reduced-motion branch that sets one static subtle ring instead of
    animating (checked once per mount, no rAF at all when true). Added
    clustering (`cluster`/`clusterMaxZoom`/`clusterRadius` on the GeoJSON
    source) with a neutral-gray cluster circle + count label layer (cluster
    color deliberately NOT severity-averaged) and click-to-zoom via
    `getClusterExpansionZoom`.
  - `components/mapas/legend-panel.tsx` (`InfraLegendPanel` only): hint text
    updated to describe fixed size + animated pulse instead of size-by-
    alumnos.
  - Leader review found and fixed one bug before accepting: `handleClick`
    read `feature.layer.id` unguarded, crashing (and breaking 4 existing
    tests) when a feature had no `.layer` — changed to `feature.layer?.id`.
  - Checks: `pnpm exec tsc --noEmit` clean (only the same pre-existing
    unrelated scripts/padron-ge.test.ts errors); `pnpm test` 742/742 green
    (731 existing + 11 new for severidad-visual).
  - Visual check in `pnpm dev` (logged in as seeded admin): confirmed fixed
    dot size and clustering with count bubbles that split on zoom, and
    cluster-click zooms in (getClusterExpansionZoom path). Confirmed the
    pulse's `setPaintProperty` loop is live and computing correct in-range
    values (sampled via injected JS: radius/opacity mid-cycle, not the static
    reduced-motion defaults) — could not visually watch the animation
    smoothly in this session because `requestAnimationFrame` never fires at
    all in this occluded/automated Chrome tab (verified independently with a
    raw rAF counter that stayed at 0 after 1s); this is a browser-automation
    artifact, not an app bug. Reverted an unrelated `next-env.d.ts` diff
    produced as a side effect of running `next dev`/tsc.

- 2026-09-22: T1.2 done.
  - `app/globals.css`: removed the nested `max-height`/`overflow-y: auto`
    from `.map-search-results` (was 11rem) and `.map-alertas-list` (was
    14rem) — `.map-left-stack` remains the single intended scroll container,
    untouched.
  - Diagnosed root's flagged "horizontal scrollbar in the alert list at
    1440" to its real cause (not just leftover from the nested-scroll fix):
    `.map-alerta-row` is a flex row whose text children default to
    `min-width: auto`, so one long unbreakable school name overflowed the
    row by a few px; because `.map-left-stack` sets `overflow-y: auto`
    without an explicit `overflow-x`, the CSS spec auto-promotes
    `overflow-x` to `auto` too when the two mismatch, so that one long name
    was producing a horizontal scrollbar on the whole left-stack column.
    Fixed with `min-width: 0` on `.map-alerta-row` and a new
    `.map-alerta-row > b, .map-alerta-row > span { min-width: 0;
    overflow-wrap: anywhere; }` rule, scoped to that row only (left
    `.map-popup-muted` untouched, since it's shared with map popups
    elsewhere).
  - Checks: `pnpm exec tsc --noEmit` clean (same pre-existing unrelated
    errors only), `pnpm test` 742/742 green.
  - Visually verified in `pnpm dev` at 1440: exactly one scrollbar on the
    left stack, no nested one inside the alert list, and
    `list.scrollWidth === list.clientWidth` / `stack.scrollWidth ===
    stack.clientWidth` (sampled via injected JS) confirm no horizontal
    overflow anywhere in the column.

## Next step
Leader dispatches T1.3 (panel overlap responsive fixes) next.
