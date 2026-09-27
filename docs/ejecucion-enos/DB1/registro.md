# DB1 — Registro de ejecución

Batch: migración SQLite → PostgreSQL (persistencia ENOS), último batch del
plan 2026/2027. Ver `plan.md` para el inventario F0 completo.

## Estado por fase

| Fase | Estado | Suite |
|---|---|---|
| F0 — Plan/inventario | **Completa** | n/a (documento) |
| F1 — Capa de acceso dual por `DATABASE_URL` | **Completa** | verde |
| F2 — Schema pg-core + migraciones drizzle-kit | **Pendiente** | — |
| F3 — Concurrencia en Postgres (lease, cupo E8) | **Pendiente** | — |
| F4 — Migración de datos SQLite→PG + verificación | **Pendiente** | — |
| F5 — Backups `pg_dump`, config RDS, runbook | **Pendiente** | — |

## F0 — Plan

Ver `plan.md`. Inventario de SQL específico de SQLite, columnas JSON (12),
puntos de concurrencia y riesgo por fase.

Hallazgo relevante: el patrón de lease (`lib/infraestructura/riesgo/job-run.ts`)
ya usa CAS por `INSERT ... ON CONFLICT DO NOTHING RETURNING` / `UPDATE ...
WHERE ... RETURNING`, no `SELECT` + decisión. Eso es directamente portable a
Postgres sin `SELECT ... FOR UPDATE` ni advisory locks; sólo cambia el tipo de
error a reintentar (`serialization_failure` / `deadlock_detected` en vez de
`SQLITE_BUSY`). Reduce el riesgo de F3 respecto de lo estimado en el brief.

No se encontró ningún `ATTACH DATABASE` en el código: `ge.sqlite` se abre
como una conexión `@libsql/client` separada (archivo propio), no vía ATTACH
desde la conexión del hub.

**Baseline**: `pnpm vitest run --maxWorkers=2` en modo SQLite, sin tocar
nada — **218 archivos / 1932 tests, verde**.

## F1 — Capa de acceso dual

Implementado por N3, verificado de forma independiente por mí (N2), no sólo
por el exit code de N3:

- `lib/db/driver.ts` (nuevo): `resolveDriver(): 'sqlite' | 'postgres'`, pura,
  lee `DATABASE_URL`. `postgres://` o `postgresql://` → `'postgres'`;
  cualquier otro valor (incluido `file:...` o vacío/ausente) → `'sqlite'`.
- `lib/db/index.ts` (modificado): `getDb()` llama a `resolveDriver()` primero;
  si da `'postgres'`, lanza un error explícito señalando que el driver aún no
  está implementado (referencia a F2 en `plan.md`). Si da `'sqlite'`, el
  camino es **idéntico byte a byte** al de antes de este batch — no se tocó
  ninguna línea del comportamiento SQLite existente.
- `lib/db/driver.test.ts` (nuevo): 5 casos (sin env, vacía, `postgres://`,
  `postgresql://`, `file:...sqlite`).

**Decisión documentada**: no se intentó una abstracción de tipos única para
`sqlite-core`/`pg-core` en Drizzle — Drizzle no permite un `db` genérico que
cubra ambos dialectos con inferencia de tipos compartida. La dualidad real
(dos schemas con la misma forma, seleccionados junto con el driver) se
resuelve en F2, cuando exista el schema pg-core. F1 sólo deja el punto de
selección listo y sin romper nada. No hizo falta usar `ask`: la dualidad no
resultó inviable, sólo se pospuso la parte que depende de F2.

**Verificación (corrida por mí, no por el reporte de N3)**:
- `pnpm vitest run lib/db --maxWorkers=2` → 3 archivos, 35 tests, verde.
- `pnpm vitest run --maxWorkers=2` (suite completa) → **219 archivos / 1937
  tests, verde** (218→219 archivos, 1932→1937 tests: exactamente el nuevo
  `driver.test.ts` y sus 5 casos; cero regresiones).
- `pnpm exec tsc --noEmit` → sin salida, sin errores.

`git status --short` en este punto:
```
 M lib/db/index.ts
?? lib/db/driver.test.ts
?? lib/db/driver.ts
```
Sin commits (regla del brief: sin commit/push/merge en este dispatch).

## Pendiente (F2 a F5)

No entraron con calidad en este dispatch. Cada una requiere, como mínimo:

- **F2**: traducir 1127 líneas de `schema.ts` a `pg-core`, decidir
  JSON→JSONB y el tratamiento de fechas (`text` ISO vs `timestamptz`) columna
  por columna, generar migraciones versionadas con `drizzle-kit`, y mover
  `ge.sqlite` a un schema Postgres `ge` propio — con la suite SQLite
  quedando verde y una revisión de un N3 distinto del implementador (fase de
  riesgo).
- **F3**: reescribir el lease y la reserva de cupo E8 usando el mismo patrón
  CAS ya identificado en F0, pero contra Postgres real, con tests de
  concurrencia genuinos contra el contenedor local — también con revisión
  cruzada.
- **F4**: script de migración de datos idempotente + verificación de
  conteos por tabla, ensayado sobre una COPIA de la demo (nunca el
  original) — también con revisión cruzada.
- **F5**: `pg_dump` en reemplazo de `VACUUM INTO`, config para RDS (SSL,
  pool, variables documentadas sin valores reales) y
  `docs/ejecucion-enos/DB1/runbook-rds.md`.

Ninguna de estas fases se empezó a implementar: no hay contenedor Postgres
corriendo, no hay schema pg-core, no hay script de migración de datos. Se
verificó que `podman` está disponible en el entorno para cuando se retome
F2/F3/F4.

## Gate

(Reservado para N1.)
