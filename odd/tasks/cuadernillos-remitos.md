# Cuadernillos: remitos and signed receipts (push flow)

Objective: replace the request/quota flow with Planeamiento → Cabecera → Escuela remitos and signed receipts. Branch: feat/cuadernillos-remitos (from origin/main 65fe19cf).
Delivery: ask-on-risk → feature-branch-chain (unit PRs target feat/cuadernillos-remitos; one final PR to main). Slices cut at work-unit commits. Runner: pnpm exec vitest; PostgreSQL suite gated by CUADERNILLOS_PG_TESTS.

## Specs

- S1 — Flow inversion. "No se asignan cupos DESDE planeamiento, sino que planeamiento va a enviar cuadernillos a las escuelas que necesiten". Quotas, cabecera requests, supervisor approval and remainders are retired as write paths (L7).
- S2 — Chain of custody "Plan → Cab → Esc". Each hand-off gets a "recibido" signed digitally by the receiving account: "Debemos añadir el concepto de "recibido" por cada transacción, donde el usuario "firma" digitalmente que recibió el cuadernillo. Hay que añadirlo en todas las partes posibles para mentener una responsabilidad entre areas." Signature = authenticated account, identity and timestamp; identity never comes from the request body (old S5 carries over).
- S3 — Remito per cabecera. Planeamiento builds one remito per cabecera with one line per destination school, quantities per product (level/grade), defaulting to the enrollment recommendation (1 per student) and editable. Example from the user's choice: "Remito #12 → Cabecera Norte / Escuela A: 1° 30 | 2° 25 / Escuela B: 1° 18 / Escuela C: 3° 40 / Cabecera firma recibido (todo el remito) / → Escuela A firma su línea …". Assumption: the cabecera must be a confirmed cabecera (bound assignment row) and any Crítica Consejo school may be a line, as cabecera requests allow today (searchCriticalConsejoSchools).
- S4 — Dispatch. Dispatch revalidates every destination school is still Crítica under the transactional eligibility lock (same order as approveRequest, projection prepared outside the transaction) and deducts global stock immediately with a dispatch movement bound to the remito. If any school is no longer Crítica, nothing is dispatched. Stock cannot go negative.
- S5 — Receipt question. The receiver is asked "RECIBIÓ X CANTIDAD DE X CUADERNILLO?" per product; confirming signs. Otherwise the receiver enters the real quantity per level/grade with a mandatory reason; the difference is recorded as a shortfall of the previous leg and is visible to the supervisor. Received quantity can never exceed the quantity sent to that leg.
- S6 — Cabecera receipt. The cabecera account bound to the remito's cabecera signs one receipt for the whole remito (per-line quantities; reason required on each line with a shortfall).
- S7 — School receipt. The school signs its own line with its GE SSO account (role operador_establecimiento, CUE-scoped by its session cueAnexo). The school is asked about the quantity the cabecera confirmed for its line, not what Planeamiento dispatched. A school cannot sign before the cabecera receipt. Assumption: a line whose cabecera-confirmed total is 0 closes without a school receipt.
- S8 — Cabecera as destination. "Un solo recibido": when the cabecera's own school is a line, the remito receipt also counts as that line's school receipt.
- S9 — Supervisor. "Solo control posterior": the supervisor of the remito's cabecera sees the full chain of its remitos (dispatched, received, shortfalls per leg) and can add observations; never blocks.
- S10 — Stock intake. "No, carga simple": stock load stays as today, unsigned.
- S11 — History. "Conservar como histórico": no existing data is deleted; quota/request/approval tables remain as read-only history hidden from the UI; stock already debited by approvals stands.
- S12 — Integrity (assumption, technical): signed receipts are immutable; dispatch and both receipts are idempotent through booklet_idempotency; receipts do not revalidate criticality.

## Tasks

| ID | Specs | Route | Status | Commit |
|---|---|---|---|---|
| T1 | S3, S4, S11, S12 | inline | pending — migration 0057: remito, line, item, observation; dispatch movement kind + remito FK keeping approval history valid (Risk item 1) | — |
| T2 | S3, S4, S12 | delegated (parallel with T3) | pending — dispatch service + planning API (create/list remitos, recommendations) | — |
| T3 | S2, S5–S8, S12 | delegated (parallel with T2) | pending — receipt services + API for cabecera and school | — |
| T4 | S7 | inline | pending — school access: confined area + CUE check for operador_establecimiento, route manifest (Risk item 2) | — |
| T5 | S9 | inline | pending — supervisor chain view + observations API | — |
| T6 | S1, S3, S5–S11 | delegated | pending — UI: remito builder, cabecera/school receipt, supervisor control; hide quota/request UI; retire old write routes | — |
| T7 | all | inline | pending — e2e seed/spec on remitos; docs | — |

## Log

- L1 (2026-11-14): "tenemos que invertir el flujo de planeamiento. No se asignan cupos DESDE planeamiento, sino que planeamiento va a enviar cuadernillos a las escuelas que necesiten, podrias ayudarme a armar el flujo nuevo?"
- L2: "con el question maker siempre las preguntas. Si, la cabecera y el supervisor siguen participando. Debemos añadir el concepto de "recibido" por cada transacción, donde el usuario "firma" digitalmente que recibió el cuadernillo. Hay que añadirlo en todas las partes posibles para mentener una responsabilidad entre areas."
- L3: Route chosen: "Plan → Cab → Esc" (supervisor authorizes in that option; refined by L5).
- L4: "las escuelas si tienen y pueden tener cuenta en el sistema, si tienen asignado desde ge por sso." Verified: role operador_establecimiento with cueAnexo (lib/infraestructura/acceso-parte-sesion.ts).
- L5: Supervisor: "Solo control posterior".
- L6: Differences: "Firma cantidad real" + note "aca se le pregunta "RECIBIÓ X CANTIDAD DE X CUADERNILLO?" y si confirma se firma."
- L7: Grouping: "Remito por cabecera". Old flow: "Reemplazarlo". Stock intake: "No, carga simple".
- L8: Discovery: the old flow is live on main/staging/prod (migrations 0043–0056); previous branch was 290 commits behind. Work restarted on feat/cuadernillos-remitos from origin/main. Data decision: "Conservar como histórico".
- L9: Cabecera as destination: "Un solo recibido".
- L10: Next: T1 inline.
