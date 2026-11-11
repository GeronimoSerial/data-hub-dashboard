# Cuadernillos

Branch: GeronimoSerial/planeamiento-flujo; delivery: ask-on-risk; runner: pnpm exec vitest.
Baseline: dd1d02b837445659135e2c3860d25f74aaae213e; forecast: exceeds 400 authored lines.

## Specs

| S1 | Solo una escuela en severidad **Crítica** puede solicitar; al aprobar se revalida y se bloquea si dejó de ser crítica. Los 15 días de lunes a viernes son contexto: no se exige espera ni pronóstico. |
| S2 | Planeamiento administra stock global y asigna cupos por cabecera y nivel o grado. La asignación no representa traslado físico ni reduce el stock global. |
| S3 | La cabecera propone cantidades para una escuela destinataria. Recomendación: **un cuadernillo por estudiante**, desagregado por nivel/grado. No se convierte la recomendación en un máximo obligatorio. |
| S4 | El supervisor ve cabeceras y, dentro de ellas, solicitudes de sus escuelas. Revisa y firma cada solicitud por separado; no hay aprobación masiva. |
| S5 | La firma es confirmación con la cuenta autenticada, identidad y fecha. No es firma dibujada ni certificado digital. La identidad nunca proviene del cuerpo enviado por el cliente. |
| S6 | Al aprobar se descuentan inmediatamente cantidad aprobada de stock global y cupo de cabecera. No se agrega confirmación posterior de entrega o recepción. |
| S7 | Si falta disponibilidad, el supervisor puede aprobar menos. Se registra el gap por escuela y nivel/grado; la cabecera solicita el remanente desde el original y requiere nueva aprobación. |
| S8 | El rechazo cierra esa solicitud; la cabecera debe crear otra. Una aprobación **no puede anularse**. No se implementan devoluciones, reversas ni restitución de stock. |
| S9 | Asignaciones escuela–supervisor y escuela–cabecera deben construirse con el listado suministrado. Toda cabecera debe tener supervisor; las contradicciones de las fuentes no se resuelven inventando asociaciones. |

## Tasks

- [ ] T1 — S9; backend delegated; implemented, independent verification pending; commit: pending
- [ ] T2 — S1, S4, S5, S9; backend delegated; implemented, request table integration and independent verification pending; commit: pending
- [ ] T3 — S3; backend delegated; implemented, independent verification pending; commit: pending
- [ ] T4 — S1–S3; backend delegated; implemented, independent verification pending; commit: pending
- [ ] T5 — S1, S4–S8; backend delegated; fixture implementation only; live adapter blocked; independent verification pending; commit: pending
- [ ] T6 — S7–S8; backend delegated; fixture implementation only; live adapter blocked; independent verification pending; commit: pending
- [ ] T7 — S1–S9; frontend delegated; forms, scoped reads and views implemented; live approval and DB verification pending; commit: pending
- [ ] T8 — S1–S9; frontend delegated; isolated browser smoke passed; real end-to-end and PostgreSQL pending; commit: pending

## Log

L1: Procede con la implementación, agrupa por tareas y usa gpt 6.1 terra para nivel 2 y que el implemente las tareas con gpt 6.1 luna high

L2: No production activation, real imports, remote operations, pushes or publishing. Pending business choices remain rollout gates.

L3: User explicitly authorized gpt-6-luna high as implementation worker substitution.

L4: T1 preview tests passed 5/5 and PGlite empty/prior-schema migration checks passed; missing head validation and guarded persistence require correction. No source import.

L5: T1/T2 corrections: focused suites 18 passed, tsc and ESLint passed; PGlite empty and prior-schema migration through 0042 passed. Frontend reports 47 focused tests passed and admin mapping corrected. Independent risk verification pending.

L6: T3/T4 worker reports 18 focused tests and prior 18 tests passed, fresh PGlite migration 0043, tsc and ESLint passed; previous-schema migration check pending. Confirmed mapping required and campaign writes default disabled. Independent risk verification pending.

L7: T5/T6 worker reports 22 fixture/route tests passed, tsc and ESLint passed, fresh PGlite migration through 0046 passed. No local PostgreSQL; concurrency proof skipped. Live approval/rejection/remainder adapter intentionally fail-closed: eligibility freshness cannot be proven transactionally. Independent verification launched. RDD global off; assessment unassessable due untracked inventory.

