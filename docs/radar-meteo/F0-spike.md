# F0 — Corrientes weather radar data spike

Research performed 2026-09-29 against the live Open-Meteo Forecast API and the repository's Corrientes department GeoJSON (`departamentos-corrientes-georef-2026-09-27.geojson`). This is a research and design decision only; no product code was changed.

## Findings

### Forecast API availability and sample

Queried `https://api.open-meteo.com/v1/forecast` for three points in Corrientes with all requested hourly fields, `forecast_days=7`, and `timezone=America/Argentina/Cordoba`. The endpoint returned three location objects, each with 168 hourly timestamps from 2026-09-29 through 2026-10-05. Coordinates are snapped to model grid cells in the response.

| Sample point (requested lat, lon) | Returned lat, lon | First hour local time | Probability | Precipitation | Wind / gust / direction | CAPE / LI / CIN | WMO code |
|---|---|---|---|---|---|---|---|
| Capital area (-27.47, -58.83) | -27.45167, -58.79193 | 2026-09-29 00:00 | 10% | 0.0 mm | 18.1 / 34.9 km/h / 109° | 2480 J/kg / 0.0 / 130 J/kg | 3 |
| Mercedes area (-29.21, -58.10) | -29.209139, -58.101257 | 2026-09-29 00:00 | 80% | 0.8 mm | 23.8 / 40.7 km/h / 93° | 1160 J/kg / 1.7 / 41 J/kg | 53 |
| Santo Tomé area (-28.08, -56.03) | -28.084358, -56.033905 | 2026-09-29 00:00 | 80% | 7.2 mm | 20.9 / 46.1 km/h / 114° | 1340 J/kg / 2.5 / 13 J/kg | 96 |

Across those seven-day samples, precipitation probability reached 100%; maximum hourly precipitation was 4.9, 6.8, and 9.7 mm respectively. Maximum wind speed was 23.6–25.0 km/h, gusts 43.6–50.0 km/h, and CAPE 1160–2480 J/kg. All requested variables were populated in the sample. Returned units were `%`, `mm`, `km/h`, `°`, `J/kg`, WMO code, dimensionless lifted index, and `J/kg` for convective inhibition. Precipitation is an hourly accumulation; probability is the probability of more than 0.1 mm in the preceding hour.

The eastern point forecast returned code 96 twice in the 168-hour sample. WMO code 96 means slight or moderate thunderstorm with hail; 99 means heavy thunderstorm with hail. So the codes are not intrinsically Central-Europe-only, and a hail proxy is not the only possible hail signal. This is a forecast-model weather code, not a hail observation or a calibrated hail probability.

Multi-location comma-separated coordinates worked: a separate request returned a list of two location objects. Forecast API documentation allows up to 16 days; seven days is supported and returned 168 hourly slots. The API's documented multi-location output changes to a list and each location carries its own snapped coordinate and hourly arrays. Open-Meteo's feature documentation specifies batches of up to 100 coordinate pairs, so larger grids must be chunked.

`models=best_match`, `models=ecmwf_ifs025`, and `models=gfs_seamless` all returned 168 hours and non-null precipitation probability at both tested locations. At the first hour, probabilities were respectively 10% / 80%, 10% / 80%, and 0% / 45%. This confirms availability for these points, not that the values agree. Keep `best_match` as the production default because it selects suitable available models for the location; make the model choice explicit in stored run metadata. The model-specific checks show that explicit ECMWF and GFS selection are viable alternatives, but model selection can change probabilities materially. The Open-Meteo GFS documentation says probability is based on the share of 31 GEFS members exceeding 0.1 mm/h; it describes probability products and resolution as model-dependent.

