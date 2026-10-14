# Evidencia de riesgo por escuela: alturas de Prefectura + lluvia SYNOP

## Objective
Make per-school flood risk react to observed reality: official Prefectura river
states (alerta / evacuación) for physically exposed schools, and measured
station rain (SYNOP via Ogimet) preferred over IMERG near stations.

## Problem / diagnosis (prod, 2026-10-14 ~01:20 UTC; local dump 2026-10-13T23:13Z)
- Run `931a9bbe` (after sync-pronostico-caudal 464,480 rows, sync-ensemble 54 rows):
  conEvidencia 6003/6003 but every school `nivel_riesgo=bajo`, `nivel_amenaza=bajo`
  for 24/72/240 h, while Paso de los Libres (9.33 m, evac 8.50) and Ituzaingó
  (4.03 m, evac 4.00) are in evacuación.
- Root causes:
  1. The engine never reads `hidro_lectura` (Prefectura). Nothing calls
     `estacionParaLocalidad` outside tests.
  2. River signal is null for every school: `obtenerNivelCaudal`
     (`riesgo/peligro/nivel.ts:~626`) returns null when the `caudal_diario`
     climatology is missing. In the dump `hazard_climatology` has only
     `precipitacion_diaria` (126 rows); job `calcular-hazard-climatologia-caudal`
     failed at 22:41Z (`cupo_agotado` on all 8 points, 0 rows) — Open-Meteo flood
     API quota. So GloFAS discharge cannot be compared to any percentile and the
     30 % caudal weight is redistributed away. Follow-up (out of scope): rerun the
     climatology job when quota resets; consider caching it, it is static.
  3. Forecast/ensemble cells are verde for most of the province; IMERG
     underestimates persistent drizzle (Corrientes Aero 87166 reported drizzle
     all day on 13/10 while IMERG gives ~0.7 mm).
  4. `scoreRiesgo = amenaza * vulnerabilidad / 100`: with low historical
     vulnerability even a high hazard collapses to `bajo`.

## Scope
1. River evidence in the engine (new port + adapter, documented weight, floor).
2. New job `sync-synop-lluvia` + engine preference station > IMERG.
3. Local recompute against the dump; before/after per department and examples.
Out of scope: map UI, push, PR, deploy, fixing the climatology quota.

## Decisions (autonomous defaults)
- **Exposure rule** (revised after supervisor review of a0da947; do not flag every
  school in a town): school must map to an approved tramo (`estacionParaLocalidad`)
  AND match the first of, from its own relation to the river:
  1. `clase_rio` in (alto, medio, bajo) (JRC v2.1 90 m);
  2. `peligro_inundacion_fluvial > 0`;
  3. `margen_rp100_m <= 1` (school DEM height minus JRC RP100 flood level; 141 schools);
  4. `distancia_agua_m <= 1000 AND altura_sobre_agua_m <= 10 AND NOT junto_laguna`;
  5. `infra_geo_rio.distancia_km <= 3`;
  6. access route floods at RP100 (`infra_exposicion_ruta_inundacion.profundidad_max_m > 0`);
  7. FALLBACK only when the school has no susceptibility row: <= 1.5 km from the
     tramo's Prefectura station (declared PNA coords with >= 4 decimals).
  Evidence on the dump: G1 `clase_rio` is `sin_riesgo` and `distancia_agua_m` null for
  all 45 Paso de los Libres schools, and their GloFAS river point is 24 km away; the
  margin and route criteria are what tie riverside schools to the river.
- **River hazard value**: normal = lectura/alerta*33 (capped 33); alerta = 66;
  evacuación = 100; +10 (cap 100) when rising (`variacion_m > 0`) in alerta.
  Readings older than 24 h at asOf, or `inconsistente`, do not count.
  Not counted as missing for non-exposed schools (no confidence penalty).
- **Weights** (`PESOS_AMENAZA`, motor-v0.3): peligroCelda .40, caudal .20,
  rioPrefectura .25, lluviaAntecedente .15 (redistribution rule unchanged).
- **Observed-hazard floor**: exposed + evacuación ⇒ scoreAmenaza ≥ 75 and scoreRiesgo ≥ 50
  (alto); exposed + alerta ⇒ scoreAmenaza ≥ 50 and scoreRiesgo ≥ 25 (moderado). Rationale: an
  official evacuation state on the school's own river is direct evidence; the
  multiplicative vulnerability must not erase it.
- **SYNOP stations** (verified on Ogimet 2026-10-14): 87155 Resistencia Aero,
  87166 Corrientes Aero, 87173 Ituzaingó, 87178 Posadas Aero, 87187 Oberá,
  87270 Reconquista, 87281 Mercedes Aero, 87289 Paso de los Libres,
  87393 Monte Caseros. Goya and Santo Tomé publish no SYNOP on Ogimet.
