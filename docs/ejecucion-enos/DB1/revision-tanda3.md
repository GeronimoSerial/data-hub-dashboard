# DB1 — Revisión independiente, Tanda 3 (tests y scripts)

Revisor: N2 (sonnet), solo lectura. No se editó ningún archivo del repo salvo
este documento. Hallazgos producidos por 5 dispatches de N3 (`opencode run
--auto -m opencode-go/deepseek-v4.1-flash`, en primer plano, uno por vez) y
verificados por mí contra el código real antes de aceptarlos.

**Alcance**: F2 (`cb37534`, tests adaptados a PGlite) y F3
(`fde3d24..39ee089`, concurrencia real y migración de jobs). Ver
`docs/ejecucion-enos/DB1/registro.md` (no se encontró `plan.md` en este
worktree; no está trackeado en git).

## Veredicto: **REJECT**

Dos hallazgos bloqueantes, ambos en `scripts/import-padron.mjs`. El resto del
batch (tests adaptados a PGlite, aislamiento, `sync-ge.mjs`,
`job-diagnostico.mjs`, `jobs.mjs`, rutas de API) está en orden, con hallazgos
menores no bloqueantes.

---

## Bloqueantes

### B1 — `import-padron.mjs`: se perdió la atomicidad transaccional por lote

- **Archivo:línea**: `scripts/import-padron.mjs:311-317` (`ejecutarEnLotes`)
- **Escenario**: la versión SQLite (`git show cb37534~1:scripts/import-padron.mjs:317-340`)
  abría `conexion.client.transaction('write')` por cada lote de
  `TAMANO_LOTE` filas, con `commit()`/`rollback()` explícito ante error. La
  versión portada:
  ```js
  async function ejecutarEnLotes(conexion, items, fn) {
    for (let i = 0; i < items.length; i += TAMANO_LOTE) {
      const lote = items.slice(i, i + TAMANO_LOTE)
      for (const item of lote) await fn(conexion.client, item)   // sin transacción
      if (PAUSA_ENTRE_LOTES_MS > 0) await dormir(PAUSA_ENTRE_LOTES_MS)
    }
  }
  ```
  ya no abre transacción alguna: cada `INSERT` es autocommit. Si el proceso
  falla a mitad de un lote (error de red, OOM, `SIGKILL` del orquestador),
  el padrón queda con filas parcialmente insertadas del lote en curso, en
  vez de revertirlas como antes. Verificado el diff completo contra
  `cb37534~1`; confirmado independientemente, no es un falso positivo de N3.
- **Agravante**: `EjecutorSql` (`lib/infraestructura/ge-db.ts:26-28`) sólo
  expone `.execute()`, no hay forma de envolver un lote en transacción sin
  ampliar esa interfaz — no es un simple `await` olvidado, requiere una
  decisión de diseño (agregar soporte de transacción al ejecutor o usar
  `db.transaction()` de drizzle para este camino).
- **Corrección sugerida**: restaurar el agrupamiento transaccional por lote,
  vía `db.transaction()` (si se puede envolver el `EjecutorSql` alrededor de
  un `tx`) o ampliando `EjecutorSql` con un método de transacción explícito.

### B2 — `import-padron.mjs`: sin cobertura de test en la ruta de persistencia

- **Archivo**: `scripts/import-padron.test.ts`
- **Escenario**: el único test file del script (`describe` en líneas 19, 30,
  44, 87, 112, 175, 186) cubre exclusivamente funciones puras
  (`extraerB64DeHtml`, `decodificarPadron`, `derivarEnteroEstable`,
  `clasificarFilas`, `derivarIds`, `deduplicarMembresias`,
  `normalizarFilaHtml`/`reconciliarFilas`). Confirmado con `rg` que no hay
  ningún otro archivo de test que ejercite `ejecutarEnLotes`,
  `insertarSecciones`, `insertarMembresias`, `insertarIdentidades`,
  `verificarCorte` ni `main`.
- **Consecuencia**: ni el `ON CONFLICT DO NOTHING` (§M1) ni la atomicidad por
  lote (B1) están verificados por ningún test contra PGlite. El script real
  con el que se importa el padrón de identidad nominal corre sin red de
  seguridad automatizada.
- **Corrección sugerida**: agregar al menos un test de integración contra
  PGlite que ejercite `main()` (o las funciones de persistencia
  directamente) con un fixture HTML pequeño, cubriendo el camino feliz y un
  fallo a mitad de lote.

