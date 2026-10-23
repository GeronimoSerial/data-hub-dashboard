# `GET /api/infraestructura/peligro`

This authenticated endpoint accepts optional `geometryRef` and `puntoRioId` query
parameters. Omitting `geometryRef` keeps the authorized global response; it does
not apply a row limit that could omit cells. The response fields remain
`pronostico`, `climatologia`, `niveles`, `caudal`, `observado`, and
`observadoAcumulado`.

Forecasts now default to current data: SQL returns all forecast steps from the
latest run at or before request time for each cell, variable, and provider. The
previous response included every historical run. This endpoint has no explicit
history or `asOf` mode, and `horizonte` is not a response filter; keep the full
step arrays because consumers may accumulate values across horizons.

Climatology returns the latest complete p90/p95/p99 reference independently for
each cell, variable, and `muestra`. Both `todos_los_dias` and `dias_humedos` are
retained when complete, and `muestra` remains in each response row. Complete
IMERG precipitation references take precedence within their sample, consistent
with the threshold source-selection contract. The territorial ficha explicitly
uses `todos_los_dias`, matching `MUESTRA_CLIMATOLOGIA` used by the hazard-level
calculation; `dias_humedos` remains available to consumers that need that sample.

The in-repository consumer found is `components/infraestructura/ficha-territorial.tsx`.
Compatibility with external consumers that relied on historical forecast rows
has not been verified.
