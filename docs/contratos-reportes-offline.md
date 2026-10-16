# Offline reports: versioned contracts (batch 0)

Status: draft contract for batches 1-7. Source plans: [plan-reportes-offline.md](plan-reportes-offline.md) and [plan-reportes-batches.md](plan-reportes-batches.md). Types-only mirror: `lib/infraestructura/reportes-offline-contratos.ts`.

Nothing in this document is implemented yet. Names of tables, routes and states are proposals to be confirmed by the batch that first uses them.

## 0. Repository facts this contract relies on

| Fact | Source |
| --- | --- |
| Schema is Drizzle `pg-core`; production uses `node-postgres` (`DATABASE_URL`), tests use PGlite. A `@libsql/client` path still exists in comments. | `lib/db/schema.ts:2`, `lib/db/driver.ts`, `lib/db/index.ts` |
| Latest migration on this branch and on `origin/main`: `0017_hidro_referencia_exposicion_dem.sql` (journal tag matches). **Next free number: `0018`.** | `drizzle/`, `drizzle/meta/_journal.json` |
| Some columns are added by `ALTER` in `lib/db/seed.ts` (e.g. `infra_movimiento.idempotency_key`), not only by migrations. A new column must be declared in both places. | `lib/db/schema.ts` (infraMovimiento comment) |
| `infra_movimiento.idempotency_key` already has a unique index. Submissions reuse it; no second idempotency table is needed for reports. | `lib/db/schema.ts` (`infra_movimiento_idempotency_key_uidx`) |
| `infra_movimiento.tipo` is free `text`; a new value (evidence-only movement) needs no DDL. | `lib/db/schema.ts` |
| Parte write guard: public password cookie OR `admin` session (no grant needed). | `lib/infraestructura/acceso-parte.ts` |
| Parte CUE-scoped write guard: a verification session token limited to one CUE. | `acceso-parte.ts` (`tieneAccesoAlParteParaCue`) |
| Map read guard: session + resource access on `/mapas/infraestructura`. | `lib/infraestructura/acceso-lectura.ts` |
| Nominal (student-identifying) data: `admin` without grant, `editor`/others need an unexpired `infra_permiso_nominal` grant; every nominal query is logged. | `lib/infraestructura/permiso-nominal.ts`, `infra_acceso_nominal_log` |

## 1. Bucket survey (OBS): BLOCKED

Status: **blocked: awaiting explicit user authorization (bucket + credentials).**

No cloud or OBS CLI was run, no credentials or environment secrets were read. The items below are the questions the survey must answer once authorized:

- Region, endpoint, bucket name (reuse the existing one; do not create a new bucket by default).
- Public access block, ACLs, bucket policy, and which other apps use the bucket (shared policy changes need that review).
- CORS: allowed origins for the browser direct upload, methods (`PUT`, `GET`, `HEAD`), allowed headers, max age.
- Lifecycle / retention rules (orphan cleanup depends on them).
- Whether OBS returns a checksum or ETag suitable for server-side verification without downloading the object.

Until the survey exists, B6 (uploads) must not start.

## 2. Identities

| Identity | Shape | Rule |
| --- | --- | --- |
| `draftId` | opaque string, generated on the client when a flow starts, globally unique (ULID or UUIDv4) | Stable identity of one load. CUE and flow type locate a draft but never identify it. Two loads for the same CUE have different `draftId`. |
| `generacion` | integer, client-side | Incremented when a draft is confirmed or discarded locally. Cleanup removes only the generation it confirmed. |
| `revision` | integer, server-side, monotonic per `draftId` | Increments on every accepted write. Never reused, never decreases. |
| `idempotencyKey` | opaque string, generated at the moment the user presses submit | Persisted with the frozen body before the first attempt. Reused on every retry. Stored in `infra_movimiento.idempotency_key`. |
| `attachmentId` | opaque string, generated on the client when a photo is selected | Identifies one photo across retries. The server generates the object key; the client never chooses it. |
| `movimientoId` | server-generated, returned on confirmation | Persist before removing any pending work. |

## 3. Contract versions

Every persisted record and every request carries `version: 1` (`CONTRATO_VERSION`). A reader that sees an unknown version must not guess: it keeps the record and shows a compatibility message (see section 13).

## 4. Context contract (`ContextoReporte`)

Saved locally when a flow starts, so an update can be rebuilt without server queries.

Fields: `draftId`, `cue`, `flujo` (`inicial` | `actualizacion`), `escuela` (name, CUE, department; no student data), `turnos`, `motivos` (catalog snapshot used by the flow), and for updates: `situacionBase` (state and history used at start) and `movimientoBaseId`.

Rules:

