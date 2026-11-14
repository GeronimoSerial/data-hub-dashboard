# Runbook: pre-apply the `hazard_forecast_pkey` drop (production)

Migration `0061_hazard_forecast_drop_pkey` drops the primary key of `hazard_forecast`.
The index weighs ~4.1 GB and has **0 scans** over the whole life of the statistics
(`stats_reset` is null). Every write path upserts on the 5-column unique index
`hazard_forecast_uidx (provider, variable, geometry_ref, corrida_en, valido_en)`; `id` is
never a conflict target and has no foreign keys pointing at it.

The migration is `SET LOCAL lock_timeout = '5s'` + `DROP CONSTRAINT IF EXISTS`. In production,
pre-apply it by hand so the deploy does not depend on app start-up; the migration is then a no-op.

## Preconditions (checked read-only on 2026-11-14)

- `hazard_forecast` is in no publication and there is no logical slot or subscription
  (only the physical `pg_walreceiver` slot of the HA standby, unaffected by this change).
- `relreplident = 'd'` (default). This is safe **only because the table is not published**:
  a published table with default identity and no PK would reject UPDATE/DELETE. Re-check
  before applying:

```sql
SELECT pubname FROM pg_publication_tables WHERE tablename = 'hazard_forecast';  -- expect 0 rows
SELECT slot_name, slot_type FROM pg_replication_slots;                          -- no logical slots
SELECT indexrelname, idx_scan FROM pg_stat_user_indexes
 WHERE relname = 'hazard_forecast' AND indexrelname = 'hazard_forecast_pkey';   -- idx_scan still 0
```

## Timing

`sync-pronostico-caudal` runs every 6 h at `:00` (00, 06, 12, 18) and also runs the retention
purge. The `ALTER TABLE` needs a brief exclusive lock and waits behind open insert
transactions, so apply it **between runs, not within ~10 minutes after a `:00`**
(for example around `:30`). With `lock_timeout` it fails cleanly instead of queueing.

## Apply

```sql
-- psql as the app owner, outside any transaction
SET lock_timeout = '5s';
ALTER TABLE hazard_forecast DROP CONSTRAINT IF EXISTS hazard_forecast_pkey;
```

If it fails with `lock timeout`, nothing changed: wait a minute and retry.

## Verify

```sql
SELECT indexrelname, pg_size_pretty(pg_relation_size(indexrelid))
  FROM pg_stat_user_indexes WHERE relname = 'hazard_forecast';   -- pkey no longer listed
```

- The next `sync-pronostico-caudal` finishes `completado`.
- `/situacion` and the hazard map keep returning data.
- RDS disk drops ~4 GB (space returns to the volume only after the index file is removed, which
  `DROP` does immediately).

## Rollback

Rebuilding costs another ~4 GB and several minutes: have 10 GB free first.

```sql
SET statement_timeout = 0;
CREATE UNIQUE INDEX CONCURRENTLY hazard_forecast_pkey ON hazard_forecast (id);
ALTER TABLE hazard_forecast
  ADD CONSTRAINT hazard_forecast_pkey PRIMARY KEY USING INDEX hazard_forecast_pkey;
```

Nothing in the code depends on the index: `id` is only used as a last tie-break after the full
unique key in `cache-radar-run.ts`. Rolling back the app image does not require rolling back the
database (the older schema file simply declares a PK that the table lacks).