---

## Menores (no bloqueantes)

### M1 — `import-padron.mjs`: `ON CONFLICT DO NOTHING` sin columna explícita

`scripts/import-padron.mjs:322,331,348` usa `ON CONFLICT DO NOTHING` (forma
sin target) en vez de `ON CONFLICT (<columna>) DO NOTHING`. Verificado
contra el DDL real (`lib/infraestructura/ge-db.ts:97-146`, no está en
`lib/db/schema.ts` — las tablas `ge_*` son SQL crudo): las claves reales
(`ge_seccion`: `(corte_id, ge_section_id)`; `ge_alumno_seccion`:
`(corte_id, ge_section_id, ge_person_id)`; `ge_alumno_identidad`:
`ge_person_id`) coinciden exactamente con las columnas insertadas, así que
es funcionalmente equivalente — pero captura cualquier violación de
unicidad, no sólo la de esa clave. Sin impacto práctico hoy.

### M2 — `sync-ge.mjs`: ya no cierra el cliente al final

`scripts/sync-ge.mjs` (función `runFixture`, líneas 192-244) eliminó el
`client.close()`/`finally` que tenía la versión SQLite, y el top-level no
llama `process.exit()`. En producción `getRawClient()` devuelve un
`pg.Pool`; conexiones idle del pool pueden impedir que el proceso Node
termine solo. Sugerencia: `process.exit(0)` explícito al final, como ya
hacen `import-padron.mjs` y `job-diagnostico.mjs`.

### M3 — Ninguna instancia PGlite se cierra en los tests

Confirmado con `rg -n "\.close\(\)"` sobre `lib/db/index.ts` y los tests: no
hay ningún `.close()` sobre la PGlite en el ciclo de vida normal de test.
Bajo `maxWorkers > 1` esto es una fuga de memoria WASM por archivo (cada
worker acumula instancias no liberadas de forma determinista). Agrava, pero
no causa por sí solo, el flaky de M4/M5.

### M4 — `lib/infraestructura/recurso-seed.test.ts`: reabre PGlite sobre el mismo dir sin cerrar la instancia previa

`restart()` (líneas 40-44) hace `vi.resetModules()` y reimporta `seed`;
`getDb()` crea una PGlite **nueva** sobre el mismo `PGLITE_DATA_DIR`
mientras la instancia anterior (del módulo descartado) sigue viva sin
cerrar. El test llama `restart()` hasta 3 veces por caso, acumulando
instancias PGlite simultáneas sobre el mismo directorio.

### M5 — Flakiness de `scripts/job-diagnostico.test.ts` y `lib/infraestructura/recurso-seed.test.ts`: diagnosticado, no bloqueante

Diagnóstico por lectura (consistente con lo ya registrado en
`docs/ejecucion-enos/E5/registro.md:13` y en `registro.md` de este batch,
líneas 393-400): **no es un bug de aislamiento ni de orden de ejecución**.
Ambos archivos pagan el costo completo de `ensureSeeded()` sobre una base
PGlite fresca (migración + siembra de 2005 filas de localización,
`lib/infraestructura/localizaciones-seed.ts:57-74`, inserción secuencial),
y ninguno declara un `timeout` propio — heredan los 5000 ms globales de
Vitest. Bajo carga (varios workers concurrentes, agravado por M3), esa
inicialización supera el presupuesto de tiempo y el test falla por
`Test timed out`, no por una aserción. Descartado por lectura: no hay
dependencia de tiempo real en las aserciones, ni IDs sin `ORDER BY`
explícito, ni contaminación cruzada entre archivos (cada uno tiene su
propia PGlite en memoria). Recomendación no bloqueante: cerrar la PGlite en
`afterEach`/`afterAll` (resuelve M3/M4) y subir el `timeout` puntual de
estos 2 archivos, como ya se hizo para
`components/mapas/map-infraestructura-page.test.tsx` en E5.

### M6 — `lib/infraestructura/riesgo/situacion/consulta.ts:131`: mismo bug de NULL, sin corregir, fuera del rango tocado

`desc(infraRiskSnapshot.scoreRiesgo)` sin `nulls last`, y `scoreRiesgo` es
nullable (`lib/db/schema.ts:697`, `real('score_riesgo')` sin `.notNull()`).
Misma clase de bug que ya se corrigió en `riesgo/route.ts` y
`radar/route.ts`, pero esta consulta no forma parte del rango de commits
revisado (`cb37534..39ee089`). Mitigado en la práctica porque el `WHERE`
filtra `nivelRiesgo IN ('alto','muy_alto')`, que en general trae filas con
score asignado. No bloqueante para este batch, pero queda pendiente de
arreglo.

