# Durable photo uploads and duplicate inventory
Branch: `GeronimoSerial/fix-carga-fotos-idempotente`. Runner: pnpm / Vitest; no external DB for implementation.
Delivery: feature branch only; separate coherent commits, no PR, merge or deploy. Forecast: 900–1400 authored lines; PR slicing deferred (no PR authorized).

## Specs
S1: Front: persistir en IndexedDB la operación completa de carga de fotos (idempotencyKey, movimiento base / documentaMovimientoId, attachmentIds, hashes, estado) ANTES del POST; al volver/reintentar/recargar, reanudar LA MISMA operación (misma clave e IDs), no generar una nueva. Estados claros: pendiente / subiendo / confirmada / error, visibles en la UI. Refrescar GaleriaEvidencia cuando la cola de fotos termina (no solo al declarar). Evitar reenviar el mismo lote.

S2: Back: idempotencia para la declaración de fotos (reusar movimiento/adjuntos ante la misma clave); hash real de contenido (p.ej. SHA-256 calculado en el cliente y verificado/registrado en el servidor); dedup por operación + movimiento documentado (si llega el mismo set de hashes para el mismo movimiento documentado del mismo parte en una ventana razonable, devolver la evidencia existente en vez de crear otra). NO dedup global por ETag. Conservar el trigger de 3 fotos.

S3: Migración drizzle solo si hace falta (p.ej. columna content_sha256 nullable + índice). NO correr migraciones contra prod ni staging. NO conectarse a ninguna DB para la Parte 1.

S4: Correr tests existentes, lint y typecheck (pnpm). Agregar tests para el camino de idempotencia/dedup (back y front donde se pueda).

S5: Commits con mensajes claros en español (conventional commits). Push SOLO de la rama GeronimoSerial/fix-carga-fotos-idempotente a origin (cuenta gh GeronimoSerial; nunca serialgeronimo). NO push a main, NO PR merge, NO deploy.

S6: Crear scripts/inventario-fotos-duplicadas.mjs (en esta rama, commiteado) que se conecte a hub_prod usando la configuración ya existente en esta máquina (la misma forma de conexión que se usó antes para hub_prod; p.ej. el backup de envs de Coolify en ~/backups/data-hub-2026-10-08/), cargando credenciales DENTRO del proceso.

S7: SEGURIDAD DE SECRETOS (OBLIGATORIO): NUNCA imprimir variables de entorno, connection strings, contraseñas, ni el contenido de archivos de credenciales, ni en stdout, logs, terminal, archivos de salida ni el reporte. No hacer cat/grep/sed/head de archivos de credenciales. Envolver el parseo de la URL/config en try/catch y mostrar solo mensajes genéricos sin el input (antes hubo una filtración por un error de parseo de URL; no repetir). Las credenciales no van en el repo ni en los archivos de salida.

S8: Solo lectura: BEGIN; SET TRANSACTION READ ONLY; solo SELECT; ROLLBACK al final. Nada de INSERT/UPDATE/DELETE/DDL. Nada de borrar o mover objetos OBS (si calculás hash de contenido, solo si está disponible sin descargar todo; si no, usar ETag+tamaño).

S9: Agrupar fotos (infra_adjunto confirmadas y pending) por parte/reporte/CUE y huella (optimizada_etag + optimizada_size, y miniatura). Cruzar con tipo de movimiento, documentaMovimientoId (resumen), creada_en, creada_por/autor.

S10: Clasificar cada grupo con duplicados: ACCIDENTAL (mismo autor, mismas fotos, movimientos solo-foto separados por minutos, sin confirmación distinta documentada) / LEGITIMO (las fotos documentan una confirmación/actualización distinta) / DUDOSO.

S11: Salida en ~/orca/backups/inventario-fotos-<YYYYMMDD-HHMMSS>/: grupos.csv, grupos.json, resumen.json (reportes escaneados, grupos con duplicados, accidentales, legítimos, dudosos, filas de fotos extra y bytes involucrados), y un README.md con la metodología. Sin secretos en la salida.

