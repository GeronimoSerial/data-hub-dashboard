# Cuadernillos wizard UI
Objective: whole cuadernillos flow (envío, recepción cabecera, recepción escuela) as a very simple wizard with few buttons.
Branch: sg/planeamiento-ui · Delivery: ask-on-risk · Runner: vitest (`npx vitest run components/cuadernillos`)

## Specs
- S1: "necesito que refactoricemos la ui del flujo de cuadernillos. Debe tener un flujo MUY sencillo, de pocos botones, en un wizard." Uses ui-taste.
- S2: Scope chosen by user: "Todo el flujo (envío + recepción cabecera + recepción escuela)".
- S3: Shared wizard shell (step counter, progress bar, one question per step, Atrás + one primary action).
- S4: Envío wizard: single destination list (Directo a escuelas + cabeceras), no mode toggle; schools+quantities; review and send.
- S5: Recepción (cabecera and escuela): step 1 "¿Llegó todo?" (choices advance on click), step 2 quantities only when less arrived, step 3 confirm. One pending envío at a time.
- S6: API payloads, idempotency keys and error messages unchanged.

## Tasks
- [x] T1 (S3) Wizard shell in kit — inline
- [x] T2 (S4) Envío builder on shell — inline
- [x] T3 (S5,S6) ReceiptWizard shared by cabecera + escuela; remove LineQuestions — inline
- [ ] T4 tests updated (81 pass), planning step 1/2 inspected on seeded env; receipt steps pending visual check — inline

## Log
- L1 (2026-11-18): "necesito que refactoricemos la ui del flujo de cuadernillos. Debe tener un flujo MUY sencillo, de pocos botones, en un wizard. Utiliza ui-taste"
- L2: "voy a necesitar que me levantes un localhost con una db temp seed para poder ver el flujo completo, con cloudflared, delegaselo a un haiku" → delegated to a haiku (read-only on repo).
- L3: No image-generation tool available: ui-taste image-first step skipped; existing kit/tokens used as target.
