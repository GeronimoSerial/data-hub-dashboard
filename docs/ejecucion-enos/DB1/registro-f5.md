# DB1/F5 — Registro de ejecución (RETOMA)

Batch: backups PostgreSQL + configuración/runbook RDS, última fase de DB1
(migración SQLite → PostgreSQL). Rama `feat/enos-db1-f5`, base `cb37534` (F2
cerrado, antes de F3 — F3 corre en paralelo sobre `feat/enos-db1` y no es
requisito de F5). Ver `registro.md` para el historial completo de F0–F4.

**Contexto de la retoma**: la máquina se reinició y cortó al N2 anterior de
esta misma tarea a mitad de dispatch. Su trabajo parcial quedó en el
worktree, sin commitear: `lib/db/config-postgres.ts` + test, `scripts/backup-postgres.mjs`
+ test, un cambio en `lib/db/index.ts` y otro en `.env.example`. Este dispatch
retomó ese trabajo (no lo descartó), lo verificó de punta a punta con N3 y
completó lo que faltaba (runbook RDS). No hizo falta reescribir nada: todo el
código previo pasó la verificación sin bugs reales.

Todo el código de este dispatch fue implementado/verificado por un N3
(`opencode run`), nunca editado directamente por este N2 — regla dura del
usuario. Este documento es el único archivo que escribió el N2 directamente.

## 1. `lib/db/config-postgres.ts` — SSL, pool y `statement_timeout`

Ya presente al retomar, verificado por N3 sin encontrar bugs (no se
modificó):

- **SSL** (`resolveSslConfig`): prioridad `DATABASE_SSL_CA_PATH` (TLS
  validando contra ese CA, revienta ruidoso si el archivo no existe) →
  `PGSSLMODE=require` / `DATABASE_SSL=require` / host `*.rds.amazonaws.com`
  (TLS sin validar CA, el bundle default de RDS no siempre está en el store
  de Node) → `DATABASE_SSL=true`/`1` (TLS validando sin CA propio) → sin SSL
  (default, correcto contra podman local sin TLS).
- **Pool** (`resolvePoolConfig`): `DATABASE_POOL_MAX` (sin default, `pg` usa
  10 si no está seteada), `DATABASE_POOL_IDLE_TIMEOUT_MS` (default 10000, el
  mismo default de `pg`, dejado explícito), `DATABASE_POOL_CONNECT_TIMEOUT_MS`
  (default 5000; `pg` no tiene default, y contra RDS conviene fallar rápido
  en vez de colgarse), `DATABASE_STATEMENT_TIMEOUT_MS` (default 30000,
  protege contra queries colgadas, se aplica por conexión vía `pg.Pool`).
  Cualquier valor no numérico o `<= 0` se ignora y cae al default.
- **Tests** (`config-postgres.test.ts`): 12 casos — 8 de `resolveSslConfig`
  (default, cada rama de SSL, lectura real de CA desde archivo temporal,
  error si el CA no existe), 3 de `resolvePoolConfig` (default, valores de
  env, valores no numéricos) y 1 de `buildPgPoolConfig` (combinación
  completa).

**Cambio en `lib/db/index.ts`**: mínimo, sin tocar comportamiento. Antes,
`getDb()` construía el `Pool` inline (SSL con una función local, sin CA
configurable ni `statement_timeout`, y sin exigir `DATABASE_URL`). Ahora:

```diff
- const pool = new Pool({
-   connectionString: process.env.DATABASE_URL,
-   ssl: resolveSslConfig(),
-   max: process.env.DATABASE_POOL_MAX ? Number(process.env.DATABASE_POOL_MAX) : undefined,
- })
+ const connectionString = process.env.DATABASE_URL
+ if (!connectionString) {
+   throw new Error('DATABASE_URL es obligatoria cuando el driver es postgres')
+ }
+ const pool = new Pool(buildPgPoolConfig(connectionString))
```

La función local `resolveSslConfig` de `index.ts` (sin CA, sin `PGSSLMODE`,
sin detección de host RDS) se eliminó por completo — reemplazada por la de
`config-postgres.ts`, estrictamente más completa. Diferencia de
comportamiento respecto de antes: `getDb()` ahora lanza un error explícito
si falta `DATABASE_URL` con el driver en `'postgres'` (antes construía un
`Pool` con `connectionString: undefined`, que fallaba igual pero con un
error de `pg` menos claro).

## 2. `scripts/backup-postgres.mjs` — pg_dump, rotación y verificación

Ya presente al retomar, verificado por N3 contra un Postgres de podman real
en el puerto **55433** sin encontrar bugs (no se modificó):

