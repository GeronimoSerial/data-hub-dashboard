# Auditoría estricta A1–A4 (adaptación de la PR #185)
Rama: feat/auditoria-estricta (base origin/dev). Estrategia de entrega: ask-on-risk, A1–A3 a dev, A4 espera aprobación del dueño. Runner: pnpm exec vitest run.

## Specs
S1. "Quiero que, adaptes la pr de auditoria que esta abierta, a este. Necesito que haya una auditoría estricta sin afectar el rendimiento del sistema."
S2. Fuente: `docs/propuestas/plan-batches-enos.md` sección "A — Auditoría estricta" (definiciones de estricta y presupuesto, tabla A1–A4, reglas). Portar la PR #185 (`pr-185`) archivo por archivo, sin merge ni rebase; migración con el siguiente número libre tras 0058 y `when` monotónico; sin snapshot viejo.
S3. Estricta: evento y efecto en la misma transacción; si el evento no se guarda, se revierte y la API responde 503 (`code: auditoria_no_disponible`). Rechazos/validaciones/401/403/409/429/excepciones dejan evento fuera de la transacción revertida.
S4. Tabla solo de inserción: trigger que rechaza UPDATE y DELETE sobre `auditoria_evento`, en PostgreSQL y PGlite (si PGlite no puede, decirlo y probar en PostgreSQL). Sin cascadas desde objetos de negocio.
S5. Sin secretos ni datos personales; metadatos por lista permitida, hasta 4 KiB. Prueba de cobertura que falla si una ruta mutadora del alcance no declara su acción.
S6. Rendimiento: p95 ≤ +5 ms por ruta de escritura auditada (PostgreSQL local `_test`), rutas no auditadas sin cambio, visor < 300 ms con 1M eventos. Cero fetch extra desde el navegador, una sola inserción por solicitud, índices (fecha,id) y (actor,fecha).
S7. Jobs: un evento de intención y uno de resultado por corrida, nunca por fila.
S8. Criterio rector: ENOS Corrientes byte a byte igual (snapshots B2 idénticos, `node e2e/mapa-enos/run.mjs` 0 failed, e2e de región verde, ningún test existente modificado sin aprobación de N1). 503 nuevo solo si falla la inserción de auditoría. Único cambio visible: visor `/admin/auditoria` (A4, no se promueve sin aprobación).
S9. A1 base. A2 reportes+verificaciones (incl. cola B6 `Enlace vencido`, respuesta asistida). A3 ENOS/admin/auth/jobs (incl. región Manaos, textos pt). A4 visor + medición reproducible + runbook.

## Tasks
- [x] T1 A1 base (S2-S5) — delegated haiku, 3 writers + verifier — dev PR #317 (a36319e2)
- [x] T2 A2 reportes y verificaciones (S3,S5) — 3 haiku writers in parallel + verifier — dev PR pending
- [x] T3 A3 — 6 haiku writers + 2 closures + verifier — dev PR #319 (3777b4a4)
- [ ] T4 A4 visor + medición + runbook (S6) — built, awaiting owner approval (not promoted)

## Log
L1 (2026-11-13) Pedido del dueño verbatim: "Quiero que, adaptes la pr de auditoria que esta abierta, a este. Necesito que haya una auditoría estricta sin afectar el rendimiento del sistema."
L2 Brief N2-J de N1: ver spec arriba; reglas: rojo primero, prueba de mutación por test nueva, haiku subagents, sin Co-Authored-By.
