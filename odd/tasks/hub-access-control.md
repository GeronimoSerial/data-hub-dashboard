# Feature: hub-access-control

## Objective

Require authentication before rendering the hub landing or its catalog. Let administrators configure each user's visible sections and initial destination, including a section-only experience without access to the hub landing. Preserve infrastructure map and report functionality.

Status: requirements agreed in chat; T1 and T2 are complete with final Sol low review PASS gates recorded below. T3a–T3d and review corrections are complete with final Sol low review PASS recorded below. T4 is ready for its final Sol low review. T5a–T5c are implemented; final Sol low review PASS recorded below. T6 final Sol low review PASS is reported below. T7a automated regression has run; one unrelated Podman-dependent suite remains unavailable. T7b browser acceptance has run in isolation but has unresolved failures and is not complete. T8 remains pending.

## Confirmed requirements

| Topic | Decision |
| --- | --- |
| Account creation | Administrator-created accounts only. No public signup or access-request form. Preserve the current workflow where the administrator assigns the initial password; invitation emails are not required. |
| Login | Email and password, reusing existing authentication. |
| Password changes | Users can change their own password. Changing it on first login is optional. |
| Permissions | Configure access by whole section, not individual report fields, map layers, or actions. Existing finer-grained restrictions remain in force. |
| Visibility | Hide disabled sections rather than merely showing locked navigation. Enforce the restriction on the server too. |
| Entry destination | Administrator selects an enabled internal destination for each user. |
| Section-only experience | A user configured to skip the hub must not reach the landing, including through a direct URL or the logo. Navigation stays within enabled sections. |
| Administration | Extend the existing administration panel; do not build a second account-management system. |
| Existing accounts | Preserve current access and existing special destinations. Accounts without a special destination continue to start at the landing. |
| Reports and shared links | Preserve their current access mechanisms. Do not add hub login to report forms, shared-token flows, or offline reporting. |

## Current implementation evidence

- `lib/auth.ts`: email/password enabled, public signup disabled, existing admin and GE SSO plugins.
- `app/api/usuarios/route.ts`: administrator-controlled account creation already accepts an initial password and stores resource permissions.
- `app/(hub)/login/page.tsx`: existing login uses `callbackUrl`; it does not yet resolve a user-specific default destination.
- `app/(hub)/layout.tsx`: loads the catalog and renders `AppShell` for anonymous visitors, including `/login` because login shares this route group.
- `app/api/hub/route.ts`: currently returns a catalog even without a session.
- `lib/acl.ts`: existing resource, audience, role and banned-user checks. The catalog marks inaccessible resources rather than removing them.
- `app/(hub)/mapas/infraestructura/layout.tsx`: existing session, resource and territorial-scope checks must remain intact.
- `app/(hub)/reportes/page.tsx`: `/reportes` redirects to the catalog's report filter. It is distinct from report submission under `/problematicas/parte`.
- `app/problematicas/parte/layout.tsx`: report forms use their own public layout.
- `odd/tasks/reportes-offline.md`: documents offline drafts, queue coordination, photo uploads and retries that require regression coverage.

## Design boundaries

- Add a centralized section-access policy on top of existing authorization. An enabled section must never grant a broader role, resource audience, territorial scope, nominal-data permission or write permission.
- Keep login and safe error/account-access pages outside the protected catalog shell. Do not gate the shared hub layout blindly: that would also gate `/login` and risk redirect loops.
- Protect page rendering, API reads and file delivery, not just menu items. Account for aliases, legacy redirects, resource viewers, related resources and prefetched responses.
- Use a stable internal section/destination registry, not arbitrary administrator-entered URLs. Validate destinations against effective permissions.
- Reuse existing roles and administrative authorization. Do not accidentally grant user-management rights to additional roles or lock out the last administrator.
- Preserve existing SSO onboarding, school/operator scoping and special entry behavior; the new email/password flow must not replace them.
- Do not rewrite infrastructure calculations, map interactions, report payloads, uploads, offline persistence or service-worker queue contracts.

## Tasks

### T1. Capture the route/access inventory and regression baseline

- [x] Inventory hub sections and map each one to pages, APIs, resource IDs, static/file entry points and navigation entries. Evidence: `docs/hub-access-control-inventory.md`.
- [x] Explicitly classify landing, explore/catalog, infrastructure map, other maps, report catalog, administrative tools and account settings. Resolve overlapping catalog views using server-side section membership, not query-string filtering alone. Evidence and catalog-filter caveat: inventory §Hub surfaces.
- [x] Record the separate access mechanisms for `/problematicas/parte`, verification routes, shared-token pages, offline assets, uploads and GE SSO callbacks. Build a narrow exception list, not a blanket `/api` bypass. Evidence: inventory §Explicit exclusions.
- [x] Record current roles, permissions and known destinations, including SSO mappings. Limitation: no deployed representative account records were inspected; use code/confirmed behavior to develop conservative compatibility defaults, then obtain an authorized read-only production account/destination snapshot before rollout migration/activation. Evidence: inventory §Current roles.
- [x] Run current focused auth/map/report tests and capture baseline results, identifying pre-existing failures separately. Command/results and non-failing environment notices: inventory §Focused baseline (12 files, 173 passed, 0 failed).

