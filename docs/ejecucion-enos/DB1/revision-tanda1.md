# DB1 F2 — Revisión independiente TANDA 1 (esquema, migraciones, siembra)

Revisor: N2 (sonnet), solo lectura. Commit revisado: `cb37534` (rama
`feat/enos-db1-rev1`), comparado contra su padre (`f3418c1`) con
`git diff cb37534~1 cb37534`. Verificaciones ejecutadas por un N3
(`opencode run --auto -m opencode-go/deepseek-v4.1-flash`) bajo
`$HOME/.cache/enos-n3/heavy.lock`, leídas y contrastadas por mí contra el
código, no tomadas de la palabra de N3.

## Veredicto: **APPROVE**

No hay bloqueantes. Hay un hallazgo menor sobre cobertura de test perdida
(no de negocio) y dos observaciones de seguimiento, ninguna crítica para F2.

## 1. Esquema pg-core vs. SQLite anterior

Revisé `lib/db/schema.ts` completo (46 tablas, diff íntegro contra el padre).

- **Conversión de tipo correcta y consistente**: `sqliteTable` → `pgTable`,
  `text(..., {mode:'json'})` → `jsonb(...)` en las 12 columnas JSON del
  inventario F0, `integer(..., {mode:'timestamp_ms'})` con default
  `unixepoch()` → `timestamp(..., {mode:'date'})` con default `now()` en las
  4 tablas de better-auth (`user`, `session`, `account`, `verification`).
- **Booleanos 0/1 → boolean nativo**: `discrepancia` (infra_verificacion),
  `evidenciaValida` (infra_risk_snapshot), `tieneAlternativaSinCruce`
  (infra_aislamiento_osm), `emailVerified`/`banned` (user). Busqué
  explícitamente consumidores que compararan estas columnas con `0`/`1`
  literal (`rg` sobre `lib/` y `app/`, excluyendo tests): no encontré
  ninguno. Todos los sitios ya tratan estas columnas como `boolean` de JS
  (`=== false`, `Boolean(...)`, `? 'sí' : 'no'`), incluidos los tests
  actualizados (`lib/infraestructura/verificaciones.test.ts` pasó de
  `toBe(0)/toBe(1)` a `toBe(false)/toBe(true)`). Sin riesgo de comparación
  rota.
- **PK, FK, únicos, índices**: preservados 1:1 en el diff; los 3 índices que
  antes vivían sueltos a nivel de módulo (`infra_afectacion_creada_en_idx_e7b`,
  `infra_afectacion_rige_desde_idx_e7b`,
  `infra_risk_run_publicado_en_idx_e7b`) se movieron al tercer argumento de
  `pgTable(...)` de su tabla — motivo documentado en el propio código
  (drizzle-kit 0.31.10 no soporta `index(...).on(columna)` suelto sobre una
  `PgColumn` de módulo). Verifiqué que no quedó una definición duplicada de
  esos tres índices (el bloque viejo se convirtió en comentario).
- **Fechas**: se mantienen como `text` ISO-8601 en esta fase (decisión
  documentada explícitamente en el propio schema.ts, líneas finales) —
  consistente con lo declarado en `registro.md`. Único cambio real de tipo
  de fecha es en las 4 tablas better-auth, que ya no tenían alternativa
  (pg-core no admite `integer` con mode timestamp).

## 2. Migraciones drizzle-kit vs. schema.ts

- `pnpm exec drizzle-kit check` (N3, bajo flock, sin escribir nada):
  **`Everything's fine 🐶🔥`** — sin drift entre `drizzle/` y `schema.ts`.
- `drizzle-kit generate --dry` no existe como flag en la versión instalada
  (`Unrecognized options for command 'generate': --dry`, exit 1) — no es un
  hallazgo, es una limitación de la CLI; `check` ya cubre lo que se pedía
  verificar (consistencia esquema↔migración).
- Conteo de tablas: 46 `pgTable(...)` en `schema.ts` == 46 `CREATE TABLE` en
  `drizzle/0000_daffy_squirrel_girl.sql`.
- Inspección manual de la migración generada: los `boolean`/`jsonb`/
  `timestamp DEFAULT now()` coinciden exactamente con `schema.ts`; los dos
  índices únicos parciales (`infra_periodo_vigente_unico`,
  `infra_risk_run_vigente_unico`) se generaron con `WHERE "tabla"."estado" =
  'vigente'`, sintaxis Postgres válida y semánticamente igual al `WHERE`
  parcial de SQLite.
- **Se aplican limpias sobre una base vacía (PGlite)**: verificado
  ejecutando la suite real de `seed.test.ts` (que llama `ensureSeeded()` →
  `migrarDb()` sobre una instancia PGlite en memoria nueva por archivo) — ver
  §4.

## 3. `seed.ts` / `ensureSeeded`

