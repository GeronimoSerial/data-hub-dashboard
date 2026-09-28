# DB1/F4 — Registro de ejecución (RETOMA post-reinicio)

Rol de este dispatch: N2 (sonnet), sin edición de código propia. El trabajo de
código (`scripts/migrar-sqlite-a-postgres.mjs`, `scripts/lib/migrar-sqlite-a-postgres.lib.mjs`,
`scripts/migrar-sqlite-a-postgres.test.ts`) ya estaba presente, sin commitear,
en el worktree al arrancar este dispatch — producido por un N3 de un dispatch
anterior cortado por el reinicio de la máquina. Este N2 lo revisó, lo verificó
de punta a punta (incluyendo el ensayo real contra datos de siembra, que no
estaba hecho) y no le hizo falta pedir ninguna corrección de código: pasó
revisión sin cambios.

## Contexto de la retoma

La máquina se reinició y cortó al N2 anterior de esta misma tarea. `/tmp` se
vació (perdiendo la copia de la demo usada para el ensayo), pero el worktree
en `feat/enos-db1-f4` conservó, sin commitear, el script de migración completo
con su librería de funciones puras y sus tests. `git log` seguía en `cb37534`
(F2 completo, F3 pendiente — sin cambios de este dispatch respecto de esa
base).

## 1–2. Script de migración: idempotencia + verificación

Revisado `scripts/migrar-sqlite-a-postgres.mjs` + `scripts/lib/migrar-sqlite-a-postgres.lib.mjs`:

- **Upsert idempotente**: `.onConflictDoUpdate({ target: pk, set: resto })`
  vía drizzle para las 46 tablas `public.*`; `INSERT ... ON CONFLICT ... DO
  UPDATE` armado a mano (con `sql` parametrizado) para las 5 tablas `ge.*`
  (no tienen objeto drizzle). Cuando la PK cubre todas las columnas
  (`recurso_tags`, `ge_alumno_seccion`), cae a `DO NOTHING` (un `DO UPDATE
  SET` vacío sería SQL inválido).
- **Lotes transaccionales**: `TAMANO_LOTE = 500`, una transacción por tabla
  (`db.transaction()` nativo de drizzle-orm/node-postgres o pglite).
- **Orden por FK**: `ordenTopologico()` (Kahn) sobre
  `drizzle/meta/0000_snapshot.json`, determinista por orden de aparición.
  Las 5 tablas `ge.*` van después, en el orden fijo `ORDEN_GE` (no tienen FKs
  declaradas pero sí un orden lógico correcto).
- **Conversión de tipos**: `jsonb` (text→JSON.parse, drizzle serializa de
  vuelta), `boolean` (0/1→true/false, con manejo de bigint/string/number),
  `timestamp` de better-auth (epoch-ms→`Date`). Fechas ISO declaradas `text`
  en el schema pg-core se conservan tal cual (sin conversión), como pide el
  brief.
- **setval**: único caso real es `ge.ge_corte.id` (única columna
  `GENERATED ALWAYS AS IDENTITY` del destino) — `ajustarSecuenciaGeCorte()`
  la avanza a `MAX(id)` (o `is_called=false` si quedó vacía) al final de la
  migración.
- **Origen/destino**: lee `hub.sqlite`/`ge.sqlite` de `--data-dir` (o
  `$DATA_DIR`) sobre **copias temporales** en `os.tmpdir()` (nunca el
  archivo original, ni siquiera en modo lectura — `@libsql/client` no
  expone `mode=ro`). Destino: `--pglite <dir>` o `DATABASE_URL` del
  entorno; en ambos casos corre `migrarDb()` (migraciones drizzle-kit) +
  `ensureGeSchema()` antes de migrar datos.
- **Verificación por tabla**: `compararTabla()` compara conteo origen/destino
  y un checksum sha256 de las PKs ordenadas (detecta filas distintas aunque
  el conteo coincida). Si alguna tabla falla, el CLI imprime el reporte
  completo y sale con `process.exit(1)`.

