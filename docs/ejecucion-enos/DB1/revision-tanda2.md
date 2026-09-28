# DB1 — Revisión independiente, Tanda 2 (concurrencia y reintentos)

Rama `feat/enos-db1-rev2`, commit `39ee089`. Alcance: F3 completo (lease de
job-run, presupuesto E8, cupo Open-Meteo, tests de concurrencia real, mezcla
de cliente crudo dentro de transacciones). Revisión de sólo lectura: ningún
archivo de código fue modificado en este dispatch.

Contexto: el N2 anterior de esta revisión fue cortado por un reinicio de la
máquina sin llegar a escribir nada. Este documento arranca de cero.

Metodología: lectura directa del código por N2 (no sólo el reporte de un N3),
más un N3 (`opencode run --auto`, `deepseek-v4.1-flash`) para contraste
independiente en los puntos 1 y 2. A partir del punto 3, el proveedor de N3
empezó a colgarse sin devolver salida (tres intentos consecutivos, 150–200s
cada uno, 0 bytes) — degradación transitoria, no un problema del código
revisado. Se documenta como limitación de la corrida: los puntos 3, 4 y 6 se
verificaron con lectura directa de N2 únicamente, sin el segundo par de ojos
de N3. El punto 5 (tests reales) se ejecutó directamente por N2, igual que en
el cierre de F2/F3 según `registro.md`.

## Veredicto: **APPROVE**

Sin bloqueantes. Un hallazgo menor (aislamiento de tests de concurrencia
compartiendo la misma base Postgres) y una observación de diseño ya conocida
y documentada (ausencia de sweeper de leases zombie).

---

## 1. `lib/db/reintento.ts` — códigos de reintento

**OK.** `CODIGOS_LOCK_POSTGRES = new Set(['40001', '40P01', '55P03'])`
(línea 34), más `SQLITE_BUSY`/`"database is locked"` como fallback por
código y por mensaje (líneas 36-48). No incluye `23505` (unique_violation)
ni ningún otro código de negocio — un `23505` cae directo al `throw err`
final (línea 98).

Reintenta el bloque **completo** pasado a `conReintentoPorBloqueo`, nunca una
parte: el contrato documentado en el propio archivo (líneas 25-30) exige que
lo envuelto sea re-ejecutable desde cero o esté dentro de una transacción que
se revierte entera. Verificado en los 3 call sites de negocio (`job-run.ts`,
`presupuesto.ts`, `cupo-om.ts`): todos re-leen el estado fresco en cada
intento o envuelven una `db.transaction` completa.

Backoff con jitter y límite: `maxIntentos` default 8 (25 en `cupo-om.ts` para
tolerar más escritores concurrentes en test), backoff `15 + rand(0,35)*(intento+1)`
ms por defecto; el último intento fallido relanza en vez de reintentar
indefinidamente (línea 94: `intento < maxIntentos - 1`).

Confirmado de forma independiente por N3: mismo veredicto, mismas líneas.

## 2. Lease de `job-run.ts`

**OK**, con una observación de diseño (no bloqueante).

- **Adquisición**: `INSERT ... ON CONFLICT DO NOTHING RETURNING` (líneas
  57-78) para el caso "clave nueva". Si no inserta, lee la fila (líneas
  87-92) sólo para decidir el WHERE del UPDATE siguiente, nunca para actuar
  directamente sobre ese read.
- **Recuperación de lease vencido**: `UPDATE ... WHERE id = ? AND (estado =
  'fallido' OR lease_expira_en <= ahora) RETURNING` (líneas 109-127) —
  condición atómica en el WHERE del propio UPDATE, no un select-then-act. Si
  dos procesos llegan al mismo tiempo, sólo uno obtiene fila en el
  `.returning()`; el otro ve vacío y devuelve `en_progreso_vigente`. Con dos
  procesos compitiendo por la misma `(tipo, claveIdempotente)`, exactamente
  uno adquiere.