- Context is written in the same IndexedDB transaction as the first draft write.
- A stale context is not a reason to drop answers: the server validates it on reconnect and may reject the submission with `contexto_vencido`; the local answers stay.
- The context holds no student identifiers. If a catalog snapshot would include them, it is excluded.

## 5. Draft contract (`BorradorRevision`)

| Field | Type | Notes |
| --- | --- | --- |
| `version` | `1` | |
| `draftId` | string | |
| `cue` | string | normalized with `normalizeCue` |
| `flujo` | `inicial` \| `actualizacion` | |
| `estado` | `activo` \| `envio_pendiente` \| `enviado` \| `descartado` | server-side state, see section 9 |
| `revision` | integer >= 0 | server-owned |
| `paso` | string | current step id |
| `pasosCompletados` | string[] | |
| `respuestas` | object | partial answers, each field optional |
| `adjuntos` | attachment references (section 8) | metadata only |
| `creadoEn`, `actividadEn`, `sincronizadoEn` | ISO 8601 | `actividadEn` drives "last activity" in the map |

Partial validation: the server validates shape, types, string lengths, enum values and permissions of the fields that are present. It never requires the form to be complete. Completeness is checked only by the submission contract (section 7).

## 6. Revision and sync

### 6.1 Requests

- `POST /api/problematicas/parte/borradores`: creates a draft. Body includes `draftId` chosen by the client. Replaying the same `draftId` with the same body returns the current revision (idempotent); a different body returns `409 conflicto`.
- `PUT /api/problematicas/parte/borradores/{draftId}`: body contains `baseRevision` and a consolidated change set (`respuestas` patch, `paso`, `pasosCompletados`, `actividadEn`). Several offline edits are merged into one request; keystrokes are never sent.
- `GET` detail and list: section 11.
- `POST .../{draftId}/descarte`: section 9.

### 6.2 Acceptance rule

The server accepts a write only when `baseRevision` equals the stored `revision` and the draft is `activo`. On success it sets `revision = revision + 1` in the same transaction.

Responses:

| Result | Meaning | Client action |
| --- | --- | --- |
| `200 {revision}` | accepted | store `revision` and `sincronizadoEn` |
| `409 {code: "conflicto", revisionServidor}` | another tab or device changed the draft | keep local changes as a pending conflict; do not overwrite silently; show explicit conflict |
| `410 {code: "cerrado", estado}` | draft already sent or discarded | drop the sync job; do not recreate the draft; show the closed state |
| `422 {code: "validacion", campos}` | shape/permission rejected | keep local answers; show the fields; stop retrying this payload |
| `401/403` | session or permission | keep work; ask to re-enter; do not clear anything |
| `429` / `5xx` | transient | retry with increasing delay (section 12) |

### 6.3 Monotonic revision and no resurrection

- The server never reuses a revision number and rejects any write whose `draftId` has a closure tombstone (section 9.2), regardless of `baseRevision`.
- A first sync may create the full snapshot (`POST`). Later syncs send changes only.
- A late request for a closed draft returns `410`; it cannot reactivate the row.

## 7. Immutable submission (`EnvioInmutable`)

Only the explicit submit button of a valid form creates a submission. Syncing an incomplete draft never does.

Client, before the first network attempt:

1. Validate the complete form locally.
2. Freeze the body: answers, attachment references, `draftId`, `baseRevision`, `contexto` version. Compute `cuerpoHash` (SHA-256 of the canonical JSON).
3. Persist `{idempotencyKey, draftId, cuerpo, cuerpoHash, estado: "pendiente"}` in IndexedDB; wait for `transaction.oncomplete`.
4. Send. On uncertain outcome, retry with the same `idempotencyKey` and identical body. Never rebuild the body from the live form.

Server, one transaction:

1. Lock the draft row (`SELECT ... FOR UPDATE`) and check `estado` (`activo` or `envio_pendiente`), `revision` and tombstone.
2. Look up `infra_movimiento` by `idempotency_key`. If found with the same `cuerpoHash`, return the stored confirmation (`200`). If found with a different hash, return `409 idempotencia`.
3. Insert the movement (`tipo` `reporte_inicial` or `actualizacion`), bind attachments to it, set the draft to `enviado`, write the closure tombstone (section 9.2) and store `movimientoId` on the draft.
4. Commit once. The response is `{movimientoId, rigeDesde, cierreDraft: "enviado"}`.

Errors:

- `422 validacion`: the server rejects; the draft moves to `activo` only through an explicit "reopen after rejection" call. The frozen body is not mutated; a correction creates a new `idempotencyKey` and a new body.
- `401/403`: keep the frozen body; ask to re-enter; retry with the same key after re-entry.
- Uncertain (timeout, 5xx, lost response): retry with the same key. The unique index makes the retry return the original confirmation.

