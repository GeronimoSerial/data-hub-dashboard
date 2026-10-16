# Save with photo hangs on "Guardando…"

## Objective
Pressing "Guardar" with a photo must always finish: success, queued, or a visible error. Never a stuck "Guardando…".

## Root cause
- `lib/infraestructura/parte/almacen-indexeddb.ts` caches one IndexedDB connection per DB name, shared by the form store and the photo queue.
- Photo-queue operations call `almacen.cerrar()`, which closed that shared connection. A connection that dies silently (closed by another user, or killed by the browser while the camera app backgrounds the page) makes `db.transaction()` throw `InvalidStateError`; every later op on the cached handle fails.
- `manejarEnvio` (reporte-inicial-form) and `enviar` (recorrido-actualizacion) had no try/finally, so a rejected `intentarEnviar`/`almacen()` left `enviando` true forever.
- `almacen()` (IDB open) and `conBloqueo` (Web Locks) had no time bound.

## Route
Delegated writer (single bounded worker), inline per task.

## Tasks
- [x] T1 Store: `cerrar()` no longer closes the shared connection; `operar` drops a dead cached connection and reopens once on `InvalidStateError`; IDB open is time-bounded.
- [x] T2 Save path: `conBloqueo` lock acquisition and `crearAlmacenParte` probe are time-bounded.
- [x] T3 UI: try/catch/finally in both save handlers; rejection shows an error and leaves "Guardando…".

## Checks
- Focused: `npx vitest run lib/infraestructura/parte/almacen-indexeddb.test.ts components/infraestructura/reporte-inicial-form.test.tsx components/infraestructura/actualizar/recorrido-actualizacion-envio.test.tsx`
- `npx tsc --noEmit`, `pnpm lint`, `pnpm test`

## Evidence
- RED observed before the fix: both store tests in `almacen-indexeddb.test.ts` (cerrar closed the shared DB; dead connection rejected) and both "si el guardado local falla" UI tests (button stuck on "Guardando…").
- GREEN: focused files pass (store 5/5, envio-offline 47/47, form + recorrido 86/86).
- Lock-timeout test in `envio-offline.test.ts` was written alongside the fix (no separate RED run).
- Note: fake-indexeddb did not reproduce a close-under-transaction race (close() waits for pending transactions); the dead-connection path is simulated by a one-shot InvalidStateError from `IDBDatabase.transaction`.
- Typecheck `npx tsc --noEmit`: exit 0. Lint (changed areas): 0 errors.
- `npx vitest run lib/infraestructura/parte lib/infraestructura/fotos components/infraestructura`: 59 files, 611 passed, 18 skipped.
- Full `pnpm test`: not completed; DB-backed suites (scripts/, ge_localizacion seeding, migrations) fail or hang without a local database, which is environmental and unrelated to this change.
- Commits: 1bab76c (store), 6f552da (lock bound), 3d3d957 (UI handlers).
- Engram mirror: pending.

## Next step
Manual check on a phone: take a photo, press Guardar, confirm it completes.