## Tasks
- T1 | S1-S4 | inline frontend + delegated backend (fixed contract, disjoint surfaces) | complete; backend `49f7deb0`, frontend `883f25af`
- T2 | S6-S11 | delegated inventory script (independent behavior/surface) | complete; `e122f739`, inventory executed read-only
- T3 | S5,S6-S11 | inline integration, independent high-risk verification, read-only execution | complete; source HEAD `e122f739` pushed and remote SHA verified

## Log
L1 — Original request (verbatim):

TAREA APROBADA POR GERO (textual: "A y B juntos"). Repo data-hub-dashboard, este worktree, rama GeronimoSerial/fix-carga-fotos-idempotente.

Contexto: un análisis estático previo (sesión Codex "analisis-fotos-reportes") encontró que el reporte tiene idempotencia pero la carga de fotos no: CargaEvidencia genera clave nueva por montaje (components/infraestructura/fotos/carga-evidencia.tsx:27-33); SelectorFotos.manejarSeleccion da UUIDs nuevos (selector-fotos.tsx:58-70); declararFotosFormulario hace POST directo no durable (lib/infraestructura/fotos/flujo-formulario.ts:51-89); crearEvidenciaFotografica solo reutiliza con misma clave+cuerpo, sin comparar contenido (lib/infraestructura/adjuntos/evidencia-fotografica.ts:93-175); GaleriaEvidencia refresca al declarar, no al terminar la cola (galeria-evidencia.tsx:54-72,123-132); encolarSubidasFotos: cuerpoHash solo de tamaños (lib/infraestructura/fotos/subida-cola.ts:57-96); drenarColaFotos solo procesa trabajos con movimiento vinculado (:199-206). Caso real: reporte 41d34104-6af5-430d-a764-733b6dad4680 (CUE 1800169-00) con 3 movimientos evidencia_fotografica el 22/10 (18:21/18:29/18:34 ART) con las mismas 3 fotos.

PARTE 1 — IMPLEMENTAR EL FIX (front + back):
- Front: persistir en IndexedDB la operación completa de carga de fotos (idempotencyKey, movimiento base / documentaMovimientoId, attachmentIds, hashes, estado) ANTES del POST; al volver/reintentar/recargar, reanudar LA MISMA operación (misma clave e IDs), no generar una nueva. Estados claros: pendiente / subiendo / confirmada / error, visibles en la UI. Refrescar GaleriaEvidencia cuando la cola de fotos termina (no solo al declarar). Evitar reenviar el mismo lote.
- Back: idempotencia para la declaración de fotos (reusar movimiento/adjuntos ante la misma clave); hash real de contenido (p.ej. SHA-256 calculado en el cliente y verificado/registrado en el servidor); dedup por operación + movimiento documentado (si llega el mismo set de hashes para el mismo movimiento documentado del mismo parte en una ventana razonable, devolver la evidencia existente en vez de crear otra). NO dedup global por ETag. Conservar el trigger de 3 fotos.
- Migración drizzle solo si hace falta (p.ej. columna content_sha256 nullable + índice). NO correr migraciones contra prod ni staging. NO conectarse a ninguna DB para la Parte 1.
- Correr tests existentes, lint y typecheck (pnpm). Agregar tests para el camino de idempotencia/dedup (back y front donde se pueda).
- Commits con mensajes claros en español (conventional commits). Push SOLO de la rama GeronimoSerial/fix-carga-fotos-idempotente a origin (cuenta gh GeronimoSerial; nunca serialgeronimo). NO push a main, NO PR merge, NO deploy.