T1 evidence/status: `docs/hub-access-control-inventory.md`; focused baseline command is recorded verbatim there. No application behavior or production data was changed/read. T1 main-task review corrections: (1) `/materiales` and `GET /api/materiales/[id]/descargar` are classified as public, separately from protected resource delivery; (2) middleware coverage is documented from the actual matcher, which gates the legacy prefixes and `/recursos/:file.pdf` only—the `gatedStaticPath` helper's `.html` recognition does not itself mean resource HTML is matched; final review confirmed no other inventory claim implies resource HTML is matched; (3) production account/destination snapshot is a rollout prerequisite, not a prerequisite to developing conservative compatibility defaults. Subsequent bounded slices, proposed file ownership and pitfalls are recorded in the inventory; coordinator decision remains how GE SSO's authoritative role/scope refresh reconciles with future per-user section settings.

Acceptance: a route-to-section matrix and reproducible baseline exist before any access behavior changes. No current report or map behavior is inferred from route names alone.

### T2. Define and persist per-user section access and entry settings

Depends on: T1.

- [x] Define the section registry and a single effective-access policy, with tests for existing roles, banned users and narrower resource/territorial restrictions.
- [x] Persist enabled sections, landing availability and an internal entry destination. Keep landing availability distinct from the initial destination so the policy is explicit.
- [x] Choose compatibility defaults that preserve existing accounts and special destinations. Document intentional catalog-visibility changes separately from unchanged opening permissions.
- [x] Validate that a section-only account has at least one usable destination; reject unknown, external or unauthorized destinations.
- [x] Follow the repository's schema/migration conventions, including any required seed/bootstrap compatibility changes after verifying current practice.
- [x] Expose the effective policy through the server session/shell data without leaking sensitive account fields.

T2 completed (T2a+T2b; Sol low review finding resolved): nullable persistence distinguishes unset from explicit empty/false; specific route membership overrides broad format; `/reportes` is reports-only; GE's operator destination is a special destination outside hub sections. Unknown formats without a recognized route fail closed. Landing now invokes existing-ACL authorization in both explicit destination resolution and null-destination fallback validation; denied/banned callback tests cover both paths. GE role/CUE/jurisdiction authority and existing ACL checks are unchanged. Migration conventions, compatibility contract and API integration contract are in `docs/hub-access-control-inventory.md`. Focused validation: `pnpm exec vitest run --maxWorkers=2 lib/hub-sections.test.ts lib/acl.test.ts lib/usuarios.test.ts lib/db/seed.test.ts` (4 files, 84 passed); `pnpm exec tsc --noEmit` passed. No enforcement, UI or API mutation wiring is enabled.

Review gates: **T1 final Sol low review: PASS. T2 final Sol low review: PASS** after resolving the landing existing-ACL callback finding. These are task-level review gates, separate from subsequent T3 review.

Acceptance: migration is repeatable and preserves existing access; enabling a section cannot override an existing denial. Account settings and logout remain reachable for section-only users.

### T3. Enforce login before the hub and resolve authorized destinations

Depends on: T2.

- [x] Separate the public login experience from the protected hub shell while preserving the `/login` URL.
- [x] Gate protected rendering before fetching or embedding the hub catalog. Anonymous `/` requests must reach login without a landing flash or catalog payload.
- [x] Protect catalog and section APIs with correct unauthenticated/forbidden responses, rather than returning login HTML to API consumers. Disabled-section catalog metadata filtering is T4, not a remaining T3 enforcement item.
- [x] Centralize post-login and already-authenticated entry resolution. Preserve authorized deep links and their valid query parameters; otherwise use the configured destination.
- [x] Treat `callbackUrl` as untrusted: it cannot bypass section restrictions, restore landing access, create redirect loops or redirect externally.
- [x] Redirect section-only requests for `/` to their configured authorized destination, including on refresh, browser history and an existing session.
- [x] Define a safe no-access state when permissions or resources change and invalidate a destination. Never fall back to a forbidden landing or loop.
- [x] Preserve GE SSO callbacks, legacy resource gates and public report exceptions identified in T1.

Acceptance: anonymous users cannot see the hub or read its catalog. Direct URLs and callback manipulation do not bypass restrictions. Public reporting and existing SSO continue to work.

#### T3a progress (bounded page-entry slice)

- [x] Moved `/login` into the public route group without changing its URL; moved `/forbidden` out of the protected shell and removed its link back to `/` so no-access cannot loop through a denied landing.
- [x] Protected layout migrates schema and checks session/ban/registered section policy before `ensureSeeded`, catalog loading, or shell rendering. Middleware forwards the original path and query as an overwritten internal request header; page authorization uses the server session, never cookie presence alone.
- [x] Added central callback/entry resolution: validate internal path and query, reject external, encoded separator, traversal, backslash and control forms; compose policy with an injected existing-ACL check; preserve permitted deep-link queries; fall back to a validated configured/available destination or safe `/forbidden`. Current path is excluded from fallback to prevent loops. A section-only user cannot use `/`.
- [x] Signed-in `/login` visits and post-login continuation use the same server resolver. GE operator CUE entry remains the preferred special destination; existing map resource and territorial ACL checks are consulted for infrastructure entry. `/reportes` remains a reports-classified route rather than redirecting reports-only users into `/explorar`.
- [x] Focused page-entry/routing tests cover anonymous catalog non-fetch, signed-in login, expired session, map-only entry, explicit-empty/banned accounts, safe callback query preservation and unsafe callback forms.

