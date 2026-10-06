# H0 live samples

Captured 2026-09-30 UTC. These are genuine responses from live requests.

- `smn-alert-api-401.json` and its headers: unauthenticated `GET https://ws1.smn.gob.ar/v1/warning/alert/area?mode=alert`, HTTP 401 JSON Unauthorized. This establishes that the route requires authorization, not its auth flow.
- `smn-cap-rss.xml` and headers: `GET https://ssl.smn.gob.ar/CAP/AR.php`, HTTP 200, RSS (`application/rss+xml`), 17,644 bytes, 25 item links; cache headers include `max-age=180` and `max-age=60`. RSS lists CAP XML links rather than embedding alert records.
- `smn-cap-corrientes-expired-2026-09-29.xml` and headers: genuine CAP XML linked from RSS, HTTP 200, 3,128 bytes, `text/xml`. Its polygon maps to Ituzaingó; issue time is 2026-09-29 13:21:41−03, expiry 2026-09-29 14:59:59−03. It was expired at capture time and is a schema/mapping sample only.
- `smn-cap-tormentas-2026-09-29.xml`: another genuine linked CAP XML, HTTP 200, 3,198 bytes; issue time 2026-09-29 13:21:41−03 and expiry 2026-09-30 02:59:59−03. Its polygon is outside Corrientes.
- `open-meteo-ensemble-2026-09-30.json` and headers: genuine trimmed first-location sample from a 25-location no-key call, HTTP 200. Seven days, hourly precipitation, 168 timestamps, 50 `precipitation_memberNN` arrays plus `precipitation` mean. It preserves all returned series names but trims each series to three values. Full body was 1,229,941 bytes and took 2.831 seconds; no quota/rate headers were returned.

The original RSS snapshot contained 25 CAP links. CAP messages whose polygons intersected Corrientes had expired by capture time; thus there was no current Corrientes warning in that snapshot. `live-probe-notes.txt` records endpoint and response observations. No Open-Meteo 429 or plan error was observed.
