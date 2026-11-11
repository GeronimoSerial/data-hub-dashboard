# hazard-readonly-source: staging reads hazard_forecast from production read-only
Objective: stop copying hazard_forecast (24 GB) into staging/dev; read it from production through a read-only connection.
Branch: feat/hazard-readonly-source (from origin/main). Delivery: single PR. Test runner: node node_modules/vitest/vitest.mjs run <files>.

## Specs
- S1: When env HAZARD_SOURCE_DATABASE_URL is set, getHazardDb() returns a drizzle instance over a separate pg Pool (max 3, statement_timeout 15000 ms, default_transaction_read_only=on, SSL as buildPgPoolConfig). When unset it returns getDb(). It throws when the URL equals DATABASE_URL.
- S2: The SELECT paths over hazard_forecast use getHazardDb(): peligro route, veredicto pronostico readers (caudal, lluvia pronosticada), cache-radar-run forecast reads. Reads that join hazard_forecast with local tables are not changed.
- S3: The Open-Meteo replicator skips hazard_forecast when HAZARD_SOURCE_DATABASE_URL is set and keeps it otherwise.

## Tasks
- T1 (S1): lib/db/hazard-source.ts + test. Route: inline. Status: done. Commit: the single commit of this feature (see git log).
- T2 (S2): switch forecast-only reads (route, pronostico, cache-radar-run). Route: inline. Status: done. Commit: the single commit of this feature (see git log).
- T3 (S3): replicator skip + test. Route: inline. Status: done. Commit: the single commit of this feature (see git log).

## Log
- L1 (original request, summarized by the orchestrator): staging and dev copy hazard_forecast from production through scripts/lib/replicacion-riesgo-om.mjs and fill the shared disk. Staging must READ the forecast from production through a read-only connection instead of copying it.
- Reads intentionally left on the main db: none of the switched reads join hazard_forecast with local tables. Climatology, ensemble and SMN reads stay on getDb().
- pronostico readers keep their `db` parameter for local tables; the forecast select inside leerLluviaPronosticadaDia no longer uses it.
- Verification: scoped vitest run had 26 file-level failures under parallel load (10s hook / 5s test timeouts). Re-running those files with 60s timeouts: 391 passed, 1 file failed (scripts/backup-postgres.test.ts: spawn podman ENOENT, environmental, unrelated). tsc --noEmit: 0 errors.
