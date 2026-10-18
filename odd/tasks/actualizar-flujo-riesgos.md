# actualizar-flujo-riesgos

Branch: `fix/actualizar-flujo-riesgos` (stacked on `fix/actualizar-parte-correcciones`, PR #176 to dev).

## Objective
Resolve every risk found while mapping the "actualizar parte" flow, plus the leftovers of actualizar-parte-correcciones.

## Scope / files
- `app/api/problematicas/parte/route.ts`
- `components/infraestructura/actualizar/recorrido-actualizacion.tsx`
- consistency rules: `components/infraestructura/actualizar/consistencia-actualizacion.ts`, `lib/**/consistencia-parte*.ts`
- `reporte-inicial-form*`

## Checks
`npx tsc --noEmit`, `npx vitest run <focused>`, full `npm test` at close.

## Tasks (executed in order, one haiku writer each, delegated)
- [x] R1 Log unexpected errors in the POST 500 path; remove DBGT debug line in `reporte-inicial-form.test.tsx`.
- [x] R2 Server owns time: ignore/clamp client `rigeDesde` (server `now`, tolerate small skew) for eligibility.
- [x] R3 Client races: serialize/debounce draft saves; guard replay effect against concurrent `enviar`; `enviandoRef` guard + typed base movimiento in `enviarSoloFotos`; single photo-link path; keep IDB/localStorage consistent.
- [x] R2b Server date math must not depend on process TZ: make `vigencia-eleccion.ts` / `vigencia-rango.ts` (used server-side via `consistencia-parte.ts`) compute in America/Argentina/Buenos_Aires explicitly; add a test under TZ=UTC. (User requirement: server time must be Buenos Aires UTC-3.)
- [ ] R2c Client date math (vigencia-chips.tsx, reporte-inicial-form.tsx) uses browser-local Date; align with Buenos Aires via lib/infraestructura/zona-horaria.ts.
- [x] R4 Idempotency: lookup inside the transaction; detect unique violations by driver error code, not message regex.
- [x] R5 Single source of consistency rules shared by client and server.
- [x] R5b Client 'nueva' evaluation passes the afectación category so the alumnos exemption matches the server.
- [x] R6 A3 follow-up: banner dismissals must not reset across `reporte-inicial-form` steps.
- [x] R6b Consistency rule codes are unique (habitual-clases-suspendidas defined twice)
- [x] R7 Extract route domain logic into a use case + repository (behavior-preserving), dedupe JSON mapping and motivo lookups.
- [ ] R8 A5: Mermaid flow map + UX proposal doc.

## Progress
(updated per task with route, commit and evidence)

- R1: route inline (1 file + 1 test file, mechanical). Test-first: new test `ante un error inesperado responde 500 genérico...` in `app/api/problematicas/parte/route.test.ts` failed RED (500 returned, no log), GREEN after `console.error('[problematicas/parte] POST failed', ...)` in the final POST catch. DBGT line removed (kept the `selectorFotos()` call).
  - `npx tsc --noEmit`: exit 0
  - `npx vitest run app/api/problematicas/parte components/infraestructura/reporte-inicial-form.test.tsx`: 10 files, 161 tests passed
  - commit: see git log (fix(parte): log unexpected errors in actualizar POST)
- R2: route inline (test file + task doc; no production change needed). Finding: the future side was already server-owned. `parteActualizacionInputSchema` (`lib/infraestructura/validacion-trayectoria.ts`) runs `normalizarVigenciaRecibida` (`vigencia-rango.ts`): a future `rigeDesde` within `TOLERANCIA_RELOJ_MS` (1 h) is clamped to server `now`; beyond it, 400. The route uses only the parsed `input.rigeDesde` for `causaElegible`, `snapshotDesde`, `creadaEn` consumers, so eligibility already used the clamped value.
  - Decision: keep the client value as the action time for past values (up to 12 months). `enviar` builds `rigeDesde: new Date().toISOString()` when the user presses enviar, and the offline queue (`envio-offline`) replays that stored payload later; server-now would misdate queued sends. Keep the 1 h tolerance: it is shared with the client vigencia field and was set on purpose in issues #29/#30 (`vigencia-rango.ts` is outside this task's surfaces).
  - Test-first: added `un rigeDesde adelantado dentro de la tolerancia se persiste recortado al ahora del servidor` and `rechaza un rigeDesde adelantado más allá de la tolerancia de reloj` to `app/api/problematicas/parte/route.test.ts` (seed `CUE_RELOJ_CLIENTE` 1801605-71). Both passed on the existing code (characterization, not RED). Mutation check: with the clamp bypassed in the schema the in-tolerance test fails (`expected 1792341183925 to be less than or equal to 1792340583948`); clamp restored.
  - `npx tsc --noEmit`: exit 0
  - `timeout 300 npx vitest run app/api/problematicas/parte/route.test.ts lib/infraestructura/validacion-trayectoria.test.ts`: 2 files, 94 tests passed
  - `npx vitest run app/api/problematicas/parte lib/infraestructura` (broad): partial, hung ~51 min with no output and was killed by the coordinator; not a verified result. Re-run only the focused files above.
- R3: route inline (1 component file + 1 test file; the test harness is the existing `recorrido-actualizacion-borrador.test.tsx`). Test-first: two new tests RED on the pre-change code: `no inicia otro guardado del borrador mientras el anterior sigue en curso` (2nd save started while the 1st was in flight) and `quita el espejo de localStorage al enviar aunque IndexedDB no pueda borrar el borrador` (mirror survived a failed delete). Both GREEN after the change. The harness wraps `guardarBorradorFormulario`/`eliminarBorradorFormulario` through `vi.mock` with `importOriginal`.
  - (a) Draft saves run on a promise chain with a sequence token: each save reads the registro left by the previous one; a newer change drops saves that have not started. No debounce needed, so the last change is not lost on unmount.
  - (b) `alEnviarConExito` removes the localStorage mirror first and deletes the IDB draft on the same chain after pending saves. A save that finishes after the close does not re-mirror.
  - (c) Replay effect takes `enviandoRef` (same guard as `enviar`). `reintentarRef` deliberately does not: the existing test `un timeout se reintenta automáticamente` expects a deliberate "Reintentar ahora" to supersede a hung auto-retry; guarding it broke that test (2 POSTs, expected 3), so it was reverted.
  - (d) `enviarSoloFotos` sets/clears `enviandoRef`; the `as string` cast is replaced by the type guard `esEvidenciaFotografica`. Not covered by a RED test: the button is disabled while `enviando`, so the same-tick double call is not reachable via fireEvent.
  - (e) `vincularFotosPreparadas` records `movimientoFotosVinculadoRef` and links once per movimientoId; the effect and `alEnviarConExito` share that guard. Not covered by a RED test (no runnable path reproduces the second trigger in jsdom).
  - `npx tsc --noEmit`: exit 0
  - `timeout 300 npx vitest run components/infraestructura/actualizar`: 6 files, 84 tests passed (baseline 82 + 2 new)
  - commit: see git log (fix(parte): serialize client draft saves and guard replay sends)
- R2b: route delegated direct (this worker is the single writer for the parent-authorized surfaces; no further delegation). Shared helper `lib/infraestructura/zona-horaria.ts` (`calendarioBA`, `instanteBA`, `sumarMesesBA`) uses a fixed UTC-3 offset (Buenos Aires has no DST since 2009); no existing helper covered this (`rg` found only per-file `timeZone` Intl formatters, which are display-only).
  - Test-first RED, method: `vitest.config.ts` pins `process.env.TZ` at config load, so `TZ=UTC npx vitest run` is overridden. The new tests switch `process.env.TZ` at runtime inside the test (Node 24 honors it) and restore it. RED on the pre-change code: `"hoy" usa el día de Buenos Aires...` and `"otro" combina fecha y hora...` (null / `2026-10-17T23:00Z` instead of `2026-10-18T02:00Z`); `el borde de 12 meses conserva la hora...` (`13:00Z` instead of `12:00Z` under America/New_York on the DST change day); `zona-horaria.test.ts` failed on the missing module.
  - Changes: `vigencia-eleccion.ts` (combinar/fechaCalendario/resumen use the BA calendar, public signatures unchanged), `vigencia-rango.ts` (`setMonth` replaced by `sumarMesesBA`). Existing "hoy combina" test now asserts the BA instant instead of local `getHours`.
  - `npx tsc --noEmit`: exit 0
  - `timeout 300 npx vitest run lib/infraestructura/vigencia-eleccion lib/infraestructura/vigencia-rango lib/infraestructura/consistencia-parte components/infraestructura/actualizar app/api/problematicas/parte/route.test.ts`: 11 files, 209 tests passed
  - Same set plus `zona-horaria` under a scratch config without the TZ pin and with `TZ=UTC`: 12 files, 212 tests passed.
  - Out of scope (client, not in the surfaces): `vigencia-chips.tsx` and `reporte-inicial-form.tsx` still use browser-local `Date` methods.
- R4: route inline (4 files inside the parent-authorized surfaces, no delegation). Test-first: `idempotencia.test.ts` RED (module missing); `route.test.ts` new test "dos POST en paralelo con la misma idempotencyKey..." RED with `expected [ 201, 409 ] to deeply equal [ 200, 201 ]` (the second request recalculated the diff against the committed parte and got 409 "sin cambios" instead of replay).
  - Changes: `idempotencia.ts` (`esViolacionUniqueIdempotencyKey`: first driver node with `code`; `23505` + `constraint` matching idempotency_key; message fallback only when no code). The Drizzle wrapper message (which carries the SQL text) is never used when a driver code exists. `route.ts`: lookup repeated as the first step of the transaction (throws `ReplayIdempotencia`, rolled back, answered as replay 200); early lookup kept as fast path; race catch uses the helper.
  - Constraint check: `drizzle/0000_daffy_squirrel_girl.sql:590` creates `infra_movimiento_idempotency_key_uidx` UNIQUE; no `DROP INDEX` in any migration; latest snapshot (`drizzle/meta/0028_snapshot.json`) keeps it. Driver is Postgres only (`lib/db/driver.ts`: pglite | postgres); SQLite/libsql is not on the request path (`@libsql/client` remains in package.json for scripts only), so the SQLite branch is kept only as a no-code fallback.
  - Stale comment noted, not changed (outside surfaces): `lib/db/schema.ts:500` points to `ensureMovimientoIdempotencyKeyColumn` in `lib/db/seed.ts`, which no longer exists.
  - `npx tsc --noEmit`: exit 0
  - `timeout 300 npx vitest run app/api/problematicas/parte`: 10 files, 95 tests passed
  - commit: see git log (fix(parte): make idempotency replay atomic and detect unique violations by code)
- R5: route inline (2 production files, 2 new test files; mapping done inline with bounded rg). Finding: the rules were already single-sourced in `lib/infraestructura/consistencia-parte.ts` (pure, no React/server-only imports). Client and server only differ in their adapters, so the work was to remove the one duplicate and pin parity.
  - Changed: `consistencia-actualizacion.ts` `alcanceDe` now delegates to the core `alcanceDeSecciones` (was a copy with identical semantics). `consistencia-parte-servidor.ts` documents the intentional differences.
  - Rule-difference table (both sides evaluated):
    | Aspecto | Cliente (`consistencia-actualizacion.ts`) | Servidor (`consistencia-parte-servidor.ts`) | Estado |
    |---|---|---|---|
    | Reglas de bloqueo | core | core | igual |
    | Alcance | `alcanceDe` (toda/algunas) | cantidad; nunca "toda" | pendiente, no afecta bloqueos (sólo advertencias) |
    | Descripción | cruda; regla usa trim | trim en el adaptador | igual veredicto |
    | Descripción obligatoria | `mensajesDeBloqueo(..., {descripcion})` oculta en filas existentes | siempre | intencional (UX) |
    | Primer bloqueo vs lista | lista completa | primer bloqueo | intencional |
    | Asistencia / vigencia | null | asistencia real, vigencia null | intencional (sin asistencia en actualizar) |
    | Categoría alumnos | no la conoce en "nueva" (`categoria: null`): usa edificio/clases del envío | anula edificio/clases/asistencia | DIVERGENCIA, no corregida (ver abajo) |
  - Mensajes: no cambiaron; ambos lados usan el mensaje del core.
  - Test-first: characterization. Parity and alcance tests pass on the pre-change code (behavior preserved), so no RED was observed; mutation check instead: server edificio mutated for `centro_evacuados` -> `consistencia-parte-paridad.test.ts` 2 failed (`evacuación preventiva con centro de evacuados`, `inundación con centro de evacuados`), mutation reverted.
  - Pending, outside surfaces: `recorrido-actualizacion.tsx` builds the "nueva" respuestas without categoria, so an alumnos afectación evaluated with `evacuado` + `clases normal` can block on the client only. Fix needs `recorrido-actualizacion.tsx` in surfaces (pass `categoria` from motivo). Also `consistencia-estado-activo.ts` holds a separate rule set (`evaluarCambioAHabitual`) not in the surfaces.
  - `npx tsc --noEmit`: exit 0
  - `timeout 300 npx vitest run components/infraestructura/actualizar lib/infraestructura/consistencia-parte app/api/problematicas/parte`: 20 files, 242 tests passed
- R5b: route inline (2 production files + parity test; mechanical). Test-first: `lib/infraestructura/consistencia-parte-paridad.test.ts` new cases `alumnos con edificio evacuado y clases normales` and `alumnos con centro de evacuados y clases suspendidas` RED (`TypeError: respuestasNuevaDeActualizacion is not a function`) before the change.
  - Changed: `consistencia-actualizacion.ts` adds `respuestasNuevaDeActualizacion` (applies the server's alumnos exemption: clases/edificio null). `recorrido-actualizacion.tsx` builds the "nueva" evaluation with `categoria` = motivo's category from the `motivos` prop (same source as the server) and uses the new helper.
  - Not covered by a component test: the motivo lookup wiring inside `recorrido-actualizacion.tsx`; the parity test covers the rule.
  - `npx tsc --noEmit`: exit 0
  - `timeout 300 npx vitest run components/infraestructura/actualizar lib/infraestructura/consistencia-parte app/api/problematicas/parte`: 20 files, 244 tests passed
  - commit: see git log (fix(parte): apply alumnos exemption to client nueva evaluation)
- R6b: route inline (2 production-adjacent edits + task doc; mechanical rename). Test-first: new test `every rule code is unique because dismissals are keyed by code` failed RED (`TypeError: codigosDeReglas is not a function`) before the change. GREEN: exported `codigosDeReglas()`; second `habitual-clases-suspendidas` (sin energía variant) renamed to `habitual-clases-suspendidas-sin-energia`. No non-test consumers reference the code.
  - `npx tsc --noEmit`: exit 0
  - `timeout 300 npx vitest run lib/infraestructura/consistencia-parte components/infraestructura/reporte-inicial-form.test.tsx components/infraestructura/actualizar app/api/problematicas/parte`: 21 files, 321 tests passed
- R7: route inline by one bounded writer (this worker), 3 work-unit commits. Behavior-preserving refactor: no RED (no behavior change to observe); the existing `app/api/problematicas/parte` route tests are the contract and were not edited.
  - Step 1 (commit b889aae5): alumnos exemption is one function `preguntaEdificioYClases` in `consistencia-parte.ts`, used by `consistencia-parte-servidor.ts` and `consistencia-actualizacion.ts` (`respuestasNuevaDeActualizacion`). The JSON mapping is `parteDeFila` (used twice) and the motivo ids are one `indiceMotivoIds` map built once per request (first match wins, as `find` did).
  - Step 2 (commit d81bcac1): DB reads/writes moved to `lib/infraestructura/parte/parte-repo.ts`; each function takes the drizzle handle (`db` or the transaction `tx`, which is a subclass of it).
  - Step 3 (see git log, "use case" commit): the POST flow moved to `lib/infraestructura/parte/actualizar-parte.ts` (`ejecutarActualizacionParte`), returning a typed union (`error` with status/mensaje/codigo, `replay`, `creado`, `fallo_interno`). The route keeps parse, auth, db handles, the replay/error/500 mapping with the same `console.error`, and the verification link. `idempotencia.ts` moved to `lib/infraestructura/parte/` because the use case must not import from `app/`; `app/api/problematicas/parte/idempotencia.ts` re-exports it so `idempotencia.test.ts` is unchanged.
  - Route size: `route.ts` 1107 lines before, 334 after. New: `actualizar-parte.ts` 729 (one transactional function moved with mechanical rewrites only: `cue.value` to `cueAnexo`, error returns to `fallo(...)`), `parte-repo.ts` 303.
  - `npx tsc --noEmit`: exit 0
  - `eslint app/api/problematicas/parte lib/infraestructura/parte`: exit 0, 0 warnings
  - `timeout 300 npx vitest run app/api/problematicas/parte lib/infraestructura/consistencia-parte components/infraestructura/actualizar`: 20 files, 245 tests passed (same before and after)
