# Cuadernillos: UX refactor by role and task

Objective: replace the capability-tab workspace with task-first screens per role (cabecera, supervisor, planeamiento/admin), keeping every existing API and guard.
Branch: `feat/cuadernillos-ux` (from `origin/main`). Delivery: one PR to main, promoted to staging and prod by cherry-pick PRs (user authorized promotion to prod). Test runner: `npx vitest run --maxWorkers=2 <paths>`, `npx tsc --noEmit`, `npx eslint components/cuadernillos`.

## Specs

| S1 | User: "es pésima la ui, voy a necesitar una refactorización total. Debe ser mucho mejor esa ux" → approved direction: "Si, hacelo con haikus y vos revisas el resultado hasta que quede perfecto. Tenes permiso de promover hasta prod." |
| S2 | Cabecera: "Nuevo pedido" is the primary action. Search by CUE → school card (name, departamento, severity badge, link "Ver ficha" to ENOS) → quantities per product prefilled with the recommendation, editable → send. Below: "Mis pedidos" with status chips (Pendiente, Aprobado, Aprobado parcial, Rechazado) and the remainder action where it applies. Admin picks the cabecera first (compact selector), then the same flow. |
| S3 | Supervisor: inbox of pending requests grouped by cabecera, with counts. Selecting one opens a side panel (sheet on mobile): school, severity, ENOS ficha link, requested vs available quantities, approve (quantities editable down to 0, confirmation step) or reject (reason required). History of decided requests collapsed below. |
| S4 | Planeamiento/admin: home summary (stock global per product, cupos per cabecera, pending/approved today) plus stock and cupo forms; a separate "Configuración" area with Cabeceras (account binding) and Membresías. |
| S5 | "Ver como" is a compact selector in the page header for admins, with a clear read-only banner; all write controls disabled in that mode. |
| S6 | Plain language: no audit/legal paragraphs on screen; short helper text only where needed; errors in Spanish, actionable. |
| S7 | Project UI rules: no native `<select>`, no duplicate search, clean uncluttered panels (memory feedback-clean-uncluttered-ui); reuse `components/ui/*` (button, input, field, sheet, tabs, toggle-group, confirm-sheet, dialog) and existing CSS variables (`var(--ink)`, `var(--line)`, …). Mobile-first: works at 360px wide. Keyboard and focus visible. |
| S8 | No API, guard or data-model changes. Every existing behaviour test that is about behaviour (not markup) must still pass or be rewritten against the new markup with the same assertion. |

## Tasks

- [ ] U1 — S2, S6, S7; cabecera home (`components/cuadernillos/cabecera/**`); delegated haiku (parallel)
- [ ] U2 — S3, S6, S7; supervisor inbox (`components/cuadernillos/supervisor/**`); delegated haiku (parallel)
- [ ] U3 — S4, S5, S6, S7; workspace shell, planning home, configuration area, view-as header (`components/cuadernillos/workspace.tsx`, `planning/**`, `config/**`, page); delegated haiku (parallel)
- [ ] U4 — S1; parent integration, removal of superseded components, visual review via e2e harness screenshots, fixes until clean
- [ ] U5 — S1; PR, CI, promote staging and prod

Contracts between units (U3 imports, U1/U2 implement):
- `components/cuadernillos/cabecera/cabecera-home.tsx`: `export function CabeceraHome(props: { isAdmin: boolean; readOnly: boolean; viewAsUserId?: string | null })`
- `components/cuadernillos/supervisor/supervisor-inbox.tsx`: `export function SupervisorInbox(props: { isAdmin: boolean; readOnly: boolean; viewAsUserId?: string | null })`

## Log

L1 (2026-11-12, user): "es pésima la ui, voy a necesitar una refactorización total. Debe ser mucho mejor esa ux" → proposal by role/task accepted: "Si, hacelo con haikus y vos revisas el resultado hasta que quede perfecto. Tenes permiso de promover hasta prod. Voy a dormir."