T3a checks: `pnpm exec vitest run --maxWorkers=2 lib/hub-entry.test.ts lib/hub-sections.test.ts 'app/(hub)/layout.test.ts' 'app/(publico)/login/page.test.ts' middleware.test.ts 'app/(hub)/mapas/infraestructura/infraestructura-layout-shell.test.tsx'` (6 files, 34 passed); `pnpm exec tsc --noEmit` passed; focused ESLint on changed code passed; `pnpm build` passed. Build emitted non-blocking warnings for deprecated middleware convention, unset Better Auth base URL/default secret, and standalone tracing of transient `.data/pg` files. At the T3a checkpoint, broad API/file enforcement had not yet been attempted; T3b–T3d below subsequently completed it.

T3b initial ownership/handoff scope (historical): authenticated/forbidden API responses and section-aware data retrieval in `app/api/hub/route.ts`, `app/api/recursos/**`, `app/api/taxonomia/**`, and section-owned `app/api/mapas/infraestructura/**` / `app/api/infraestructura/**` handlers; resource viewer/file delivery in `app/api/recursos/[id]/**`, `app/api/gate/[...path]/route.ts`, and matching rules in `middleware.ts`; explicit review of public static map/data exposure under `public/data/**`. Keep public report/offline, verification, shared-token, GE SSO, and public materials/download boundaries from T1. Subsequent completed enforcement and exact route classification are recorded below and in the inventory coverage table.

T3b–T3d implementation, the full route coverage map, exclusions and verified test evidence are recorded in `docs/hub-access-control-inventory.md` §§T3b–T3d. T3d is complete and MAIN TASK T3 is ready for task-level review. Resource and taxonomy GET handlers were confirmed absent; current resource file/explain/static paths have denial tests. `/api/hub/admin` metadata and catalog visibility remain T4 filtering work, while direct resource/map access is guarded. Public `public/data/**` exposure remains a known publication risk pending data-owner authorization, not a blocker to T3. T4 must filter disabled-section content server-side from initial payloads, search, related resources, counters and prefetch without replacing resource/audience/territorial ACLs.

#### T3 review corrections (pending Sol re-review)

- Added `requireServerHubPageAccess` checks at protected page boundaries. These re-read the server session and enforce effective section policy plus the existing page ACL; shared-layout path headers are not used as the page authorization decision. Coverage includes landing/catalog pages, resource viewer, maps and infrastructure map/school viewer pages, situation, infrastructure reporting entry, and staff-gated infrastructure tools. Existing staff, resource, territorial and nominal checks remain in place.
- The landing page's own guard resolves a denied `/` to the authorized configured/available destination (excluding `/` as the current path), with `/forbidden` only when no authorized destination resolves. This covers client navigation when the shared layout is reused.
- `/mapas` and `/tableros` now render the existing `ExplorePage` catalog with forced `mapa` and `tablero` formats respectively, matching `/reportes` rather than redirecting to `/explorar`. Query parameters cannot change the guarded section or the forced catalog format.
- Regression coverage: a staff account with maps-only access is denied at the situation page guard; map and dashboard catalogs are resolved directly, and destination tests cover maps-only, dashboards-only, and infrastructure-only accounts without landing or redirect loops. Focused command/results are recorded after validation below. No API situation/map draft-exclusion changes are included in this correction.
- Validation after landing correction: `pnpm exec vitest run --maxWorkers=2 lib/hub-entry.test.ts lib/hub-entry-server.test.ts 'app/(hub)/section-catalog-pages.test.tsx' 'app/(hub)/layout.test.ts'` (4 files, 27 tests passed); `pnpm exec tsc --noEmit` passed; focused ESLint on the changed page-guard helper and test passed. No browser test was run; full browser regression remains T7.

- T3 review fixes 3+4: situation APIs now require the `situation` section and retain their original staff-only guard without applying infrastructure resource-audience/territorial checks. Infrastructure map photo reads and draft-map counts/details use the default infrastructure verifier; this does not change public report/offline write and upload authorization under `/api/problematicas/parte/**`. See the corrected route ownership table in the inventory. Route-level regression coverage checks situation-only staff success, infrastructure-only denial, and disabled infrastructure denial for photos and draft-map readers. T4 metadata filtering remains out of scope.

### T4. Apply section visibility across navigation and catalog surfaces

Depends on: T2, T3.

