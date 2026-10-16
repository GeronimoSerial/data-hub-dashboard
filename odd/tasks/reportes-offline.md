# Offline reports, synced drafts and OBS photos

Objective: implement docs/plan-reportes-offline.md following docs/plan-reportes-batches.md (batches 0–8, in order).
Constraints: one storage/confirmation/coordination contract shared by page and worker; no image bytes in JSON; photos disabled in production until B8.
Route: every batch delegated direct to a haiku writer; parent spot-checks.
Delivery strategy: ask-on-risk (forecast > 400 authored lines).

## Checklist

- [x] B0 Contracts — docs/contratos-reportes-offline.md, lib/infraestructura/reportes-offline-contratos.ts (77b39f3, a4da765, 98f10cf). Vitest 5/5, tsc ok, eslint ok.
  - [x] B0-OBS survey done (docs/relevamiento-obs.md); bucket reportes-infraestructura created (la-south-2); IAM user reportes-infraestructura-app via bucket policy (verified); prod CORS origin set.
- [ ] B1 Reliable local persistence
  - [x] B1-T1 (haiku, 84e7d60; vitest 495 ok, tsc ok, eslint ok) Shared IndexedDB store: stores, oncomplete, migration, Blob files, generations (haiku)
  - [x] B1-T2 (acd46f3 + fix 7026aca) Wire forms: restore before autosave, error states (haiku)
  - [x] B1-T3 (haiku, 80b3477; vitest parte 72 ok, tsc ok) sw-parte.js adapter on shared contract (haiku)
- [ ] B2 Coordinated queue and confirmations
  - [x] B2-T1 (27af474) Job store: immutable body + idempotency key persisted before first attempt; confirmation (movimientoId) persisted before removing pending
  - [x] B2-T2 (merged a3dce81; tsc+eslint ok, tests via CI) Page/worker coordination: locks, interrupted-job recovery, priorities (final report > draft sync > photos)
  - [x] B2-T3 (merged 80834f9; tsc+eslint ok, tests via CI) Retry policy: backoff + open/online/visibility triggers; error classes (recoverable, validation, server limit, expired session)
  - [x] B2-T4 (merged; type fix edc16b6; tsc+eslint ok at 2980eee, tests via CI) Forms consume confirmations on reopen without restoring sent drafts; keep attachments on form clear
- [ ] B3 Server-synced drafts
  - [x] B3-T1 (gpt-6-luna, f88e89c merged) Schema + migration 0018 (drafts, revisions, closure tombstones); mirror ALTERs in lib/db/seed.ts
  - [x] B3-T2 (ecb0421) API: create, sync (partial validation + revision control), read, discard; tombstones reject late syncs
  - [x] B3-T3 (merged a3dce81; tsc+eslint ok, tests via CI) Client batching: sync on step complete/abandon, consolidate offline edits, keep local changes on conflict
  - [x] B3-T4 (merged 033158c; tsc+eslint ok, tests via CI) Final submission links and closes its draft consistently
  - [x] B3-T5 (merged 033158c; tsc+eslint ok, tests via CI) Aggregated map queries + permission-filtered detail (no nominal data)
- [ ] B4 Offline reopen
  - [x] B4-T1 (merged 80834f9; tsc+eslint ok, tests via CI) Generic offline page reusing forms and persisted context
  - [x] B4-T2 (merged 02aeffc; tsc+eslint ok, tests via CI) SW precache: verify completeness before announcing availability; versioned caches keep previous until new ready; no authenticated responses/credentials cached
  - [x] B4-T3 (merged 02aeffc; tsc+eslint ok, tests via CI) Failed-navigation fallback preserving flow and CUE
  - [x] B4-T4 (merged 60fbcec; tsc+eslint ok, tests via CI) Reconnect: restore + sync, validate stale context without discarding answers
- [ ] B5 Local selection and optimization
  - [x] B5-T1 (974f0b0) Photo picker: select, preview, remove (max 3 per submission)
  - [x] B5-T2 (84a3e95 + fix 7026aca) Worker pipeline: one at a time off main thread, optimized + thumbnail, orientation, strip metadata, no original fallback
  - [x] B5-T3 (merged a3dce81; tsc+eslint ok, tests via CI) Limits (input, memory, formats) + replace originals only after variants persisted; resumable after close
  - [ ] B5-T4 Measure weights with real photos on modest devices
- [ ] B6 Attachments and direct OBS upload (depends on B0-OBS)
  - [x] B6-T1 (merged 2980eee; tsc+eslint ok, tests via CI) Schema/API: attachments linked to movimientos; photo-only evidence update; server-side permission + 3-photo limit under concurrency
  - [x] B6-T2 (merged 60fbcec; tsc+eslint ok, tests via CI) Batch authorization (presigned, controlled keys, verifiable constraints); reuse/renew without confusing OBS failure with app session expiry
  - [ ] B6-T3 [in progress: gpt-6-luna, reportes-b6-t3t4-upload] Client upload queue: one at a time after report confirmed; survives close/expired session
  - [ ] B6-T4 [in progress: gpt-6-luna, reportes-b6-t3t4-upload] Idempotent confirm + reconcile uncertain uploads before retransmit
  - [ ] B6-T5 Local cleanup after confirm + safe orphan object cleanup
- [ ] B7 Map, gallery and pending items
  - [x] B7-T1 (merged 60fbcec; tsc+eslint ok, tests via CI) Grouped draft/photo counts (no per-school queries)
  - [x] B7-T2 (merged 60fbcec; tsc+eslint ok, tests via CI) Paginated pending detail (progress, last activity, allowed answers), visually/statistically separate from confirmed
  - [ ] B7-T3 [in progress: gpt-6-luna, reportes-b7-t3t4-gallery] Photo indicator, thumbnails on sheet open, lightbox; on-demand temporary access, no proxy/mass signing
  - [ ] B7-T4 [in progress: gpt-6-luna, reportes-b7-t3t4-gallery] Historical evidence by movimiento and date, including solved situations
- [ ] B8 Integrated validation and enablement
  - [ ] B8-T1 Run focused + regression tests across batches
  - [ ] B8-T2 Real offline reopen on Chrome and Safari (prod build, HTTPS/localhost)
  - [ ] B8-T3 Measure bytes/requests per flow; with vs without photos on critical path; memory with large photos
  - [ ] B8-T4 Gradual enablement flags + rollback preserving data and queues

Acceptance criteria per batch: see the "Cierre" section of each batch in docs/plan-reportes-batches.md.

## Notes

- New columns must be declared in lib/db/schema.ts and in the ALTERs in lib/db/seed.ts.
- Submissions reuse the unique infra_movimiento.idempotency_key.

## Next step

B1 Reliable local persistence.

## Wave 2 verification (34fe71b)

Feature-scoped vitest 571 passed / 18 skipped; new API route tests 4/4; tsc ok; eslint ok. Full-repo vitest run in one process shows timeouts in unrelated PGlite suites that pass in isolation.
