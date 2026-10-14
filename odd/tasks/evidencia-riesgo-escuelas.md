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
- **Exposure rule** (do not flag every school in a town): school is exposed to
  its tramo river when its locality maps to an approved tramo
  (`estacionParaLocalidad`) AND any of: `infra_susceptibilidad_estatica.clase_rio`
  in (alto, medio, bajo); `peligro_inundacion_fluvial > 0`;
  `distancia_agua_m <= 1000 AND altura_sobre_agua_m <= 10 AND NOT junto_laguna`;
  `infra_geo_rio.distancia_km <= 3`.
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
- [ ] T5 Local recompute against dump (before/after per department, examples)

## Merge note
- Migration is `drizzle/0016_lluvia_estacion.sql` (journal idx 15, snapshot `0016_snapshot.json`) because
  branch `GeronimoSerial/veredicto-diario-ia` adds 0015 (verdict tables). If that branch merges first,
  re-order `drizzle/meta/_journal.json` (0015 verdict idx 15, 0016 lluvia idx 16) and regenerate the
  0016 snapshot on top of the 0015 one (`npx drizzle-kit generate` must report no drift).

## Checks
`timeout 300 npx vitest run <related files>`, `npx tsc --noEmit -p .`, `pnpm lint`.

## Progress / evidence
(updated per task)
