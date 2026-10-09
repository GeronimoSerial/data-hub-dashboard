# Metodología del mapa (versión educativa) en producción

## Objective
Replace the flood-only methodology tab of the infrastructure map with the approved
education-focused methodology page (prototype `docs/prototipos/metodologia-mapa-educativa.html`).

## Scope
- New `components/mapas/metodologia/` (component, KaTeX formulas, simulators).
- Site typography (Barlow / Barlow Semi Condensed) and site color tokens; light and dark via existing `[data-theme]`.
- Keep deep links `#metodologia/<id>` (`inundacion-clases-rio`, `inundacion-ruta-acceso`, `inundacion-junto-laguna`).
- Prototype files stay in `docs/prototipos/` (original kept as backup).

## Constraints
- Every number must match the code (verified during prototyping).
- In-page navigation must not break the tab hash (`#metodologia`).

## Checks
- `pnpm vitest run components/mapas` · `pnpm tsc --noEmit` · `pnpm eslint components/mapas` · visual review in the browser.

TDD: off (no project/session configuration); functional checks above.

## Tasks
- [ ] T1 Component, styles, simulators, tests; wire into `map-client.tsx`; remove old component. Route: inline (user asked to do it personally).
- [ ] T2 Visual review in the running app (light + dark), fix defects.

## Progress
- Created 2026-10-08.
