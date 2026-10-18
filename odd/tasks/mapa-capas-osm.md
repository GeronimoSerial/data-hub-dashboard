# Mapa: capas OSM (río teñido, arroyos, rutas, huella de edificio)

Locator: `odd/tasks/mapa-capas-osm.md` · Branch `GeronimoSerial/mapa-capas-osm` (worktree `../mapa-capas-osm`, base 7ee4e4d1)

## Objective
Make the infrastructure map communicate risk through OSM context: tint the Paraná/Uruguay by the
height state of the nearest station, show intermittent vs permanent waterways, put the road
hierarchy front and centre, and show each school's OSM building footprint at close zoom.

## Constraints
- The basemap is OpenFreeMap (OpenMapTiles schema, vector source `openmaptiles`). Restyle it in
  `lib/mapas/basemap-sereno.ts` (re-applied after every style load) or add our own layers on that source.
- Reuse `PALETA_ESTADO_ALTURA`. Readings older than 18 h are `sin_dato` (neutral gray).
- MapLibre 6.3: `within` works for points and lines only, so the river tint is drawn as a
  semi-transparent band along the river axis (`waterway` class=river) per station segment, not as a
  recoloured water polygon.
- Another agent is working in `../ui`. Everything here stays in this worktree.

## Tasks
- [x] T1 (0de38145) Road hierarchy + waterways: restyle the basemap's `transportation` layers (primary/secondary
  stand out, track/unclassified in the dirt tone, residential/service quieter); `waterway`
  stream/river dashed when `intermittent=1`. Route: delegated (2+ files).
- [x] T2 (e269d253) Tinted river: segment cells per station (halfway boundaries along each river), a line layer
  on `openmaptiles`/`waterway` class=river coloured via `within` per cell, low opacity, below the pins.
  Route: delegated.
- [x] T3 (65e0791b) Building footprint: persist `edificio.poligono` in the importer + DB (migration), expose it
  in `/api/infraestructura/accesos/[cueAnexo]`, render fill+outline at zoom ≥ 16 in the school's state colour.
  Route: delegated.

## Checks
vitest for touched `lib/mapas` and `components/mapas`, `tsc --noEmit`, eslint on touched files.

## Delivery
Strategy: ask-on-risk. One work-unit commit per task.

## Progress
- Exploration done (basemap, stations, footprints pipeline mapped).
- T1 0de38145: `lib/mapas/basemap-rutas-agua.ts`, called from `aquietarBasemap`; layers matched by source-layer + filter classes.
- T2 e269d253: `lib/mapas/rio-tenido.ts` (per-river midpoint cells), layer in `capa-estaciones-rio.tsx` under the basemap labels.
- T3 65e0791b: `edificio` jsonb column (drizzle 0021, not applied), importer, geometria API, fill+outline at z>=16.
- Checks: vitest lib/mapas+components/mapas green except `recurso-seed-natalidad` (PGlite migration timing, passes in isolation); tsc clean; eslint clean on new code.
- Pending: visual check in the browser; importer test (`scripts/importar-geo-static.test.ts`) not extended.
