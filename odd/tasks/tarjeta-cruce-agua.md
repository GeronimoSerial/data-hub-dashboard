# Water crossing card

## Objective
Replace the one-line water-crossing tooltip in the infrastructure map with a card in the station/rain card style, and enrich crossings with the waterway name and bridge name/type from OSM.

## Scope
- Card: type pill + icon, short explanation, "does not indicate passability today" warning, school of the route, destination and route length, main road, crossing position ("Cruce 2 de 4 · a 3,1 km de la escuela"), crossings without bridge on that route, IMERG 24/72 h rain at the point when the layer is on, OSM source footer with extract date.
- Job: `services/geo-static` `calcular_aislamiento` keeps waterway `name`/type and bridge `name`/`bridge` tag per crossing; export, import script, API and client types carry them; card shows them when present.

## Constraints
- Job run needs `services/geo-static/.data/osm/argentina-latest.osm.pbf` (missing in this worktree) and `uv sync`.
- Old NDJSON without the new fields must keep importing and rendering.

## Tasks
- [ ] T1 Crossing card with client-side data (route: delegated, 2+ non-trivial files)
- [ ] T2 IMERG rain lookup at the crossing point (delegated)
- [ ] T3 Job keeps waterway/bridge names + tests (delegated, Python)
- [ ] T4 Import script, API, types and card show names (delegated)
- [ ] T5 Run the job and import new geometry (needs PBF)

## Checks
- `npx vitest run components/mapas lib/mapas lib/infraestructura scripts/importar-geo-static.test.ts`
- `cd services/geo-static && uv run pytest`

## Progress
- Exploration done 2026-10-17. Next: T1.
