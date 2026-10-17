# Radar UI cleanup

## Objective
Make the radar tab of `/mapas/infraestructura` readable on desktop: one overlay at a time, a stable sidebar, a legible timeline and clear variable labels. Mobile is out of scope (the map is not designed for it).

## Problem (observed 2026-10-17, desktop 1440x900)
- Sidebar content changes without user action: the risk-engine block (KPIs + "Riesgo actual (hoy)") appears late inside `PanelRadar` (`components/mapas/panel-radar.tsx:95-151`) once `useRadar` resolves.
- One map click opens two overlays: IMERG popup (`capa-lluvia-observada.tsx:226`) and `PopupRadar` (via `radar-meteo-map-click`, `map-infraestructura-page.tsx:1393`).
- `PopupRadar` (`globals.css:2676`) and `.radar-escuela-card` (`globals.css:2721`) use fixed corners and cover the sidebar / legend.
- Two legends stacked bottom-right (`.radar-meteo-legend` :2656, `.map-leyenda` radar mode :2403); timeline touches the rain legend.
- Timeline axis: day label stacked under hour label, first label clipped, hour ticks every 12 h land on 02/14 local.
- Radar overlays hard-code z-index instead of `--z-*` tokens.

## Scope
- Rename variables: "Lluvia" -> "Lluvia (mm)", "Probabilidad" -> "Lluvia (prob)".
- No data/API changes; no mobile work.

## Tasks
- [x] T1 Labels: rename variable labels in `selector.tsx` / `leyenda.tsx` and tests.
- [ ] T2 Sidebar: stable layout, no late block jump; single heading hierarchy; fix lone granizo card.
- [ ] T3 Overlays: one overlay open at a time (IMERG popup vs point forecast vs school card); point forecast never covers the sidebar or legends; z-index via tokens.
- [ ] T4 Legends + timeline: separate legends from timeline; one-line axis labels with day only at midnight, ticks at 00/12 local, no clipping.
- [ ] T5 Visual check with Playwright screenshots (desktop) after each task.

## Checks
- `pnpm vitest run components/mapas` per task; full suite at close (3 known failures in `smn-alertas.test.ts`, missing XML fixtures).
- Desktop screenshots via tunnel.

## Progress
- Exploration done.
- Decision (user, 2026-10-17): keep the risk block in the radar sidebar. It is a different risk: computed and probabilistic, unlike "Situación actual" (director reports). T2 must label it as such and reserve its space so it never jumps in late.
- Route: delegated direct (one writer, T1-T4 touch 5+ non-trivial files).
