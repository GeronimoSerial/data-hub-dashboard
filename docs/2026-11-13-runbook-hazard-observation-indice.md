# Runbook: pre-create the `hazard_observation` index (large databases)

Migration `0060_hazard_observation_observado_idx` adds
`hazard_observation (provider, variable, observado_en)`. It fixes the `sync-hazard-imerg`
`SELECT DISTINCT observado_en ... BETWEEN` query, which scanned every row of the provider
(41.6 s cold in prod, over the 30 s pool `statement_timeout`).

The migrator runs inside a transaction, so the migration uses a plain
`CREATE INDEX IF NOT EXISTS` (it takes a `SHARE` lock: writes to `hazard_observation` wait
while it builds; reads are fine). On a large database, pre-create the index
`CONCURRENTLY` **under the same name** before deploying. The migration is then a no-op.

```sql
-- psql, outside any transaction, as the app owner
SET statement_timeout = 0;
CREATE INDEX CONCURRENTLY IF NOT EXISTS hazard_observation_provider_variable_observado_idx
  ON hazard_observation USING btree (provider, variable, observado_en);

-- verify it is valid (indisvalid = true); if not, DROP INDEX CONCURRENTLY and retry
SELECT indexrelid::regclass, indisvalid FROM pg_index
 WHERE indexrelid = 'hazard_observation_provider_variable_observado_idx'::regclass;
```

If a `CONCURRENTLY` build fails it leaves an `INVALID` index with that name, and
`IF NOT EXISTS` would then skip it: drop it (`DROP INDEX CONCURRENTLY ...`) and rebuild.
