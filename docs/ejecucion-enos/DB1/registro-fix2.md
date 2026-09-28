# DB1 FIX2 — Registro de ejecución

Objetivo: singleton real de PGlite/pg.Pool compartido por proceso en
`lib/db/index.ts`, para que `next dev` (páginas RSC y rutas de API en bundles
distintos dentro del MISMO proceso Node) deje de abrir dos instancias de
PGlite sobre el mismo directorio en disco.

Ruta: N2 (sonnet, este registro) coordina y verifica; toda edición de
código/tests la hizo un N3 (`opencode run --auto -m
opencode-go/deepseek-v4.1-flash`), en foco, uno por vez. El N2 no editó
ningún archivo de código ni de test.

## Diagnóstico (aportado por N1, confirmado al leer el código antes de delegar)

`lib/db/index.ts` guardaba el cliente en variables de módulo (`let _db`,
`let _rawClient`). En `next dev`, las páginas (RSC) y las rutas de API se
cargan en grafos de módulos/bundles distintos dentro del MISMO proceso, así
que se creaban DOS instancias de PGlite sobre el mismo directorio. Síntoma
observado: el login (`/api/auth/sign-in`) escribía la sesión en una
instancia, `/api/auth/get-session` la veía (mismo bundle de API), pero
`/mapas/infraestructura` (`getSessionUser()` en RSC) no la veía y redirigía a
`/login`; la base en disco se corrompió dos veces. Con el driver `pg`
(Postgres real) no pasa: dos `Pool` contra un servidor real son válidos.

## Cambios (los tres los aplicó un N3, verificados por mí antes de aceptarlos)

### Pase 1 (implementación principal)

- `lib/db/index.ts`: singleton real en `globalThis[Symbol.for('enos.db')]`
  (un `Map<string, { db, rawClient, migratePromise }>`). Clave = `connectionString`
  para el driver `postgres`; clave = path absoluto resuelto del directorio
  para PGlite con directorio (`PGLITE_DATA_DIR` o `getPglitePath()` fuera de
  tests). PGlite 100% en memoria bajo Vitest (sin `PGLITE_DATA_DIR`) queda
  SIN cachear — mantiene el aislamiento por archivo de test de siempre.
  `migrarDb()` memoiza la promesa de migración en la misma entrada, para que
  dos bundles que la llamen casi al mismo tiempo sobre el mismo directorio
  corran la migración una sola vez. Comentario corto explicando el porqué de
  `globalThis` (next dev, bundles separados, un solo proceso Node).
- `lib/db/index.ts`: helper `__eliminarInstanciaCacheadaParaTests(opciones)`
  (uso exclusivo de tests) para borrar una entrada del cache y cerrar su
  cliente, simulando honestamente que un reinicio real de proceso también
  vacía `globalThis` (cosa que `vi.resetModules()` NO hace por sí solo).
- `lib/infraestructura/recurso-seed.test.ts`: su test de "reinicio real de
  proceso" (simula un restart con `vi.resetModules()` sobre el mismo
  directorio de PGlite) ahora borra también la entrada cacheada antes de
  reimportar, para seguir probando honestamente una recarga desde disco en
  vez de encontrar la instancia ya cacheada.
- `lib/db/index.test.ts` (nuevo): dos importaciones con `vi.resetModules()`
  de por medio, apuntando al mismo directorio, devuelven la MISMA instancia
  por referencia; la migración corre una sola vez (se cuentan las
  invocaciones del migrator real envuelto, sin mockearlo).
- `lib/infraestructura/ge-db.ts`: revisado, no tiene singleton propio (reusa
  `getRawClient()`/`getDb()`). Sin cambios.

Verificación de este pase: `vitest run lib/db/ lib/infraestructura/recurso-seed.test.ts --maxWorkers=2` → 6 archivos / 49 tests, 0 fallas.

### Pase 2 (conflicto encontrado al leer el diff, no al correr los tests)

Al revisar el diff completo yo mismo (no sólo el resumen del N3) encontré dos
problemas que los tests locales no iban a detectar:

1. **Bug real en el helper**: `__eliminarInstanciaCacheadaParaTests` hacía
   siempre `path.resolve()` sobre el argumento, lo cual es correcto para
   PGlite (clave = path) pero rompe silenciosamente para `postgres` (clave =
   `connectionString` tal cual, sin resolver como path). Arreglado: el
   helper ahora acepta `{ directorio } | { connectionString }` (con
   `cerrarCliente?: boolean`, default `true`).
2. **Test real roto por el cacheo, gateado y por eso invisible en CI sin
   Postgres**: `lib/infraestructura/briefing-ia/presupuesto.test.ts`
   (`it.skipIf(!process.env.DATABASE_URL_TEST)`) simula dos conexiones
   físicas independientes de Postgres compitiendo por el mismo mes
   (`expect(poolA).not.toBe(poolB)`). Con el cacheo por `connectionString`,
   `poolA` y `poolB` habrían colapsado al mismo `Pool`. Arreglado con el
   mismo criterio que en `recurso-seed.test.ts`: entre las dos importaciones
   se borra la entrada cacheada de ese `connectionString` (con
   `cerrarCliente: false`, porque `poolA` sigue vivo y en uso durante toda la
   carrera y la limpieza final).

