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
- [ ] R2 Server owns time: ignore/clamp client `rigeDesde` (server `now`, tolerate small skew) for eligibility.
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
