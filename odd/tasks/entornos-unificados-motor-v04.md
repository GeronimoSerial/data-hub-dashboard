# Unified environments on risk engine v0.4

## Objective

Bring prod, staging and dev to the same code and data state, with every change
currently headed to `dev` shipped to `prod`, and the risk engine v0.4 fully
working: no silent factor gaps, and the frontend consuming v0.4 with equal or
better coverage than v0.3.

## Current state (verified 2026-10-18, ~16:45 UTC)

### Branches and deployments

| Item | State |
|---|---|
| `dev` vs `main` | Equal in code (`main` only has merge commit `e80fa1bd`) |
| `main` vs `prod` | `prod` is 9 commits behind `main` (ops v0.4 workflow, daily verdict, OSM v4 outputs, preview fix) |
| `staging` | Contains `main` plus 9 own commits |
| Prod container | `pts681lz0kazhs1dph8wjaxt`, image revision `d5f1761f` (`prod`) |
| Staging container | revision `a7952790` (`staging`) |
| Dev container | revision `00c55e17` (`dev`) |
| `RIESGO_REGLAS_MOTOR` | Not set in any of the three apps (engine runs v0.4 by default) |
| CI (`ci.yml`) | Runs tests only on PRs to `main`. PRs to `dev` only get GitGuardian |

### Open PRs to `dev`

| PR | Scope | Engine risk |
|---|---|---|
| #176 `fix/actualizar-parte-correcciones` | Parte form, photos, consistency (+515/−114) | None |
| #177 `GeronimoSerial/ui` | Exports tab and xlsx (+5k). "en-riesgo" reads the radar, i.e. the vigente run | Low. Adds a dependency and 13 `.claude/skills/arc` files unrelated to the app |
| #178 `feat/planificacion-riesgo-hoy` | Single operational version v0.4, migration `0029`, flood reference card (+36.7k, ~30k is evidence data) | High |

A trial merge of #176 → #178 → #177 onto `dev` produced no conflicts.

### Database (hub_prod)

