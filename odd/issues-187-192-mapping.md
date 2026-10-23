# ODD source map: issues #187–#192

## Scope and checkout state

Investigation only. The six GitHub issues are currently open. `HEAD` is `a6917708` and the working tree already contains an uncommitted, unverified #191 candidate. No issue-specific fix is present in `HEAD` history found in this checkout; history does contain the existing report, nominal-access, photo-gallery, fullscreen, and risk features described below. The candidate is not an approved design and was not changed for this report.

Relevant existing test seams include `lib/infraestructura/identidad.test.ts`, `app/api/mapas/infraestructura/nominal/route.test.ts`, `lib/infraestructura/parte-consulta.test.ts`, `components/mapas/ficha-escuela-panel.test.tsx`, `components/mapas/ficha-escuela-pagina.test.tsx`, `components/infraestructura/fotos/galeria-evidencia.test.tsx`, the risk API route tests, `lib/infraestructura/validacion-trayectoria.test.ts`, `lib/infraestructura/servicio-educativo.test.ts`, and `lib/infraestructura/consistencia-parte.test.ts`. There are no tests for the uncommitted career selector, career catalog, migration, or candidate flow changes in this diff.

## #187 — nominal affected-student selection

**Confirmed behavior and flow.** The issue describes a production case where the nominal dialog returns a section’s full membership despite a strict partial selection. In `lib/infraestructura/identidad.ts`, `listarAfectadosNominal` obtains a cutoff and section IDs using `obtenerCorteYSeccionesDeAfectacion`, queries all `ge.ge_alumno_seccion` memberships for those sections, then resolves identities for all resulting person IDs. `lib/infraestructura/impacto.ts` currently returns only `{ corteId, geSectionIds }` from `infra_afectacion_seccion`; it does not retrieve `infra_afectacion_alumno`. The endpoint is `app/api/mapas/infraestructura/nominal/route.ts`, called by `components/infraestructura/alcance-nominal-modal.tsx`. The data contract in `lib/db/schema.ts` distinguishes complete sections (no selection rows) from partial sections (selected student rows).

**Acceptance scenarios.** For one section with selected person IDs, return only those identities and count them; for a complete section with no selected IDs, return all memberships; cover a mixed affectation with one complete section and one partial section; preserve nominal access checks and access logging; ensure the returned sections/count agree with the caller-visible scope.

**Existing tests / unknowns.** Extend identity and route tests named above. Confirm handling of stale selected person IDs or rows outside the cutoff, duplicate membership IDs, and sections with no current memberships. Production report references Escuela Nº 975 and one selected student; no local reproduction was run.

## #188 — critical-severity justification read contract

**Confirmed behavior and flow.** Submission validation/persistence already has justification fields (`lib/infraestructura/validacion-trayectoria.ts`, `app/api/problematicas/parte/route.ts`, `infraAfectacion` in `lib/db/schema.ts`). The shared read model `AfectacionFicha` in `lib/infraestructura/parte-consulta.ts` currently has `descripcion` but omits `justificacionCritica` and `justificacionCriticaDetalle`; `armarFichaParte` builds the map/director read model. The map route and director route consume that model. `components/mapas/ficha-escuela-panel.tsx` and `components/mapas/ficha-escuela-pagina.tsx` render the school detail view; the issue reports the justification is not displayed. The current map contract is thus missing the values before rendering, rather than a persistence issue.

**Acceptance scenarios.** A critical affectation with a predefined reason shows its reason in both panel and standalone page; `otro` shows its saved detail; absent/noncritical justification adds no empty UI; map and director API read contracts preserve the appropriate privacy boundary. Existing critical-justification validation tests and the `parte-consulta` / panel tests are the focused seams; add standalone-page assertions as well.

**Unknowns.** Decide exact label/placement and whether the detail should appear only for `otro` (the stored detail contract suggests so). Check null, historical, and malformed legacy values. No candidate changes target #188.

## #189 — evidence gallery and fullscreen recovery

