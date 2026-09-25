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
- [x] T2 — Catalog filtering (`/api/hub`, home, `/explorar`) + tests. Route: delegated writer (3+ files).
- [x] T3 — `/api/usuarios` + admin user form (selector + multiselect) + tests. Route: delegated writer (2+ non-trivial files).

## Acceptance criteria
- `consulta` + `seleccionados` with only natalidad map: sees only it in catalog; other resources/routes/gate → forbidden.
- `consulta` + `todos`: behavior identical to before.
- admin/editor: unaffected.
- `vitest run` and `eslint .` pass; `next build` typechecks.

## Progress / Evidence
- T1 done. Files: `lib/db/schema.ts` (user.accesoRecursos + userRecursos table), `lib/db/seed.ts` (HUB_DDL + ensureAccesoRecursosColumn guarded ALTER), `lib/db/seed.test.ts` (schema assertions + ALTER idempotency test), `lib/acl.ts` (SessionUser.accesoRecursos/recursoIds, RecursoAccess.id, puedeAbrir rule), `lib/acl.test.ts` (5 new cases), `lib/session.ts` (getSessionUser loads acceso_recursos + recursoIds), `lib/db/recurso-access.ts` and `app/api/recursos/[id]/archivo/route.ts` (RecursoAccess now carries id), plus SessionUser/RecursoAccess fixtures updated across ~11 test files for typecheck.
- Verification: `pnpm vitest run` → 100 files / 853 tests passed. `npx tsc --noEmit` → clean. `npx eslint lib app` → clean.
- No decision gaps; better-auth needed no `additionalFields` change since acceso_recursos is read directly from DB in session.ts, per the task's stated preference.

- T2 done. Home (`app/(hub)/page.tsx`) and `/explorar` don't call the DB directly: both read `useHubData()` (`components/hub-data.tsx`), which fetches `/api/hub` for non-staff sessions (`/api/hub/admin` for staff, untouched — staff-only, out of scope). So the single fix point for those two surfaces is the shared catalog loader's consumer: `app/api/hub/route.ts` now loads the session with `getSessionUser()` and filters `catalog.recursos` through the new `filtrarVisibles(user, items)` helper in `lib/acl.ts` before responding — no N+1, `loadHubCatalog` already bulk-loads audiences and each `Recurso` already carries `id`/`estado`/`audienciaNivelIds`/`audienciaUserIds`. Also filtered the "relacionados" list in `app/(hub)/recursos/[id]/page.tsx` (passed unfiltered to `ResourceExperience`/`relatedResources` before this change — a leak of titles for resources the viewer can't open, even though opening the page itself already gates via `puedeAbrir`). `/reportes`, `/tableros`, `/mapas` redirect into `/explorar` (already covered) or, for `/mapas/{natalidad,infraestructura,matricula}`, gate individually via `puedeAbrir` already (pre-existing, untouched). `/api/recursos/[id]/explain` also already gates via `puedeAbrir` inside `buildExplainContext` (pre-existing) — not a listing surface, left untouched.
- Files: `lib/acl.ts` (`filtrarVisibles` helper), `lib/acl.test.ts` (6 new cases: anon/todos/seleccionados/staff/audience), `app/api/hub/route.ts` (session + filter), `app/api/hub/route.test.ts` (new, 5 cases), `app/(hub)/recursos/[id]/page.tsx` (filter `related`).
- Verification: `pnpm vitest run` → 101 files / 863 tests passed. `npx tsc --noEmit` → clean. `npx eslint lib app components` → clean.
- Decision note: anonymous visitors now get an empty catalog (`puedeAbrir(null, …)` is always `false`). Evidence considered: `/recursos/[id]` and the `/mapas/*` detail pages already `redirect('/login?...')` for anonymous users, but the home/`/explorar` list itself renders without a forced login and the shell shows an "Iniciar sesión" menu item rather than gating — so pre-T2, anonymous visitors *could* browse the full published catalog list (just not open items). This task's own instructions frame both the "public feature" and "ambiguous" branches as converging on "filter via puedeAbrir, anon → empty," so that's what's implemented, but flagging as a real behavior change or a case for a public-safe listing (e.g. only truly audience-less resources) if browsing before login was intentionally supported.

- T3 done. `nivelIds` had no existence validation to mirror (it's never checked against the `niveles` table anywhere in the codebase — only structurally parsed), so `recursoIds` gets a new existence check as explicitly required by this task, using the same helper/replace shape as `replaceUserNiveles`: `lib/usuarios.ts` adds `AccesoRecursos` type, `unknownRecursoIds` (queries `recursos` via `inArray`, returns the ids that don't exist), `replaceUserRecursos` (delete+insert, same pattern as `replaceUserNiveles`), and `setAccesoRecursos` (direct `user` table update — `accesoRecursos` isn't a better-auth field, same reasoning as T1's session.ts note). `parseCreateUserBody`/`parsePatchUserBody` gained `accesoRecursos` (enum, default `'todos'` on create) and `recursoIds` (string array) parsing. `listHubUsers` now also loads `userRecursos` rows and returns `accesoRecursos`/`recursoIds` per user.
- Files: `lib/usuarios.ts`, `lib/usuarios.test.ts` (new parse/enum/DB-backed tests using the seeded `r1` recurso, same tmpdir isolation pattern as `lib/db/seed.test.ts`), `app/api/usuarios/route.ts` (POST: 400 on unknown recursoIds via `unknownRecursoIds`, then `setAccesoRecursos` + `replaceUserRecursos` after create), `app/api/usuarios/[id]/route.ts` (PATCH: same 400 check + conditional `setAccesoRecursos`/`replaceUserRecursos`), `components/admin-page.tsx` (`HubUserRow` gains `accesoRecursos`/`recursoIds`; `UserForm` adds a "Acceso a recursos" `RadioGroup` — Todos / Solo los seleccionados — disabled with hint "Admin y editor ven todos los recursos" when role is admin/editor, plus a `MultiSelect` of recursos (reusing the same picker used for niveles/audience, labelled "Título — Nivel") shown only when `seleccionados` and not staff; `UsersAdmin`/`UserDialog` thread `recursos` from `useHubData()` — no new endpoint; users table gets a small "N recursos" badge when restricted).
- Decision: when `accesoRecursos` is `'todos'`, `recursoIds` are stored exactly as sent (not cleared), matching the task's stated preference so toggling back to `'seleccionados'` doesn't lose the previous selection. No user-delete route exists in this codebase, so no `user_recursos` cleanup path was added (nothing to mirror).
- Verification: `pnpm vitest run` → 101 files / 873 tests passed. `npx tsc --noEmit` → clean. `npx eslint lib app components` → clean.

## Next step
Manual check + PR decision.