- `pg_dump --format=custom` (formato lógico nativo de Postgres, comprimido,
  restaurable selectivamente con `pg_restore`) — equivalente en propósito a
  `VACUUM INTO` de `scripts/backup-sqlite.mjs`, pero es el mecanismo nativo
  de Postgres, no una adaptación de la técnica SQLite.
- **Verificación post-backup**: `pg_restore --list` sobre el `.dump` recién
  creado; si no devuelve contenido o falla, el archivo se borra (no se deja
  basura corrupta en la rotación).
- **Rotación** por cantidad retenida (`retener`, default 10): borra los más
  viejos por orden lexicográfico del timestamp ISO en el nombre, nunca el
  recién creado. (`backup-sqlite.mjs` no tiene rotación — esta es una mejora
  sobre el equivalente SQLite, pedida explícitamente en el brief.)
- **Tests** (`backup-postgres.test.ts`, 4 casos, contra contenedor
  `docker.io/library/postgres:16` real en el puerto 55433, levantado y
  destruido por el propio test): crea el `.dump`, pasa `pg_restore --list`
  con salida no vacía, un restore real en una base nueva conserva los datos
  insertados antes del backup, y la rotación conserva sólo los `retener` más
  recientes. **4/4 verdes**, corrido dos veces por N3 sin flaky. Sin
  contenedores colgados al terminar (`podman ps -a` vacío al cierre).

No se encontró ningún timer/cron ni runbook de backup automático para SQLite
en `deploy/` (sólo hay unidades systemd en `deploy/systemd/ops1`, ninguna de
backup) ni en `docs/ejecucion-enos/OPS1/` — el único runbook de backup
existente es `docs/ejecucion-enos/E0/runbook-migracion-backup.md`, que
describe el procedimiento **manual** (`node scripts/backup-sqlite.mjs`), sin
timer. Por eso no había ningún timer que extender: el runbook de F5
(`runbook-rds.md`) documenta el backup Postgres como el mismo tipo de
procedimiento manual/operativo, sin inventar un mecanismo de scheduling que
no existe para el equivalente SQLite.

## 3. `.env.example`

Ya presente al retomar. Verificado por N3 (este N2 tiene prohibido leer
`.env*`): sólo nombres de variables y valores ficticios (`localhost`,
`admin@example.com`, `changeme-admin`, placeholders vacíos), sin secretos ni
endpoints reales. Las 7 variables de SSL/pool/timeout ya estaban
documentadas (`DATABASE_SSL`, `PGSSLMODE`, `DATABASE_SSL_CA_PATH`,
`DATABASE_POOL_MAX`, `DATABASE_POOL_IDLE_TIMEOUT_MS`,
`DATABASE_POOL_CONNECT_TIMEOUT_MS`, `DATABASE_STATEMENT_TIMEOUT_MS`); no
hizo falta agregar nada.

## 4. `docs/ejecucion-enos/DB1/runbook-rds.md` (nuevo)

Escrito por N3 en este dispatch. Cubre, con placeholders explícitos
(`<RDS_ENDPOINT>`, `<APP_USER>`, `<KMS_KEY_ID>`, etc.), sin URLs ni
credenciales reales y sin ejecutar nada en AWS:

1. **Instancia RDS**: Postgres 16, cifrado en reposo con KMS (backups y
   snapshots incluidos), backups automáticos (retención ≥7 días, ventanas de
   backup/mantenimiento fijas, PITR), Multi-AZ recomendado, parameter group
   propio (`rds.force_ssl=1`, `statement_timeout` alineado a
   `DATABASE_STATEMENT_TIMEOUT_MS`, `max_connections` alineado al pool de la
   app), y la resolución de TLS del lado cliente ya implementada en
   `config-postgres.ts`.
2. **Usuario de aplicación con privilegios mínimos**: `<APP_USER>` sin
   superusuario ni `CREATE`, `GRANT` sólo sobre `SELECT/INSERT/UPDATE/DELETE`
   en los schemas `public` y `ge` (más `ALTER DEFAULT PRIVILEGES` para que
   alcance a tablas futuras), separado de `<MIGRATOR_USER>` (dueño de los
   schemas, el único que corre DDL).
3. **Migraciones de schema**: cómo `migrarDb()` (`lib/db/index.ts`) aplica
   `drizzle/` contra `node-postgres`, idempotente, y por qué conviene
   correrlo como paso separado del deploy con el usuario migrador.
4. **Migración de datos**: referencia explícita a
   `scripts/migrar-sqlite-a-postgres.mjs` (F4, en paralelo, no implementado
   en este dispatch) y su contrato esperado (idempotente, verificación de
   conteos por tabla, ensayado sobre una copia).