**Confirmed behavior / reported symptoms.** The issue reports cropped photos on small screens and a blocked school detail after entering fullscreen; environment and reproducer are absent, and the issue explicitly says the cause was not reproduced. In `components/infraestructura/fotos/galeria-evidencia.tsx`, the selected image viewer is rendered inline with `role="dialog"`, backdrop click and close button handlers. It does not currently handle Escape, move/restore focus, or portal the viewer. `components/infraestructura/fotos/galeria-evidencia.module.css` uses fixed square thumbnails with `object-fit: cover` and a viewer image with `object-fit: contain`; inspect the viewer bounds and containing stacking/overflow contexts rather than treating thumbnail cropping alone as the reported defect. `components/mapas/fullscreen-button.tsx` requests fullscreen on its target and listens for `fullscreenchange`; `components/mapas/map-infraestructura-page.tsx` chooses the map shell as the fullscreen target. The gallery is shared by the map panel and school page.

**Acceptance scenarios.** Open landscape and portrait images at narrow/mobile and desktop dimensions; resize/orient while open; close with button, backdrop and Escape; confirm focus returns to the thumbnail; enter fullscreen, open/close the viewer, return to the school details and exit fullscreen; confirm page/map scrolling and controls still operate in both host views.

**Tests / unknowns.** `galeria-evidencia.test.tsx` covers current gallery behavior but not keyboard/focus/viewport sizing; add browser tests for both hosts and fullscreen transitions. Obtain browser, viewport, device, and a reproduction trace if diagnosis remains unclear. No candidate changes target #189.

## #190 — intermittent probabilistic-risk failure

**Confirmed behavior / flow.** The issue reports intermittent `no available server`, without a timestamp, response, or deterministic reproducer. The literal was not found in source. A confirmed school-risk UI request exists in `components/infraestructura/riesgo-escuela.tsx`: it fetches `/api/infraestructura/riesgo/escuela/[cueAnexo]?horizonte=…`, and any non-OK/network failure is collapsed to the generic “No se pudo cargar el riesgo actual.” with no retry control. That route and its tests are in `app/api/infraestructura/riesgo/escuela/[cueAnexo]/`. A separate probabilistic ranking endpoint is `app/api/infraestructura/riesgo/route.ts`, called by the map radar/risk panel; it checks read access, seeds, reads the current `infraRiskRun`, and queries snapshots. Do not assume which request the report means. The endpoint route tests cover API behavior, not the reported transient infrastructure error.

**Acceptance scenarios.** Identify the exact failing URL/method and capture status, duration, response body, request/correlation ID and time; verify successful response renders normally; simulate a transient failure then a successful retry without losing school/map context; verify permanent/authorization errors are not retried blindly; test an empty current run separately from a server error. Add regression coverage once the failing layer and error contract are established.

**Unknowns / operational dependency.** Need application, proxy/load-balancer and downstream service logs correlated to the observed request. “No available server” may be emitted outside this app; infrastructure root cause is unconfirmed. User must supply a failure window or operators must reproduce and capture evidence. No candidate changes target #190.

## #191 — Superior CUE eligibility and career selection

**Product constraints confirmed for this plan.** Only Superior CUEs disable “Inaccesibilidad de alumnos”. For “Afecta al establecimiento”, users select one or more careers belonging to that CUE, including ABIERTA and CERRADA careers. The supplied workbook has already been checked: Estatales and Privados sheets, 82 unique CUEs and 409 CUE-career pairs; source header is `Carrrera`; source CUEs are nine digits and must map to seven-digit CUE plus two-digit annex. Do not print or add student/person data. Do not infer a new career nominal roster.

**Current candidate diff (uncommitted, incomplete).** It adds `data/carreras-superior-2026.json`, `lib/infraestructura/carreras-superior.ts`, `components/infraestructura/selector-carreras.tsx`, `scripts/importar-carreras-superior.mjs`, `drizzle/0030_superior_carreras.sql` and migration journal/snapshot changes. It changes `AfectacionBorrador` and the shared form fields, toggles off the students category for CUEs found in that static catalog, sends/reads career arrays in the director parte route, stores `infra_afectacion.carreras` JSONB, adds schema validation, adds career values to the service-scope union and persistence, and includes some display/history-summary hooks. `normalizeCue` is used to map base CUEs to annex `-00`. The JSON catalog carries institution/career labels only, not a nominal roster.

**Reusable pieces.** Catalog lookup and membership validation in `carreras-superior.ts`; selector component; the form’s existing draft state/serialization and generic offline submission envelope; shared `Afectacion`/read-model and route; career field persistence and CUE validation are plausible building blocks. User requirement supports a per-affectation career array. Keep the existing `design.md` and form/UI patterns.

**Gaps and compatibility risks to resolve in the ODD.**