Limits: submission JSON body at most 256 KB (text only). Attachment references at most 3.

## 8. Attachments (metadata only)

### 8.1 Rule

Image bytes never appear in JSON, base64 or localStorage. JSON carries metadata and state only. Bytes go from the browser directly to OBS with a temporary authorization.

### 8.2 Metadata (`AdjuntoMetadata`)

`attachmentId`, `orden` (1-3), `mime` (`image/jpeg` or `image/webp` after local optimization), `bytesOptimizado`, `bytesMiniatura`, `ancho`, `alto`, `sha256Optimizado`, `estado`, `objectKeyPrincipal` and `objectKeyMiniatura` (server-generated after declaration).

Declared sizes are hints. The server validates against what OBS reports (section 8.5).

### 8.3 State machine

```
declarado -> autorizado -> subido -> disponible
declarado | autorizado | subido -> fallido -> autorizado   (re-authorization)
declarado | fallido -> descartado                          (local removal before upload)
```

`disponible` is terminal for the photo. `descartado` is terminal. Only `disponible` photos are shown as available in the map; the rest are "pendientes" for the user.

### 8.4 Declaration and authorization

- Photos are declared with the submission or with an evidence-only movement (section 10). Declaration stores metadata and reserves object keys; it does not transfer bytes.
- Authorization is requested in one batch for up to 3 photos and their variants (`principal` and `miniatura`), after the report is confirmed (`movimientoId` exists).
- The server generates object keys from the controlled template `reportes/{cue}/{movimientoId}/{attachmentId}/{variante}.{ext}`. Clients cannot pick keys.
- Authorizations are short-lived, write-only, restricted to the exact key, size bound and content type. A reused authorization is valid only while not expired.
- An OBS authorization error is reported as an upload error, never as an application session expiry.

### 8.5 Verification before "disponible"

- The server checks existence, size and content type with a metadata request (HEAD) and compares with the declared values. It does not download or recompress the image; it is not a file proxy.
- Checksum verification depends on what OBS exposes (open question, section 15).
- Only after verification the state moves to `disponible`.

### 8.6 Idempotency and reconciliation

- Confirmation of an attachment is idempotent by `attachmentId`.
- If OBS has the object but the confirmation was lost, the next reconciliation checks the key (HEAD) and confirms it. The client must not re-transfer before reconciling.
- Maximum 3 photos per submission or evidence movement is enforced on the server, including under concurrent requests (row lock on the movement).

## 9. Lifecycle, closure and tombstone

### 9.1 Draft states

| State | Counts in "pending" | Transitions |
| --- | --- | --- |
| `activo` | yes | -> `envio_pendiente` (submit), -> `descartado` (discard) |
| `envio_pendiente` | yes, until closed | -> `enviado` (confirmed), -> `activo` (explicit reopen after a validation rejection only) |
| `enviado` | no | terminal |
| `descartado` | no | terminal |

Pending drafts have no automatic expiry. They show `actividadEn`.

### 9.2 Closure tombstone

Table (proposal `infra_borrador_cierre`): `draft_id` primary key, `cue`, `estado_cierre` (`enviado` | `descartado`), `revision_cierre`, `movimiento_id` (nullable), `cerrado_en`.

Rules:

- Written in the same transaction as the state change, and never deleted by sync.
- Any later write, sync or submission for the `draftId` returns `410 cerrado`.
- The tombstone is the only guard against a late request; `revision` alone is not enough.

### 9.3 Discard offline

Discard is applied locally first (generation closed, local data removed after confirmation). The client queues `POST .../descarte` with the last known `baseRevision`. The server closes the draft with `estado_cierre = descartado`. If the draft was already `enviado`, the server returns `410` and the client keeps the confirmation, not the draft. The map may keep showing the draft until the discard is confirmed.

## 10. Evidence-only movement (photos without a situation change)

- New `infra_movimiento.tipo` value: `evidencia_fotografica`. `resumen` contains only attachment references and the movement it documents. It must not change `situacion`, `severidad`, afectaciones or statistics.
- Created by `POST .../evidencia` with a client `idempotencyKey` and the declared photos (max 3). Same frozen-body and hash rules as section 7.
- Deduplication: a photo is unique by `(movimientoId, sha256Optimizado)`; a duplicate declaration with the same hash returns the existing `attachmentId` instead of a new object.
- The evidence movement is linked to the update's history (section 10 of the functional plan: historical photos per movement and date).

## 11. Read paths (map, detail, lists)

Gates:

- Map aggregate (counts): `verificarAccesoLectura` (session + `/mapas/infraestructura`).
- Draft list and detail: the same read gate as the map, plus the nominal filter below. Writers need the parte guard (`tieneAccesoAlParte` or CUE-scoped guard) for their own draft.
- Nominal filter: any answer field that identifies students (e.g. student lists under afectaciones) is removed unless the caller has an unexpired `infra_permiso_nominal` grant or is `admin`. Nominal reads are logged in `infra_acceso_nominal_log` like the existing endpoint.