- **Fencing en `publicarResultado`**: el UPDATE exige `estado = 'en_progreso'
  AND lease_owner = <el que reservó>` (líneas 214-219). Si otro proceso ya
  recuperó el lease (nuevo `leaseOwner`), este UPDATE no matchea y devuelve
  `false` sin pisar el trabajo ajeno.
- **Filas huérfanas**: si el proceso muere entre `adquirirLease` y
  `publicarResultado`, la fila queda `en_progreso` con `finalizadoEn: null`
  indefinidamente — no hay sweeper en background. No es una fila huérfana
  *permanente*: en cuanto el `leaseExpiraEn` vence, la próxima invocación con
  la misma clave la recupera vía el UPDATE condicionado de arriba. Es
  recuperación perezosa (lazy), consistente con lo que ya documenta
  `registro.md` (hallazgo H3.1, patrón CAS) — no es un defecto de esta
  revisión, es una característica del diseño: no hay garantía de reintento
  automático si nadie vuelve a invocar esa clave, sólo de que **si** alguien
  la invoca, no habrá doble ejecución ni pisado de datos.

Confirmado de forma independiente por N3, mismo veredicto (incluida la misma
observación sobre el sweeper).

## 3. Presupuesto E8 (`lib/infraestructura/briefing-ia/presupuesto.ts`)

**OK.** No hay ningún `SELECT` seguido de `UPDATE` sin condición.

- Mes nuevo: `INSERT ... ON CONFLICT DO NOTHING RETURNING` (líneas 49-53).
  Si la reserva sola ya excede el techo, se hace `DELETE` explícito de la
  fila recién creada (línea 60) — correcto, porque nadie más pudo sumar nada
  a una fila que no existía hasta ese INSERT.
- Mes existente: el UPDATE de acumulación lleva la condición en el propio
  WHERE — `sql`${mes} = ${mes} AND ${acumuladoUsd} + ${monto} <= ${techo}``
  (líneas 75-77), evaluada por Postgres en el momento del UPDATE, no contra
  un valor leído antes. Bajo READ COMMITTED, dos conexiones reservando al
  mismo tiempo no pueden ambas pasar el chequeo: la segunda ve el
  `acumuladoUsd` ya incrementado por la primera (cada UPDATE toma el row lock
  y re-evalúa el WHERE con el valor commiteado), así que no hay doble gasto
  al superar el techo.
- `ajustarPresupuestoMes` (líneas 92-106) no necesita condición: sólo corrige
  el número con el delta real tras una reserva que ya pasó el CAS.

No pude contrastar este punto con N3 (el proveedor dejó de responder en tres
intentos consecutivos); queda verificado únicamente por lectura directa.

## 4. Cupo de Open-Meteo (`lib/infraestructura/riesgo/providers/cupo-om.ts`)

**OK.**

- `intentarReservarTodasLasVentanas` (líneas 250-295) reserva las 4 ventanas
  dentro de una única `db.transaction`, todo-o-nada: cada `UPDATE` por
  ventana lleva `pesoAcumulado + peso <= limite` en el WHERE (línea 282), y
  si cualquier ventana no matchea se lanza `CupoAgotadoEnVentana`, que
  revierte la transacción completa — ninguna ventana queda incrementada a
  medias.
- Techos duros: `TECHO_GRATIS` (líneas 91-96) fija 600/min, 5.000/hora,
  10.000/día, 300.000/mes. `limiteVentana` (líneas 114-144) sólo permite
  **bajar** el techo vía el env base (clamp explícito con warning si se
  intenta subir, línea 134-141); superarlo requiere `apiKeyPresente` **Y**
  el env `_PAGO` de esa ventana con un valor numérico > 0 (líneas 119-124).
  Sin ambas condiciones, no hay forma de configurar un valor por encima del
  techo gratuito.
- El cupo es atómico entre procesos: cada `UPDATE` condicionado dentro de la
  `tx` evalúa el valor vigente en la base al momento de ejecutarse (mismo
  patrón CAS que `job-run.ts`), no un read previo del proceso.