- **SYNOP rain use**: school within 25 km of a station; 24 h = sum of 6 h
  periods ending in the window (needs all 4), else a t=4 24 h group; 72 h needs
  ≥ 10 of 12 six-hour periods; otherwise IMERG. Source recorded in the factor.
  iR=3 at 00/06/12/18Z ⇒ 0 mm for 6 h; iR=4 ⇒ no data. Trace (990) = 0 mm, traza.

## Tasks
- [x] T1 SYNOP 6RRRt decoder (pure) + real fixtures + tests
- [x] T2 Persistence + Ogimet client + job `sync-synop-lluvia` (+cadence, jobs.mjs, DEPLOY notes)
- [x] T3 River evidence port/adapter + engine integration + floor + tests
- [x] T4 Observed-rain adapter: SYNOP over IMERG + source recorded
- [x] T5 Local recompute against dump (before/after per department, examples)

## Phase 2 (user request 2026-10-14: static susceptibility wrong along the Uruguay; Puerto Valle)

### Audit findings (JRC v2.1 sampled over HTTP with rasterio, 2026-10-14)
- Tiles: S20_W60 (id 85) and S30_W60 (id 86) cover lon -60..-50, lat -40..-20. Corrientes bbox fully
  covered; CRS EPSG:4326, ~93 m pixels, nodata -9999; the pipeline passes (lon, lat) correctly.
- Paso de los Libres RP100 W-E transects at lat -29.715/-29.720: wet only in the channel
  (depth 8.7-14.3 m from lon -57.0850 eastward); every town pixel west of the bank is nodata (= dry).
  School with margin -3.4 m (-29.7200, -57.0873): RP10 and RP100 pixel = nodata. San Cosme 1800133-00:
  RP10 1.09 m, RP100 3.45 m (wide Paraná floodplain is modelled).
- Puerto Valle 1801318-00 (-27.617, -56.415): nodata in RP10/RP100 at the point and along a 3 km
  transect; the Yacyretá reservoir is permanent water and its shore is not a modelled floodplain.
- Root cause (dataset limitation): the JRC global model at 90 m does not produce a floodplain at the
  Uruguay towns (incised banks + global DEM); the river-channel depth is modelled, the town is dry. Not a
  CRS/tile/nodata bug. Static RP classes cannot represent the current event there.
- Pipeline bug found: `margen_inundacion.py` uses the MAX JRC depth over permanent-water pixels as the
  RP water rise. Over the channel that is channel depth (~10-14 m), not a rise above the bank, so
  `margen_rp*` is biased ~10 m low (141 schools <= 1 m). Phase-1 criterion `margen_rp100 <= 1` inherited it.

### Phase 2 design
- Dynamic DEM exposure ("estimado"): water surface at the school = DEM permanent-water level near the
  school + (current gauge reading - 365-day median reading of the tramo station), the anomaly linearly
  interpolated along the river between the two nearest stations of the same river. Exposed when the
  school is within `DISTANCIA_RIO_MAX_M` (default 500 m) of permanent river water and its ground (p10 of
  DEM within 50 m) is <= water surface + `MARGEN_DINAMICO_M` (default 1 m). Assumption: the Copernicus
  GLO-30 water surface corresponds to a typical (median) stage; DEM vertical error ~2 m. Official IGN
  gauge zeros were not found online (searches recorded in final report); the median-anomaly method
  avoids needing them and can switch to official zeros when available.
- Reservoir: schools on the Yacyretá reservoir (upstream of the dam, Paraná, lon > -56.75) get river
  evidence `no_aplica` (Ituzaingó gauge is downstream of the dam).
- Static `margen_rp100` criterion removed until the pipeline fix is re-run; JRC class/fluvial and route
  criteria kept as complementary.
- Rain: observed rain scored against IMERG climatology percentiles when a climatology row exists for the
  cell (by provider/version); otherwise documented absolute thresholds per window (24 h: 50/80/120 mm;
  72 h: 80/120/180 mm, same as `umbrales-provisorios.ts`).
- Degradation: an exposed school whose station has no reading <= 24 h gets a `rio-prefectura` factor
  "sin dato" and counts as missing (confidence drops); never imputed normal.

- Pipeline fix verified: the median floodplain surface inflated by DSM canopy (school 17 m above river
  got -9 m) -> switched to p10 (127 schools <= 1 m; that school +1.3 m). Copernicus GLO-30 is a DSM.
- Dynamic rule guards (data-driven, no event values): school water level must be within +-3 m of the
  tramo's typical river level (median DEM water level of tramo schools <= 500 m from water) - else the
  nearby water is a lagoon; > +10 m above it -> reservoir/perched water -> river evidence `no_aplica`
  (Yacyretá reservoir: Puerto Valle 80.0 m vs Ituzaingó river ~54.5 m).