- [x] Make `AppShell`, logo/home links, search, menus and breadcrumbs reflect effective permissions. Section-only users have no route back to the landing through hub chrome.
- [ ] Remove disabled-section content from server catalog responses, initial HTML, search, counters and related-resource lists. Do not rely on client-only hiding.
- [ ] Enforce the same policy on direct resource/viewer/file/API access while retaining existing ACL checks.
- [ ] Preserve existing resource-level behavior within enabled sections; this task does not introduce new report-level or layer-level configuration.
- [ ] Preserve map layout, scroll restoration, full-screen viewers and navigation among permitted infrastructure subroutes.

T4a server catalog/read visibility and T4b navigation/chrome implementation are complete; MAIN TASK T4 is ready for ONE Sol low review. A shared server catalog filter now removes resources outside the user's effective section policy and prunes levels, types, categories, and tags to those referenced by the remaining resources. `/api/hub`, `/api/hub/admin`, SSR initial data, and client refetch share the filtered catalog. Resource detail related items retain same-section locked-card behavior; direct resource detail and explain authorization continue to apply the centralized section rule and existing resource ACL. Staff READ metadata follows restricted section grants while staff role-based administration/mutations and admin route access remain intact. Navigation, footer, account menu, home search/actions, educational-level chips and resource breadcrumbs hide disabled-section targets; section-only users have a non-link brand and sign out to `/login`. The shell provides direct navigation for permitted sections and preserves staff administration access. Admin sidebar receives the effective policy from the server layout, omits landing return when landing is disabled, and hides all infrastructure operation destinations (including Verificaciones, whose page guard requires infrastructure) unless infrastructure is enabled. General role-authorized administration and `/admin#usuarios` recovery remain available without infrastructure. Hub data no longer falls back to the static seed catalog when server data is absent. Unknown formats without a recognized canonical route remain fail-closed per T2; a trusted route overrides broad format (including infrastructure maps). No public materials, report/token/GE/offline, or static assets were changed. Follow-up review corrections: landing-enabled/explore-disabled test verifies educational chips are hidden; restricted staff sidebar test verifies no landing/infrastructure links while admin user recovery remains; admin layout tests verify the effective policy is passed through from `getSessionUser`. Focused validation: `pnpm exec vitest run --maxWorkers=2 components/hub-page.test.tsx components/admin-shell.test.tsx 'app/(hub)/admin/layout.test.tsx'` (3 files, 7 tests passed); `pnpm exec tsc --noEmit` and focused ESLint passed; `git diff --check` passed. Infrastructure map viewer/layout code was not modified. Stale-session revocation remains enforced by fresh server page/API guards and filtered catalog reads, not by client navigation visibility alone.

Acceptance: a user enabled only for infrastructure sees only permitted navigation and no disabled-section metadata. The map retains its existing interactions and internal permission boundaries.

### T5. Extend the existing user administration panel

Depends on: T2; integration with T3 and T4.

- [x] Extend the current create/edit user form with enabled sections, landing access and initial destination.
- [x] Keep administrator-assigned initial passwords and existing account creation. Do not add public signup or an email invitation dependency.
- [x] Offer only valid destinations for the selected effective access; return clear validation errors when removing access would invalidate the destination.
- [x] Keep existing role, resource, jurisdiction, password-reset and account-blocking controls intact.
- [x] Validate and authorize changes in `/api/usuarios` and `/api/usuarios/[id]`; reject forged permission/destination values server-side.
- [x] Re-evaluate permissions on subsequent protected requests, including existing sessions. Prevent stale catalog responses from leaking content after revocation.
- [x] Cover self-editing and administrator lockout cases without silently broadening administrative privileges.

Acceptance: an authorized administrator can create a map-only user and later change their sections and destination without code changes. A non-administrator cannot mutate these settings.

#### T5a API/settings integration (implemented; review pending)

- Existing create and patch endpoints accept the registry-backed `hubAccess: { enabledSections, landing, destination }`; per-user GET returns `usuario`, and list GET includes the same policy fields. No signup or invitation flow was added.
- The POST and PATCH routes keep the existing administrator-only mutation guard. Editors retain the existing read-only list/individual GET access, while editors and regular roles receive 403 for mutation. Existing last-admin, password reset, ban, name, role and self-target behavior is retained.
- Validation uses the target account's merged role, resource mode/IDs, jurisdiction IDs and GE CUE against `serverHubPathAllowedByExistingAcl`, never the administrator caller. PATCH validates the resulting policy before mutations; role/resource/scope changes that would stale the saved destination are rejected. Unknown section IDs, malformed policies, non-registry/external destinations and unauthorized destination paths fail with 400.
- Explicit `enabledSections: [], landing: false, destination: null` is a valid deny-all/blocked state and never inherits the legacy landing. Accounts with unset/null columns preserve legacy behavior. A supplied non-empty policy must have a usable authorized destination; default legacy settings on account creation remain unset.
- `getSessionUser` reads persisted policy and ACL data from the DB each request, with no policy cache, so subsequent requests (including existing sessions) observe changes. User creation checks destination validity before calling Better Auth createUser, retaining the admin-assigned initial password.
- Checks: `lib/usuarios.test.ts` plus existing role/admin/last-admin/policy cases; `pnpm exec tsc --noEmit` passed; focused ESLint passed with zero errors. Route-level mutation tests and full API test coverage remain to be added/verified; T5b form and integrated UI checks are pending. Sol review: pending (main T5).