Queries:

- Counts: one grouped query, `SELECT cue_anexo, count(*) FROM infra_borrador WHERE estado IN ('activo','envio_pendiente') GROUP BY cue_anexo` (filtered by the CUE set of the map viewport). No per-school query.
- Total: `count(*)` of the same predicate. Counts drafts, not schools.
- Detail list: keyset pagination ordered by `(actividad_en DESC, draft_id DESC)`, page size 20 (max 50). No offset pagination.
- Photo counts: grouped query on available `infra_adjunto` rows by CUE; no OBS call and no signature per school.
- Photo history: keyset by `(movimiento.creada_en DESC, attachment_id DESC)`, recent first.

Indexes (proposed for batch 3 migration `0018`):

- `infra_borrador (cue_anexo, estado, actividad_en, draft_id)`.
- `infra_adjunto (cue_anexo, estado)` and `infra_adjunto (movimiento_id, orden)`.
- `infra_adjunto (movimiento_id, sha256_optimizado)` unique, for deduplication.
- `infra_borrador_cierre (draft_id)` primary key.

Rules:

- The map never claims a local-only draft or photo. It knows only synced rows.
- Draft responses are labeled "Borrador sin enviar" in the UI; they never appear as confirmed situations, severities or totals.
- Draft rows never change statistics or the situation of sent reports.

## 12. Payload, frequency and retry limits

| Item | Limit / rule |
| --- | --- |
| Draft sync JSON body | 64 KB |
| Submission JSON body | 256 KB |
| Photos per submission or evidence movement | 3 (server-enforced) |
| Photos uploaded at a time | 1 (initially) |
| Image processing at a time | 1 |
| Draft sync trigger | step completion, step abandonment, `visibilitychange`/`pagehide` with pending changes; debounce 2 s; never per keystroke |
| Retry for reports | on open, `online`, tab visible, then delays growing up to 30 s |
| Retry for drafts | growing delay, cap 60 s; stop on `401/403/410/422` |
| Retry for OBS | growing delay; reuse valid authorization; renew when expired |
| Polling | none. No health checks. `navigator.onLine` is a hint only. |
| Honor server limits | `Retry-After` header wins over local delay |

Values for photo size (`max 1600 px`, target 200-400 KB, max 600 KB; thumbnail up to 320 px, target 40 KB) come from the functional plan and are to be validated in batch 5. The server rejects metadata above `bytesOptimizado <= 600 KB` and `bytesMiniatura <= 40 KB` as a first bound, to be revised after measurement.

## 13. Conflict and recovery

| Case | Behavior |
| --- | --- |
| Two tabs, same draft | Same `draftId`; the second tab reads the latest revision; a stale write gets `409`. |
| Two devices, same draft | `409` with `revisionServidor`. Local answers are stored as a conflict generation, shown to the user; nothing is overwritten silently. |
| Local draft from an older format | Read by a migration step; if not migratable, show the incompatibility and offer to keep it, export it, or start again. Never delete silently. |
| Context no longer valid on reconnect | Keep answers; server returns `contexto_vencido`; user is shown what changed. |
| Session expired | Keep the work; ask to re-enter; retry with the same keys afterwards. |
| Submission response lost | Retry with the same `idempotencyKey`; server returns the stored confirmation. |
| Submission rejected by validation | Stop retries; keep the frozen body for reference; reopen explicitly; corrections create a new body and key. |
| Storage quota full or blocked | Explicit message stating what is not protected; the report can still be sent. |

## 14. Migration plan and next free number

- Next free migration: **`0019`** (file `drizzle/0019_reportes_offline_borradores.sql`). Batch 3 owns it; batch 0 does not add migrations.
- Tables proposed: `infra_borrador`, `infra_borrador_cierre`, `infra_adjunto`. Plus `tipo` value `evidencia_fotografica` (no DDL).
- Columns added to existing tables (if any) must also be added to the ALTER path in `lib/db/seed.ts`.

## 15. Open questions (blockers)

1. OBS survey not done (blocked, section 1). Needed for region, endpoint, CORS and checksum options.
2. Whether OBS exposes a checksum or ETag that can verify content without downloading (section 8.5).
3. Exact list of answer fields that count as nominal (student identifiers) for drafts. Batch 3 must map them from the parte schema.
4. Whether the evidence movement needs its own permission beyond the parte guard.
5. Retention rule for orphan objects (depends on the bucket lifecycle survey).
6. Confirm that a rejected submission may be reopened by the same director only (no second device) for the first release.