### M7 — Paginación: `ORDER BY` sin desempate secundario determinista

`app/api/infraestructura/riesgo/route.ts:150`,
`app/api/infraestructura/radar/route.ts:258`,
`app/(hub)/admin/riesgo/page.tsx:208`: `desc nulls last` sin criterio de
desempate. En SQLite los empates quedaban en orden de `rowid` (inserción);
en Postgres el orden de empates no está garantizado. Con paginación, filas
con el mismo score pueden repetirse u omitirse entre páginas. No introducido
por esta migración (tampoco había desempate antes), pero la migración
cambia el orden efectivo de los empates. Sugerencia: agregar un segundo
criterio estable (p. ej. `cueAnexo asc`).

### M8 — Transacciones sobre `pg.Pool` crudo no garantizan afinidad de conexión

`lib/infraestructura/localizaciones-seed.ts:57-78`,
`lib/infraestructura/identidad.ts:205-215,243-258`,
`lib/infraestructura/ge-db.ts:208-223` (`activarCorte`) arman
`BEGIN`/`COMMIT`/`ROLLBACK` con llamadas de `EjecutorSql` separadas sobre
`getRawClient()`. En tests (`PGlite`, una sola conexión) esto es atómico;
en producción `getRawClient()` es un `pg.Pool`, y cada `.execute()` puede
tomar una conexión física distinta del pool, rompiendo la atomicidad real.
Ya reconocido con un `// TODO(DB1-F2/F3)` explícito en `ge-db.ts:207`; no es
un hallazgo nuevo de esta tanda, pero conviene resolverlo (`pool.connect()`
reservado) antes de exponer estos caminos —en particular
`consultarYRegistrarAfectados`, la ruta auditada de nominal— contra un
Postgres real con carga concurrente.

### M9 — Documentación y comentarios desactualizados (sin impacto funcional)

- `docs/rotacion-clave-nominal.md:16,25` — sigue describiendo el
  procedimiento sobre `ge.sqlite`/`openGeDb()`, que ya no existen.
- `scripts/job-diagnostico.mjs:58,62,73,79,115` — comentarios e
  identificadores (`hub.sqlite`, `BUSY_TIMEOUT_MS_JOB`, `getSqlitePath`)
  que ya no aplican; `busyTimeoutMs` es no-op confirmado en
  `lib/db/index.ts`.
- `scripts/job-diagnostico.test.ts:9-12` y `lib/db/seed.test.ts:27-28` —
  comentarios que describen el comportamiento viejo de aislamiento por
  `DATA_DIR`, que ya no aplica bajo PGlite en memoria.

---

## Confirmado en orden (sin hallazgos)

### 1. Tests adaptados a PGlite (`cb37534`)

Revisados los 33 archivos de test tocados en `cb37534` (excluyendo
`seed.test.ts` y `driver.test.ts`, ya cubiertos por la tanda anterior). **No
se borró ningún caso ni se relajó ninguna aserción de negocio.** Los únicos
casos desaparecidos son andamiaje específico de SQLite, clasificados como
**obsoletos**:

- `rotacion-clave.test.ts` — se quitó la verificación "sobre una copia,
  nunca el original" (procedimiento de copiar `ge.sqlite`); la garantía de
  negocio (recifrado correcto, preserva nombres) se conserva.
- `ge-db.test.ts` — el caso de `attachGe` se reescribió porque ya no hay
  `ATTACH`; se conserva la garantía real (join hub↔ge en una query, sin
  alterar tablas del hub).
- `identidad.test.ts` — el escaneo "sin texto plano en reposo" pasó de
  escanear el archivo `ge.sqlite` completo a la columna `payload_cifrado`;
  el archivo ya no existe (PGlite en memoria), garantía conservada.
- `lib/auth.test.ts` — reescrito con un espía sobre `getDb` para verificar
  pereza/memoización; pierde la observación de "conecta contra el `DATA_DIR`
  vigente al primer uso" porque `getDb()` bajo Vitest ignora `DATA_DIR`
  (usa siempre PGlite en memoria) — comportamiento ya no observable, no una
  garantía perdida.