No hizo falta ninguna corrección: la implementación ya cubre los 4 puntos
del punto 1 y el punto 2 del brief.

## 3. Base de origen realista (worktree temporal)

El worktree detached que N1 ya había dejado en
`/tmp/claude-1000/db1-f4-sqlite-src` (`898fdea`, versión SQLite previa a F2)
seguía presente pese al reinicio. Se instalaron sus dependencias con
`pnpm install --frozen-lockfile` bajo `flock $HOME/.cache/enos-n3/heavy.lock`
(`XDG_DATA_HOME` propio, `db1f4-src`).

Siembra en `DATA_DIR=/tmp/claude-1000/db1-f4-data`:

1. `node scripts/sync-ge.mjs --fixture` → 2005 localizaciones cargadas, 1
   corte activado en `ge.sqlite`.
2. Arranque breve de `next dev` (puerto 3299, foreground con `timeout`,
   sin proceso residual) para disparar `ensureSeeded()` vía
   `/api/auth/session` y crear/migrar `hub.sqlite` con las tablas base
   (`niveles`, `tipos`, `categorias`, `recursos`, `infra_periodo`,
   `infra_motivo`, etc.).
3. `DEMO_OK=1 NOMINAL_ENCRYPTION_KEY=<clave de prueba, base64 32 bytes
   generada con openssl para este ensayo> node scripts/seed-demo-partes.mjs`
   → Parte A: 561 secciones y 13257 alumnos en `ge.sqlite`; Parte B: 50
   partes, 97 afectaciones, 21 filas de `servicio_alcance`, 92 movimientos
   en `hub.sqlite`. `listarPartesVigentes()` verificó 47 escuelas con parte
   vigente, coherente con el desglose esperado (35 normal, 10 parcial, 5
   suspendido, 6 con evacuados).

Quedaron filas reales en la mayoría de las tablas de `hub.sqlite` y
`ge.sqlite` (excepciones: tablas de hazards/riesgo/OM-cupo, que no tienen
seed de demo — vacías también en producción hasta que corra un job real).

Al terminar la siembra se quitó el worktree temporal:
`git worktree remove --force /tmp/claude-1000/db1-f4-sqlite-src` (sólo tenía
`node_modules` sin trackear y un `next-env.d.ts` autogenerado modificado;
nada de trabajo en progreso que preservar).

## 4. Ensayo de migración (doble, para demostrar idempotencia) + app

Dos corridas consecutivas de
`node scripts/migrar-sqlite-a-postgres.mjs --pglite /tmp/claude-1000/db1-f4-pg --data-dir /tmp/claude-1000/db1-f4-data`
sobre el mismo `DATA_DIR`, sin tocar nada entre medio:

| Corrida | Tablas OK | Filas clave |
|---|---|---|
| 1ª | 51/51 | `ge_localizacion`=2005, `ge_alumno_identidad`=13257, `ge_seccion`=564, `ge_alumno_seccion`=13261, `infra_parte`=50, `infra_afectacion`=97, `infra_movimiento`=92 |
| 2ª (re-ejecución) | 51/51, **conteos idénticos** | mismos valores exactos, sin duplicar ni perder filas |

Las 51 tablas (46 `public.*` + 5 `ge.*`) dieron `OK` con checksum coincidente
en ambas corridas.

Levantada la app de **este worktree** (`enos-db1-f4`, no el temporal) con
`PGLITE_DATA_DIR=/tmp/claude-1000/db1-f4-pg PORT=3201 timeout 60 pnpm dev -p 3201`
en foreground (con `timeout` como cinturón de seguridad, sin `&` persistente
entre llamadas de herramienta — el proceso se lanzó y se detuvo dentro de la
misma invocación de shell):

