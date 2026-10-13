# Mapa: peligro visible

## Objective
Surface hazard outputs that are already computed (climatology, forecast vs threshold, IMERG, GloFAS caudal,
Prefectura heights, ensemble P95/P99) in the selected-school UX of the map. No new data sources.

## Problem / why
`FichaTerritorial` (only consumer of `/api/infraestructura/peligro`) is mounted only in `FichaParteModal`, which
no app code imports. `hidro_lectura` has no read path. `hazard_ensemble_prob` only feeds the engine.
User decision 2026-10-13: freeze new sources; make what exists visible first.

## Scope
- Selected school sidebar (`components/mapas/ficha-escuela-panel.tsx`) gains the hazard sheet and river status.
- Radar-meteo school card gains ensemble P95/P99.
Out: new sources, IMERG climatology migration, push/PR/merge/deploy.

## Constraints
- Missing data renders "Sin dato", never as low risk. Show timestamps / data age. Indices are relative.
- UI copy Spanish; code/comments English. Haiku workers implement; one writer at a time.
- No collision with `mapa-ajustes-pr63.md` F1/F2 (sidebar layout): new content must keep `min-width: 0`, no horizontal scroll.

## Checklist
- [ ] T1 Mount `FichaTerritorial` in `FichaEscuelaPanel` (section "Peligro hidrometeorológico"); delete dead `FichaParteModal` and its modal-only tests. Route: delegated (Haiku writer, 3+ files).
- [ ] T2 Render climatology thresholds (P90/P95/P99) next to the current forecast in `FichaTerritorial`. Route: delegated (Haiku).
- [ ] T3 Read path for Prefectura heights: `ultimaLecturaEstacion` in `lecturas-repo.ts`, route `GET /api/infraestructura/hidrometria/estado?localidad=`, section in the school sidebar (station, river, height, alerta/evacuación, `medidaEn`). Route: delegated (Haiku, possibly 2 workers: backend then UI).
- [ ] T4 Ensemble P95/P99 for the school cell in the radar school route + `EscuelaCard`. Route: delegated (Haiku).
- [ ] T5 Seasonal trend: follow-up only (flag default off, route not gated by flag, no per-school story). Route: none.

## Acceptance criteria
- Selecting a school in the map shows hazard levels, caudal percentile, IMERG and climatology thresholds, with "Sin dato" for gaps.
- School with an approved tramo shows latest Prefectura height + timestamp; otherwise "Sin estación de referencia".
- Radar school card shows P(>P95)/P(>P99) or "Sin dato".

## Checks
Focused vitest per task; at end `npx tsc --noEmit`, `npm run lint`, relevant vitest suites.

## Progress / evidence
(commits recorded per task)

## Next step
T1.