#### T5b existing admin user form (implemented; T5c and main review pending at checkpoint)

- Existing create/edit controls now include section selection, landing availability, and a registry-backed initial destination. Administrator-assigned initial passwords, role, jurisdiction/resource selectors, password reset, ban, and last-admin behavior remain in the existing workflow.
- The create form starts with no sections and no landing, so infrastructure-only accounts can be configured without code changes. Editing legacy accounts presents the inherited all-sections/landing defaults, preserves explicit empty/false values, and uses the existing landing as the legacy starting destination unless a stored destination exists.
- The destination list is registry-driven and further restricted by a private admin-only management-options API evaluated against the target account's role, resources, jurisdiction, and existing CUE, never the acting administrator. It returns only minimal resource selector data, separately from the T4 section-filtered catalog, and is `private, no-store`.
- Removing access that invalidates a saved destination leaves it visible as invalid, announces the reason, and blocks save until corrected. The explicit no-sections/no-landing/no-destination state remains configurable. API failures and save-pending states are shown without closing the dialog.
- Component coverage includes infrastructure-only creation and payload, explicit-empty rehydration, destination invalidation, role-filtered destination options, pending save, and API error feedback. Options-route tests cover non-admin denial, private/no-store minimal management data, and target-user ACL evaluation.
- Checks: `pnpm exec vitest run --maxWorkers=2 components/admin-page.test.tsx lib/usuarios.test.ts app/api/usuarios/opciones/route.test.ts` (3 files, 48 tests passed); `pnpm exec tsc --noEmit` passed; `pnpm lint` passed with 17 existing warnings and zero errors; focused ESLint for touched TypeScript files passed. No browser click-through was run in this slice; main T5 Sol low review remains pending. T5c route/API regression coverage remains pending.

#### T5c bounded route/API verification and repairs (2026-10-23)

- Added route-level tests for POST/list `/api/usuarios`, GET/PATCH `/api/usuarios/[id]`, and both methods of `/api/usuarios/opciones`, using the route modules and real body parsers with isolated dependency mocks. Coverage includes anonymous 401, editor/regular 403 mutation denial, staff reads, target (not caller) merged role/resource/jurisdiction/CUE ACL evaluation, malformed/unknown section and external/unauthorized destination rejection, explicit deny-all, legacy defaults, self-edit, last-admin protection, and existing GE operator destination scope.
- Found separate sequential role/resource/scope/section writes could leave partially updated database authorization settings. Consolidated those DB changes into one transaction. Account creation now compensates by removing the newly created Better Auth account if permission persistence fails. User list and destination options responses are `private, no-store` to prevent stale management state.
- Persistence rollback is integration-tested against the isolated PGlite database: a constraint failure in selected resources preserves the previous resource mode, resource IDs, policy, and destination. API tests verify create failure invokes account cleanup and patch failures do not report success.
- Permission freshness was verified against the existing per-request session DB lookup and T4 server re-denial-before-catalog test; management-options responses are already private/no-store. GE operator CUE and existing jurisdiction/resource controls are retained when destination choices are computed.
- Focused checks: `pnpm exec vitest run --maxWorkers=2 app/api/usuarios/route.test.ts 'app/api/usuarios/[id]/route.test.ts' app/api/usuarios/opciones/route.test.ts lib/usuarios.test.ts components/admin-page.test.tsx lib/hub-sections.test.ts lib/hub-entry-server.test.ts 'app/(hub)/layout.test.ts'` (**8 files, 75 tests passed**). `pnpm exec tsc --noEmit`, focused ESLint, and `git diff --check` passed. Focused ESLint reported zero warnings. Vitest continues to print the known Vite native config-loader compatibility warning.
- No browser click-through, full lint, production build, or live database test was run. Existing Better Auth role/ban/password operations are external to the authorization-settings database transaction; cross-system rollback for those provider mutations is not claimed. T5 is pending the separate provisioning correction (blocker 4); no review is recorded as passed here.

#### Sol MAIN TASK T5 review corrections: blockers 1–3 (2026-10-23)

- **Blocker 1:** Destination-option and PATCH authorization candidates now set `banned: false` for ACL evaluation only, independent of reversible ban state. PATCH applies the submitted role/resource/scope/policy and destination as intended; `banned:false` still invokes Better Auth unban, while the actual persisted/session ban continues to deny runtime entry. Regression tests cover banned-target options and full unban+edit payload.
- **Blocker 2:** A null destination now validates the landing ACL using `canUseLanding`, so unset/legacy landing means enabled; explicit `landing:false` remains denied. Regression covers a legacy role/resource/jurisdiction-only PATCH and ACL denial at `/`.
- **Blocker 3:** Existing-ACL validation now resolves the four legacy aliases through `legacyRecursoRedirect` to their canonical `/recursos/:id` entries before checking resource ACL. Selected-resource users with no selected resource are denied each alias; selecting its canonical resource allows it. A banned runtime user remains denied. PATCH regression verifies rejecting `/tablero` when target-selected-resource ACL denies it.
- Reverification command: `pnpm exec vitest run --maxWorkers=2 'app/api/usuarios/[id]/route.test.ts' app/api/usuarios/opciones/route.test.ts lib/usuarios.test.ts lib/hub-entry-server.test.ts` (**4 files, 53 tests passed**); `pnpm exec tsc --noEmit` and focused ESLint passed with zero warnings. The known Vite config-loader compatibility warning remains. Fix 4 provisioning was not changed or claimed complete; T5 remains pending that separate correction and review.