- `curl -s -o /dev/null -w '%{http_code}' http://localhost:3201/login` → **200**.
- `curl http://localhost:3201/api/mapas/infraestructura/totales` → `401 No
  autenticado` (no había `ADMIN_EMAIL`/`ADMIN_PASSWORD` seteados para crear
  el admin inicial en este ensayo — fuera del alcance de F4 crear
  credenciales de prueba persistentes). Se verificó el total de escuelas de
  forma directa e independiente contra la MISMA PGlite migrada: `SELECT
  COUNT(*) FROM ge.ge_localizacion` → **2005**, exactamente el conteo de
  origen cargado por `sync-ge.mjs --fixture`.
- Proceso detenido explícitamente (`kill`) al terminar los chequeos; no quedó
  ningún `next dev` corriendo.

Al cerrar el ensayo se borraron `/tmp/claude-1000/db1-f4-data`,
`/tmp/claude-1000/db1-f4-pg` y los logs temporales de `next dev`.

## 5. Tests con fixtures chicas

`scripts/migrar-sqlite-a-postgres.test.ts` (ya presente, revisado, sin
cambios) — **5/5 verde**:

1. Columna `jsonb` (`tipos.aplica_a`): texto JSON de SQLite → array JS usable
   tras el upsert con drizzle.
2. Columna `boolean` (`user.banned`, 0/1): convierte a `true`/`false`.
3. Columna `timestamp` de better-auth (epoch-ms): convierte a `Date`, con 3
   columnas (`created_at`, `updated_at`, `ban_expires`) verificadas por
   `getTime()`.
4. FK real (`niveles` → `recursos`): el hijo se inserta después del padre
   sin violar la constraint.
5. **Re-ejecución** (`migrar()` llamado dos veces sobre el mismo destino):
   no duplica `niveles` ni las 5 filas de `ge.*`, y el `setval` de
   `ge.ge_corte` queda consistente (un INSERT posterior sin id explícito cae
   en el id 2, sin colisionar con el 1 importado).

Cubre exactamente los 4 casos pedidos (json, boolean, FK, re-ejecución) más
timestamp (necesario para better-auth, no pedido explícitamente pero
requerido por el schema real).

## Verificación de aceptación (corrida por mí, N2, no sólo reportada)

- `pnpm vitest run scripts/migrar-sqlite-a-postgres.test.ts --maxWorkers=2`
  (bajo `flock`) → **5/5 verde**.
- `pnpm vitest run --maxWorkers=2` (suite completa, bajo `flock`) →
  **217/219 archivos, 1933/1935 tests verdes**. Los 2 archivos que fallan
  (`cupo-om.test.ts`, `presupuesto.test.ts`) son los mismos 2 de F3
  pendiente ya documentados en `registro.md` al cierre de F2 (tests de
  concurrencia con dos conexiones físicas reales, fuera del alcance de F4).
  Sin regresiones: 219−218=1 archivo nuevo (el test de migración) y
  1935−1930=5 tests nuevos (exactamente los de ese archivo).
- `pnpm lint` → limpio, sin salida.
- `pnpm exec tsc --noEmit` → **3 errores**, los 3 en
  `lib/infraestructura/riesgo/providers/cupo-om.test.ts` — el mismo hallazgo
  documentado al cierre de F2 (tipo `LibSQLDatabase` para simular una
  segunda conexión física, no aplica al tipo `Db` unificado). Cero errores
  nuevos.

## Estado de fase

| Fase | Estado |
|---|---|
| F4 — Migración de datos SQLite→PG + verificación | **Completa** |

Trabajo de código de F4 ya estaba en el worktree al empezar este dispatch
(sin commitear); este N2 lo verificó de punta a punta (incluyendo el ensayo
real contra datos de siembra realistas, que faltaba) y no requirió ninguna
corrección. Sin commits en este dispatch (regla del brief).

## Pendiente para F5 (sin cambios respecto del plan original)

- `pg_dump` en reemplazo de `VACUUM INTO`/`backup-sqlite.mjs`.
- Config para RDS (SSL vía `DATABASE_SSL`, pool vía `DATABASE_POOL_MAX`, ya
  soportados en `lib/db/index.ts` desde F2) documentada sin secretos en
  `runbook-rds.md`.
- Runbook de cutover/rollback.

## Gate

(Reservado para N1.)
