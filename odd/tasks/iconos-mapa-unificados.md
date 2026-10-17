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
- [ ] T3 Visual verification in the browser (light/dark, desktop/390px) via the tunnel; fix defects.

## Checks
`pnpm tsc --noEmit`, `pnpm vitest run components/mapas lib/mapas`.

## Progress
- T1 done — c358924d `fix(mapas)`: SVG emitted at 2x + `pixelRatio: 2`, `icon-size: 1` (school 26 px, cluster badge 18 px); stroke 2; `lib/mapas/colores-mapa.ts` theme tokens (ink border light/dark); cluster halo layer; sin-reporte dots use `--card`/`--ink-faint` in dark; selection pin filled + ink outline + drop shadow; draft badge 18 px, center anchor [11,11]; theme change re-registers images. Checks: `pnpm tsc --noEmit` clean (only `.next/dev` generated-type errors from the running dev server); `pnpm vitest run components/mapas lib/mapas` 687/687.
- T2 done — 81b4f5c5 `refactor(mapas)`: single rasterizer `svgIconoMapa` + `registrarImagenesSvg` in `insignias-mapa.tsx` (real Lucide via renderToStaticMarkup, filled shape + 2 px halo + white/ink glyph, pixelRatio 2) used by schools, clusters, accesos, stations, events and legend; hand-copied paths removed (only custom bridge glyph kept); per-school state badges moved from DOM `<Marker>` to a symbol layer with the cluster offset [13,-13] plus an sr-only list for screen readers; station colors in `PALETA_ESTADO_ALTURA`. Checks: tsc clean (same `.next` caveat); vitest 688/688.
- Pending for T3: crossing `CircleQuestionMark` glyph keeps its inner ring; station hues kept as-is (centralized only, not re-toned).
