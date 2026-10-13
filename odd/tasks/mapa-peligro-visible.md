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
Re-planned 2026-10-13 after addendum 1 (user): the current flood situation must be visible in the map at a glance.
Map-level layers first, on by default in a "Situación actual" group with legend; per-school items after.
- [x] T1 Mount `FichaTerritorial` in `FichaEscuelaPanel`; delete dead `FichaParteModal`. Route: delegated (Haiku). Commit 41aeeb2.
- [x] T2 Climatology thresholds P90/P95/P99 next to current forecast in `FichaTerritorial`. Route: delegated (Haiku) + parent fix. Commit 13b34e2.
- [x] T3a `ultimaLecturaEstacion` + `GET /api/infraestructura/hidrometria/estado?localidad=`. Route: delegated (Haiku). Commit 2f81da5.
- [ ] L1a Stations backend: pure `estadoAltura` (evacuacion/alerta/normal/sin_dato, trend) + `GET /api/infraestructura/hidrometria/estaciones` (21 catalog stations with coords + latest reading). Route: delegated (Haiku).
- [ ] L1b Stations layer: circle markers colored by state, popup (height, trend, alerta/evacuación, medidaEn), toggle in new "Situación actual" group (default on), legend entry. Route: delegated (Haiku).
- [ ] L2a IMERG backend: `GET /api/infraestructura/peligro/observado-grilla?horas=24|72` → 0.1° cell squares with sum, coverage (null below 80 %), latest observation time. No observed-rain climatology exists (`precipitacion_observada_satelital` is not in `hazard_climatology`): exceedance marked "Sin umbral". Route: delegated (Haiku).
- [ ] L2b IMERG layer: fill by mm class, "Sin dato" style, 24/72 h switch, legend, default on. Route: delegated (Haiku).
- [ ] L3a Events data + loader: copy `eventos.geojson`, `eventos.csv`, `evidencias.csv` from 187f153 into `public/data/eventos-inundaciones/`; pure loader placing locality-level events at locality point (`public/data/localities.geojson`) else department centroid, tagging precision; resolves source URL via evidencias. Route: delegated (Haiku).
- [ ] L3b Events layer: markers by precision, popup (fecha, tipo, precisión, confianza, fuente link), default on, legend. Route: delegated (Haiku).
- [ ] L4 Local run + screenshots of the map with layers on. Route: parent + worker.
- [ ] T3b River status section in school sidebar (uses T3a route). As time allows.
- [ ] T4 Ensemble P95/P99 in radar school card. As time allows.
- [ ] T5 Seasonal trend: follow-up only (flag default off, route not flag-gated).

## Acceptance criteria
- Opening the map shows, without clicks: IMERG 24/72 h rain cells, Prefectura stations colored by state, reported events, plus the existing nivel_riesgo choropleth; a legend explains them.
- Missing data renders "Sin dato"; timestamps visible in popups; event precision never finer than the source.
- Replacing the events files in `public/data/eventos-inundaciones/` is enough to refresh the layer.

## Checks
Focused vitest per task; at end `npx tsc --noEmit`, `npm run lint`, relevant vitest suites.

## Progress / evidence
(commits recorded per task)

## Next step
L1a.
