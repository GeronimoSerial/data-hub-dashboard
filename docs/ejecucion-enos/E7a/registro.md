# Registro de ejecución — Batch E7a (episodios derivados)

Batch E7a del plan de ejecución ENOS 2026/2027: episodios derivados, calculados
automáticamente sobre afectaciones confirmadas (partes/movimientos reales).
Ningún episodio manual: fueron eliminados del producto en E1-fix2 y este batch
no los reintroduce. Principio rector: el único ingreso manual sigue siendo el
parte que carga la escuela; este batch es puramente analítico/derivado.

## 1. Baseline (antes de tocar código)

Corrido en el worktree `enos-e7a` sobre `3bd9604` (E0, E1, E2, E3b ya
mergeados), 2026-09-26.

| Verificación | Comando | Resultado |
|---|---|---|
| Tests | `pnpm test` | ✅ 1136 passed (1136), exit 0 |
| Lint | `pnpm lint` | ✅ exit 0 |
| Types | `pnpm exec tsc --noEmit` | ✅ exit 0 |
| Build | `pnpm build` | ✅ exit 0 |

Nota: se encontró un directorio `.atl/` no trackeado y no creado por esta
tarea; no se tocó, se deja tal cual y se reporta a N1/coordinador.

## 2. Decisiones locales de N2

Registradas a medida que aparecen; cada una con el motivo. Las decisiones de
producto (unidad territorial=departamento, N=7 días, fuente=afectaciones
confirmadas, tablas, ACL, flag `EPISODIOS_DERIVADOS_ENABLED`) ya vienen fijadas
por N1 en el brief y no se repiten acá salvo detalle de implementación.