PARTE 2 — INVENTARIO DRY-RUN DE DUPLICADOS EN hub_prod (ESTRICTAMENTE SOLO LECTURA):
- Crear scripts/inventario-fotos-duplicadas.mjs (en esta rama, commiteado) que se conecte a hub_prod usando la configuración ya existente en esta máquina (la misma forma de conexión que se usó antes para hub_prod; p.ej. el backup de envs de Coolify en ~/backups/data-hub-2026-10-08/), cargando credenciales DENTRO del proceso.
- SEGURIDAD DE SECRETOS (OBLIGATORIO): NUNCA imprimir variables de entorno, connection strings, contraseñas, ni el contenido de archivos de credenciales, ni en stdout, logs, terminal, archivos de salida ni el reporte. No hacer cat/grep/sed/head de archivos de credenciales. Envolver el parseo de la URL/config en try/catch y mostrar solo mensajes genéricos sin el input (antes hubo una filtración por un error de parseo de URL; no repetir). Las credenciales no van en el repo ni en los archivos de salida.
- Solo lectura: BEGIN; SET TRANSACTION READ ONLY; solo SELECT; ROLLBACK al final. Nada de INSERT/UPDATE/DELETE/DDL. Nada de borrar o mover objetos OBS (si calculás hash de contenido, solo si está disponible sin descargar todo; si no, usar ETag+tamaño).
- Agrupar fotos (infra_adjunto confirmadas y pending) por parte/reporte/CUE y huella (optimizada_etag + optimizada_size, y miniatura). Cruzar con tipo de movimiento, documentaMovimientoId (resumen), creada_en, creada_por/autor.
- Clasificar cada grupo con duplicados: ACCIDENTAL (mismo autor, mismas fotos, movimientos solo-foto separados por minutos, sin confirmación distinta documentada) / LEGITIMO (las fotos documentan una confirmación/actualización distinta) / DUDOSO.
- Salida en ~/orca/backups/inventario-fotos-<YYYYMMDD-HHMMSS>/: grupos.csv, grupos.json, resumen.json (reportes escaneados, grupos con duplicados, accidentales, legítimos, dudosos, filas de fotos extra y bytes involucrados), y un README.md con la metodología. Sin secretos en la salida.

REPORTE FINAL en español: rama, hashes de commits, link de GitHub de la rama, resumen de cambios con archivos clave, resultados de tests/lint/typecheck, resultados del inventario (totales + top ejemplos), ruta de salida, y un plan de limpieza PROPUESTO (no ejecutado). Terminá con la línea "TAREA TERMINADA".

L2 — Verified initial branch and clean tree at a6917708. RDD globally disabled. CodeGraph query unavailable; read-only explorer mapped flow. Front/server contract: optional optimizadaSha256 and miniaturaSha256 lowercase hex on each declaration; response attachmentIds ordered to match request for remap, documentaMovimientoId pins CUE resolution. Existing legacy hashless clients retained, no content dedup without hashes. Use a 30-minute same-author, same-part, same-base hash-set dedup window under existing row lock; server stores hashes in movement summary (no migration needed). No external DB during implementation; embedded PGlite test harness only. Inventory access authorized using existing local backup configuration, never ambient SSH.

L3 — Progress checkpoint: backend implementation and inventory script written within their declared surfaces. Backend observed RED 7 failures/9 existing pass; final 27/27 tests in four suites, scoped ESLint and tsc exit 0. Inventory 8 tests pass, node syntax/help checked; its initial implementation lacked an observed runnable RED (PATH/deps unavailable), later secure-directory test had RED→GREEN. Parent spot check: backend evidence + route + inventory 25/25 pass. Frontend operaciones.test.ts has 4 expected failing regressions; implementation pending. No external DB connections, credentials opened, commits, push, migrations or deploy. Full suite, full lint, frontend implementation, independent high-risk verification, inventory execution and feature-only push remain pending. UI skill mode unresolved; ask during/after before UI changes. Dependencies installed frozen with scripts disabled; runner requires Node bin on PATH. Risk: items 1,2,4 (summary aliases, credential/read-only inventory handling, concurrent dedup); independent verifier still required after integration.