5. **Cutover con ventana de mantenimiento**: 9 pasos ordenados, desde
   anunciar la ventana hasta reanudar el servicio, con el backup SQLite del
   paso 3 como red de seguridad final antes de migrar datos.
6. **Verificación post-cutover**: la app levanta, un parte de prueba se
   puede crear y releer, `backup-postgres.mjs` corre contra la RDS real y
   pasa `pg_restore --list`, y se reconfirman los conteos por tabla.
7. **Rollback a SQLite**: revertir `DATABASE_URL` + redeploy de la versión
   previa, con la misma advertencia que `runbook-migracion-backup.md` de E0:
   el restore no reconcilia nada solo, cualquier escritura hecha ya contra
   Postgres durante el cutover requiere reconciliación manual.
8. **Monitoreo**: métricas de RDS (`CPUUtilization`, `FreeStorageSpace`,
   `DatabaseConnections`, `ReadLatency`/`WriteLatency`, `FreeableMemory`) y
   señales de la app (timeouts de `statement_timeout`, agotamiento del pool).
9. **Health check de la base**: **PENDIENTE**, ver punto 5 abajo.

## 5. Health check

No existe ningún endpoint de salud/health en `app/api` (confirmado por N3,
además de la búsqueda previa de este N2 con `rg`). Queda anotado como
pendiente explícito en `runbook-rds.md` §9: un `app/api/health/route.ts` con
una query trivial (`SELECT 1`) contra el pool, devolviendo 503 si falla,
fuera del alcance de F5.

## Verificación de aceptación (N3, corrida real, confirmada por N2)

- `pnpm vitest run --maxWorkers=2` (suite completa, bajo `flock`, memoria
  disponible siempre >17 GB): **218/220 archivos, 1944/1946 tests verdes**.
  Los 2 rojos son exactamente los ya conocidos y aceptados desde F2/F3
  (`lib/infraestructura/riesgo/providers/cupo-om.test.ts`,
  `lib/infraestructura/briefing-ia/presupuesto.test.ts` — necesitan Postgres
  real de F3, fuera de alcance de F5). **Cero regresiones nuevas** respecto
  de la baseline de `cb37534` (216/218 archivos, 1928/1930 tests); el total
  subió por los tests nuevos de F5 (`config-postgres.test.ts` +12,
  `backup-postgres.test.ts` +4), no por fallas.
- `pnpm lint`: limpio, sin errores ni warnings.
- `pnpm exec tsc --noEmit -p .`: 3 errores, los 3 preexistentes en
  `cupo-om.test.ts` (mismo motivo documentado en F2/F3: tipa
  `LibSQLDatabase` para simular una segunda conexión física). **Sin errores
  nuevos.**
- `pnpm exec next build`: exit code 0. Warnings no bloqueantes preexistentes
  (convención `middleware` deprecada, Better Auth sin `secret`/`baseURL` en
  build, un `TypeError` no bloqueante de `@electric-sql/pglite` durante
  prerender) — ninguno introducido por F5.
- `scripts/backup-postgres.test.ts` contra podman real (puerto 55433): 4/4
  verdes, corrido dos veces, sin contenedores colgados al cierre
  (`podman ps -a` vacío).
- `next-env.d.ts` quedó auto-modificado por `next build` (`.next/dev/types`
  → `.next/types`); N3 lo restauró con `git checkout --` para dejar el
  worktree exactamente como al inicio (no es un cambio funcional de F5).

`git status --short` al cierre de este dispatch:

```
 M .env.example
 M lib/db/index.ts
?? docs/ejecucion-enos/DB1/runbook-rds.md
?? lib/db/config-postgres.test.ts
?? lib/db/config-postgres.ts
?? scripts/backup-postgres.mjs
?? scripts/backup-postgres.test.ts
```

Sin commits (regla del brief: sin commit/push/merge en este dispatch). Queda
para que N1 integre.

## Pendiente

- **Health check de base** (§5 arriba): fuera de alcance de F5, anotado como
  trabajo futuro en `runbook-rds.md`.
- **F4** (migración de datos SQLite→Postgres): en paralelo, no es requisito
  de este dispatch; `runbook-rds.md` §4 ya referencia el script esperado.
- El ensayo de `runbook-rds.md` contra una instancia RDS real queda,
  necesariamente, pendiente: no hay cuenta AWS ni instancia en este batch, y
  el runbook lo dice explícitamente en su alcance.

## Gate

(Reservado para N1.)
