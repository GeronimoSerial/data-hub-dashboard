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
- [ ] R3 Client races: serialize/debounce draft saves; guard replay effect against concurrent `enviar`; `enviandoRef` guard + typed base movimiento in `enviarSoloFotos`; single photo-link path; keep IDB/localStorage consistent.
- [ ] R4 Idempotency: lookup inside the transaction; detect unique violations by driver error code, not message regex.
- [ ] R5 Single source of consistency rules shared by client and server.
- [ ] R6 A3 follow-up: banner dismissals must not reset across `reporte-inicial-form` steps.
- [ ] R7 Extract route domain logic into a use case + repository (behavior-preserving), dedupe JSON mapping and motivo lookups.
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
