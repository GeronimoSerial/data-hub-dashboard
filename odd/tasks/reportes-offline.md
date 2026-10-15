# Offline reports, synced drafts and OBS photos

Objective: implement docs/plan-reportes-offline.md following docs/plan-reportes-batches.md (batches 0–8, in order).
Constraints: one storage/confirmation/coordination contract shared by page and worker; no image bytes in JSON; photos disabled in production until B8.
Route: every batch delegated direct to a haiku writer; parent spot-checks.
Delivery strategy: ask-on-risk (forecast > 400 authored lines).

## Checklist

- [x] B0 Contracts — docs/contratos-reportes-offline.md, lib/infraestructura/reportes-offline-contratos.ts (77b39f3, a4da765, 98f10cf). Vitest 5/5, tsc ok, eslint ok.
  - [ ] B0-OBS bucket survey — BLOCKED: awaiting explicit user authorization (bucket + credentials).
- [ ] B1 Reliable local persistence
- [ ] B2 Coordinated queue and confirmations
- [ ] B3 Server-synced drafts (next migration: 0018)
- [ ] B4 Offline reopen
- [ ] B5 Local selection and optimization
- [ ] B6 Attachments and direct OBS upload (depends on B0-OBS)
- [ ] B7 Map, gallery and pending items
- [ ] B8 Integrated validation and enablement

Acceptance criteria per batch: see the "Cierre" section of each batch in docs/plan-reportes-batches.md.

## Notes

- New columns must be declared in lib/db/schema.ts and in the ALTERs in lib/db/seed.ts.
- Submissions reuse the unique infra_movimiento.idempotency_key.

## Next step

B1 Reliable local persistence.
