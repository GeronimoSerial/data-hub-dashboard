# Iconos del mapa unificados

## Objective
Improve the infrastructure map aesthetics: crisp icons, one coherent icon system, dark-mode-safe colors.

## Problem
Audit 2026-10-17 (code-only): school/cluster icons rasterized without `pixelRatio` and scaled 0.8 (blurry on HiDPI); two icon languages (dark-stroke circle vs white-halo shapes); stroke widths 1.7/2.4/2.5; hardcoded `#1c1c1c` borders vanish in dark mode; selection pin has no outline/shadow; hardcoded colors outside the tonal palette; legend uses real Lucide while map uses hand-copied paths.

## Scope
`components/mapas/*`, `lib/mapas/*`, map rules in `app/globals.css`, their tests. No data/API changes.

## Delivery strategy
ask-on-risk. Forecast ~600 authored lines.

## Tasks
- [x] T1 Quick fixes: pixelRatio 2 + icon-size 1 for school/cluster images; single stroke width 2; theme-aware border/halo (light/dark); selection pin with fill, outline and shadow; cluster halo; legible "sin reporte" dots in dark; draft badge aligned with other badges. Route: delegated (2+ non-trivial files).
- [x] T2 Unification: one rasterizer (renderToStaticMarkup + real lucide, pixelRatio 2) shared by map and legend, removing hand-copied paths; one style (filled shape + 2px halo + white/ink glyph); map color tokens module with dark variant mirrored in JS; station colors moved to the tonal palette; per-school state badges rendered with the same technique/offset as cluster badges. Route: delegated.
- [x] T4 Zoom/navigation (user 2026-10-17: "acercar" not intuitive): cluster click must zoom (observed no zoom at z8.1); clusters split earlier; "Ver toda la provincia" reset control; department click zooms to it; controls styled like app buttons. Route: delegated.
- [x] T5 Visual redesign (user: map looks generic, icon backgrounds barely visible, Prefectura icons ugly, unidentifiable black icon; dark mode out of scope): quiet basemap (hide `circle_11_black` place dots, fewer labels, fade outside province); neutral clusters recede, affected ones stand out; cluster badges legible; Prefectura stations redesigned as level chips; rain layer less muddy. Route: delegated.
- [ ] T3 Visual verification in the browser (light/dark, desktop/390px) via the tunnel; fix defects.

## Checks
`pnpm tsc --noEmit`, `pnpm vitest run components/mapas lib/mapas`.

## Progress
- T1 done — c358924d `fix(mapas)`: SVG emitted at 2x + `pixelRatio: 2`, `icon-size: 1` (school 26 px, cluster badge 18 px); stroke 2; `lib/mapas/colores-mapa.ts` theme tokens (ink border light/dark); cluster halo layer; sin-reporte dots use `--card`/`--ink-faint` in dark; selection pin filled + ink outline + drop shadow; draft badge 18 px, center anchor [11,11]; theme change re-registers images. Checks: `pnpm tsc --noEmit` clean (only `.next/dev` generated-type errors from the running dev server); `pnpm vitest run components/mapas lib/mapas` 687/687.
- T2 done — 81b4f5c5 `refactor(mapas)`: single rasterizer `svgIconoMapa` + `registrarImagenesSvg` in `insignias-mapa.tsx` (real Lucide via renderToStaticMarkup, filled shape + 2 px halo + white/ink glyph, pixelRatio 2) used by schools, clusters, accesos, stations, events and legend; hand-copied paths removed (only custom bridge glyph kept); per-school state badges moved from DOM `<Marker>` to a symbol layer with the cluster offset [13,-13] plus an sr-only list for screen readers; station colors in `PALETA_ESTADO_ALTURA`. Checks: tsc clean (same `.next` caveat); vitest 688/688.
- Pending for T3: crossing `CircleQuestionMark` glyph keeps its inner ring; station hues kept as-is (centralized only, not re-toned).
- T4 done — 3d772a30 `feat(mapas)`: cluster click zooms straight to `getClusterExpansionZoom` (min +1; the old click only opened a popup with an "Acercar" button, which is why zoom stayed 8.12) and the popup was removed; clusterMaxZoom 11→10, radius 40→32; custom `ControlesZoom` (Acercar/Alejar/Ver provincia, hub-styled, Spanish labels) replaces NavigationControl, rotation disabled; department click fits the department bbox (`bboxGeometria`). Browser: cluster click 8.12→9.12. Checks: tsc clean; vitest 689/689.
- T5 done — 38348344 `feat(mapas)`: `aquietarBasemap` hides POIs/shields/road names/villages and strips `circle_11_black` from town labels (text at 0.7); neutral clusters are soft gray discs without ring, affected ones get white rim + severity glow + bold count; evacuation badges are 22 px white chips with red glyph and radius-aware offset; Prefectura stations are dots at z<8 and level chips (state colour + ↑/↓ + level) from z8, sin dato always a faint dot; rain raster opacity 0.65→0.35; legend shows chips and gray neutral swatch. Checks: tsc clean; vitest 690/690. Captures in scratchpad `capturas-v2/`.
- T6 (user: Prefectura stations less visible) — 2b77e315: stations are state-coloured pins with a Waves glyph (sin dato solid slate, never faint) on top of clusters, plus a level chip at every zoom (last known level, `s/d` without reading); legend shows pin + "3,00 m" chip. The stray gray dot on the Paso de los Libres cluster was the faint sin-dato station dot. Checks: tsc clean; vitest 690/690. Captures `capturas-v3/`. Open: a pin can partially cover a cluster count where a station sits on a town.
- Open: rain layer still on by default (default lives in `lib/infraestructura/mapa/capas.ts`, outside scope); `estacion-*` INSIGNIAS entries now unused by the map; dark mode not re-checked.