- Station references (sync-prefectura-historico, 2026-10-14): 18 stations, ~700-740 readings each;
  medians e.g. Paso de los Libres 4.32 m, Santo Tomé 3.74, Ituzaingó 1.20, Corrientes 2.79.

### Phase 2 tasks
- [x] T6 geo-static: fix RP water-surface in `margen_inundacion.py` (+tests)
- [x] T7 geo-static: job `calcular_exposicion_rio_dem` (ground p10, DEM river level, distance) -> output CSV
- [x] T8 table `infra_exposicion_rio_dem` + importer + idempotent scheduled import job
- [x] T9 job `sync-prefectura-historico` (daily, 365-day stats per station) + table + health
- [x] T10 engine: dynamic exposure (interpolated anomaly), reservoir rule, sin-dato degradation
- [ ] T11 engine: rain climatology hook + absolute thresholds per window
- [ ] T12 recompute (incl. 1801318-00) + 'Operación permanente' section

## Merge note
- Migration is `drizzle/0016_lluvia_estacion.sql` (journal idx 15, snapshot `0016_snapshot.json`) because
  branch `GeronimoSerial/veredicto-diario-ia` adds 0015 (verdict tables). If that branch merges first,
  re-order `drizzle/meta/_journal.json` (0015 verdict idx 15, 0016 lluvia idx 16) and regenerate the
  0016 snapshot on top of the 0015 one (`npx drizzle-kit generate` must report no drift).

## Checks
`timeout 300 npx vitest run <related files>`, `npx tsc --noEmit -p .`, `pnpm lint`.

## Progress / evidence
Commits: 4250a4e (T1), c8202f6 + 1493d56 + fc98e24 + 6d7bf00 (T2), c4e7db4 + 3a4a703 + ad41a7a (T3),
50d3f87 + e427e29 (T4), a0da947 -> aee8b75 (exposure revised after review), cbfde7e (SYNOP 06-12Z derivation).
Route per task: T1/T2 parts/T3a/T3b/T4a delegated to Haiku writers; T3 integration, T4 adapter, wiring and
exposure revision inline (core design, already mapped).

### T5 local recompute (dump prod-20261013T2313Z-post-imerg, Postgres 18 throwaway, ahora=2026-10-14T00:30Z)
- Before = main c749d77 (motor-v0.2), after = this branch (motor-v0.3) + SYNOP loaded from Ogimet
  (9 stations, 123 records). Both: 6003 snapshots (2001 schools x 3 horizons), conEvidencia 6003.
- Before: 2001/2001 `bajo` on every horizon (reproduces prod run 931a9bbe).
- After: 15 schools `bajo -> alto`, 10 `bajo -> moderado`, 1976 unchanged (same on 24/72/240 h).

| Departamento | Schools | Change | Alto | Moderado |
|---|---|---|---|---|
| Ituzaingó | 78 | 9 | 9 | 0 |
| San Martín (La Cruz, Yapeyú) | 51 | 7 | 0 | 7 |
| Paso de los Libres | 70 | 6 | 6 | 0 |
| General Alvear | 25 | 3 | 0 | 3 |
| Capital | 363 | 0 | 0 | 0 |
| Empedrado | 59 | 0 | 0 | 0 |
| Itatí | 26 | 0 | 0 | 0 |

- Paso de los Libres (9.33 m, evac 8.50): exposed via `margen_rp100` (4) and `ruta_rp100` (2) -> alto
  (amenaza muy_alto); the other 39 town schools are above the RP100 level and stay bajo.
- Ituzaingó (4.03 m, evac 4.00): Ituzaingó + Apipé Grande schools via `ruta_rp100`/`peligro_fluvial` -> alto.
- Itatí (6.07 / alerta 6.8), Empedrado (4.94 / 6.5), Capital (5.43 / 6.5): river normal -> river factor
  present for exposed schools but no floor; no level change (correct for the observed state).
- Capital rain: SYNOP 87166 now used for 323 Capital schools (24 h 4.8 mm, 72 h 19.3 mm) instead of
  IMERG (1.1 mm / ~5 mm); 461 of 2001 schools use station rain on 24 h. Too little rain to move levels.
- Ituzaingó (87173) and Paso de los Libres (87289) stations have gaps in 6 h groups -> IMERG kept.

## Pending / follow-ups
- Rerun `calcular-hazard-climatologia-caudal` when the Open-Meteo quota resets (caudal is null for all).
- Schedule `sync-synop-lluvia` in Coolify (`habilitado: false` until then) and apply migration 0016.
- Node `fetch` to Ogimet timed out intermittently from this host (curl worked): 7/9 stations failed in
  one local run; watch `ogimet-synop` source health after deploy.
- Replace the station-distance fallback with distance to a river-bank geometry when one exists.
- Floors dominate the score of affected schools (score lands exactly on 50/25): expected while forecast
  cells are verde and vulnerability is multiplicative; revisit with the engine-defect work in
  `mejoras-deteccion-inundaciones.md`.