#### MAIN TASK T5 final Sol low review handoff (2026-10-23)

- Final Sol low review: **PASS**. The final review verification reported **156 tests passed and TypeScript passed**. This closes T5's review gate; it does not imply browser, lint, or build coverage beyond separately recorded checks.

### T6. Add optional self-service password changes

Depends on: T3.

- [x] Add a password-change entry accessible from both the standard hub and section-only experiences.
- [x] Reuse the existing authentication provider's supported self-service change flow, verifying the current password and password policy. Do not expose the administrator password-reset operation to regular users.
- [x] Provide validation, pending, success and failure states; never expose or log passwords.
- [x] Document and test session behavior after a password change. Keep the configured destination and permissions unchanged.

#### T6 implementation (2026-10-23, ready for MAIN TASK Sol low review)

- Added `/cuenta` in the public route group, protected by a server Better Auth session check but outside `HubLayout` and catalog loading. It is therefore reachable by section-only and explicit-empty users; an expired/anonymous session redirects to plain `/login` (no callback loop). The page checks the account table for a `credential` account with a password and only renders self-service change for email/password accounts. It does not apply admin reset/set-password APIs.
- Added account-menu navigation in `AppShell`; `/forbidden` and `/cuenta` both retain logout recovery without rendering the catalog shell. `/cuenta` offers a return link only when `resolveServerHubEntry` finds an authorized destination; explicit-empty/banned users are never sent to `/` or into a resolver loop and retain logout. A 401 during submit displays an actionable `/login` link.
- Banned accounts are explicitly denied password changes in the page UI and at the server boundary: the Better Auth catch-all checks current `getSessionUser()` state before dispatching only `POST /api/auth/change-password` and returns 403 before invoking Better Auth. Other auth endpoints (including sign-out), admin ban flows, and public report routes are untouched. This is not presented as a provider/DB transaction guarantee.
- Uses Better Auth `authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true })`. The installed 1.7.1 source confirms the endpoint requires a sensitive session, enforces configured min/max lengths, verifies the current password against the credential account, updates that account, deletes other sessions, and rotates the current session cookie. For unbanned accounts, current session is preserved and other sessions are revoked. No role, destination, or section-policy write occurs. Admin-assigned initial passwords remain usable and no first-login redirect/change is introduced.
- UI uses the existing auth form/field/button styles and Spanish copy, browser current/new-password autocomplete, required/minimum-length checks, matching confirmation, pending/error/success states, generic provider errors, and clears all password fields on success. Passwords are not logged or displayed in errors.
- Tests cover minimum policy, invalid current password without revealing provider details, successful change/session-preservation contract, optional initial password use, banned UI denial and pre-mutation API denial, section-only route reachability, sign-out endpoint unaffected, credential-only availability, anonymous/expired redirect, and actionable expired-session login. Existing `AppShell` and hub-layout tests cover shell integration and keep the route independent of catalog fetches.
- Checks after Sol findings: `pnpm exec vitest run --maxWorkers=2 'app/(publico)/cuenta/change-password-form.test.tsx' 'app/(publico)/cuenta/page.test.tsx' 'app/(publico)/cuenta/account-actions.test.tsx' 'app/api/auth/[...all]/route.test.ts' components/app-shell.test.tsx 'app/(hub)/layout.test.ts'` (**6 files, 26 tests passed**); `pnpm exec tsc --noEmit`, focused ESLint, `git diff --check`, and `pnpm build` passed. Vitest emitted the known non-failing Vite native config-loader warning; build emitted the existing deprecated middleware-convention and unset Better Auth baseURL/default-secret warnings. No browser click-through or live auth-provider/database test is claimed. T6 fixes are ready for Sol re-review.

#### T6 logout failure handling correction (2026-10-23)

- Final review found that Better Auth `signOut()` may resolve with `{ error }` on HTTP failure rather than reject. Both new shell-independent logout controls now inspect `result.error`; failure shows an accessible alert, keeps the user on the recovery page, clears pending state, and permits retry. Navigation to `/login` occurs only after successful sign-out. The analogous new `/forbidden` action had the same issue and was fixed/tested. Existing unrelated `AppShell.signOut` was left out of scope.
- Regression tests cover resolved 500 error envelope, no navigation on failure, retry availability, successful retry navigation, and successful logout.
- Focused checks at this correction checkpoint: `pnpm exec vitest run --maxWorkers=2 'app/(publico)/cuenta/account-actions.test.tsx' 'app/(publico)/forbidden/forbidden-actions.test.tsx'` (**2 files, 3 tests passed**); `pnpm exec tsc --noEmit` and focused ESLint passed. No build rerun at that checkpoint; final Sol review evidence is recorded immediately below.