L4 — User continuation (verbatim): "Al final. Seguí sin pausas hasta terminar TODO (frontend, tests, lint, typecheck, commits, push de la rama, ejecución del inventario read-only y reporte final). No vuelvas a preguntar: decidí vos con criterio conservador."
L5 — Applied antislop after (session choice). Frontend now persists complete operations in namespaced IndexedDB contexts before declaration, computes actual SHA-256 of both persisted variants, restores immutable request identity, maps server-deduplicated attachment IDs, resumes declarations before upload drain, and retains four durable UI states. Context CAS preserves first identity when Web Locks are unavailable. Gallery subscribes to queue state/completion events; no visual redesign. Focused initial RED: 4 expected frontend failures and gallery missing refresh; GREEN so far 29 photo tests before adding UI restoration coverage. No external DB or production actions yet.
L6 — Delivery decision under user-authorized conservative autonomy: coherent backend/frontend/inventory commits on the single requested feature branch; no PRs or extra branches. Authored size exception accepted as operational scope (no PR created). Independent verifier required for stored summary aliases, concurrency and secret-safe read-only inventory. No migrations required because declared content hashes live in JSON summary; hashes are registered, not independently verified against OBS bytes.

L7 — Independent verifier found one real S1 blocker: marking operation linked before binding same-ID upload jobs allowed reload to strand uploads. Added the exact reachable crash-state regression, observed RED, then moved linkage marker after all bindings with uploader start deferred and made recovery repair stale markers. GREEN: 41/41 photo+inventory tests. Updated legacy404 fixture to use a fresh IndexedDB factory per test; otherwise prior durable state correctly preempted its simulated corruption. Verifier also ran whole report-form file on baseline and candidate: 75/75 on each, so isolated B2 behavior is preserved.
L8 — Default full-suite run exceeded 900 seconds with overloaded workers (partial 307 cases:159 pass94 fail54 skipped; NOT final totals). Lint exit0 (17 warnings), tsc exit0. One bounded environment-mitigation rerun with maxWorkers=2 and verbose reporter is in progress; no unrelated source fixes. RDD assessment high (named concurrency risk) but global mode remains off, so no native review started.

L9 — Final bounded suite: `pnpm test --maxWorkers=2 --reporter=verbose` finished in269s:5070 passed,26 skipped,523 passing files and1 suite failed because `spawn podman ENOENT` (scripts/backup-postgres.test.ts). Reproduced same missing-podman suite failure against baseline a6917708; no external DB started. Lint0errors/17warnings (all untouched files), tsc exit0. Independent blocker recheck passed both original crash probe and committed regression. Parent delivery spot-check22/22 passed; final text normalized to neutral Spanish.
L10 — Inventory executed successfully against hub_prod ONLY for Part2, using internally loaded existing configuration. Transaction READ ONLY verified by successful SET; only fixed SELECTs and final ROLLBACK, no OBS access. Output `~/orca/backups/inventario-fotos-20261024-223102/`: grupos.csv,grupos.json,resumen.json,README.md.54 reports,79 photos,6 incomplete fingerprints,3 groups all DUDOSO,0ACCIDENTAL,0LEGITIMO,6 extra rows,1128838 declared bytes. All3 groups concern CUE1800169-00 / report41d34104-6af5-430d-a764-733b6dad4680. Two earlier evidence movements document initial report; third documents a distinct confirmation. Therefore no blanket accidental classification or deletion. File modes0600,directory0700; output and changed-source secret scans PASS. No cleanup performed.
L11 — Proposed cleanup only (not authorized/executed): review the first two same-base batches and preserve the separate confirmation evidence; obtain explicit record-level approval, take verified backup, use a separately tested reversible transaction and validate references/three-photo invariant before any separately approved orphan-object removal.

