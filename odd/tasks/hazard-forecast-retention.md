# hazard-forecast-retention

Objective: stop unbounded growth of `hazard_forecast` (~0.93 GB/day) by purging runs older than 14 days after each successful forecast sync.
Branch: feat/hazard-forecast-retention (based on origin/main). Delivery: single commit. Test runner: vitest (`node node_modules/vitest/vitest.mjs run lib/infraestructura/riesgo`).

## Specs
- S1: Keep 14 days of forecast runs. Rows with `corrida_en` older than `ahora - 14 days` are deleted; rows at or after the cutoff are kept. `dias` must be an integer >= 7.
- S2: Deletes run in batches (`tamanoLote`, default 100000, at most `maxLotes`, default 40) using `ctid IN (SELECT ... LIMIT)`, so a single statement never locks or fills the shared disk.
- S3: The purge runs after the new run is inserted, only on a completed sync. A purge failure is logged with `console.warn` and never fails or rolls back the sync.

## Tasks
- T1 (S1, S2): `purgarPronosticoAntiguo` in `lib/infraestructura/riesgo/retencion-pronostico.ts`. Route: inline. RED observed (module missing), then GREEN (9 tests).
- T2 (S3): Call from `ejecutarCuerpoDelJob` in `lib/infraestructura/riesgo/jobs/sync-pronostico-caudal.ts` before the `completado` publish, wrapped by `purgarRetencionSeguro`. Route: inline. RED observed (2 tests failing), then GREEN.

## Log
- L1: Original request (summary, verbatim wording in the task brief): purge `hazard_forecast` runs older than 14 days in small batches, call it at the end of the successful hazard_forecast sync, purge failure must not fail the sync, dias < 7 must throw.
- Only writer of `hazard_forecast` is `sync-hazard-pronostico-caudal` (`sync-pronostico-caudal.ts`). `sync-imerg.ts` only mentions the table in a comment.
- Risk: item 1 (data or irreversible effects: deletes existing stored data). Mitigations: 14-day floor (dias >= 7), `corrida_en < corte` predicate, batched deletes, bounded `maxLotes`.
- Known limit: the purge runs inside the job lease (5 min). With the default 40 x 100k batches it may outlast the lease; a lease loss there only means another run takes over, and the purge is idempotent.