#### MAIN TASK T6 final Sol low review evidence (2026-10-23)

- The coordinator reports final Sol low review **PASS**, with **33 tests passed and TypeScript passed**. The independent reviewer also reported real Better Auth provider checks against an in-memory database, including CSRF/session behavior. This is reviewer-reported evidence, not a test run performed or independently reproduced by this T7a executor; the available checkout's T6 focused run above records 26 tests, and does not itself prove the provider/database checks. No production credentials or database were used.

Acceptance: users may enter immediately with their assigned password, optionally change it later, and subsequently authenticate with the new password. No first-login change is forced.

### T7. Run security and functional regression acceptance

Depends on: T3 through T6.

- [ ] Unit/API tests: section-policy matrix, compatibility defaults, account administration, unauthenticated reads, banned users, direct URL denial and callback validation.
- [ ] Browser tests: login before landing, no protected-content flash, normal account, map-only account, multiple enabled sections, no landing access, logout, expired session, refresh and browser back/forward.
- [ ] Catalog checks: disabled sections absent from initial HTML, API responses, search, related resources and counts; verify file/static gates and resource aliases.
- [ ] Infrastructure checks: permitted users retain map layers, filters, school detail, territorial/nominal restrictions, risk views and existing actions applicable to their role.
- [ ] Report checks: existing form access, new report, update/history, shared links, drafts, submission confirmation and existing rate/access controls.
- [ ] Offline checks: offline reopen, pending queues, photos, reconnect, session expiry where applicable and no lost or duplicate submissions. Do not clear existing queues or cached offline assets as part of hub login changes.
- [ ] Run relevant existing tests plus lint, type checking and production build using repository scripts. Record actual commands/results and browser evidence; do not mark unexecuted checks as passed.

#### T7a automated integrated regression (2026-10-23; separate from browser T7b)

- Full lint: `pnpm lint` passed with 0 errors and 17 warnings. Full typecheck: `pnpm exec tsc --noEmit` passed. Production build: `DATA_DIR="$(mktemp -d /tmp/opencode/hub-access-build.XXXXXX)" DATABASE_URL= BETTER_AUTH_SECRET=local-build-only-secret-not-a-production-credential BETTER_AUTH_URL=http://127.0.0.1:3000 pnpm build` passed; only the existing middleware-convention deprecation warning was emitted. The build used a fresh local data directory and explicitly fake local auth settings; no production credentials/database were used.
- Full Vitest runs mirror `.github/workflows/ci.yml` at one worker per shard. Shard 1: `pnpm exec vitest run --maxWorkers=1 --hookTimeout=30000 --testTimeout=30000 --shard=1/4` — **136 files passed; 1,279 passed, 1 skipped, 0 failed** (155.50 s). Shard 2: same command with `--shard=2/4` — **134 files passed; 1,171 passed, 5 skipped; 1 test failed and 1 suite failed** (125.87 s). The page test asserted the old unencoded callback URL although the centralized guard correctly emits the encoded URL; updated assertion verified in isolation: `pnpm exec vitest run --maxWorkers=1 --hookTimeout=30000 --testTimeout=30000 'app/(hub)/infraestructura/cargar/page.test.tsx'` — **1 file, 5 passed**. The unrelated `scripts/backup-postgres.test.ts` failure was reproduced in isolation by `pnpm exec vitest run --maxWorkers=1 --hookTimeout=30000 --testTimeout=30000 scripts/backup-postgres.test.ts`: its hook cannot start Postgres because `podman` is absent (`spawn podman ENOENT`; 4 tests skipped); not counted as passing. This is unrelated to hub access; no pre-change baseline for this container-dependent suite was established. Shard 3: same command with `--shard=3/4` — **136 files passed; 1,289 passed, 19 skipped, 0 failed** (144.89 s). Shard 4: same command with `--shard=4/4` — **136 files passed; 1,428 passed, 1 skipped, 0 failed** (143.28 s). The added spoof regression passed in a focused rerun: `pnpm exec vitest run --maxWorkers=1 --hookTimeout=30000 --testTimeout=30000 middleware.test.ts` — **1 file, 7 passed**. Raw shard totals: **5167 passed, 26 skipped, 1 failed test, plus 1 failed suite**. The one failed test was the stale redirect assertion (corrected and isolated green); the remaining suite failure is the independently reproduced missing-Podman environment limitation. Do not call the raw full suite all-green. Existing non-failing output includes the Vite native config-loader warning, jsdom canvas notices, and jsdom navigation notice. The T7a executor ran no browser tests; the separate T7b browser run and its 8 failures are recorded below and remain unresolved.
- All four originally launched shard runs completed and their notifications/results were consumed; no shard was duplicated. Only the stale page assertion and missing-Podman suite were rerun in isolation, plus the new middleware regression test.