### Scoped final UI filter
Scope: added durable statuses/retry behavior only; existing evidence UI retained (ENERGY1/RHYTHM1/MOTION1). Design read: existing school-report tool for directors, same palette, typography, layout and focus styles; no redesign. Reason for every visual choice: retain established components, avoid unrelated visual changes.
- R01 PASS: no new gradients/glows.
- R02 PASS: no new em dashes in UI copy.
- R03 PASS: status copy is ordinary wrapping paragraph text; no CSS/width changes.
- R04 PASS: no new icons or icon-library choice.
- R05 PASS: no new layout/template sections.
- R06 PASS: typography unchanged.
- R07 PASS: no new background patterns.
- R08 PASS: no new decorative arrows.
- R09 PASS: no new badges.
- R10 PASS: no new glass effects.
- R11 PASS: existing button shapes retained.
- R12 PASS: no new shadows.
- R13 PASS: no new glow.
- R14 PASS: no cards added.
- R15 PASS: retry button names the stored upload action.
- R16 PASS: no promotional claims.
- R17 PASS: status photo count derives from stored operation.
- R18 PASS: no testimonials.
- R19 PASS: no new motion.
- R20 PASS: established report-tool visual identity retained.
- R21 PASS: no theme behavior changed.
- R22 PASS: no illustrations added.
- R23 PASS: no assets or navigation invented.
- R24 PASS: existing report link retained only when supplied.
- R25 PASS: no new color/contrast pair introduced; status inherits existing text.
- R26 PASS: retry executes durable declaration; native cancel control retained.
- R27 PASS: pending/uploading/confirmed/error plus storage-error status implemented.
- R28 PASS: no FAQ added.
- R29 PASS: palette unchanged.
- R30 PASS: no product imitation or new visual system.
- R31 PASS: preserve existing styles to keep bugfix scope contained.
- R32 PASS: native buttons retain focus-visible outlines (gallery CSS88,153).
- R33 PASS: changes written directly into source, not external CSS patches.
- R34 PASS: no light/dark styles changed.
- R35 PASS within changed-component scope: rendered JSX tests click retry after remount and verify queue-event refresh/status transitions; full-app browser E2E not claimed.
- R36 PASS: no compliance/performance/security marketing claims.
- R37 PASS: existing design, not an undirected new design.
- R38 PASS: no fabricated production content; inventory numbers are observed.
- Liveliness PASS: existing focal point, whitespace, accent and identity preserved; no new design to manufacture.
- C1 PASS: unchanged visual choices, explicit scope reason above.
- C2 PASS: changed retry interaction exercised in rendered-component test.
- C3 PASS: status paragraph communicates actual durable operation state.
- C4 PASS within changed scope: fixed four-state and crash/reload behavior tested; unchanged responsive/theme CSS.
- C5 PASS: no fictional evidence or test results claimed as production facts.

L12 — Delivery source commits:49f7deb0 backend (253 authored lines),883f25af durable frontend (607 authored lines),e122f739 read-only inventory (245 authored lines). Frontend slice deliberately remains cohesive because persistence, queue recovery, hash mapping, UI state and regressions form one behavior; no artificial split or test omission. No PR requested/created. Authenticated GitHub identity verified as GeronimoSerial before HTTPS push, isolated gh credential helper used, only HEAD:refs/heads/GeronimoSerial/fix-carga-fotos-idempotente pushed to origin; remote source SHA matched local. Final passive log commit follows on same branch. No main push, merge, deploy, migration, production write or object deletion performed.
L13 — Final exact-source normalization: neutral Spanish error copy; parent delivery spot22/22 pass, final tsc exit0 and full lint exit0 with same17 pre-existing warnings. Main functional suite remains5070pass26skip and1 environmental failed suite (`podman` absent), confirmed on baseline; not described as a green full suite. Independent high-risk verifier resolved its sole blocker after one correction/recheck. No credentials or inventory outputs added to repository. Retained only requested private inventory artifacts; verification scratch cleaned after final bookkeeping.
