# Registro — fix de concurrencia en escrituras SQLite

Rama `fix/parte-alta-concurrente`. Este documento resume la causa raíz de la
carrera en el alta de parte, el fix aplicado y su extensión a los demás
escritores de `hub.sqlite`, más la cobertura de reintento (qué queda envuelto
y qué se dejó deliberadamente afuera).

## Causa raíz de la carrera en el alta de parte

`app/api/problematicas/parte/route.ts` insertaba el parte con una transacción
`db.transaction()` por defecto (`BEGIN DEFERRED`), que no toma el lock de
escritura hasta el primer `INSERT`/`UPDATE` real dentro del bloque. Dos
requests concurrentes sobre el mismo `hub.sqlite` podían entrar ambas a la
transacción, ambas hacer el chequeo de existencia (para deduplicar
afectaciones equivalentes) contra el mismo estado "todavía sin el otro
insert", y ambas decidir que no había duplicado — terminando en dos filas para
lo que debía ser una sola alta idempotente. El lock de escritura real recién
aparecía en el primer `INSERT`, demasiado tarde para servir de barrera.

## Fix aplicado

- La transacción de la ruta ahora se abre con `BEGIN IMMEDIATE`
  (`client.transaction('write')` de `@libsql/client`, no el `db.transaction()`
  por defecto de drizzle): toma el lock de escritura al abrir, no en el primer
  statement, así que un segundo request concurrente no puede colarse en la
  ventana de lectura-antes-de-escribir.
- El chequeo de existencia (afectación equivalente) se hace **dentro** de esa
  transacción ya con el lock tomado, en vez de antes de abrirla.
- Si la transacción pierde la carrera por el lock (`SQLITE_BUSY` /
  "database is locked" porque otro request ya tiene su propio `BEGIN
  IMMEDIATE`), la ruta reintenta el bloque completo con backoff corto + jitter
  en vez de devolver 500. Cada intento reabre la transacción y vuelve a leer
  el estado fresco, así que un reintento nunca reutiliza una decisión de
  dedup tomada con datos viejos.
- `lib/db/seed.ts` activa `PRAGMA journal_mode=WAL` al sembrar: permite
  lectores concurrentes mientras hay un escritor activo, reduciendo cuánto
  tiempo real pasa cualquier lector esperando el lock de escritura (el fix de
  arriba no depende de esto, pero baja la probabilidad de choque).

## Extracción del helper de reintento

La lógica de reintento (antes sólo en la ruta de parte) se extrajo a
`lib/db/reintento.ts#conReintentoPorBloqueo`, con detección de lock ocupado en
`esErrorLockOcupado` (chequea `err.code === 'SQLITE_BUSY'` y el texto
`SQLITE_BUSY|database is locked` tanto en `err.message` como en
`err.cause.message`, porque drizzle envuelve el error real de libsql en un
`DrizzleQueryError` con la causa original). Deliberadamente **no** se resolvió
con el `timeout` (busy_timeout) nativo de `@libsql/client`: ese busy-wait es
sincrónico dentro del único hilo de JS de Node, así que dos escritores del
MISMO proceso web compitiendo por el mismo lock terminan agotando el timeout
completo (el que tiene el lock nunca puede correr para soltarlo mientras el
otro espera en la llamada nativa). El reintento manual usa `setTimeout` real,
que sí cede el hilo.

Contrato del helper: reintenta sólo ante `SQLITE_BUSY`/"database is locked";
cualquier otro error se relanza en el primer intento; se rinde tras
`maxIntentos` (default 8) y relanza el error original de lock ocupado. Todo
bloque envuelto tiene que ser re-ejecutable desde cero sin duplicar efectos:
o relee estado fresco en cada intento (ruta de parte, `adquirirLease`), o es
un statement/transacción atómica que se revierte entera si falla a mitad de
camino (todos los demás call sites).

## Dónde se aplicó el reintento y por qué es seguro

- **`app/api/problematicas/parte/route.ts`**: bloque completo (transacción +
  dedup + insert), ya cubierto antes de la extracción.
- **`lib/infraestructura/riesgo/job-run.ts`** (`adquirirLease`,
  `renovarLease`, `publicarResultado`): cada uno son operaciones CAS de un
  solo `INSERT ... ON CONFLICT DO NOTHING` o `UPDATE ... WHERE ...
  RETURNING`. Reintentar el statement completo desde cero no cambia su
  semántica de fencing/CAS porque cada intento vuelve a evaluar la condición
  contra el estado real de la fila en ese momento — no reutiliza una decisión
  tomada en un intento anterior. Cubierto además por un test con lock real de
  una segunda conexión nativa (no mock) sosteniendo `BEGIN IMMEDIATE'
  mientras `adquirirLease` reintenta y sólo adquiere al soltarse el lock.
- **`lib/db/recursos.ts`**, **`lib/infraestructura/episodios-derivados/
  recompute.ts`**, **`lib/infraestructura/riesgo/geo-perfil.ts`**,
  **`lib/infraestructura/riesgo/rio-asociacion.ts`**, **`lib/infraestructura/
  riesgo/jobs/calcular-riesgo.ts`**, **`jobs/calcular-climatologia(-caudal)
  .ts`**, **`jobs/sync-ensemble.ts`**, **`jobs/sync-imerg.ts`**, **`jobs/
  sync-pronostico-caudal.ts`**: cada llamada envuelta es una transacción
  completa (delete+insert, upsert de batch) que se revierte entera si falla a
  mitad de camino, o un upsert único por fila — reintentar desde cero no deja
  efectos parciales duplicados.
- **`scripts/job-diagnostico.mjs`** y **`scripts/job-episodios-derivados.mjs`**:
  además de heredar el reintento manual vía `lib/db/index.ts`, cada uno pasa
  ahora un `busyTimeoutMs` modesto (5s) a `getDb()` en su primera llamada del
  proceso. Es seguro sólo ahí: cada invocación de estos scripts es su propio
  proceso de Node con una única conexión, así que el busy-wait sincrónico del
  binding nativo no puede congelar un segundo escritor del mismo proceso —
  sólo espera a que el proceso web (u otro job) libere el lock cruzado. El
  reintento manual sigue siendo la red de seguridad si el busy_timeout nativo
  no alcanza.

## Qué se dejó deliberadamente sin envolver

No se encontraron escritores adicionales sin cubrir: todos los `db.insert`/
`db.update`/`db.transaction` de escritura fuera de tests quedaron bajo
`conReintentoPorBloqueo` o son operaciones de un único statement ya atómicas
por SQLite (y por lo tanto seguras de reintentar igual, cubiertas arriba). No
se envolvió ningún `db.select` de sólo lectura: una lectura fallida por
`SQLITE_BUSY` no tiene efectos que proteger y ese caso es raro en modo WAL
(lectores no compiten con el escritor por el lock).

## Verificación

- `pnpm vitest run lib/db/reintento.test.ts
  lib/infraestructura/riesgo/job-run.test.ts
  app/api/problematicas/parte/route.test.ts` → 3 archivos, 52 tests, OK.
- `pnpm test` (suite completa, `vitest run`) → 164 archivos, 1378 tests, OK.
- `pnpm lint` → sin hallazgos.
- `pnpm exec tsc --noEmit` → sin errores.
- `pnpm build` → build de producción (Next 16, Turbopack) completo sin
  errores; las advertencias impresas (Better Auth sin `BETTER_AUTH_SECRET`/
  `BETTER_AUTH_URL`, seed de admin saltado) son de configuración de entorno
  local, no relacionadas con este fix.