#### T7b isolated browser acceptance (2026-10-23; incomplete)

- Ran `corepack pnpm test:e2e:hub-access` in the isolated temporary checkout, using its throwaway PGlite database, generated local credentials, port 3101, and external-request interception. The webpack production build and TypeScript check passed. Playwright executed 14 tests: **5 passed, 1 skipped, 8 failed**. This is not a T7b pass.
- Initial run exposed a fixture defect: Better Auth 1.7.1 requires the local credential issuer `local:credential`, while the fixture inserted `credential`, causing `User not found`. Updated only `e2e/hub-access/seed.mjs` to use the issuer Better Auth actually queries. The rerun then authenticated the desktop admin and infrastructure users sufficiently to reach protected routes; account create/edit was not verified.
- Rerun evidence: anonymous landing redirect/no protected-content flash passed on desktop and mobile; three public report/offline browser tests passed (online report replay, photo authorization/map navigation, and large-image processing). The offline reopen test remains blocked because the service worker stays in `installing` with no active worker. Hub tests remain incomplete: the admin-users table locator was not found; a denial assertion falsely treats `/mapas/infraestructura` as containing the denied `/mapas` prefix; expected 403s from denied destinations were also recorded as console errors; maps-only mobile login remained on `/login`; keyboard focus inspection found `outline-style: none`. These findings need targeted diagnosis and rerun before claiming the related acceptance criteria.
- The isolated runner cleans up its temporary checkout, database, and Playwright artifacts after each run, so failure traces/screenshots are not retained. No shared T7a files, public-report/offline data, production credentials/data, or service workers in another browser were touched. T7a's four shards and focused corrections are now recorded above, but the raw suite retains the unrelated Podman-dependent failure; together with the unresolved T7b failures, MAIN T7 Sol review remains pending. Do not mark T7 complete from this checkpoint.

#### T7b browser acceptance resolution (2026-10-23)

- Final run: `corepack pnpm test:e2e:hub-access` — **13 passed, 1 skipped (mobile-only test in desktop project), 0 failed** (log: session scratchpad `t7b-8.log`).
- Product fixes: `components/admin-page.tsx` `AdminField` now binds its label to the child control (labels were unassociated). `app/(hub)/layout.tsx` + `components/hub-data.tsx` skip the client `/api/hub` refresh when the user lacks the explore section (section-only users got a 403 on every hub page).
- Test fixes (root causes evidenced from kept artifacts): Better Auth default sign-in rate limit (3 per 10 s per IP) produced 429s on the shared 127.0.0.1 — `login()` waits for the sign-in response and retries after the window; exact-pathname denial assertions; destination option label is "Mapa de infraestructura"; dialog fields located by role; mobile nav checked through the collapsed menu; expected 503 for unpublished `departamentos` dataset in the empty DB; password restored and unique created-user email/row scoping because both Playwright projects share one DB; Tab pressed after focus returns to the menu trigger; offline SW wait uses `expect.poll` (`waitForFunction` did not poll the async predicate; SW activates in ~0.4 s).
- `run.mjs` supports `HUB_E2E_KEEP_DIR=<dir>` to keep Playwright artifacts. Pending: MAIN T7 review gate.

Acceptance: no new map/report regression; all new access cases pass. Any baseline failure is identified separately, with unresolved release-impacting failures blocking rollout.

### T8. Stage, migrate and release with recovery instructions

Depends on: T7.

- [ ] Validate staging with an existing administrator, a standard account, a newly restricted map-only account and representative SSO/public-report flows.
- [ ] Verify migrated permissions and destinations against the T1 baseline before production activation.
- [ ] Prepare a rollback compatible with the migrated schema and existing accounts; never delete report data, drafts, uploaded photos or pending queues.
- [ ] Record production smoke checks and the recovery path for invalid destinations or administrative lockout. Document that reverting enforcement restores the old public-catalog behavior and therefore requires explicit operational approval.

Acceptance: rollout has recorded evidence, a usable administrator account and recovery steps that preserve reporting data and workflows.

## Execution order

T1 -> T2 -> T3 -> T4 -> T5 -> T6 -> T7 -> T8.

Each implementation task includes its focused tests. T7 is integrated acceptance, not the first testing step. Do not mark tasks complete based solely on code inspection.

## Execution and review workflow

- Luna executes small implementation subtasks, each kept approximately below 100k tokens; do not expand a subtask into the whole feature.
- Sol performs one low review after each completed main task (T1–T8), not after every implementation subtask. Main-task review findings are recorded against that task and resolved before advancing.

## Out of scope

- Public access requests, automatic account approval or email invitation delivery.
- A new authentication provider or replacement of GE SSO.
- New permissions for individual reports, map layers, fields or actions.
- Replacing existing resource audiences or territorial/nominal restrictions.
- Functional redesign of the infrastructure map, reporting engine or offline system.

## Next step

Start T2 after coordinator confirmation of how GE SSO's authoritative role/scope refresh interacts with per-user section settings. Production account/destination snapshot is required before rollout migration/activation, not before developing conservative compatibility defaults. This plan changes no application behavior.