- Vigente run: `35d77e75-2018-45fa-8d82-c1e986328d81`, `motor-v0.4`, 6,003 snapshots, all with `resultado_v04`.
- Migration `0029_riesgo_operativo_solo_v04` is applied and registered (`created_at = 1792344000000`, same `when` as in #178). Constraint `infra_risk_run_vigente_solo_v04` is validated.
- Per the #178 docs, the same run was replicated to `hub_staging` and `hub_dev` with matching hashes.

### v0.3 vs v0.4 coverage

| Metric | v0.3 (02:15) | v0.4 (14:15) |
|---|---|---|
| Snapshots per horizon | 2,001 | 2,001 |
| With score, level, hazard, vulnerability, enrollment | 2,001 | 2,001 |
| With access risk | 1,989 | 1,989 |
| High/very high at 24/72/240h | 28/28/28 (identical per horizon) | 7/7/14 |
| `rio-v04 superacion_terreno` | — | 1,368 |
| `caudal-punto-rio nivel_caudal` | — | 3,225 |
| `rio-prefectura altura_rio` | 492 | 804 |

No school loses its score. v0.4 differentiates horizons and adds river factors.

## Defects found

### D1. Meteorological hazard missing at 240h (blocking)

In 3 of the 4 daily `calcular-riesgo` runs, every school gets `sin_dato` for
`nivel_peligro_240h`. Nothing is recorded in `metadatos.degradacion`.

Root cause, reproduced inside the prod container with the deployed code:

1. Rule v0.4 F5 (`lib/infraestructura/riesgo/peligro/nivel.ts`, `acumularVentana`)
   sums precipitation in the window (216, 240] and requires
   `COBERTURA_MIN_VENTANA_V04_HORAS = 18` hours of coverage.
2. `providers/ecmwf.ts` requests `forecast_days=10`, which ends at 00 UTC of
   day 10. Horizons are measured from the ingest time (`corridaEn = ahora`), so
   every later ingest of the day reaches less far:

   | Ingest | Max horizon | Hours in (216, 240] | 240h level |
   |---|---|---|---|
   | 00Z | 239 | 23 | yes |
   | 06Z | 233 | 17 | no |
   | 12Z | 227 | 11 | no |
   | 18Z | 221 | 5 | no |

3. v0.3 used the nearest horizon with a 24h tolerance, so it never showed the gap.

### D2. As-of filter uses `corrida_en`, not `ingerido_en`

`emitidoHastaAhora` compares `corrida_en` (ingest time floored to the 6h block)
with `ahora`. Rows ingested after a run are treated as if they existed when the
run was computed, so recomputing a past instant does not reproduce what was
actually calculated.

### D3. `corrida_en` is not the ECMWF model run

`corridaEn` is our ingest instant. ECMWF open data has a 2h extra delay, and
06/18 UTC runs only reach 144h (00/12 UTC reach 360h). The day-10 window can
refresh at most every ~12h, whatever we request.

### D4. Flood card parses engine prose with regex

`lib/infraestructura/riesgo/presentacion-crecida.ts` extracts probabilities and
heights from the Spanish text of `factor.explicacion` (generated in
`motor/altura-critica.ts`). Any wording change silently empties the card. No
frontend reader uses the structured `resultado_v04`.

### D5. Manual runs displace the scheduled one

A manual `calcular-riesgo` run marks the 6h block as complete, so the next
scheduled run in that block is skipped (`ya_completado`). Expected behavior,
but a re-run after a fix needs an explicit idempotency bypass.

## Open-Meteo facts (verified in the docs)

- Free tier limits: 600/min, 5,000/h, 10,000/day, 300,000/month.
- A call costs more than 1 only with more than 10 variables or more than 2 weeks
  per location. `pesoLlamada` in `providers/cupo-om.ts` applies the same rule.
- The ECMWF request uses 5 variables, so 10 or 11 days (or `forecast_hours`
  up to 336) weighs 1. Max forecast length is 15 days.
- Sources: https://open-meteo.com/en/pricing,
  https://open-meteo.com/en/docs/ecmwf-api,
  https://www.ecmwf.int/en/forecasts/datasets/open-data

## Plan

Each step lists its checks. A step is done only when its checks were observed.

### Phase 1. Hotfix the 240h hazard (today)

- [ ] **T1. Ingest covers 240h on every run.** In `providers/ecmwf.ts`, request
      `forecast_hours=264` (or `forecast_days=11`) instead of `forecast_days=10`.
      Keep `pesoLlamada` at 1. Test: every ingest instant yields horizons ≥ 240.
- [ ] **T2. Engine safety net.** In F5 `acumularVentana`, when the latest ingest
      does not cover the window, use the most recent previous ingest that does,
      at most 18h old. Record a `degradacion` entry for the run when this
      happens, and when 240h still ends as `sin_dato`. Tests for the fallback,
      the age limit and the degradation entry.
- [ ] **T3. Ship the hotfix.** Branch from `main`, PR to `main` (CI runs there),
      then merge into `dev`, `staging` and `prod` so the three stay equal.
      Deploy prod.
- [ ] **T4. Re-ingest and re-run.** Run `sync` ECMWF once (one cycle, about
      8 calls) and `calcular-riesgo` with the idempotency bypass. Confirm with
      the user before each prod action.
- [ ] **T5. Verify in hub_prod.** The new vigente run has 2,001
      `nivel_peligro_240h` factors and `degradacion` is empty. Replicate the run
      to staging and dev with `scripts/replicar-riesgo-v04.mjs`.

### Phase 2. Integrate the open PRs

- [ ] **T6. #176 into `dev`.**
- [ ] **T7. #178 into `dev`.** Migration `0029` is already applied in the three
      databases. Drizzle will skip it by `created_at`, and it is idempotent anyway.
- [ ] **T8. #177 into `dev`.** Remove `.claude/skills/arc` from the PR first.
- [ ] **T9. PR `dev` → `main`.** This is the first point where the test suite
      runs. Fix any failure before continuing.

### Phase 3. Promote and align the three environments

- [ ] **T10. `main` → `staging`.** Reconcile the 9 staging-only commits
      (merge them into `main` or drop them) so staging equals `main`.
      Visual review: flood card, radar, Planificación, exports "en-riesgo".
- [ ] **T11. Pre-prod data check** (read-only, hub_prod): compare the vigente
      v0.4 run with the last v0.3 run per horizon. `count(score_riesgo)` must
      not drop, and every factor family present in v0.3 must be present in v0.4
      (except the replaced `susceptibilidad-physrisk`).
- [ ] **T12. `main` → `prod`.** Deploy prod. Confirm that the 3 containers run
      the same revision and that the next scheduled run publishes v0.4 with
      every factor family and every horizon.

### Phase 4. Frontend consumes v0.4 with full precision

- [ ] **T13. Read structured v0.4 data.** Expose `resultado_v04` from
      `app/api/infraestructura/riesgo/escuela/[cueAnexo]/route.ts` and make the
      flood card read probabilities and abstention reasons from it instead of
      parsing `explicacion`. Keep the text parser only as a fallback during
      the transition.
- [ ] **T14. Contract test** between `explicacionAlturaCritica` and the parser
      while the fallback exists.
- [ ] **T15. Freshness in the UI.** Show the forecast emission time per horizon
      (`observadoEn`). The 240h horizon is less fresh than 24h by design (D3).
- [ ] **T16. As-of correctness (D2).** Filter by `ingerido_en <= ahora`.
      Needs a decision on whether `corrida_en` should hold the ECMWF model run.

## Constraints

- Never exceed the Open-Meteo limits. No repeated full syncs.
- No prod mutation (deploy, re-run, DB write) without explicit user confirmation.
- The three databases keep historical runs. Migration `0029` blocks any v0.3
  run from becoming vigente.

## Progress

- 2026-10-18: analysis done, root cause of D1 reproduced in prod. No code changed yet.
- 2026-10-18: T1 implemented (ecmwf.ts `forecast_hours=264`, `pesoLlamada` dias=11) and T2 implemented (F5 respaldo a la ingesta previa ≤18 h, `peligro_240h_respaldo` / `peligro_240h_sin_dato` en degradación); tests written, CI pending (not run locally).

## Next step

T1 and T2 on a hotfix branch from `main`.