Tampoco pude contrastarlo con N3 por la misma degradación del proveedor;
verificado por lectura directa.

## 5. Tests de concurrencia real contra Postgres (podman)

Corrido por N2, contenedor propio, borrado al cerrar:

```
podman run -d --name enos_db1rev2_pg -e POSTGRES_USER=enos_test \
  -e POSTGRES_PASSWORD=enos_test_local -e POSTGRES_DB=enos_db1_rev2 \
  -p 55434:5432 docker.io/library/postgres:16
```

- **Suite completa** (`DATABASE_URL_TEST` seteada, `--maxWorkers=2`):
  **219/219 archivos, 1936/1936 tests, verde.** Coincide exactamente con lo
  registrado en `registro.md` al cierre de F3.
- **Los 4 archivos de concurrencia real** (`job-run.test.ts`,
  `presupuesto.test.ts`, `cupo-om.test.ts`, `reintento.test.ts`) corridos
  aislados 5 veces seguidas: **4 corridas en verde, 1 con un fallo**.

### Hallazgo menor: carrera de migración entre test files concurrentes

El único fallo observado (de 5 corridas) fue:

```
lib/infraestructura/riesgo/providers/cupo-om.test.ts >
  "dos conexiones independientes compiten por el mismo bucket/ventana..."
Error: Failed query: CREATE TABLE "account" (...)
Caused by: duplicate key value violates unique constraint
  "pg_type_typname_nsp_index"
  Key (typname, typnamespace)=(account, 2200) already exists.
```

No es un bug en el código revisado (lease, presupuesto o cupo): es una
carrera en `migrarDb()` (`lib/db/index.ts:104`, `drizzle-orm/node-postgres/migrator`)
cuando **dos test files corriendo en workers distintos** apuntan a la
**misma** base física de `DATABASE_URL_TEST` y ambos ejecutan `migrate()`
casi simultáneamente contra el mismo schema `public` — el `CREATE TABLE`
choca por el OID interno de `pg_type`, no por un `IF NOT EXISTS` faltante en
el DDL del propio proyecto. Con `--maxWorkers=2` y varios archivos de test
gateados por `DATABASE_URL_TEST` corriendo en paralelo contra el mismo
Postgres compartido, esta carrera de migración es intermitente (≈1 de cada
5 corridas en esta muestra). Reproducido y luego confirmado como flaky (no
determinístico): 5 corridas adicionales sin `cupo-om.test.ts` en paralelo con
otro archivo migrando la misma base salieron todas en verde.

No bloquea el approve porque:
- No afecta ningún camino de producción (sólo el *setup* de test, y sólo
  cuando dos suites de test comparten la misma base física real en
  paralelo — el uso normal en CI con un contenedor por job, o `--maxWorkers=1`
  contra esa base, no lo dispara).
- El propio `registro.md` ya reporta la suite completa en verde de punta a
  punta corriendo contra el mismo podman, lo cual es consistente con que la
  probabilidad de colisión exacta de migración entre estos 3-4 archivos
  puntuales es baja, no cero.

Recomendación (no bloqueante, para un batch futuro si se corre esto en CI de
forma rutinaria): serializar la migración inicial contra `DATABASE_URL_TEST`
compartida con un lock (advisory lock de Postgres o ejecutar `migrate()` una
sola vez antes de la suite en vez de una vez por archivo de test), en vez de
dejar que cada archivo gateado por Postgres real llame a `migrarDb()` de
forma independiente.

## 6. Transacciones: `db.transaction` sin mezclar cliente crudo

**OK.** Grep de los 13 call sites de `db.transaction(` en código de
producción (excluidos tests) contra los 26 call sites de
`crearEjecutorSql(getRawClient())`/`getRawClient()`:

- **`app/api/problematicas/parte/route.ts`** (el caso que causó el deadlock
  real de F2, según `registro.md`): el `client` externo
  (`crearEjecutorSql(getRawClient())`, línea 384) sólo se usa ANTES de
  `db.transaction()` (línea 577) — `asegurarGeAdjuntada(client)`,
  `getCorteVigente(client)` (líneas 397-398). Dentro del callback de la
  transacción, todas las lecturas GE pasan por `clienteGeEnTx =
  crearEjecutorSql(tx)` (línea 585, comentario explícito en líneas 578-584
  documentando por qué), usado en `obtenerAfectacionesYServicio` (línea 628,
  768) y `buscarAfectacionEquivalente` (línea 646). Ningún uso del cliente
  externo dentro del callback. Correcto.
- **`lib/infraestructura/riesgo/geo-perfil.ts`**: el `client` crudo
  (línea 53) se usa para un único `SELECT` que se materializa en el array
  `filas` (líneas 62-65) **antes** de `conReintentoPorBloqueo(() =>
  db.transaction(...))` (línea 74). Dentro del callback sólo se itera sobre
  `filas` (ya en memoria) y se usa `tx.insert(...)`. Sin mezcla.
- **`lib/db/seed.ts`**: el `ejecutor` crudo (línea 125, los `DROP TABLE IF
  EXISTS`) corre secuencialmente antes de la `db.transaction` de siembra
  (línea 155), nunca dentro de ella.
- **`lib/infraestructura/riesgo/providers/cupo-om.ts`**: la única
  `db.transaction` (línea 259) no usa `getRawClient`/`$client` en ningún
  punto del callback — confirmado por grep, sin coincidencias en ese
  archivo.
- Los demás 8 call sites de `db.transaction` (`recursos.ts` ×3, `rio-asociacion.ts`,
  `sync-ensemble.ts`, `sync-imerg.ts`, `sync-seasonal.ts`,
  `sync-pronostico-caudal.ts`, `calcular-riesgo.ts`,
  `episodios-derivados/recompute.ts`) no aparecen en el grep de
  `getRawClient()`/`$client` en absoluto — no tienen cliente crudo que
  mezclar.

No queda ningún caso de la clase de bug que causó el deadlock de F2. El fix
documentado en `registro.md` está aplicado consistentemente en todo el
repo, no sólo en el archivo donde se encontró originalmente.

---

## Resumen de verificación

- `pnpm vitest run --maxWorkers=2` con `DATABASE_URL_TEST` contra podman
  local (contenedor propio, puerto 55434, borrado al cerrar): **219/219
  archivos, 1936/1936 tests, verde.**
- Re-corrida aislada de los 4 archivos de concurrencia ×5: 4 verdes, 1 fallo
  (carrera de migración documentada arriba, no reproducible de forma
  determinística, no relacionada con la lógica revisada).
- Grep exhaustivo de `db.transaction(` × `getRawClient()`/`$client` en todo
  el código de producción: sin mezcla de cliente crudo dentro de ninguna
  transacción activa.
- N3 (`opencode-go/deepseek-v4.1-flash`) contrastó de forma independiente
  los puntos 1 y 2 con el mismo veredicto que N2; dejó de responder (colgado,
  0 salida, 3 intentos) para los puntos 3, 4 y 6, que quedan verificados
  únicamente por N2.

## Bloqueantes

Ninguno.

## Menores

1. Carrera de migración intermitente cuando múltiples archivos de test
   gateados por `DATABASE_URL_TEST` corren en paralelo contra la MISMA base
   física real (ver punto 5). No afecta producción. Recomendado para un
   batch futuro si esta suite pasa a correr rutinariamente contra Postgres
   real en CI.
2. Sin sweeper de leases zombie en `job-run.ts` (ver punto 2): un job que
   muere entre adquirir y publicar queda `en_progreso` hasta que algo vuelva
   a invocar esa misma clave. Es una característica del diseño documentada
   en `registro.md`, no un defecto nuevo — se deja registrado acá porque el
   brief pedía revisar explícitamente filas huérfanas.