- Eligibility currently means “this CUE has at least one catalog entry”, not an independent establishment classification. Confirm this catalog is the authoritative Superior eligibility list and define behavior for missing/new CUEs. Verify CUE and annex matching for actual inputs and category selectors.
- The initial-report path is visibly modified, but update/recorrido UI does not yet expose a career selector or establish how changing career scope is authored. `lib/infraestructura/parte/recorrido-actualizacion.ts` adds a type/payload field only; verify UI state, server modification semantics, confirmation and historical diff end to end.
- Initial POST, GET, idempotency/equivalent-affectation matching, justifications, completeness checks, map/director readbacks, history/diff and validation must agree on whether Superior affectations have empty sections and only career IDs. Existing summaries/counts assume sections in places. `lib/infraestructura/parte-consulta.ts` totals remain section/student totals; map summary behavior for career-only records needs explicit contract/labels.
- Offline drafts are browser persisted in `reporte-inicial-form.tsx`, and sending uses shared offline queue contracts. Candidate serialization includes optional careers, but check restore/older draft compatibility, offline replay against the new server/schema, interrupted sends, and drafts created before the catalog/migration rollout. No new candidate tests exercise these cases.
- Migration is additive JSONB but rollout needs ordering: database migration before code that writes/reads the column, coordinated rollback behavior, and production catalog delivery. Do not run it during planning. The workbook remains an existing user artifact and should not be copied, modified, or included in source changes.
- Career service scope is not established as a requirement. The issue/product requirement asks for career scope on the affectation reason; it does not ask to create a new `servicio educativo` alcance type. Candidate sends the selected affected careers as service scope, extends service status calculations, and adds `tipo: carrera` history semantics. This adds domain and migration/compatibility surface; recommend omit unless product explicitly needs independent per-career service status. If retained, finish all readers, timeline descriptions, map current-state labels, update paths, scope validation, and compatibility tests; `movimiento-descripcion.ts` currently formats only establishment/turno/seccion-specific cases and needs review.
- Candidate route checks service career membership but should keep validation centralized and consistent for both new/modified affected careers. Check duplicate IDs, empty arrays, old non-Superior records, and career removal behavior. The present API’s change handling and transaction must not silently preserve incompatible section/student rows.

**Minimal design proposal.** Keep catalog-backed Superior eligibility, disable the specified category in UI and enforce it server side; persist selected career labels/identifiers on the affectation with an additive migration; validate selections against the selected CUE; return them through the shared read model and initial/update/history flows; adapt labels/counts for career-only scope. Do not extend `ServicioAlcanceTipo` unless a separate product decision confirms service interruption can be independently scoped to careers. Do not infer career closure status behavior: requirement explicitly includes both open and closed careers.

**Acceptance scenarios.** Superior CUE: category disabled and forged server request rejected; select one and several careers including entries from both closure states; reject career outside CUE, duplicates and empty selection; submit online/offline, restore draft and retry; verify persisted readback in map/director, update flow, history and summaries; verify non-Superior sections/students flows unchanged; verify all 82 listed CUEs normalize and resolve.

**Tests / owners.** UI owner: `components/infraestructura/afectacion-campos.tsx`, selector and initial/update forms; API/domain owner: `validacion-trayectoria.ts`, `app/api/problematicas/parte/route.ts`, `parte-consulta.ts`, `movimiento-diff.ts`; persistence owner: schema + migration; data owner: import/catalog and CUE-normalization validation; offline owner: draft/replay/restore contracts. Focus existing `afectacion-campos`, validation, route, `parte-consulta`, movement diff, offline contract and service-scope tests; add focused UI/API/database integration coverage. This unit spans enough owners that it may exceed 400 authored lines if all compatibility and tests are included; split catalog/persistence foundation from UI/API/readback integration, but keep an agreed contract first.

## #192 — “Centro de evacuados” affectation reason

**Confirmed behavior and flow.** `lib/infraestructura/motivos.ts` seeds reason names and categories; request validation resolves a submitted reason and category in `app/api/problematicas/parte/route.ts`; persisted affectations store the reason text, later shown through `parte-consulta` and school detail components. The building status `centro_evacuados` already exists as `EstadoEstablecimiento` (`lib/infraestructura/trayectoria-tipos.ts`) and is labeled in `components/infraestructura/estado-actual-textos.ts`. `lib/infraestructura/consistencia-parte.ts` has explicit rules pairing the existing building status with evacuation, flood, storm, service, and classroom states. The new reason is a distinct affectation reason, not a replacement for that building status.

