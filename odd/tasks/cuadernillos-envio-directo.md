# Cuadernillos: envío directo a escuela (sin cabecera)

Objective: let Planeamiento choose between sending a remito through a cabecera (current flow) or directly to schools, skipping the cabecera leg.
Branch: `feat/cuadernillos-envio-directo` (from origin/main 6272c2c1), worktree `~/orca/workspaces/data-hub-dashboard/envio-directo`. Delivery: ask-on-risk. Test runner: vitest (`npm test`; remito tests run on PGlite with real drizzle migrations).

## Specs

- **S1** Planeamiento chooses the send mode in the "Enviar cuadernillos" wizard. User: "debemos tener una manera de elegir si enviar a cabecera o enviar directo, para saltearse ese flujo". Modes: `cabecera` (current) and `directo`.
- **S2** A `directo` remito has no cabecera: `booklet_remito.cabecera_cue_anexo` is null if and only if `modo = 'directo'`. Existing rows become `modo = 'cabecera'` with no data change. New migration 0063.
- **S3** Direct mode is available for any school, not only Capital. The Crítica rule still applies: every recipient must be a Consejo school with severity Crítica, as today (user answer: "Criterios ok, con Crítica").
- **S4** A direct remito may carry several schools. Each school signs its own line with its GE account (`operador_establecimiento`, scoped by CUE) and confirms against the quantity Planeamiento dispatched. No cabecera receipt is required (`cabecera_receipt_pending` must not apply to direct lines).
- **S5** A shortfall on a direct line is recorded as the leg "Planeamiento → Escuela" (a reason is mandatory when the quantity is short, and none is allowed when it is not, as today).
- **S6** A direct remito becomes `received` when all its schools have signed (zero-total lines close as `closed_empty`, as today).
- **S7** Direct remitos are visible to Planeamiento and admins, not to supervisors. A cabecera cannot sign a direct remito.
- **S8** The existing cabecera flow keeps its current behavior: dispatch, cabecera receipt, school receipt after the cabecera, and supervisor control. Its existing service, route and UI tests stay green unchanged. Exception (L6): the 0062 DB-check test for "school quantity requires a cabecera quantity" is updated, because that invariant intentionally moves from the DB check to the receipts service.

## Tasks

| ID | Specs | Route | Status | Commit |
|---|---|---|---|---|
| T1 | S2 | delegated (haiku, user request) — Risk: item 1 (migration) | done | 4b61f05f |
| T2 | S1 (API), S3, S4 dispatch | delegated (haiku) | done | a9965f48 |
| T3 | S4, S5, S6, S7 (receipts) | delegated (haiku) | done | 9b341433 |
| T4 | S7, S8 (control) | delegated (haiku) | done | 079e366e |
| T5 | S1, S4, S5 (UI) | delegated (haiku) | pending | |
| T6 | docs + e2e | delegated (haiku) | pending | |

Order: T1 → (T2 ‖ T3 ‖ T4, disjoint files) → T5 → T6. Parent owns git, runs the full suite as the seam check, and commits per task.

## Log

- **L1** (2026-11-17, user): "En capital, no hay cabeceras, se encarga planeamiento nomas. Asi que debemos tener una manera de elegir si enviar a cabecera o enviar directo, para saltearse ese flujo"
- **L2** (2026-11-17, user): "dale, usa haikus para la implementacion"
- **L3** (2026-11-17, user answer to the rules question): "Criterios ok, con Crítica". The accepted defaults: (1) any school, not only Capital; (2) several schools per direct remito, each signing its own line with GE; (3) shortfall leg "Planeamiento → Escuela"; (4) received when all schools signed; (5) visible to Planeamiento and admins, not supervisors.
- **L4** Context: Escuela 293 (CUE 180119800, Capital, no cabecera) received booklets that must be registered later through this flow, with totals: 1° 73, 2° 81, 3° 98, 6° 68 (user: "registra totales, no diferencies por docentes").
- **L6** (T1 decision) A CHECK on `booklet_remito_item` cannot see `booklet_remito.modo`. The school check becomes `school <= COALESCE(cabecera_received, dispatched)`. For cabecera remitos, "the cabecera signs first" is enforced by `remito-receipts.ts` (the existing test "rejects signing before the cabecera receipt" stays). The 0062 schema test asserting the DB rejection is updated to the new invariant.
- **L5** Code map (origin/prod, explorer): `booklet_remito.cabecera_cue_anexo` is NOT NULL with an FK (lib/db/schema.ts:2124). `receipt_signature_check` (:2134) ties `received` to the cabecera signer. `booklet_remito_item_school_check` (:2172) requires `cabecera_received_quantity`. Dispatch: lib/cuadernillos/remito-dispatch.ts (authority check :232, Crítica :236-241). Receipts: remito-receipts.ts (school `cabecera_receipt_pending` :216, expected quantity :220). Control scoping: remito-control.ts:121-127. Wizard: components/cuadernillos/planning/remito-builder.tsx.
- **L7** (T2) The existing recommendations test case `cueAnexo=…&campaignId=…` (no cabecera → 400) was removed: S1 makes a missing cabecera valid for planning (200), and non-planning without cabecera is now covered by a 403 test. Idempotency hashes drop `modo: 'cabecera'` so absent and explicit cabecera match pre-existing records.
- **L8** (T2–T4 seam) `vitest lib/cuadernillos app/api/cuadernillos`: 48 files, 370 passed. Directo shortfall is counted in the school leg with dispatched as base (T4). Remaining tsc error `control-view.tsx:160` (nullable cabecera) belongs to T5.