`reintento.test.ts` agrega 2 casos nuevos (códigos Postgres) sin eliminar
nada; `verificaciones.test.ts` y `verificaciones-cola.test.tsx` actualizan
`toBe(0/1)` a `toBe(false/true)` porque `discrepancia` pasó a `boolean`
nativo — equivalente semántico correcto.

### 2. Aislamiento

Correcto en lo esencial: una PGlite en memoria por archivo, sin
contaminación cruzada ni dependencia de orden entre archivos (confirmado por
lectura de los helpers de setup). Los defectos encontrados son de **gestión
de recursos** (M3, M4), no de aislamiento funcional, y el flaky de
`job-diagnostico.test.ts`/`recurso-seed.test.ts` es de presupuesto de tiempo
(M5), no una regresión de lógica de negocio de DB1.

### 3. Scripts portados

- `sync-ge.mjs` — **OK**. `ON CONFLICT(cue_anexo) DO UPDATE` con la columna
  de conflicto correcta (PK real de `ge_localizacion`), prefijo `ge.`
  consistente, `RETURNING id` correcto para el identity de `ge_corte`.
  Cubierto por `sync-ge.test.ts` contra PGlite. Menor: M2.
- `job-diagnostico.mjs` — **OK**. Cambio de `$client` a
  `crearEjecutorSql(getRawClient())` correcto y cubierto por
  `job-diagnostico.test.ts`. Sin SQL sobre tablas `ge_*` (sólo `SELECT 1`
  de liveness). Menor: M9 (comentarios).
- `import-padron.mjs` — **RECHAZADO**, ver B1/B2/M1.

### 4. `scripts/jobs.mjs` + `jobs.migracion-legacy.test.ts`

Verificado por lectura línea a línea (sin tocar el repo, según lo pedido):
`correrJob()` (`scripts/jobs.mjs:297-314`) llama
`const { ensureSeeded } = await import('../lib/db/seed.ts'); await ensureSeeded()`
**antes** del `switch` que despacha cualquier job. El test
(`scripts/jobs.migracion-legacy.test.ts`) arranca sobre un
`PGLITE_DATA_DIR` completamente sin migrar (confirma `tablasAntes`/
`controlDrizzleAntes` vacíos, líneas 68-75) y en la primera invocación de
`correrJob('briefing-ia')` (línea 82) espera
`{ ejecutado: false, motivo: 'sin_corte_disponible' }` (línea 86). Si se
quitara la llamada a `ensureSeeded()`, `correrJobBriefingIA()` intentaría
leer `infra_situacion_corte` sobre una base sin tablas y lanzaría
`relation "infra_situacion_corte" does not exist` (`42P01`) en vez de
devolver ese objeto — el `expect(sinCorte).toEqual(...)` de la línea 86
fallaría con una excepción no capturada. El test **sí** detecta la
regresión; consistente con la verificación por mutación que ya reportó
`registro.md`.

### 5. Rutas de API y páginas (paridad de comportamiento)

Barrido completo de `orderBy` en `app/**` y `lib/infraestructura/**`
tocados en el rango: los 3 puntos que ordenan `score_riesgo` (nullable)
dentro del rango usan `nulls last` explícito; el resto de columnas
ordenadas son `notNull` o están protegidas por `isNotNull` en el `WHERE`.
Sin alias camelCase sin comillas en SQL crudo (barrido por regex, todos los
casos existentes ya citados correctamente). Paginación: conteo total y
corte de página idénticos a la versión SQLite (mismo `WHERE`, misma fórmula
de `totalPages`); el único cambio es el `ORDER BY` (M7, menor). Fechas:
todas las columnas de fecha comparadas por las rutas/páginas tocadas siguen
siendo `text` ISO 8601; el único cambio a `timestamp` nativo es en tablas de
`better-auth`, no comparadas en SQL por ninguna ruta de este alcance. Un
caso de la misma clase de bug de NULL queda sin corregir fuera del rango
(M6).

---

## Metodología

5 dispatches de N3 (`opencode run --auto -m opencode-go/deepseek-v4.1-flash`,
uno a la vez, en primer plano), cada uno acotado a un área del brief. Cada
hallazgo bloqueante y una muestra representativa de los menores fue
re-verificado por mí contra el código real (`git show`, `git diff`, lectura
directa) antes de incluirlo en este documento; no se aceptó ningún hallazgo
de N3 sin esa verificación independiente. No se corrió `podman`/Postgres
real en esta tanda (no hizo falta: los hallazgos bloqueantes se confirman
por lectura de código y diff, sin necesitar concurrencia real).
