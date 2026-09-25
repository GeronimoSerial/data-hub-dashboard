# Feature: recursos-por-usuario

## Objective
Allow admins to restrict a `consulta` user to a selected set of resources ("Acceso a recursos: Todos / Solo los seleccionados"), enforced in every read surface including the catalog.

## Problem / Why
- `consulta` only means "not staff"; it never restricts what a user can view.
- Restriction lives only on the resource (audience), and an empty audience means open to any session (`lib/acl.ts` `puedeAbrir`).
- Catalog surfaces (`/api/hub`, home, `/explorar`) do not filter at all.
- Reported case: `natalidad@mec.gob.ar` with `consulta` sees everything.

## Scope (authorized by user, design approved in chat 2026-09-25; user skipped spec/plan)
- Data: `user.acceso_recursos` (`'todos' | 'seleccionados'`, default `'todos'`), new table `user_recursos (user_id, recurso_id)` PK composite. DDL in `lib/db/seed.ts` (idempotent, guarded ALTER) + Drizzle schema.
- Rule: staff unchanged; `consulta` + `seleccionados` → only listed resources; resource audience still applies (intersection).
- `SessionUser` gains `accesoRecursos`, `recursoIds` (loaded in `getSessionUser`).
- Catalog filtering with `puedeAbrir` in `/api/hub`, home, `/explorar`.
- Admin UI user form: selector + resource multiselect; disabled for staff. `/api/usuarios` POST/PATCH validate + persist.

## Out of scope
Action-level permissions (e.g. infraestructura load) — `permiso-nominal` owns those.

## Constraints
- Existing users keep `todos` (no behavior change).
- Code comments/UI copy follow existing project language (Spanish UI, as in codebase).

## TDD
Mode: off (no project/session TDD config found; not chosen by user). Tests still added alongside behavior. Runner: `pnpm test` / `vitest run`.

## Delivery
Strategy: ask-on-risk. Forecast ~450-600 authored lines. Branch `feat/roles`. RDD: check `gentle-ai review mode status`.

## Tasks
- [x] T1 — Data model + session + ACL rule + tests. Route: delegated writer (writer trigger: schema.ts, seed.ts, session.ts, acl.ts, acl.test.ts).
- [ ] T2 — Catalog filtering (`/api/hub`, home, `/explorar`) + tests. Route: delegated writer (3+ files).
- [ ] T3 — `/api/usuarios` + admin user form (selector + multiselect) + tests. Route: delegated writer (2+ non-trivial files).

## Acceptance criteria
- `consulta` + `seleccionados` with only natalidad map: sees only it in catalog; other resources/routes/gate → forbidden.
- `consulta` + `todos`: behavior identical to before.
- admin/editor: unaffected.
- `vitest run` and `eslint .` pass; `next build` typechecks.

## Progress / Evidence
- T1 done. Files: `lib/db/schema.ts` (user.accesoRecursos + userRecursos table), `lib/db/seed.ts` (HUB_DDL + ensureAccesoRecursosColumn guarded ALTER), `lib/db/seed.test.ts` (schema assertions + ALTER idempotency test), `lib/acl.ts` (SessionUser.accesoRecursos/recursoIds, RecursoAccess.id, puedeAbrir rule), `lib/acl.test.ts` (5 new cases), `lib/session.ts` (getSessionUser loads acceso_recursos + recursoIds), `lib/db/recurso-access.ts` and `app/api/recursos/[id]/archivo/route.ts` (RecursoAccess now carries id), plus SessionUser/RecursoAccess fixtures updated across ~11 test files for typecheck.
- Verification: `pnpm vitest run` → 100 files / 853 tests passed. `npx tsc --noEmit` → clean. `npx eslint lib app` → clean.
- No decision gaps; better-auth needed no `additionalFields` change since acceso_recursos is read directly from DB in session.ts, per the task's stated preference.

## Next step
T2 — catalog filtering (`/api/hub`, home, `/explorar`).