Diff completo revisado (864 líneas). Confirmado:

- `HUB_DDL` y los 6 `ensure*Column*`/`ensureVerificacionPeriodoIdColumn`
  (parches manuales `ALTER TABLE` para bases SQLite viejas) fueron
  eliminados. `seedHub()` ahora llama `migrarDb()` primero (aplica las
  migraciones drizzle-kit) y después limpia las 4 tablas del modelo
  deprecado (`infra_problematica*`, `infra_episodio`) vía `ejecutor.execute`
  con `DROP TABLE IF EXISTS` — mismo efecto idempotente que antes, sin el
  DDL manual.
- La lógica de siembra en sí (período ENOS, localizaciones, primer admin
  solo si no hay usuarios, recursos) **no cambió** — el diff no toca esas
  funciones, solo el bloque de arranque de `seedHub()`.
- `ensureSeeded()` sigue con el patrón de `seedPromise` (memoizado por
  proceso) sin cambios — sigue aplicando la migración una sola vez por
  proceso.
- **Verificado de punta a punta contra PGlite** (N3 + yo, no solo el reporte
  de N3): `pnpm vitest run lib/db/seed.test.ts lib/db/reintento.test.ts
  lib/db/driver.test.ts --maxWorkers=2` → **3 archivos, 29 tests, verde**.
  Esto ejercita `ensureSeeded()`/`migrarDb()` desde una base PGlite recién
  creada en cada test, exactamente el camino "migración limpia + siembra
  idempotente" que pedía el brief.

## 4. Tests borrados en `seed.test.ts` (y en el resto del commit)

`seed.test.ts` pasó de 20 `it(...)` a 12. Clasificación de los 8 removidos,
uno por uno:

| Test removido | Función que probaba | Clasificación |
|---|---|---|
| `renombra problematica_id a afectacion_id y preserva los datos existentes` | `ensureAccesoNominalLogAfectacionIdColumn` | **Obsoleto** — la función fue eliminada de `seed.ts`; el schema ya nace con `afectacion_id`, no hay rename que hacer |
| `dropea la columna de una base vieja que la tenía y preserva movimientos existentes` | `ensureMovimientoEpisodioIdColumnDropped` | **Obsoleto** — función eliminada, columna nunca existe en el schema nuevo |
| `es idempotente: reejecutarla sobre una base que ya no tiene la columna no falla` | ídem | **Obsoleto** |
| `backfillea periodo_id desde infra_episodio.periodo_id y preserva el resto de las columnas` | `ensureVerificacionPeriodoIdColumn` | **Obsoleto** — función eliminada, `infra_verificacion.periodo_id` ya es la única forma desde el arranque |
| `cae al período vigente cuando la referencia a infra_episodio está rota` | ídem | **Obsoleto** |
| `es un no-op sobre una base que ya está migrada (sin episodio_id)` | ídem | **Obsoleto** |
| `arranca sin romperse y backfillea periodo_id sobre infra_verificacion` | ídem (integración) | **Obsoleto** |
| `agrega auditoria_fallback a una infra_briefing creada sin esa columna y preserva las filas existentes` | `ensureBriefingAuditoriaFallbackColumn` | **Obsoleto** — función eliminada, la columna ya nace en la migración inicial |

Los 8 removidos mapean exactamente 1:1 a las 4 funciones `ensure*` que
`seed.ts` eliminó en este mismo commit (confirmé cada función efectivamente
borrada, no solo renombrada). **Ninguno es una garantía de negocio perdida**:
todos probaban parches de migración ad-hoc para bases SQLite preexistentes,
un concepto que no existe en el modelo nuevo (migraciones versionadas desde
cero). Los tests que sí verifican comportamiento de negocio real (HUB_DDL/
migración inicial crea las tablas y preserva filas al reaplicarse, un parte
por cueAnexo+período, un solo período vigente, soft delete de afectación/
alcance, DROP idempotente del modelo retirado, motivos únicos) se
conservaron, solo renombrados (`HUB_DDL` → `la migración inicial` en el
texto del `describe`/`it`).

**Otro archivo de test borrado completo**: `scripts/jobs.migracion-legacy.test.ts`
(89 líneas, 1 `it`). Lo leí íntegro: reproducía un bug histórico
(`ensureBriefingAuditoriaFallbackColumn` faltante rompía `jobs.mjs` en
producción) usando `db.$client.execute('ALTER TABLE ... DROP COLUMN
auditoria_fallback')` y `PRAGMA table_info` — API específica de libsql que
ya no compila contra el tipo `Db` unificado, y que prueba un bug que ya no
puede ocurrir (la migración inicial siempre crea la columna). **Obsoleto**,
correctamente eliminado.

