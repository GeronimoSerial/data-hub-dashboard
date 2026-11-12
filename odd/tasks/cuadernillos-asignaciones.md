# Cuadernillos: assignments, admin authority and supervisor view

Objective: make the booklet flow operable in prod: load school–supervisor–cabecera assignments for Consejo General schools, let admins do everything, and let an admin see the supervisor/cabecera views.
Branch: `feat/cuadernillos-asignaciones` (from `origin/main` 71832ce0). Delivery: `ask-on-risk`, promote main → staging → prod by cherry-pick PRs. Test runner: `npx vitest run <paths>`, `npx tsc --noEmit`.

## Specs

| S1 | School universe = prod DB, not `escuelas.json`: `ge.ge_escuela_nivel_jur` with `nivel_jurisdiccional_id = 9` ("Consejo General de Educacion") joined to `ge.ge_localizacion`. Snapshot 2026-11-11: 1316 schools with location (1351 with level). User: "el listado de escuelas no debe salir del json sino de la db del mapa enos." |
| S2 | Build a cleaned assignment list ("lista depurada"); "lo que es relevante son las asignaciones". Per Consejo school: `cue_anexo`, `nombre`, `supervisor` (folder name in `CUE (1)/`), `relationship` (cabecera/dependiente), `cabecera_cue`, `source` (file:sheet:row), `status` (ok / sin_supervisor / conflicto / sin_cabecera). Never invent a supervisor or cabecera; unresolved rows stay flagged. Snapshot: 887 with supervisor, 429 without, 3 CUEs under two supervisors. |
| S3 | "Un admin deberia poder realizar lo que sea, cargar stock, ver, modificar, lo que sea." Every booklet route and service accepts an unbanned `role = 'admin'` (via `isBookletAdmin`) without email verification, membership or school assignment, including `ensurePlanningActor` and assignment confirmation. Identity is still the session actor and is recorded. Eligibility, stock, idempotency and locks still apply. |
| S4 | "Cómo no se puede confirmar desde la ui?" An admin can upload the cleaned list in the UI, see the preview (accepted / conflicts / unresolved), map each supervisor and cabecera name to an existing account (picked explicitly, never inferred by name), and confirm. Confirmation goes through `stageAssignmentSourceManifest` + `confirmStagedAssignmentSource`. |
| S5 | Admin can grant and revoke booklet memberships (`planning`, `cabecera`, `supervisor`) to existing accounts from the UI. |
| S6 | "necesito ver qué le apareceria al supervisor": an admin can open the workspace "as" a chosen supervisor or cabecera account (read-only), seeing exactly that account's tabs, schools and requests. |
| S7 | Works in prod: errors seen in prod must not occur for an admin. |

## Tasks

- [x] T1 — S1, S2; data; delegated (haiku, parallel); build script + `data/cuadernillos/asignaciones-consejo.csv`; commit: 8591d4fa, a9c81cad
- [x] T2 — S3, S7; backend; delegated (haiku, parallel); admin bypass in `assignment-source.ts` (ensurePlanningActor, confirmation account checks) and `approvalAuthorityReady` responsible-account checks when actor is admin; commit: a14b0e6a, 05087340
- [x] T3 — S5; backend + UI; delegated (haiku, parallel); memberships service, `app/api/cuadernillos/memberships`, admin panel in planning view; commit: f95c85a9
- [x] T4 — S4; backend; delegated after T2; upload/stage/preview/confirm routes under `app/api/cuadernillos/assignments/sources`; commit: 05087340
- [x] T5 — S4; UI; delegated after T4; assignment import screen with account mapping; commit: latest
- [x] T6 — S6; backend + UI; delegated after T3; admin "ver como" for supervisor/cabecera; commit: 585e4bfa
- [ ] T7 — S7; parent; load the list into prod, grant memberships, promote main → staging → prod, smoke as admin; commit: pending

Route evidence: T1/T2/T3 have disjoint edit surfaces and run in parallel (user asked for haiku workers). T4 shares `assignment-source.ts` with T2; T5 depends on T4; T6 shares workspace files with T3.

## Log

L1 (2026-11-11, user): "Me queres decir qué cosas faltan para el flujo de cuadernillos? veo que está bastante incompleto" → "pero si la asignación se hizo en base a 'CUE (1)' se supone que hay un documento ya … estoy viendo en prod los errores, no en staging, y no deberia suceder. Un admin deberia poder realizar lo que sea, cargar stock, ver, modificar, lo que sea. Cómo no se puede confirmar desde la ui? ademas necesito ver qué le apareceria al supervisor" → "vas a tener que crear una nueva lista depurada entonces, lo que es relevante son las asignaciones" → "pero el listado de escuelas no debe salir del json sino de la db del mapa enos." → "hay que hacer mucho entonces. Crea un plan de implementación en un .md y delega haikus para hacerlo"
L2: User granted full DB access (ssh coolify-mec, prod env). Read-only queries ran: level counts and Consejo export (1316 rows).
L3: Mapping: confirm route returns 503 unconditionally; no loader, no membership grant UI/API, no view-as. Main already has `isBookletAdmin` in permissions/approvals/remainders (PR #251); gaps remain in `assignment-source.ts` and `approvalAuthorityReady`.
L5: T1 done (haiku): 1316 rows; ok 28, sin_cabecera 895, sin_supervisor 388, conflicto_supervisor 5; cabecera resolved only for 48 schools from explicit sheet evidence. Earlier 429 baseline was a weaker scan (missed Esquina rows). User asked for an Excel of schools without supervisor: `../escuelas-consejo-sin-supervisor.xlsx` (388 rows, outside repo).
L6: T2 done (haiku): admin bypass in ensurePlanningActor; responsible accounts need not-banned + membership, not emailVerified. lib/cuadernillos + api: 160 passed, 17 skipped. Gap: `assignment-import.ts` ~305 still requires emailVerified (legacy path, not used by S4).
L4 (assumption): admin approving still needs a confirmed assignment for the school (recipient/cabecera must be known); only account/membership checks are bypassed.
L7: T1b: 12 more read, 74 inferred by department (Esquina override per user), sin_supervisor 302; Excel at planeamiento-flujo root. T5/T6 done. Seam: 254 passed, 17 skipped; tsc 0. BLOCKER: only 76 schools have a cabecera; confirmation requires one. Awaiting user on cabecera source.
L8 (2026-11-11, user): "subir el csv? para que quiero subir un csv? no necesitamos saber la cabecera de cada escuela, la escuela va hacia la cabecera y es ésta la que realiza el pedido, desde un listado de escuelas afectadas (coloca el cue y le aparecen solo si tiene una situación cargada) y luego el supervisor tiene un acceso linkeable a la ficha de la escuela en el mapa enos"
L9 (2026-11-11, user): "el de la escuela cabecera que lo hace. Asi que, deberiamos tener un 100% de escuelas cabeceras con supervisor asignado idealmente"
L10: Prod DB has no cabecera/supervisor source columns outside booklet tables. Cabecera set = escuelas.json `cabecera` in (cabecera, si es cabecera, es cabecera) ∪ sheet cabeceras: 135, 129 in Consejo, 104 with supervisor, 25 without (Capital 15, Mercedes 5). Excel `planeamiento-flujo/cabeceras-consejo-supervisor.xlsx`.
