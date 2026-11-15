# Cuadernillos: plain-language, task-first UX for envíos

Objective: make every cuadernillos screen tell each role what to do now, in plain words, with dense layouts. Frontend only (no schema/API change).
Branch: feat/cuadernillos-envios-ux (from origin/main c128b156). Delivery: PR to main + cherry-pick PR to staging, merge (user choice for the previous feature). Runner: pnpm exec vitest.

## Specs

- S0 — Request: "Sigue sin entenderse muy bien cuando ingresas, hay que refactorizar la experiencia de usuario para que sea mas fluido el comprendimiento de lo que hay que hacer, no tantos tecnicismos". Scope chosen: "Todo, 1 a 7". Vocabulary chosen: "Usar "envío"".
- S1 — Task first. Each role lands on one card saying what it has to do now: school "Te llegó un envío de cuadernillos. Confirmá qué recibiste."; cabecera "Tenés 2 envíos para recibir."; Planeamiento "Enviar cuadernillos" (stock and numbers below); supervisor "3 envíos llegaron incompletos. Revisalos.". With nothing pending: "No tenés nada pendiente.".
- S2 — Plain vocabulary everywhere in the UI: Remito → Envío ("envío N° 12" as reference), Despachar → Enviar, Firmar recibido → Confirmar que llegó, Tramo/línea → not shown, Faltantes → Llegó de menos, Severidad Crítica → Escuelas que necesitan cuadernillos, "Un solo recibido" → removed (the system handles it silently). Error messages in plain Spanish (e.g. "La Escuela X ya no figura como prioritaria, quitala del envío"), never codes.
- S3 — Receipt in one question: one card per envío with the list ("1° grado: 30, 2° grado: 25") and two big buttons "Sí, llegó todo" / "Llegó menos"; only "Llegó menos" reveals quantities + motivo. Final confirmation: "Confirmo que recibí estos cuadernillos — [nombre], 14/11".
- S4 — Journey: each envío shows "Enviado → Llegó a la cabecera → Llegó a la escuela" with who confirmed each step and when (replaces chips "En camino", "Pendiente en cabecera", "Recibido por cabecera"). Shared component ShipmentJourney in components/cuadernillos/kit.tsx.
- S5 — Planeamiento wizard with numbered steps "1. ¿A qué cabecera? · 2. ¿Qué escuelas y cuántos? · 3. Revisar y enviar"; schools searched by name, CUE secondary.
- S6 — Circuit guide: "Planeamiento envía → la cabecera confirma y reparte → la escuela confirma", shown on empty screens, dismissible. Shared component CircuitGuide in kit.tsx.
- S7 — Less noise: hide the campaign selector when there is only one; supervisor sees observations only when opening an envío with a problem; role tabs only for accounts with more than one role.
- S8 — Density (2026-11-14, verbatim): "Tambien vamos a tener que aprovchar mejor los espacios en las pantallas, no me puede ocupar un row de cuadernillos y su cantidad, aproximadamente 60px, son gigantes. Estamos desperdiciando espacio. Reordenalo". Product/quantity rows ~30–36px on desktop, multi-column grids for product quantities; touch screens keep 44px targets.

## Tasks

| ID | Specs | Route | Status | Commit |
|---|---|---|---|---|
| T1 | S4, S6, S8 | inline (shared kit: TaskCard, ShipmentJourney, CircuitGuide, dense CSS) | done — kit.guidance.test 3/3 | (this commit) |
| T2 | S1–S4, S6, S8 | delegated (sonnet medium, parallel: receipts) | pending | |
| T3 | S1, S2, S4–S8 | delegated (sonnet medium, parallel: planning) | pending | |
| T4 | S1, S2, S4, S6–S8 | delegated (sonnet medium, parallel: control + workspace) | pending | |
| T5 | all | inline (e2e selectors, docs, seam check) | pending | |

## Log

- L1 (2026-11-14): "Sigue sin entenderse muy bien cuando ingresas, hay que refactorizar la experiencia de usuario para que sea mas fluido el comprendimiento de lo que hay que hacer, no tantos tecnicismos / Dame sugerencias"
- L2: Suggestions 1–7 given; answers: "Usar "envío" (Recommended)", "Todo, 1 a 7 (Recommended)".
- L3: "Tambien vamos a tener que aprovchar mejor los espacios en las pantallas, no me puede ocupar un row de cuadernillos y su cantidad, aproximadamente 60px, son gigantes. Estamos desperdiciando espacio. Reordenalo" → S8; kit density tightened in T1.
