# H0 spike — precise, useful weather radar

Date: 2026-09-30. Scope: research and product specification only; no application code changed. This builds on [R1 precision audit](../../../../tmp/radar-precision/R1-report.md) and [F0 decisions](F0-spike.md).

## Executive findings

- The product has three jobs, in order: show **official SMN alerts**; answer whether heavy rain is likely tomorrow and when; show daily rain by department for the next seven days. Use a department-area average with local cell maximum in detail, plus point forecasts at school coordinates.
- The official SMN endpoint `ws1.smn.gob.ar/v1/warning/alert/area?mode=alert` returned HTTP 401 without credentials. The official RSS/CAP path works: RSS HTTP 200 lists 25 CAP XML links; linked CAP responses are valid OASIS CAP 1.2 XML with `severity`, phenomenon, issue/validity times, official text and polygon geometry. CAP severity is not an explicit yellow/orange/red SAT color field. The eastern Corrientes sample polygon intersects Ituzaingó. The RSS had no current Corrientes alert at capture time; never serve expired CAP entries as active.
- The live Open-Meteo Ensemble request succeeded without a key for all 25 centroids. One variable, seven days returned 168 hourly steps, 50 member series plus a mean, 1,229,941 bytes in 2.831 seconds. No quota/rate headers or 429/plan errors appeared. Provider-side billing of member arrays remains unconfirmed.
- With the repository's conservative `pesoLlamada` rule, 25 centroids × one requested variable × seven days costs **25 weight per run**, or 100/day every six hours. If all 51 returned precipitation series count as variables, the rule yields 127.5/run and 510/day. Set a **600 weight/day hard cap** for this pilot, reserving margin above the conservative returned-series estimate and far below the roughly 1,950/day radar allocation; stop on 429, plan error, or observed usage above cap.
- Department and school values can be derived from the existing 0.2° hourly `best_match` run for zero additional Open-Meteo cost. The run stores seven days, refreshes every three hours (about 1,950/day), and is retained 14 days.

## 1. SMN official alerts: source, contract and territorial mapping

### Evidence and live-call status