L8: Independent verifier: backend service tests 49 passed; six route suites 20 passed (mocked services); four PostgreSQL tests skipped. Found remainder recommendation uses enrollment rather than gap; enrollment turn mixing; S4 request listing missing; T1 import has no public caller. One correction batch requested for first two. Default approval/rejection/remainder adapter disabled; pending transaction-bound authority and isolated PostgreSQL proof.
L9: User expanded goal verbatim: “asegurate de que quede en dev desplegado y funcionando end to end el proyecto”. No remote destination or session authorization provided; do not probe ambient credentials.

L10: Independent correction recheck: gap recommendations, multi-turn fail-closed and scoped request GET resolved; four focused suites 26 passed, reproduced by coordinator. Live DB coverage, PostgreSQL concurrency and transactional source freshness remain pending; active approval/rejection/remainder writes disabled. Local dev workflow references Coolify secrets; destination and session authorization not established. Default .env targets shared dev DB and was not used.

L11: Frontend reports scoped assignment/recommendation/request reads and protected role views; focused suites 19, 27 and 47 passed and tsc passed. Overview/inventory read, forms, approval UI and end-to-end remain pending. No commits: ask-on-risk chain strategy not selected; do not stage unrelated source documents.

L12: User authorized continued local development. Unix Docker socket unavailable; postgres/initdb/pg_isready absent. A narrower transaction-consistent snapshot requires a policy decision on eligibility serialization point and executor threading; no source infrastructure changed. Approval writes remain gated. Assignment confirmation now recomputes preview server-side; independently verified 12 tests. Scoped authenticated chain GET and root ID added; independently verified and coordinator reproduced 24 tests. No live DB proof.

L13: Frontend reports overview, assignment confirmation, stock/quota/request and approval/rejection/remainder forms implemented with gated errors; seven focused suites 48 passed, isolated PGlite browser harness 1 passed (gated writes, not full E2E). tsc and scoped ESLint passed. Build exited 0 but logged PGlite ErrnoError/RuntimeError during page collection and Next standalone warning; not clean proof.

L14: Frontend identified client-supplied provenance as insufficient for S9. Public confirmation now returns 503 and default assignment persistence fails closed before writes until trusted reconciliation exists; preview remains available. Independent verifier and coordinator each observed 24 focused tests passed. No real import occurred; DB rollback proof pending.

L15: Isolated PGlite upgrade through migrations 0040–0046 passed: 40→47 migrations, synthetic prior-schema row preserved, 12 booklet tables and expected chain index, columns and checks. No shared DB/env used. Projection mapping found global executor escapes in parte-mapa.ts (raw client and institute scope), parte-consulta.ts (period), and datasets/repositorio.ts (reference cache). A product decision is required on snapshot-time versus coordinated-latest approval authority; PostgreSQL concurrency proof still pending.

L16: User authorized executing dev-operacion.yml against configured Coolify dev credentials, excluding production. Local inspection: desplegar only redeploys existing dev image; configurar copies production media and was not authorized/run. Current changes need ghcr.yml triggered by push to dev to build/push dev and short-SHA tags; push remains unauthorized. No remote actions taken. Eligibility serialization policy and trusted assignment reconciliation remain unresolved; no E2E readiness claimed.

L17: User decision verbatim: “si dale, procede” in response to “si la escuela deja de estar crítica mientras se procesa la aprobación, ¿debemos bloquearla antes de guardar y descontar stock? Recomiendo que sí”. Approval must block if school loses critical status during processing, before saving or deducting stock.

L18: Frontend independently rechecked isolated T8 standalone browser harness: exit 0, 1 passed, no earlier PGlite/standalone warning. Still gated smoke, not full E2E. Strong eligibility source writer map needs explicit implementation scope; user-space PG17 socket-only cluster started/stopped using publicly downloaded packages without installation, but no PostgreSQL concurrency tests yet.