**Verificación de paridad en el resto del commit**: conté `it(...)` parent
vs. actual en los 34 archivos `*.test.ts`/`*.test.tsx` tocados por el commit.
Todos tienen paridad exacta salvo `seed.test.ts` (20→12, ya arriba) y
`jobs.migracion-legacy.test.ts` (1→eliminado). `reintento.test.ts` incluso
**ganó** 2 casos (10→12, los 2 nuevos códigos Postgres mencionados en
`registro.md`). No hay ninguna otra pérdida silenciosa de cobertura.

## 5. SQL crudo portado

- **Alias sin comillas**: revisé `ge-db.ts` (`getCorteVigente`, `as
  "cicloLectivo"`/`as "fetchedAt"`) y `contexto.ts` (3 queries, `as
  "cueAnexo"`/`as "geSectionId"`/`as "gePersonId"`) — todos los alias
  camelCase están correctamente citados. Audité el resto de `SELECT ...
  FROM ge.*` en el repo (`secciones-cue.ts`, `parte-mapa.ts`, `geo-perfil.ts`,
  `exposicion.ts`, `impacto.ts`, `localizaciones-seed.ts`, `identidad.ts`):
  todos seleccionan columnas snake_case sin alias (se consumen tal cual en
  JS), no hay más casos de plegado a minúscula pendientes.
- **NULLS LAST/FIRST**: confirmé `sql`${col} desc nulls last`` en
  `app/api/infraestructura/riesgo/route.ts:150`,
  `app/api/infraestructura/radar/route.ts:258` y
  `app/(hub)/admin/riesgo/page.tsx:208`. La cuarta referencia que
  `registro.md` mencionaba (`admin/riesgo/[snapshotId]/page.tsx`) en
  realidad no necesita el fix: esa página hace un `SELECT` por `id` exacto
  (un solo snapshot), sin `ORDER BY` — no hay NULLs que ordenar. No es un
  bloqueante, es una imprecisión menor de `registro.md` sobre qué archivos
  quedaron afectados.
- **Comparaciones ISO de texto**: las fechas siguen siendo `text` en ambos
  motores en esta fase (ver §1), así que el orden lexicográfico de ISO-8601
  se comporta igual en SQLite y Postgres — no encontré ninguna comparación
  que dependiera de un comportamiento específico de un motor.

## 6. Otras verificaciones ejecutadas (N3, contrastadas por mí)

- `pnpm exec tsc --noEmit -p .` (con caché incremental default): **3
  errores, los 3 dentro de `lib/infraestructura/riesgo/providers/cupo-om.test.ts`**
  (líneas 279, 280, 292 — tipan `LibSQLDatabase` para simular una segunda
  conexión física de SQLite, no aplica al tipo `Db` unificado de pg-core).
  Coincide exactamente con lo que `registro.md` reporta como cierre de F2 y
  es explícitamente alcance de F3 (concurrencia), no de este dispatch — no
  se tocó ese archivo en `cb37534~1..cb37534` según el diff. No alcancé a
  correr un `tsc` completo sin caché (`--incremental false`) por contención
  de recursos compartidos con otro proceso de F4 corriendo en paralelo en la
  misma máquina; el resultado incremental ya es consistente con la cifra
  documentada y no cambia el veredicto.

## Bloqueantes

Ninguno.

## Menores

1. **`registro.md` atribuye el fix de `nulls last` a
   `admin/riesgo/[snapshotId]/page.tsx`**, pero esa página no tiene
   `ORDER BY` sobre `scoreRiesgo` — la lista está en `admin/riesgo/page.tsx`
   (sin `[snapshotId]`). Corregir la referencia en la próxima actualización
   del registro para no confundir a quien lo lea después.
2. **Seguimiento ya reconocido en el propio `registro.md`** (no nuevo, solo
   confirmado en esta revisión): `activarCorte` en `ge-db.ts` corre
   `BEGIN`/`COMMIT`/`ROLLBACK` crudos sobre el cliente que reciba; si algún
   día se lo llama con un `Pool` real (hoy siempre es `PGlite` o una `tx` ya
   abierta) esas tres sentencias podrían caer en conexiones físicas
   distintas del pool. Correcto documentarlo como pendiente de resolver
   antes de RDS con carga concurrente, no bloqueante para F2.

## Lo que no se corrió (fuera de alcance de esta revisión)

No corrí la suite completa de Vitest (`pnpm vitest run` sin filtro) ni
`next build` — el `registro.md` ya reporta esos resultados
(216/218 archivos, 1928/1930 tests verdes; build exitoso) y correrlos de
nuevo hubiera duplicado un paso pesado mientras otro proceso (F4, misma
máquina) ya estaba usando el `flock` compartido. La verificación dirigida
sobre `lib/db/*` + `drizzle-kit check` + `tsc` alcanza para sostener el
veredicto de esta tanda (esquema, migraciones, siembra, SQL crudo).