The public SAT page is [ws2.smn.gob.ar/alertas](https://ws2.smn.gob.ar/alertas). Live probe on 2026-09-30: `GET https://ws1.smn.gob.ar/v1/warning/alert/area?mode=alert` without auth returned **401 Unauthorized** with JSON `{timestamp,status,error,message,path}`. The exact auth flow, key issuance, rate limits and schema behind that route remain unknown; a JWT-managed auth flow is reported by a third-party client but was not verified. The public feed `GET https://ssl.smn.gob.ar/CAP/AR.php` returned **200**, `application/rss+xml`, 17,644 bytes, 25 item links; headers contained `Cache-Control: max-age=180` and a second `max-age=60, public, must-revalidate` (conflicting cache directives). Its items link individual CAP XML files. One live CAP XML link returned **200**, `text/xml`, 3,198 bytes and parsed as CAP 1.2. The captured CAP sample was issued 2026-09-29 13:21:41−03; it expires 2026-09-30 02:59:59−03 and was expired by next-day capture. Corrientes CAP polygons in the RSS also expired by 08:59:59−03 on 30 Sep; no current Corrientes alert remained when fetched. This proves machine-readable CAP delivery, not guaranteed freshness. See [SMN SAT page](https://ws2.smn.gob.ar/alertas), [SMN technical note](https://repositorio.smn.gob.ar/bitstream/handle/20.500.12160/1838/Nota_Tecnica_SMN_2022-124.pdf?isAllowed=y&sequence=1), and [SAT decision manual](https://repositorio.smn.gob.ar/bitstream/handle/20.500.12160/2594/C9%20-%20Manual%20de%20uso%20para%20tomadores%20de%20decisi%C3%B3n.pdf?isAllowed=y&sequence=1).

The CAP payload is structured as root `identifier`, `sender`, `sent`, `status`, `msgType`, `scope`; `info` includes `language`, `category`, `event`, `urgency`, `severity`, `certainty`, `onset`, `expires`, `senderName`, `headline`, `description`, `instruction`, `web`; and `area` includes `polygon` (lat,lon pairs). The CAP `severity` enum is the closest level-like field observed (`Moderate` in the sample); it is not explicitly the SMN SAT color level. The CAP records had no `areaDesc` or geocode fields. Thus use `identifier`/sender/sent for bulletin identity and geometry for department intersection, not a presumed department code. CAP includes issue/expiry but not an explicit generic `effective` in every record; validate optionality. CAP polygon is the strongest area schema observed. No rate-limit headers were returned; RSS cache headers suggest refresh/cache behavior, not alert-generation cadence. The live RSS items were issued at 19:00 GMT on 29 Sep and can become stale after expiry.

The SAT page states Creative Commons Attribution 2.5 Argentina for SMN site content. No distinct machine-feed/API terms or rate limits were found; confirm reuse/attribution with SMN before production. Treat the JSON API as unavailable without authorized credentials, and use the public CAP feed only with expiry checks and freshness monitoring.

The expected alert record contract should preserve raw upstream data and normalize only after validation: upstream ID; phenomenon/type; level; issued-at; start/end validity; official headline and description/recommendation; zone IDs/names; geometry (if supplied); source URL; fetched-at; and raw payload. CAP, if the current feed is valid, provides the interoperable format alternative. Do not infer issued-at from fetch time or represent warning/ACP products as official SAT alerts without explicit product typing.

### Corrientes department mapping

The project geometry is `public/data/departamentos-corrientes-georef-2026-09-27.geojson`, IGN source, 25 features. It has stable department IDs, names and centerpoints. The table below is the centroid input set for the proposed one-variable pilot; coordinates are copied from each feature's `properties.centroide` (not recomputed).

| Department | IGN ID | Latitude | Longitude |
|---|---:|---:|---:|
| San Cosme | 18133 | -27.382299 | -58.517474 |
| Esquina | 18049 | -29.985327 | -59.241382 |
| Itatí | 18077 | -27.346056 | -58.071382 |
| Monte Caseros | 18112 | -30.228961 | -57.870302 |
| Ituzaingó | 18084 | -27.911309 | -56.790098 |
| Capital | 18021 | -27.522337 | -58.762484 |
| San Luis del Palmar | 18140 | -27.602053 | -58.268351 |
| Sauce | 18175 | -29.999503 | -58.794997 |
| Curuzú Cuatiá | 18035 | -29.695467 | -58.324860 |
| San Miguel | 18154 | -27.875860 | -57.410042 |
| Empedrado | 18042 | -27.896113 | -58.665840 |
| Berón de Astrada | 18014 | -27.477970 | -57.611381 |
| San Martín | 18147 | -28.828980 | -56.931584 |
| Paso de los Libres | 18119 | -29.593636 | -57.299634 |
| Goya | 18070 | -29.451454 | -59.255912 |
| Lavalle | 18091 | -28.987990 | -58.933723 |
| San Roque | 18161 | -28.705807 | -58.613036 |
| General Alvear | 18056 | -28.775163 | -56.511530 |
| Concepción | 18028 | -28.408400 | -58.031393 |
| Bella Vista | 18007 | -28.497387 | -58.930435 |
| Santo Tomé | 18168 | -28.231104 | -56.222177 |
| Saladas | 18126 | -28.212469 | -58.619913 |
| General Paz | 18063 | -27.719932 | -57.787633 |
| Mburucuyá | 18098 | -28.016384 | -58.185564 |
| Mercedes | 18105 | -29.064507 | -57.818386 |

CAP links use names like `...Tormenta_Llanura_alertas_alertas_12.xml`, but the numeric suffix is part of a per-message filename, not a stable territory ID. Returned CAP areas have polygon geometry and blank `areaDesc`; no stable Corrientes zone ID/name was exposed. I intersected the 25 linked CAP polygons from the live RSS snapshot with the IGN department multipolygons. Four eastern polygons intersected Corrientes: suffixes 9 and 11 intersected **Ituzaingó and Santo Tomé**; suffixes 10 and 12 intersected **Ituzaingó**. These are message polygon observations, not a complete or stable zonal partition; they had expired by capture time. Other departments had no current alert polygon in this snapshot. In production, dynamically intersect each CAP polygon with all 25 IGN multipolygons (store department ID/name, intersection area/fraction and GeoJSON version), instead of hard-coding a permanent `9→Ituzaingó` mapping. This maps each alert to the department set required by the UI, but a full official SAT zone catalog is not published/verified here. Keep all 25 department IDs/names in the mapping universe.

Dynamic geometry mapping avoids guessing zone aliases. Use a small positive-area intersection threshold to avoid boundary-only topology noise; retain overlap fractions and source geometry for review. Do not turn absent geometry or stale/expired alerts into a department match.

### Raw sample files and gap

The deliverable directory includes genuine CAP RSS and XML samples, the 401 JSON response, a trimmed no-key Ensemble response and response headers. CAP samples are explicitly expired at capture; they demonstrate schema and polygon mapping, not active state. H1 still needs an empty/no-alert capture and a current Corrientes CAP for an active event, plus investigation of the inconsistent cache headers.

## 2. Free Open-Meteo Ensemble pilot

### Request and call evidence

Live request to `https://ensemble-api.open-meteo.com/v1/ensemble` with all 25 centroids, `models=ecmwf_ifs025`, `hourly=precipitation`, `forecast_days=7`, Buenos Aires timezone, and no API key returned **HTTP 200**. Response size: **1,229,941 bytes**. Measured elapsed time: **2.831 s** (one request). Headers: `Date`, `Content-Type: application/json; charset=utf-8`, chunked transfer encoding, connection close; no quota/rate headers. Response contained 25 locations, 168 timestamps (2026-09-30T00:00 through 2026-10-06T23:00), 50 member arrays `precipitation_member01`…`precipitation_member50` and one `precipitation` series per location. No 429 or plan error occurred. See the sample and headers in `muestras/`.

The current Open-Meteo Ensemble documentation and pricing should be rechecked during implementation: [Ensemble API docs](https://open-meteo.com/en/docs/ensemble-api), [pricing](https://open-meteo.com/en/pricing). The exact requested `ecmwf_ifs025` model returned 50 member arrays plus the mean.

### Quota budget and guardrail

Repository `pesoLlamada` is `max(1, variables/10) × max(1, days/14) × locations`. At 25 locations, one requested variable, seven days: 25 weight/run; four runs/day is **100/day**. If billing counts all 50 members plus mean as 51 variables, `pesoLlamada({ubicaciones:25,variables:51,dias:7})` is **127.5/run**, or **510/day**. This is the conservative bound under the repository helper—not 25×51, because its variable factor is divided by ten. Combined with radar's roughly 1,950/day the bound is about **2,460/day** (73,800/month at 30 days), before other jobs. The live response has no quota headers, so this is a budget estimate, not measured billing.

**Pilot policy:** every six hours, aligned to available ECMWF cycle readiness with a delayed fetch/retry; do not request hourly. Hard reserve **600 local weight/day** for this pilot and at most four calls/day. Count failed attempts conservatively after a request reaches the network; cap retries. The user chose free-tier pilot only; Professional purchase requires a later explicit decision. Pause Ensemble on 429, plan errors, or measured daily weight above 600. Keep the pilot's weight in the shared quota reservation ledger; the existing radar's roughly 1,950/day remains separately reserved.

For probabilities, aggregate each member's local-day hourly values to daily accumulation first, then derive median/p10/p90 and `P(≥25 mm)` (optionally ≥10/50). Publish valid-member count and never treat missing member values as zero.

## 3. Zero-quota department aggregation from existing run

Use the current `radar_meteo_run` payload: hourly values on the 0.2° Corrientes grid, UTC timestamps, seven forecast days, nine configured fields. No new Open-Meteo request is needed. At the aggregation boundary convert timestamps to `America/Argentina/Buenos_Aires`; use local calendar days, explicitly handling DST even though Argentina currently has no DST.

### Cell assignment and weights

Build a stable cell→department lookup once per `grid_version` and GeoJSON version. Use each model grid cell's center (`latModelo`, `lonModelo`) and point-in-polygon against each department multipolygon. Boundary ties go to the department with the largest intersection/nearest polygon-edge distance. If a center is outside every polygon (including the existing grid's 10 km buffer cells), assign the nearest department by great-circle distance to the department geometry, not its centroid alone; tag fallback assignments for QA. Persist a versioned compact mapping (cell ID, department ID, overlap area/weight, fallback bool) or deterministically compute/cache it once. For area-average values, assign by cell center for the initial build; where cheap, weight by grid-cell/polygon overlap area, correcting for longitude scale (or use equal-area CRS). `radar_meteo_run` currently uses the generated buffered grid and provides model-adjusted cell coordinates; keep the mapping stable to the grid's stored model coordinates.

### Per-department/day metrics

- **Area-average daily rain (mm):** sum each cell's hourly precipitation for hours in the local day, then compute the area-weighted arithmetic mean across assigned cells with valid values. Do not sum across cells. Keep coverage (`validWeight / totalWeight`); below 80% return null.
- **Local maximum daily rain (mm):** maximum of the same per-cell daily sums; retain cell ID/coordinates for detail. This distinguishes a localized convective maximum from the department mean.
- **Maximum gust:** max `wind_gusts_10m` across all valid cells/hours in that local day, in km/h; also retain time and cell.
- **Peak hour:** hour at which the weighted department mean hourly precipitation is largest, in local time; report the interval as the ending hour because source precipitation is the preceding hour's accumulation. Tie-break to earliest timestamp.
- **Storm flag:** true if any cell/hour has WMO `weather_code` 95, 96 or 99. Keep source codes and time; this is model guidance.
- **Hail category maximum:** take max category across WMO 96 (hail thunderstorm, lower intensity) and 99 (heavy hail thunderstorm), map to categorical estimated hail; null if none. Do not infer hail from WMO 95.
- **Own thresholds:** highlight daily department mean ≥25/50 mm and gust ≥60/80 km/h in the table only. These are internal thresholds, never “alerta”.

### Next 48 hours

For each department and each of the next 48 hourly periods, provide area-average hourly precipitation, local maximum precipitation, area-average/max gust, peak storm/hail code and valid-cell coverage. Retain local ISO timestamp plus UTC offset; do not aggregate to three-hour means. Existing `paso=3` must read **“mm en 3 h”** (and, if shown, explicitly label a separate average rate as mm/h).

## 4. School-point forecast

School coordinates already come from `ge.ge_localizacion.lat/lon` exposed in `lib/infraestructura/parte-mapa.ts` as `lat`/`lon`; the map API's school records include `cueAnexo`, `lat`, `lon`, name, locality and department. Use that same established coordinate source and `cueAnexo` identity. At click time, bilinearly interpolate each hourly grid variable from the four surrounding model-grid points; fall back to the nearest valid cell near edges and disclose that fallback. Daily rain is the sum of interpolated hourly rain for the local day (do not interpolate precomputed department means). Include department ensemble daily probabilities as context, clearly marked as department-level, not a school-specific probability. If no valid school coordinate, omit point detail and show the department estimate only. This adds no Open-Meteo quota.

## 5. IMERG verification design

Reuse `sync-imerg.ts`, `providers/imerg.ts` and `peligro/observado.ts`. IMERG observations are stored as `hazard_observation` rows at `geometry_ref` (grid-cell reference), one `mm/30min` value per half-hour, with `valido_desde`/`valido_hasta`, quality and provider. Existing observed aggregation requires at least 80% coverage of the 48 half-hour periods for 24 h. The sync job backfills a rolling 72 h (+ latency margin) and processes a bounded number of new granules per run. It has no explicit pruning in the sync job; this means the 14-day radar retention is sufficient for archived D-1 forecasts, while IMERG rows currently remain available beyond 14 days unless another retention mechanism exists. Verify database growth and establish a separate 45-day cleanup only after an audit of other consumers; verification itself needs at least 30 days of recent rows.

Daily job sequence (after the Early Run latency, e.g. 08:00 local for the previous local day):

1. Select the latest **complete radar run fetched/issued before the D-1 local day begins**, with archived coverage for the full local day. Persist run ID and issue/fetch time; never use the newer run that saw observed-time data.
2. For each of 25 departments, map forecast grid cells and IMERG 0.1° observations by polygon/cell overlap (use area weights and quality filter). Sum the 48 half-hour IMERG values per observed cell for D-1; require ≥80% temporal coverage per cell and ≥80% department area coverage. Forecast target is the department area-average daily forecast; observed target is area-average IMERG daily sum. Keep grid/algorithm versions.
3. Store paired forecast/observation, valid area coverage and missing reason so summary statistics can be recomputed. Exclude pairs without adequate coverage; do not silently impute zero.
4. Compute over trailing 14 complete days and also report sample count: mean bias `forecast − observed` in mm/day; POD for event threshold observed ≥10 mm/day = hits/(hits+misses); FAR = false alarms/(hits+false alarms), with event threshold forecast ≥10 mm/day. Include eligible pair count, event count, coverage and date range. These categorical scores require both forecast and observed classification at the same threshold.

Show “precisión reciente” only after **at least 14 valid department-days and at least 5 observed ≥10 mm events** in the lookback (14 calendar days can provide up to 350 pairs); otherwise say “aún sin muestra suficiente”. Report the n and date window beside metrics; separate lead time/model when metadata is reliable. IMERG is a satellite estimate, not gauge truth; use “verificación con IMERG”. Existing 72 h ingestion/backfill alone cannot guarantee historic D-1 coverage after downtime, so backfill via repeated bounded syncs before enabling scores.

## 6. Data model and API proposal

Use immutable compact run records matching existing `radar_meteo_run` conventions and repository naming style (snake_case DB). Proposed tables:

- **`radar_meteo_ensemble_run`**: `id`, `model`, `run_at`, `fetched_at`, `timezone`, `department_geo_version`, `forecast_start/end`, `step_minutes`, `member_count`, `status`, `idempotency_key`, `payload jsonb`, `raw_meta jsonb`; unique idempotency key and status/fetched index. Payload by department with timestamps, daily member summaries or compact hourly/member arrays. 14-day retention, preserving latest complete run. Persist raw response only if compact; otherwise store checksum/selected response metadata.
- **`smn_alerta`**: `id` (upstream stable ID), `product_type`, `level`, `phenomenon`, `issued_at`, `valid_from`, `valid_to`, `zones jsonb`, `departments jsonb`, `geometry jsonb` nullable, `headline`, `description`, `recommendation`, `source_url`, `fetched_at`, `raw jsonb`, `status`. Unique upstream ID + update/version key; indexes on validity and level. Keep current and expired notices for **90 days** for audit, purge older; retain deduped raw versions only when materially updated.
- **`radar_meteo_verificacion`**: `department_id`, `local_date`, `forecast_run_id`, `lead_hours`, `model`, forecast/observed mm, bias, event threshold, hit/miss/false-alarm classification, forecast/observed coverage, IMERG granule count, mapping/algorithm versions, computed_at. Unique `(department_id, local_date, forecast_run_id, lead_hours, algorithm_version)` and indexes by date/department. Keep at least 2 years to support seasonal diagnostics; raw observation retention is separate.

Suggested authenticated/read API contracts:

`GET /api/infraestructura/radar-meteo/resumen?modo=diario` returns `{ runAt, fetchedAt, timezone, alerts: [{id,level,phenomenon,headline,description,issuedAt,validFrom,validTo,departments}], departments: [{id,nombre,days:[{date,rainMeanMm,rainMaxMm,peakHour,maxGustKmh,storm,hailCategory,probability25,thresholds:{rain25,rain50,gust60,gust80},coverage}]}], verification: {available,window,n,biasMm,pod10,far10,coverage} }`. `probability25` is null unless the pilot ensemble run is valid.

`GET /api/infraestructura/radar-meteo/resumen?modo=horario&horas=48` returns the same freshness/alerts plus `hours:[{time,departments:[{id,rainMeanMm,rainMaxMm,maxGustKmh,storm,hailCategory,coverage}]}]`.

`GET /api/infraestructura/radar-meteo/escuela/[cueAnexo]` returns `{cueAnexo,nombre,departamento:{id,nombre},coordinate:{lat,lon,source},runAt,timezone,hours:[{time,rainMm,gustKmh,weatherCode}],days:[{date,rainMm,rainP10Mm,rainP50Mm,rainP90Mm,probability25,departmentProbability:true}],coverage,interpolation}`. Return 404 for unknown CUE, and 422/partial department-only response for missing coordinates.

## 7. UX specification

- Put an alerts strip first. Show only current official SMN alert records with the official yellow/orange/red level colors, phenomenon and official text; click highlights the matched departments. Do not turn own model thresholds into alert badges. Green is no risk in SAT but is not an active alert strip item.
- Below it show “Radar de pronóstico” with freshness and explicit “pronóstico de modelo”. The 7-day department table uses a heat-colored area-mean mm/day cell, optional `P≥25 mm` column when Ensemble is active, max gust, storm/hail icons and bold styling on the internal 25/50 mm and 60/80 km/h thresholds. Tooltip/detail includes local maximum, cell/hour, data coverage and ensemble member count.
- Toggle between “Próximas 48 h (por hora)” and “7 días (por día)”. Use day labels and Buenos Aires local time. Fix the old `paso=3` wording to **“mm en 3 h”**.
- School popup: point forecast timeline/next-day rain and gust, seven daily totals, department probability context, coordinate source/fallback and run freshness. Make the probability clearly area-level.

## DECISIONS

1. Alerts are the primary task; daily department and next-day/hour views follow. Provide department and school-point scales.
2. Only SMN-issued SAT products use the word **alerta**. Internal rain/gust thresholds highlight values only; model storm/hail are forecast signals, never official warnings.
3. SMN ingestion remains gated on a real response, validated schema/auth and written terms check. Prefer official CAP/feed if it is live and machine-readable; otherwise obtain SMN integration details. No HTML scraping as a silent fallback.
4. Department rain is area-average; local max appears in detail. School values use bilinear interpolation from the existing deterministic grid.
5. Use existing 0.2° radar run and derive department/hour/day metrics at zero Open-Meteo cost.
6. Keep Open-Meteo Ensemble as a free-tier pilot only, 25 centroids, `ecmwf_ifs025`, hourly precipitation, seven days, every six hours, ≤200 estimated provider weight/day, with a fail-closed cap and no automatic plan upgrade.
7. Evaluate forecast daily totals against D-1 IMERG by department; require ≥14 valid pairs and ≥5 event cases before displaying recent accuracy.
8. Alert retention 90 days, ensemble retention 14 days, verification retention ≥2 years; IMERG retention must be measured and explicit cleanup added only after confirming other consumers.

## H1–H4 build order

**H1 — contract and spatial base.** Confirm with SMN whether the 401 JSON endpoint can be authorized, validate CAP/feed terms, refresh cadence and cache semantics, and establish a verified crosswalk from CAP `severity` to official SAT yellow/orange/red levels. Archive an empty/no-alert response and a current Corrientes CAP, not just the expired schema sample. Build versioned dynamic CAP-polygon→25 IGN-department mapping and radar-cell→department overlap lookup. Add fixture-based contract tests from genuine samples.

**H2 — zero-quota aggregation and read API.** Implement area-weighted departments, local-day and 48-hour summaries from the existing complete radar run, missing coverage semantics, school interpolation using map coordinates, and `/resumen` plus school endpoint. Include threshold emphasis and corrected units. This provides core questions before Ensemble.

**H3 — official alerts and pilot Ensemble.** Add `smn_alerta` ingestion with source freshness/expiry and raw payload; render official text and colors only after the severity→SAT-color crosswalk is confirmed, with department selection. Separately add ensemble run ingestion with a 600/day hard cap, response header/time/size telemetry, model member validation and probabilities. Enable only with the verified free access and budget cap; no notifications.

**H4 — IMERG verification and operational polish.** Add daily D-1 comparison and verification table/API, ≥14 pair/≥5 event gate, coverage and version tracking; determine IMERG storage growth and retention policy. Add admin panel diagnostics, monitoring for stale alerts/runs, error states, and operational documentation.

## Sources

- [R1 precision audit](../../../../tmp/radar-precision/R1-report.md) (prior live Open-Meteo observations, quota uncertainty).
- [F0 radar decisions](F0-spike.md) (grid, cadence, variables, retention, request-weight rule).
- [SMN SAT alerts page](https://ws2.smn.gob.ar/alertas); [live JSON endpoint](https://ws1.smn.gob.ar/v1/warning/alert/area?mode=alert); [CAP RSS feed](https://ssl.smn.gob.ar/CAP/AR.php); [SMN technical note on API](https://repositorio.smn.gob.ar/bitstream/handle/20.500.12160/1838/Nota_Tecnica_SMN_2022-124.pdf?isAllowed=y&sequence=1); [SAT decision manual](https://repositorio.smn.gob.ar/bitstream/handle/20.500.12160/2594/C9%20-%20Manual%20de%20uso%20para%20tomadores%20de%20decisi%C3%B3n.pdf?isAllowed=y&sequence=1).
- [Open-Meteo Ensemble API](https://open-meteo.com/en/docs/ensemble-api), [pricing](https://open-meteo.com/en/pricing).
- Repository sources: `lib/infraestructura/radar-meteo/{grilla,provider,job-sync}.ts`; `public/data/departamentos-corrientes-georef-2026-09-27.geojson`; `lib/infraestructura/riesgo/{jobs/sync-imerg.ts,providers/imerg.ts,peligro/observado.ts}`; `lib/infraestructura/parte-mapa.ts`; `drizzle/0005_radar-meteo-run.sql`.