**Acceptance scenarios.** New reason appears under establishment category in initial and update flows; server accepts and persists it; map/director readback and history retain the display string; distinguish selecting the reason while building state is not `centro_evacuados` from setting the building state; evaluate whether each combination yields a consistency warning rather than silently changing either field.

**Tests / unknowns.** Extend `validacion-trayectoria.test.ts`, reason selector tests, route persistence/readback and `consistencia-parte`/server-consistency tests. Confirm stable reason ID/name and whether consistency rules are needed for (a) reason without status and (b) status without reason. No candidate changes target #192.

## Ownership, order, and collision map

1. **Shared contract / product decisions:** settle #191 eligibility catalog authority, career-only semantics, whether service scope changes are in scope; settle #192 reason/status consistency policy; settle #188 placement. These decisions precede the dependent ODD units.
2. **Independent #187 data/API unit:** `impacto.ts`, `identidad.ts`, nominal API and tests. Avoid overlap with #191’s `parte-consulta` and shared affectation model where possible.
3. **Independent #188 read model and UI unit:** `parte-consulta.ts`, `ficha-escuela-panel.tsx`, `ficha-escuela-pagina.tsx` and tests. Potential file collision with #191 `parte-consulta`/shared UI; sequence or assign exclusive ownership.
4. **Independent #189 gallery/fullscreen unit:** gallery TSX/CSS, fullscreen/map target behavior and browser tests. Keep exclusive ownership of gallery and fullscreen files.
5. **#190 diagnosis then remediation:** gather operational evidence first; UI retry/error handling can proceed only after request/error contract is identified. Do not claim a backend fix from current source inspection.
6. **#191 catalog/persistence then integrated flow:** approve domain contract; then migration/catalog, followed by UI/API/readback/offline/history. Exclusive ownership needed for `reporte-inicial-form.tsx`, `validacion-trayectoria.ts`, `app/api/problematicas/parte/route.ts`, `parte-consulta.ts`, and `trayectoria-tipos.ts`; these overlap other issue work and should not be edited concurrently.
7. **Independent #192 motive/consistency unit:** reason seed, validation, consistency rules and tests; avoid conflict with #191 route/validation work.

Likely >400 authored lines: #191 if including complete initial/update/offline/readback/history and regression coverage; possibly #189 if browser coverage spans both map and standalone page. Keep focused units under reviewable ownership boundaries and flag any actual authored-line total during planning.

## Verification matrix

| Issue | Focused automated coverage | Runtime / browser | External evidence or blocker |
|---|---|---|---|
| #187 | `identidad.test.ts`; nominal route tests; complete/partial/mixed-section fixtures | Authorized nominal dialog; counts and rows match selection | Confirm production reproduction/data semantics if stale rows appear |
| #188 | `parte-consulta.test.ts`; panel and standalone page tests | Map panel and individual school rendering; critical/other/null cases | Product decision on placement/detail display |
| #189 | Gallery component tests for Escape/focus/close; fullscreen behavior | Mobile and desktop, portrait/landscape, map panel and page, enter/exit fullscreen | Obtain device/browser/viewport if issue cannot be reproduced |
| #190 | Risk school and ranking route tests; transient fail/retry regression | Capture exact call; fail then recover without losing context | Correlated app/proxy/downstream logs; incident time, URL, status and body |
| #191 | Selector, schema, route, read model, diff, offline restore/replay and migration integration tests | Representative Superior and non-Superior CUEs; online/offline; update/readback/history | Catalog authority; decision on service scope; migration rollout sequencing |
| #192 | Motive schema/route/readback and consistency tests | Select/save/consult with both building-state combinations | Product decision on reason/status consistency and stable label |

No full suite or build was run; this mapping task does not require them.

## Questions for coordinator

1. For #191, is the verified workbook catalog authoritative for Superior eligibility, including CUEs absent from the catalog? Is per-career affectation sufficient, or is per-career service interruption an independently requested behavior?
2. For #192, should reason “Centro de evacuados” and building status `centro_evacuados` require each other, or should inconsistency only be surfaced as a warning?
3. For #190, which exact screen/request and incident time produced “no available server”? The source cannot distinguish the per-school endpoint from the map ranking request.