Sources: [Forecast API documentation](https://open-meteo.com/en/docs), [GFS API variable documentation](https://open-meteo.com/en/docs/gfs-api), [WMO code table 4677](https://www.nodc.noaa.gov/archive/arc0021/0002199/1.1/data/0-data/HTML/WMO-CODE/WMO4677.HTM).

### Candidate grids

The GeoJSON vertex bounds are longitude -59.710824 to -55.620259 and latitude -30.730192 to -27.253966. I counted points on regular longitude/latitude grids aligned to degree increments, retaining points inside the province polygon or within approximately 0.1° of its boundary. The latter is a small geographic buffer (roughly 9–11 km at Corrientes latitudes). These are planning counts; final grid generation should use a proper polygon buffer and a documented point-in-polygon operation.

| Grid spacing | Approx. spacing at Corrientes | Candidate points | Bounding-box lattice points | Visual / quota implication |
|---|---:|---:|---:|---|
| 0.25° | 24–28 km | 156 | 323 | Coarse, visibly blocky for a province-wide smooth raster; lowest cost |
| 0.2° | 19–22 km | 244 | 504 | Good initial compromise for provincial patterns; still materially smoother than 0.25° |
| 0.1° | 9–11 km | 979 | 1755 | Smoothest of these options, but the model's native field is not truly 10 km and the quota cost is high |

Grid spacing describes interpolation/display sampling, not forecast resolution. It must not imply detail finer than the selected model provides. The polygon buffer avoids a hard edge at the province boundary; clip the visible raster to the province outline in the map.

## DECISIONS

### Grid

Start with a 0.2° grid, approximately 244 retained points using the counts above. It offers a meaningful visual improvement over 0.25° without the near-fourfold jump to 0.1°. Preserve the spacing as configuration so a 0.25° quota fallback is straightforward. Generate candidate points deterministically from the checked-in boundary data, apply a small geodesic buffer, and assign stable cell IDs from grid indices. Persist actual returned snapped coordinates as source/model metadata; do not silently treat requested coordinates as native model cells.

### Variables and update interval

Use the seven core fields `precipitation_probability`, `precipitation`, `wind_speed_10m`, `wind_gusts_10m`, `wind_direction_10m`, `cape`, and `weather_code`. Add `lifted_index` and `convective_inhibition` only if evaluation shows useful hail discrimination. Keep the priority order rain → wind → hail: on pressure, first omit CIN and lifted index, then omit CAPE / hail overlay, then wind speed, gust, and direction, while retaining both rain fields.

With the updated budget allocation, refresh every three hours on the model update cycle. Use the returned hourly forecast frames for playback. The larger 0.1° grid can be refreshed eight times daily and still stay just inside the 20% daily and monthly safety margins. Do not poll hourly: that would exceed the protected daily/monthly budget at 0.1° and can fetch unchanged model runs. Use the shared quota reservation/cooldown mechanism for all calls; monthly/manual legacy jobs must remain paused or be scheduled so their weight is accounted for before a climatology run.

### Quota calculation

The repository's `pesoLlamada` formula is:

```text
max(1, variables / 10) × max(1, forecast_days / 14) × locations
```

It conservatively assumes multi-location requests scale linearly with locations, even though Open-Meteo has not published a definitive multi-location billing rule. At 7 days and 2, 5, 7, or 9 variables, both factors are 1; thus quota weight per run equals retained point count. Batching into ≤100 coordinates changes the number of HTTP requests, not this conservative aggregate weight.

| Grid | Weight / run | 1 h: runs/day, weight/day | 3 h: runs/day, weight/day | 6 h: runs/day, weight/day |
|---|---:|---:|---:|---:|
| 0.25° | 156 | 24, 3,744 | 8, 1,248 | 4, 624 |
| 0.2° | 244 | 24, 5,856 | 8, 1,952 | 4, 976 |
| 0.1° | 979 | 24, 23,496 | 8, 7,832 | 4, 3,916 |

The free-tier hard ceilings are 600/minute, 5,000/hour, 10,000/day, and 300,000/month. Keeping about 20% below each gives radar planning ceilings of 480/minute, 4,000/hour, 8,000/day, and 240,000/month. The recommended 0.1° / three-hour option weighs 979 per run, 7,832/day, and approximately 234,960 over a 30-day month. That is 78.3% of both the daily and monthly hard limits, leaving 21.7% margin. Each run requires ten requests (nine × 100 points and one × 79) at the 100-coordinate batch cap, with aggregate run weight 979. Pace those requests over at least three minutes (e.g. 4 + 4 + 2) so no minute exceeds the 480 planning ceiling; each request weighs at most 100. The full run weight 979 is below the 4,000 hourly planning ceiling. The daily window is the binding limit.

For comparison, 0.2° refreshed hourly costs 5,856/day and about 175,680 per 30-day month, inside all protected budgets, while 0.1° refreshed every six hours costs 3,916/day and 117,480/month. The 0.1°/three-hour choice uses most of the allocated quota to improve spatial smoothness and forecast freshness. Its remaining headroom is only 168/day and 5,040/month under the protected budgets, so a monthly or manual climatology run must be accounted for and may require reducing radar cadence or temporarily using 0.2°/three-hour (1,952/day) or 0.1°/six-hour (3,916/day). Maintain leases/idempotency and shared atomic quota reservations; if any reservation fails, leave that run retryable and do not publish an empty success. Rain fields remain the first priority; omit optional hail variables and overlay, then wind fields, before dropping either rain field.

Open-Meteo free-tier ceilings and its variable/day counting examples are documented on [Pricing](https://open-meteo.com/en/pricing). Its page says a request normally corresponds to one HTTP request, with fractional extra weight for >10 variables and >14 days. The linear coordinate multiplier above follows the repository helper's conservative assumption.

### Storage and read API

Prefer one compact immutable forecast-run record over one database row per cell × instant. Suggested run metadata: `id`, `provider`, `model`, `run_at`, `fetched_at`, `timezone`, `grid_version`, `forecast_start`, `forecast_end`, `step_minutes`, `units`, `status`, and an indexed idempotency key. Store arrays in a JSONB payload (or a compressed binary payload if measured size warrants it), with stable cell IDs and coordinates once per cell and each variable's 168 values per cell. With 244 cells, 168 timestamps, and 7–9 variables, row-per-observation design would create roughly 287k–370k values per run plus row/index overhead; compact arrays avoid that write and index amplification. Keep at least the newest complete run and retain run history for 7–14 days for rollback and freshness diagnosis; purge expired runs after publishing a replacement successfully.

Suggested UI response:

```json
{
  "runAt": "2026-09-29T00:00:00Z",
  "fetchedAt": "2026-09-29T00:05:00Z",
  "model": "best_match",
  "stepMinutes": 60,
  "times": ["...168 ISO timestamps..."],
  "units": {"precipitation_probability":"%", "precipitation":"mm"},
  "grid": {"version":"corrientes-0.2-v1", "cells":[{"id":"...", "lat":-27.45, "lon":-58.79}]},
  "frames": [{"time":"...", "cells":[{"id":"...", "probability":10, "precipitation":0.0}]}]
}
```

For payload efficiency, the wire form may transpose `frames` into per-variable typed arrays; keep the semantic contract as timestamps + grid IDs + selected variable values. Allow the client to request a variable and a frame range, and include run freshness and units. Default playback can step hourly; a 3-hour display mode can select every third timestamp without discarding hourly source values.

### Rendering

Use a client-side `CanvasSource` or stretchable image source in MapLibre, generated from the grid values for the selected timestamp. Bilinearly interpolate between neighboring grid points into a device-sized canvas, alpha-mask it to the province polygon, and update the source image as the timeline advances. Use a transparent precipitation ramp inspired by familiar NWS radar reflectivity colors, with discrete labels and thresholds expressed in mm/h; use a separate sequential ramp for probability (0–100%). Do not reuse a reflectivity dBZ legend as if it were a precipitation-amount scale. The raster is model forecast, not observed radar imagery.

MapLibre GL JS is already installed. Native Canvas 2D, `CanvasSource`, `ImageSource`, GeoJSON and symbol/circle layers add no npm dependency or bundle cost. Add sparse wind arrows as a GeoJSON symbol layer rotated by `wind_direction_10m` and styled by speed/gust; only consider a custom MapLibre WebGL layer for animated particles after profiling, since that entails custom rendering code rather than a justified dependency. Render hail potential as a separate, toggleable outline/dot overlay with a distinct legend. Avoid adding deck.gl or a particle package in F0: no external library is required for the initial effects, keeping incremental bundle cost at zero.

References: [MapLibre API: CanvasSource / addSource](https://maplibre.org/maplibre-gl-js/docs/API/classes/Map/), [MapLibre examples](https://maplibre.org/maplibre-gl-js/docs/examples/).

### Hail signal / proxy

First use forecast WMO codes 96 and 99 as an explicit model hail signal; the live Corrientes sample emitted code 96 at Santo Tomé. Their meanings are slight/moderate and heavy thunderstorm with hail respectively. Keep this categorical and label it as forecast guidance, not an observed or calibrated chance. WMO 95 (thunderstorm without hail) is not evidence of hail.

If a continuous overlay is still needed, call it **convective hail environment**, not hail probability. A conservative, explicitly uncalibrated heuristic for initial evaluation is:

* No signal unless precipitation probability is at least 40% (or WMO code is 96/99) and CAPE is at least 500 J/kg.
* Elevated environment when CAPE ≥1000 J/kg and lifted index ≤0°C; stronger environment when CAPE ≥2000 J/kg and lifted index ≤−2°C.
* Gusts ≥50 km/h may raise the display category by one level only when the CAPE/LI and precipitation gates are met. Never use gusts alone as hail evidence. CIN may suppress the level (e.g. CIN >150 J/kg) rather than serve as a positive hail indicator.

These are triage bins to validate against Corrientes events, not a probability model. CAPE and LI indicate instability, while hail reaching the ground also depends on the hail-growth-zone CAPE, vertical shear, freezing and wet-bulb-zero heights, storm structure, and melting. Those factors are not all among the cheap requested fields. NWS training material identifies CAPE, freezing level, wet-bulb zero, and shear among hail factors, and notes the influence of dry mid-level air; therefore the UI must show uncertainty and must not imply meteorological warning-grade certainty. If available at little quota cost, prefer adding `freezing_level_height`; proper calibration requires local hail reports and retrospective validation.

Sources: [NWS Skew-T parameters and hail guidance](https://www.weather.gov/source/zhu/ZHU_Training_Page/convective_parameters/skewt/skewtinfo.html), [NWS severe-weather forecasting](https://www.weather.gov/source/zhu/ZHU_Training_Page/skewt_severe/skewt_severe.html), [WMO code table](https://www.nodc.noaa.gov/archive/arc0021/0002199/1.1/data/0-data/HTML/WMO-CODE/WMO4677.HTM).

### Automatic refresh

Choose a host systemd timer invoking the existing `scripts/jobs.mjs` runner through `docker exec`, with one timer every three hours. The repository already documents systemd host timers as its established job pattern in `docs/ejecucion-enos/OPS1/runbook-scheduler.md`; that is preferable to introducing an in-process scheduler. The brief notes that timers are not currently installed on the host, so installation/deployment remains an operational step. Resolve the running application container by stable Compose service/project labels (or a carefully anchored name prefix) on each run because Coolify changes container-name suffixes. Require exactly one running match, log and exit otherwise, and retain DB lease/idempotency so overlapping timer invocations cannot duplicate a run.

Tradeoffs: systemd survives app restarts and keeps scheduling outside web replicas, but the host needs timer/service files and Docker access. Coolify scheduled tasks avoid host timer administration but couple cadence and execution to Coolify task configuration and container lifecycle. An `instrumentation.ts` scheduler is easiest to deploy with Next but may run once per replica, restart at deployments, and needs distributed locking and leader election; it should not own forecast ingestion. The systemd choice fits the existing runner and permits deterministic logs/retries while container discovery handles redeploy suffixes.

## Open questions before F1

1. Does the production Open-Meteo account have an API key / paid quota, and what are measured daily/hourly weights for all existing jobs over an ordinary week (separately from the active backfill)?
2. Is forecast guidance sufficient for the term “radar,” or should the UI call this a forecast radar to distinguish it from observed precipitation radar?
3. Can the team obtain georeferenced hail reports for Corrientes to evaluate WMO-code hit rate and calibrate the CAPE/LI bins?
4. Should the initial map show the latest 7-day hourly run only, or retain selectable prior runs for forecast revision comparison?
5. Which exact model source should be pinned after comparing several weeks of Corrientes rain forecasts and measured outcomes against `best_match`?

## Coordinator resolution (binding for F1–F5)

The grid and quota sections above disagree (0.2° vs a revised 0.1°/3 h). These decisions settle them and the open questions:

1. **Grid: 0.2°** (about 244 cells), with spacing kept configurable. The source models are about 0.25° native, so 0.1° only oversamples; client-side bilinear interpolation provides the smoothness.
2. **Refresh: every 3 h**, 7 days of hourly frames. That is 1,952 weight per day (about 20% of the daily limit) and about 59k per month. The headroom is kept for the monthly climatology run and for reactivating river forecasts if needed.
3. **Variables (8):** `precipitation_probability`, `precipitation`, `wind_speed_10m`, `wind_gusts_10m`, `wind_direction_10m`, `cape`, `lifted_index`, `weather_code`. `freezing_level_height` is added only if it keeps the weight at 1 (it does at 10 variables or fewer, so it is included as the 9th). CIN is dropped.
4. **Model:** `best_match`, recorded in the run metadata.
5. **Storage:** one immutable run record with compact JSONB arrays. Keep 14 days of runs and serve only the latest complete run.
6. **Hail:** WMO 96/99 are a categorical signal, plus the uncalibrated "convective hail environment" bins above. The UI labels it "Granizo (estimado)".
7. **UI naming:** Spanish UI "Radar de pronóstico", with an explicit note that it is model forecast, not observed radar.
8. **Scheduler:** a host systemd timer running `docker exec` with container discovery by the Coolify label or anchored name prefix. The climatology jobs run monthly at a low-usage hour.
9. **API key:** none (free tier), with `apiKeyPresente=false` as the default.