### Pase 3 (lint)

- `lib/db/index.test.ts` tenía 1 warning de eslint
  (`@typescript-eslint/consistent-type-imports` por un `typeof import(...)`
  inline). Arreglado con un `import type * as PgliteMigrator from
  'drizzle-orm/pglite/migrator'`, mismo patrón que ya usa el repo en otros
  `vi.mock`.

## Verificación funcional (corrida por mí, no por el N3)

Levanté un Postgres real descartable con podman para ejercer el test antes
gateado:

```sh
podman run --rm -d --name enos-pg-db1fix2 -p 55432:5432 \
  -e POSTGRES_USER=enos_test -e POSTGRES_PASSWORD=enos_test_local_only \
  -e POSTGRES_DB=enos_db1_f3 postgres:16
DATABASE_URL_TEST='postgresql://enos_test:enos_test_local_only@localhost:55432/enos_db1_f3' \
  pnpm exec vitest run lib/infraestructura/briefing-ia/presupuesto.test.ts --maxWorkers=2
```
→ 1 archivo / 6 tests, 0 fallas (incluye el test antes gateado, ahora
ejercido de verdad). Contenedor descartado después (`podman rm -f`).

Suite completa, bajo flock:

```sh
flock $HOME/.cache/enos-n3/heavy.lock pnpm exec vitest run --maxWorkers=2
```
→ 224 archivos / 1984 tests pasados, 3 skips preexistentes (los gateados por
Postgres real que no corrí sin `DATABASE_URL_TEST`), 0 fallas nuevas.

```sh
pnpm lint          # 0 errores, 0 warnings
pnpm exec tsc --noEmit   # exit 0
pnpm build         # OK, todas las rutas compilan (server/static)
```

### Repro del bug original contra la demo (:3202)

Siguiendo en serie la receta de `docs/ejecucion-enos/pulido/registro.md`:

1. `kill` del `next dev` anterior en :3202 (verificado con `ss -ltnp`).
2. Borrado y recreación de `DATA_DIR/pg` (`/home/gero/orca/demo-data/enos-pulido`).
3. App sola arriba → `GET /login` → `200`.
4. App abajo → `node scripts/sync-ge.mjs --fixture` (2005 escuelas) →
   `DEMO_OK=1 node scripts/seed-demo-partes.mjs` (47 escuelas con parte,
   indicadores idénticos a los ya documentados en el registro de "pulido
   visual": `conServicioSuspendido: 5, conServicioParcial: 10, evacuadas: 6,
   centrosDeEvacuados: 4, sinReportar: 8, alumnosAlcanzados: 1658,
   seccionesAlcanzadas: 82`).
5. App arriba de nuevo, desacoplada de la terminal (`setsid`, log en
   `/home/gero/orca/demo-data/enos-pulido/dev.log`).
6. `POST /api/auth/sign-in/email` con `ADMIN_EMAIL`/`ADMIN_PASSWORD` del
   `.env.demo` → `200`, cookie de sesión guardada.
7. `GET /mapas/infraestructura` con esa cookie → **`200`** (dos veces
   seguidas, y una tercera vez después de esperar 1 minuto). Antes del fix
   esto redirigía con `307` a `/login` por la doble instancia de PGlite.
8. `GET /api/auth/get-session` con la misma cookie → `200`.

La demo queda corriendo en `:3202` al cerrar esta tarea.

## Nota lateral (no bloqueante, para quien retome F3/riesgo)

Durante la corrida de `seed-demo-partes.mjs` el proceso estuvo varios minutos
sin imprimir nada visible porque yo lo redirigí con `| tail -60` (modo lote:
no imprime nada hasta EOF), no porque estuviera colgado — lo confirmé
matando el proceso y viendo que ya había terminado con éxito (exit 0,
resultados esperados). Si alguien más audita esto y ve el proceso "sin
progreso" en `ps`/`top` por varios minutos con este mismo patrón de
invocación, no es necesariamente un cuelgue: conviene redirigir con `tee` a
un archivo real (o `stdbuf -oL`) en vez de `| tail -N` para tener visibilidad
en vivo la próxima vez.

## Estado final

- [x] Singleton de `globalThis` para PGlite (por directorio) y `pg.Pool`
      (por `connectionString`), con memoización de la promesa de migración.
- [x] Test de instancia compartida + migración única (`lib/db/index.test.ts`).
- [x] Comentario corto explicando el porqué de `globalThis`.
- [x] `ge-db.ts` revisado, sin cambios necesarios.
- [x] Tests existentes que dependían de aislamiento (`recurso-seed.test.ts`,
      `presupuesto.test.ts`) ajustados para seguir probando lo que probaban
      antes, sin quedar en falsos positivos por el cacheo nuevo.
- [x] Suite completa, lint, tsc, build: todos verdes.
- [x] Verificación funcional contra la demo real en :3202: bug original no
      reproduce más (`200` en vez de `307`).
- [x] Sin commitear (para que N1 lo audite).