- **Fuente de "afectación confirmada"**: se usa `infra_afectacion` (parteId →
  cueAnexo vía `infra_parte`, `rigeDesde`, `retiradaEn`) en vez de
  `infra_movimiento` directamente. `infra_movimiento` sólo guarda un diff
  (`resumen` JSON) y no expone una fila por afectación individual con su
  vigencia; `infra_afectacion` es la tabla de dominio que el adapter de
  historial del motor de riesgo (E3b, `motor/adaptadores/historial.ts`) ya usa
  con el mismo criterio as-of estricto. `retiradaEn = null` ⇒ afectación
  vigente (no recuperada); no nulo ⇒ recuperada en esa fecha. Esto es
  consistente con el plan base §8 ("afectaciones/verificaciones reales, nunca
  predicciones") y no contradice ninguna decisión fija de N1.
- **`movimiento_id` en `infra_episodio_miembro`**: `infra_afectacion` no tiene
  FK directa a `infra_movimiento`. Se resuelve al recomputar buscando, para el
  `parteId` de la afectación, el `infra_movimiento` con el mismo `parteId` y
  `rigeDesde` igual al de la afectación (ambos se escriben en la misma
  transacción del POST que crea la afectación). Si no hay match exacto (dato
  legacy u orden inesperado), `movimientoId` queda `null` — la miembro sigue
  siendo válida (no es una columna NOT NULL), y se documenta como caso
  degradado esperado.
- **Reingreso de una escuela dentro del mismo episodio** (recuperada y vuelta a
  afectarse sin que el episodio del departamento llegue a cerrarse): no crea
  una segunda fila en `infra_episodio_miembro`; se reutiliza la fila existente
  y se vuelve a poner `recuperadoEn = null`, actualizando `movimientoId` al de
  la afectación más reciente. `primeraAfectacionEn` nunca se pisa (conserva la
  primera vez que esa escuela entró al episodio).
- **`escuelasAfectadas`**: cuenta de CUE-anexo distintos que fueron miembro del
  episodio en algún momento (acumulado), no sólo los vigentes al cierre.

## 3. Despachos N3

### Ola 1 (paralela, 2 N3, archivos disjuntos)

**N3-Schema** — `lib/db/schema.ts` (bloque `infraEpisodioDerivado` +
`infraEpisodioMiembro` al final), `lib/db/seed.ts` (bloque DDL `-- E7a: ...`
en `HUB_DDL`), `lib/infraestructura/episodios-derivados/flags.ts` +
`flags.test.ts` (nuevos). Brief con el DDL/Drizzle exactos a pegar (mismo
patrón que E2/E3b). Verificación: `pnpm exec vitest run
lib/infraestructura/episodios-derivados/flags.test.ts` → 3/3 passed.
Revisado por N2: `git diff` de schema.ts/seed.ts coincide carácter a carácter
con lo pedido; no tocó ningún otro archivo.

**N3-Regla** — `lib/infraestructura/episodios-derivados/regla.ts` +
`regla.test.ts` (nuevos, sin DB). Brief con el algoritmo completo en
pseudocódigo (línea de tiempo de eventos apertura/recuperación por
departamento, orden determinista, cierre por N días vs. cierre por
recuperación total, reingreso sin duplicar fila) escrito por N2, para que N3
sólo transcriba a TypeScript y agregue tests. Verificación: `pnpm exec vitest
run lib/infraestructura/episodios-derivados/regla.test.ts` → 10/10 passed
(los 10 casos de aceptación: apertura, extensión, cierre por N días, cierre
por recuperación, reapertura como episodio nuevo, dos departamentos
simultáneos, datos fuera de orden, as-of sin fuga, reingreso dentro del mismo
episodio, idempotencia estructural). Revisado por N2 leyendo el archivo
completo: la implementación es fiel al algoritmo especificado, no hay
`new Date()` implícito, orden de eventos determinista con desempate por
`cueAnexo`.

Ambos N3 corrieron en paralelo (Bash con `&`+`wait`, foreground,
`OPENCODE_CONFIG=n3-sin-mcp.json`, modelo `deepseek-v4.1-flash`). `git status`
tras la ola confirmó archivos disjuntos, sin pisarse.

### Ola 2 (paralela, 2 N3, archivos disjuntos)

**N3-Job** — `lib/infraestructura/episodios-derivados/recompute.ts` (traduce
`infra_afectacion`+`infra_parte`+`infra_geo_profile`+`infra_movimiento` al
input puro de la regla, resuelve `movimientoId` por `(parteId, rigeDesde)`
exacto en un Map en memoria, excluye escuelas sin perfil geográfico válido, y
reemplaza atómicamente — un solo `db.transaction` con delete+insert — el
conjunto completo de `EPISODIOS_REGLA_VERSION`), `recompute.test.ts` (DB
temporal vía `DATA_DIR` + `mkdtemp`, igual patrón que
`scripts/job-diagnostico.test.ts`), `lib/infraestructura/episodios-derivados/job.ts`
(wrapper de lease sobre `infra_job_run`, clave idempotente = día UTC,
`TIPO_JOB='episodios-derivados-v0'`), `scripts/job-episodios-derivados.mjs`
(entrypoint calcado de `scripts/job-diagnostico.mjs`, mismo loader ESM para
imports `@/`). Verificación: `pnpm exec vitest run
lib/infraestructura/episodios-derivados/recompute.test.ts` → incluido en los
20/20 passed reportados abajo. Revisado por N2 leyendo `recompute.ts`
completo: transacción única para el reemplazo atómico, exclusión geográfica
correcta, resolución de `movimientoId` en batch (sin N+1 queries).

**N3-API** — `app/api/infraestructura/episodios-derivados/route.ts` (GET
lista, filtros `estado`/`departamento`/`desde`/`hasta` + paginación, ACL
`verificarAccesoLectura()` antes de `ensureSeeded()`, `Cache-Control: private,
no-store`) y `[id]/route.ts` (GET detalle con miembros agregados, 404 llano
si no existe), con sus `route.test.ts`. Copiado del patrón exacto de
`app/api/infraestructura/riesgo/route.ts`. Verificación: `pnpm exec vitest run
recompute.test.ts route.test.ts [id]/route.test.ts` → **3 archivos, 20/20
tests passed** en conjunto. Revisado por N2: orden ACL→ensureSeeded correcto,
headers `no-store` presentes en toda respuesta, sin datos nominales (sólo
`cueAnexo`, que es código de establecimiento, no dato de persona).

Ambos N3 corrieron en paralelo, mismo procedimiento que la ola 1. `git status`
confirmó archivos disjuntos.

### Ola 3 (único N3): UI

`app/(hub)/admin/episodios-derivados/page.tsx` (lista) y `[id]/page.tsx`
(detalle), copiando el patrón exacto de `admin/riesgo/page.tsx` (gate de
sesión → chequeo de flag ANTES de `ensureSeeded()` → query directa). Sin
ningún botón/form/action de crear/cerrar/reabrir episodio (verificado con
`rg -ni "crear|cerrar episodio|reabrir|<form|<button"` sobre el árbol nuevo:
sin resultados). Revisado por N2 con lectura completa de ambos archivos.

### Revisión independiente (N3 DISTINTO de los implementadores, sólo reporte)

Repasó los 7 archivos/áreas pedidas (casos geográficos, outages/formato de
fecha, idempotencia/atomicidad, performance/N+1, ACL, determinismo/orden,
flag apagado) y reportó 9 hallazgos, 0 bloqueantes, 2 mayores, 5 menores, 2
cosméticos. Acción de N2 por hallazgo:

| # | Severidad | Hallazgo | Acción de N2 |
|---|---|---|---|
| 1 | **Mayor** | La lista (API y UI admin) no filtraba por `reglaVersion`: al publicarse una futura `episodios-v0.2`, las filas de `episodios-v0.1` no se borran (el recompute sólo reemplaza SU propia versión) y quedarían mezcladas en la lista. | **Corregido** (N3 de corrección dedicado): se agregó `eq(infraEpisodioDerivado.reglaVersion, EPISODIOS_REGLA_VERSION)` como condición obligatoria (no opcional) en la query de lista de `route.ts` y de `page.tsx`. El detalle por id no lo necesitaba (búsqueda por id ya es inequívoca). Test de regresión agregado en `route.test.ts` sembrando una fila de una versión vieja inventada y verificando que nunca aparece en la lista. |
| 2 | Mayor | La geografía se resuelve con `infra_geo_profile` ACTUAL, sin versionar por fecha: un recomputo histórico (`asOf` en el pasado) después de que una escuela cambió de departamento reasignaría afectaciones viejas al departamento nuevo. | **No corregido, documentado como limitación conocida** (ver §5 UX/pendientes). El mismo patrón ya existe en el motor de riesgo v0 (E3b), que también usa el perfil geográfico actual sin versionar por fecha — no es una regresión introducida por E7a, es una limitación estructural compartida de `infra_geo_profile` (no tiene historial). Corregirla requeriría versionar el perfil geográfico por fecha, fuera del alcance de este batch. |
| 3 | Menor (N2 lo reclasifica como corrección real, no cosmética) | El cierre por N días sólo se evaluaba antes de una 'apertura' o al final contra `asOf`, nunca antes de una 'recuperación'. Caso real: afectación día 0, recuperación día 10, `asOf` día 30, N=7 → cerraba por "recuperación total" en el día 10 en vez de por timeout en el día 7 (el timeout ya había vencido antes de la recuperación, y la regla dice que gana la condición más temprana). | **Corregido** (N3 de corrección dedicado): el chequeo de timeout ahora se evalúa antes de CUALQUIER evento (apertura o recuperación), no sólo antes de apertura. Test de regresión agregado reproduciendo el caso exacto (11avo test de `regla.test.ts`). Los 10 tests anteriores siguen pasando sin cambios de comportamiento (el test de "cierre por recuperación" existente sigue siendo válido porque en ese caso la recuperación SÍ ocurre antes de que venza el timeout). |
| 4 | Menor | La lista de la API ordena/filtra `inicioEn` por comparación de string asumiendo sufijo `Z`, pero el schema de partes acepta también offsets (`+03:00`). | **No corregido, documentado como limitación conocida**: mismo criterio que el resto de las rutas de listado del repo (ej. `infra_risk_snapshot`, `infra_movimiento`), que también comparan/ordenan fechas ISO como string asumiendo UTC. No es una regresión introducida por este batch. |
| 5 | Menor | El lease del job (10 min) no se renueva durante el recompute, y `job.ts` no verifica el booleano de retorno de `publicarResultado` (fencing). | **No corregido**: medido en la prueba real (ver §4), el recompute completo tarda 15ms sobre datos reales — muy por debajo de cualquier riesgo de vencimiento de lease. Se deja documentado para si el volumen de `infra_afectacion` creciera órdenes de magnitud. |
| 6 | Menor | La ACL usada (`verificarAccesoLectura`) es la ACL de lectura genérica de staff del recurso `/mapas/infraestructura`, no una ACL más estricta. | **No es una desviación**: es la MISMA función que ya usan las APIs de E2/E3b, documentadas igual como "ACL de staff" en sus propios registros. Consistente con el resto del repo. |
| 7 | Menor | `getSessionUser()` se llama antes del chequeo de flag en las páginas admin. | **No es una desviación**: es el mismo patrón exacto de `admin/riesgo/page.tsx` (gate de sesión primero, flag después). La garantía real ("con el flag apagado no se toca `infra_episodio_*` ni se llama `ensureSeeded()`") sí se cumple. |
| 8 | Cosmético | Empate de eventos con mismo `(t, tipo, cueAnexo)` cae al orden de filas de SQLite (no especificado). | No corregido: sólo aplica a afectaciones duplicadas del mismo CUE con timestamp idéntico, caso no observado en datos reales; cada departamento se procesa de forma independiente (confirmado). |
| 9 | Cosmético | El filtro `departamento` es case-sensitive/exacto. | No corregido: mismo criterio ya usado por `app/api/infraestructura/riesgo/route.ts` (comentario idéntico: "el dato viene normalizado en mayúsculas... acá la comparación es exacta"). |

Verificación tras las 2 correcciones: `pnpm exec vitest run
lib/infraestructura/episodios-derivados/regla.test.ts
"app/api/infraestructura/episodios-derivados/route.test.ts"` → **23/23
passed** (11 regla + 12 API lista). Repetidas las 4 verificaciones globales
completas después de las correcciones (ver §6).

## 4. Pruebas reales fechadas

Ejecutadas por N2 el **2026-09-26/27**, contra la base de desarrollo REAL de
este worktree (`.data/hub.sqlite` + `.data/ge.sqlite`, misma base usada por
E2/E3b, 2005 registros de `public/data/localizaciones.json`). Script ad-hoc
`medir-episodios.mjs` (mismo patrón de loader ESM que
`scripts/job-diagnostico.mjs`), NO commiteado (efímero, igual criterio que
`medir-riesgo.mjs` de E3b — no quedó en el repo).

No hay partes reales cargados todavía en este worktree (dev DB recién
sembrada), así que se sembraron a mano 3 afectaciones mínimas sobre escuelas
REALES con perfil geográfico REAL (no localizaciones inventadas), para poder
ejercitar el job contra geografía real. Al terminar, se revirtieron esas 3
filas sintéticas de `infra_parte`/`infra_afectacion`/`infra_movimiento` y los
episodios que generaron, dejando la DB de desarrollo en su estado real
(sólo quedan los 2005 perfiles geográficos calculados, reutilizables por
otros batches).

**1. Geo-perfiles reales sobre el padrón real:**
```json
{"procesados":2005,"conPerfilValido":2001,"excluidos":4,"perfilVersion":"geo-perfil-v1","duracionMs":317}
```
(idénticos a los números de la corrida real de E3b, confirmando que el
padrón/perfil geográfico no cambió entre batches).

**2. Siembra de 3 afectaciones sobre escuelas reales con perfil válido**
(departamentos reales: CAPITAL, GENERAL PAZ, SAN LUIS DEL PALMAR).

**3. Job real (`correrJobEpisodiosDerivados`) contra esos datos:**
```json
{"ejecutado":true,"episodiosCreados":3,"escuelasExcluidas":0,"departamentosProcesados":3,"duracionMs":15}
```
15ms de duración total del recompute (lease de 10 minutos, sin riesgo de
vencimiento a este volumen — ver hallazgo #5 de la revisión).

**4. Estado final verificado directamente en la DB:** 3 episodios `abierto`,
uno por departamento, cada uno con 1 escuela afectada — coincide
exactamente con lo sembrado.

**5. Idempotencia del job (lease/día UTC) verificada con una segunda
invocación el mismo día:**
```json
{"ejecutado":false,"motivo":"ya_completado"}
```

**6. Idempotencia estructural del recompute (llamado directo, mismo `asOf`,
dos veces seguidas) verificada contra la DB real:**
```json
{"r1":{"reglaVersion":"episodios-v0.1","episodiosCreados":3,...},"r2":{"reglaVersion":"episodios-v0.1","episodiosCreados":3,...}}
```
Conteo final tras los 2 recomputos consecutivos: **3 episodios** (no 6): el
reemplazo atómico por versión funciona también contra la base real, no sólo
en los fixtures de test.

## 5. UX

Estado: UI mínima de solo lectura (`/admin/episodios-derivados` lista +
detalle), copiando el patrón visual/de interacción ya validado de
`/admin/riesgo` (E3b): tabla server-rendered, filtros por querystring,
paginación por link, estilos con variables CSS del sistema de diseño
(`var(--ink)`, `var(--line)`, `var(--fill)`). Sin ningún control de
creación/cierre/reapertura manual (verificado explícitamente, ver Ola 3
arriba). Detrás de `EPISODIOS_DERIVADOS_ENABLED` (default apagado); con el
flag apagado no se toca la tabla en absoluto.

**Walkthrough con operadores reales:** **PENDIENTE**. No hubo operadores
disponibles durante esta ejecución del batch. Queda documentado el
recorrido guiado reproducible para cuando estén disponibles:

1. Activar `EPISODIOS_DERIVADOS_ENABLED=true` en el entorno.
2. Iniciar sesión con un usuario con rol staff (mismo gate que
   `/admin/riesgo`).
3. Ir a `/admin/episodios-derivados`: confirmar que la lista muestra
   episodios por departamento, con filtro por estado (abierto/cerrado) y
   paginación.
4. Entrar al detalle de un episodio: confirmar que se ven parámetros de la
   regla, fechas de inicio/fin, y la tabla de escuelas miembro con su
   fecha de primera afectación y recuperación.
5. Confirmar explícitamente con el operador que NO hay forma de crear,
   cerrar ni reabrir un episodio desde la UI — es el punto central del
   principio rector del batch (único ingreso manual = el parte).
6. Recoger feedback sobre claridad del copy y utilidad del detalle para su
   trabajo diario, sin implicar ninguna decisión automática.

Esta gestión queda condicionada a que N1/producto coordine la disponibilidad
de operadores reales, fuera del alcance de lo que N2/N3 pueden decidir.

## 6. Verificaciones finales

Repetidas las 4 verificaciones globales tras integrar las 3 olas y aplicar
las 2 correcciones de la revisión independiente:

| Verificación | Comando | Resultado |
|---|---|---|
| Tests | `pnpm test` | ✅ **1171 passed** (1171) — baseline 1136 + 35 nuevos (13 ola 1 + 20 ola 2 + 2 de las correcciones) |
| Lint | `pnpm lint` | ✅ exit 0 |
| Types | `pnpm exec tsc --noEmit` | ✅ exit 0 |
| Build | `pnpm build` | ✅ exit 0 |

`git status` final: sólo los archivos de este batch tocados/creados
(`lib/db/schema.ts`, `lib/db/seed.ts` modificados; el resto son archivos
nuevos bajo `lib/infraestructura/episodios-derivados/`,
`app/api/infraestructura/episodios-derivados/`,
`app/(hub)/admin/episodios-derivados/`, `scripts/job-episodios-derivados.mjs`
y este `docs/ejecucion-enos/E7a/`). El directorio `.atl/` no trackeado sigue
presente, no fue tocado, no fue creado por esta tarea — reportado a N1.
Ningún dato sintético de la prueba real quedó en `.data/hub.sqlite` (revertido
explícitamente); sólo quedan los 2005 perfiles geográficos reales,
reutilizables por otros batches.

Pendiente para N1: revisar, commitear y mergear. La sección Gate (§7) queda
para que N1 la complete.

## 7. Gate

_(Esta sección la completa N1. No editar desde N2/N3.)_

## Gate (N1)

**Decisión: aceptado con follow-up (2026-09-26).**

- Verificaciones globales repetidas por N1: `pnpm test` 150 archivos / 1171 tests OK; `pnpm lint`, `pnpm exec tsc --noEmit` y `pnpm build` con exit 0.
- Revisión independiente: regla pura y determinista, carrera timeout/recuperación resuelta, reapertura como episodio nuevo, departamentos independientes, cálculo de 7 días en milisegundos UTC, reemplazo atómico por versión (verificado 3→3 en doble recómputo real), DDL aditivo sin índices sobre columnas de migraciones posteriores, sin columna de episodio en `infra_movimiento`, ACL y ninguna vía de creación o cierre manual.
- Follow-up obligatorio antes de exponer un `asOf` histórico (replay de E7): el filtro as-of usa sólo `rigeDesde`; hay que sumar el momento de registro (`creadaEn` del parte o de la afectación) y filtrar `creadaEn <= asOf`, con test de parte registrado tarde.
- Parámetros por defecto (departamento, cierre a 7 días) quedan configurables y versionados; el usuario puede cambiarlos.
- Pendiente que se arrastra: walkthrough con operadores reales.