L19: Implemented transaction-bound severity projection, migration 0047 with seven public source triggers and idempotent four GE guards; lock first in approval, writers acquire exclusive advisory lock, GE bootstrap outside shared-lock tx. Independent review found no concrete coverage defect. Real isolated PG17 proof 10 passed, including actual approveRequest through production transaction methods with fixture-only authority override, both source/approval orders, phantoms, no-overspend and rollback. Fixture suite coordinator spot-check 70 passed. Success/rollback tests do not assert approved line quantities or full movement/idempotency payloads; proof remains incomplete. Production authority remains false pending trusted assignment reconciliation. PGlite upgrade through 0047 preserved synthetic row.

L20: User authorized persisted server-staged immutable source trust, with synthetic isolated manifest allowed; no real rows imported or arbitrary client staging. Migrations 0048–0050, revision/row/confirmation hash binding and locked memberships implemented. Independent PG17 recheck 17/17, fixture suites 40/40; confirmed retargeting, revocation race and legacy-null blockers resolved. Real source loader and public admin confirmation still absent. Disposable local PG socket-only cluster was started for HTTP E2E; harness interrupted during Next build retry before DB seed to avoid unexplained external access, then cluster stopped and removed. No full HTTP E2E proof.

L21: User: previous worker out of tokens, continue with haiku workers. Haiku run of isolated E2E found product bug: createRemainderRequest called getCurrentEligibility without the GE projection (approveRequest passes prepareCurrentEligibilityProjection), so every live remainder request returned 409 ineligible; unit mocks hid it. Coordinator verified in code, observed RED (4 remainders tests failed after mock made fail-closed like the live adapter), fixed remainders.ts (prepare projection, type pick), GREEN: cuadernillos+api suites 114 passed/17 skipped, tsc 0. Spec fixed to use __dirname (CJS). Full isolated HTTP E2E against disposable PG17 socket cluster passed: @pglite-smoke 1/1, @postgres-workflow 1/1 (approval 200, remainder 201, rejection, balances). Cluster stopped. Not yet done: remainder path does not take lockEligibilitySources (approval does); real source loader/public admin confirmation absent; production authority still false; no commits; no remote deploy (no push authorized).

L22: Admin read-only visibility (user: "necesito que el admin pueda ver todo"). Added isBookletAdminViewer (role admin, verified, not banned) used only on read paths: request page (planning-equivalent read scope, no per-row membership check), assignments and overview (planning scope fallback, requested tab kept). Write gates (hasBookletCapability/canAccessSchool/canAccessRequest and every write service) unchanged, so admins without memberships stay forbidden on stock, quota, request create, approve, reject, remainder and assignment confirm. UI: page gives all three tabs with a read-only note; stock/quota forms, cabecera request block, supervisor decision block and remainder controls are hidden when read-only. Known gap: GET /requests/[id]/remainder (getRequestChain in remainders.ts, outside this surface) remains cabecera-membership scoped, so admins see chain roots via the list only. Verified: lib/cuadernillos, app/api/cuadernillos, components/cuadernillos suites pass except pre-existing lib/access route-manifest test; tsc 0 errors.

L23: User override (verbatim relayed): "no me importa las reglas de membresia, te dije que admin ve y hace todo. Soy yo, y debo probarlo completamente." Admin (role admin, verified, not banned) now operates every booklet action through one shared helper isBookletAdmin: hasBookletCapability and canAccessSchool return true, approve/reject skip supervisor membership and assignment, remainder create and chain read skip cabecera membership and assignment, request create skips the head-ownership check, and approve/reject/remainder skip the approvalAuthorityReady gate for admins. Kept for admins: session identity (signatures and creators use the session admin id), eligibility Critica, stock and quota availability, idempotency, locks, campaign policy. Read UI restriction removed; the page is unchanged from base. Not widened: assignment-source.ts ensurePlanningActor still requires planning membership (outside surface; not reachable from any route); POST /api/cuadernillos/assignments mode confirm still returns 503 by design. Non-admin regressions pinned for approvals, requests, inventory, remainders, permissions and queries. Verified: lib/cuadernillos, app/api/cuadernillos, components/cuadernillos, lib/access: 208 passed, 17 skipped, 1 pre-existing route-manifest failure; tsc 0 errors. Risk: approvalAuthorityReady bypass lets admins approve against unconfirmed assignment provenance.
