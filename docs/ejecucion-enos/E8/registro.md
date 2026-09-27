# E8 — IA narrativa opcional y acotada (briefing asistido)

Registro único del batch (plan-ejecución §7). Worktree: `enos-e8`, rama `feat/enos-e8`, base `ebe0a9d`, luego mergeada con `feat/renovación` (E5 Centro de Situación) en `d42890a`.

## Baseline (antes de tocar código)

Ejecutado 2026-09-27 sobre `ebe0a9d`, `--maxWorkers=2`, sin secretos productivos:

| Comando | Exit | Notas |
|---|---|---|
| `pnpm test -- --maxWorkers=2` | 1 | 1503 passed / 1 failed (178/179 archivos OK). Falla preexistente: `components/infraestructura/actualizacion-form.test.tsx:721` (timeout esperando confirmación de guardado offline), no relacionada con E8. Ver `/tmp/e8-baseline-test.log`. |
| `pnpm lint` | 0 | limpio |
| `pnpm exec tsc --noEmit` | 0 | limpio |
| `pnpm build` | 0 | limpio |

## Decisiones locales (N2)

1. **Flag de UI**: el repo ya reserva `AI_BRIEFING_ENABLED` / `aiBriefingEnabled()` en `lib/infraestructura/riesgo/flags.ts` (comentario explícito: "única fuente de lectura... ninguna otra parte del repo debe leer... AI_BRIEFING_ENABLED"), expuesto ya en `/api/infraestructura/operacion/salud`. Se usa ESE flag existente para gobernar `BriefingPanel` en vez de introducir `BRIEFING_IA_ENABLED` como decía el brief original — mismo propósito, nombre ya establecido por el propio repo antes de este batch. No requirió `ask`: es una convención de nomenclatura ya fijada, no un contrato de producto.
2. **Contrato del corte y merge con E5**: E5 (Centro de Situación, tabla `infra_situacion_corte`) ya estaba mergeado en `feat/renovación` (commit `5216011`) cuando se llegó a esta parte del batch — se consultó a N1 (`ask`) y se mergeó esa rama en el worktree (`d42890a`), resolviendo conflictos en `schema.ts`/`seed.ts` conservando ambos bloques (E7b + E5 + E8). `PuertoCorteSituacion` (`lib/infraestructura/briefing-ia/puertos.ts`) expone `obtenerUltimoCorte`, `obtenerCortePorId` y `obtenerCorteAnterior` (este último agregado por indicación explícita de N1); el adaptador real (`crearPuertoCorteSituacionReal`) envuelve `lib/infraestructura/riesgo/situacion/corte.ts` de E5. Se agregó además una FK `infra_briefing.corte_id → infra_situacion_corte.id` (schema.ts y seed.ts) ya que la tabla real existe — decisión local de integridad referencial, no pedida explícitamente pero coherente con el resto del esquema (ver `infraParte.periodoId`).
3. **Fallback determinista de E4**: se reutiliza `reconstruirBriefingDesdeCorte` de `lib/infraestructura/riesgo/situacion/corte.ts` (ya reconstruye la plantilla de `generarBriefing` de E4 a partir de dos cortes persistidos) en vez de rearmar `RunBriefing` a mano, por indicación explícita de N1.
4. **Proveedor IA**: OpenRouter vía `fetch` nativo (sin SDK nuevo). `zod` ya está en el repo, se reutiliza para el esquema de salida estructurada. Tarifa fija verificada por N1: USD 0,035/M tokens de entrada, USD 0,29/M de salida.
5. **Lease/idempotencia del job**: se reutiliza `adquirirLease`/`publicarResultado` de `lib/infraestructura/riesgo/job-run.ts`, con `tipo='briefing-ia-v0'` y `claveIdempotente=<corteId>`. A diferencia de `episodios-derivados` (clave = día UTC, conocida de antemano), el `corteId` no se conoce hasta leer el último corte — `job.ts` lo resuelve ANTES de pedir el lease.
6. **Reintento ante bloqueos**: la escritura de `infra_briefing` (`repositorio.ts`) está envuelta con `conReintentoPorBloqueo` de `lib/db/reintento.ts`.
7. **Presupuesto mensual**: el chequeo compara el acumulado del mes UTC (previo a esta corrida) contra `E8_PRESUPUESTO_USD_MES`, sin proyectar el costo incremental de la llamada actual — simplificación razonable dado que una corrida cuesta ~USD 0,0001, muy por debajo de la granularidad del techo (default USD 5).
8. **Motivos de fallback persistidos**: además de los listados originalmente (`json_invalido`, `cifra_no_trazable`, `timeout`, `http_error`, `presupuesto_agotado`, `sin_api_key`), `validar.ts` puede devolver también `ref_inexistente` y `sin_frases`; se persisten tal cual en `motivo_fallback` (columna `text` libre, sin `CHECK`) porque dan más información de auditoría sin costo.
9. **UI**: `BriefingPanel` (`components/infraestructura/briefing-panel.tsx`) es un componente de presentación pura (recibe `briefing` por props, sin fetch propio), NO se montó en ninguna página — el flag `AI_BRIEFING_ENABLED` sigue apagado por defecto y la UI existente queda sin cambios. Documentado en el propio archivo dónde debe montarse (junto al resumen ejecutivo, detrás de `aiBriefingEnabled()`).

## Despachos N3

Todos los N3 se despacharon de a uno (`opencode run --auto -m opencode-go/deepseek-v4.1-flash`), con `OPENCODE_CONFIG=$HOME/.config/opencode/n3-sin-mcp.json`. A partir de la mitad del batch se agregó `XDG_DATA_HOME=$HOME/.cache/enos-n3/e8` (instrucción de N1: el `opencode.db` compartido entre N2 causaba cuelgues). Nunca se usó la herramienta Agent (spend limit de Anthropic agotado, instrucción explícita de N1 durante la ejecución).

1. **N3-Validación** (`validar.ts`, `validar.test.ts`): guardrail de trazabilidad de cifras (todo-o-nada, resistente a instrucciones embebidas en el texto). Verificado: `vitest run validar.test.ts` → 10/10.
2. **N3-Proveedor** (`proveedor-openrouter.ts`, `proveedor-openrouter.test.ts`): cliente `fetch` puro con `fetchImpl` inyectable, timeout con `AbortController`, cálculo de costo con `usage.cost` o tarifa fija de respaldo. Verificado: 8/8.
3. **N3-Persistencia** (`repositorio.ts`, `repositorio.test.ts`): idempotencia por `corteId`, suma mensual de costo. Se detectó una falla real tras el merge con E5 (la FK nueva rompía los fixtures del test, que no insertaban un `infra_situacion_corte` previo) — **corregido por mí** (N2): agregado helper `crearCorte` en el test. Verificado: 7/7.
4. **N3-Orquestador, implementación** (`generar-briefing-asistido.ts`): pipeline completo de guardrails (presupuesto → proveedor → JSON → esquema Zod → trazabilidad → fallback), despachado en 2 pasadas separadas (implementación y corpus de tests) tras un primer intento que agotó el timeout de 560s sin dejar rastro. Verificado con `tsc --noEmit` dirigido al archivo: limpio.
5. **N3-Orquestador, corpus de tests** (`generar-briefing-asistido.test.ts`): 15 tests — 13 del corpus pedido (sin corte, IA válida, corte vacío, cambios entre cortes, fuente caída, **instrucción maliciosa embebida en el texto de la IA sin efecto**, cifra no trazable, JSON no parseable, JSON fuera de esquema, timeout, http_error, presupuesto agotado, sin api key) + 1 caso extra (primer corte sin anterior) + estimación de costo mensual. Verificado: 15/15.
6. **N3-Job** (`job.ts`, `job.test.ts`): wrapper de lease que resuelve el `corteId` antes de pedir el lease (a diferencia de `episodios-derivados`, que usa el día UTC conocido de antemano). Verificado: 7/7.
7. **N3-Registro de job OPS1** (`cadencias.ts`, `scripts/jobs.mjs`, `scripts/jobs.test.ts`, `deploy/systemd/ops1/enos-ops1-briefing-ia.timer`): job `briefing-ia` registrado siguiendo el patrón de `episodios-derivados` (gestiona su propio lease, `jobs.mjs` sólo lo invoca). Timer a las `:30 UTC`, 10 minutos después de `situacion-corte` (`:20 UTC`). Verificado: `scripts/jobs.test.ts` 20/20 + `tsc --noEmit` completo limpio.
8. **N3-API** (`app/api/infraestructura/briefings/[id]/route.ts`, `.../ultimo/route.ts` + tests): ACL `staffGuard` (mismo patrón que `/api/infraestructura/operacion/salud`), `Cache-Control: private, no-store` en toda respuesta. Verificado: 9/9.
9. **BriefingPanel (implementado por N2, no por N3)**: el dispatch de N3 para `components/infraestructura/briefing-panel.tsx` agotó el timeout de 560s **dos veces consecutivas** con la configuración correcta (`XDG_DATA_HOME` incluido) — contención real de la máquina (8 procesos `opencode run` simultáneos de otros N2 en paralelo, confirmado con `ps aux`). Por regla explícita del propio brief ("implementás vos sólo si la misma tarea falla 2 veces con esta configuración; registralo con la causa"), lo implementé directamente: componente de presentación pura + 5 tests (`briefing-panel.test.tsx`). Verificado: 5/5.

## Pruebas reales fechadas

No se ejecutó ninguna llamada real a OpenRouter en este worktree (no hay `OPENROUTER_API_KEY` disponible ni se buscó). Comando exacto para que N1 corra la prueba real, fechada, cuando tenga la key:

```bash
OPENROUTER_API_KEY=<key real> \
OPENROUTER_MODEL=deepseek/deepseek-v4.1-flash \
node -e "
const { generarConOpenRouter } = require('./lib/infraestructura/briefing-ia/proveedor-openrouter.ts')
generarConOpenRouter([
  { role: 'system', content: 'Devolvé sólo el texto OK.' },
  { role: 'user', content: 'test E8' },
]).then((r) => console.log(JSON.stringify(r, null, 2)))
"
```

(Alternativa más simple: montar `BriefingPanel` detrás de `AI_BRIEFING_ENABLED=true` en un entorno con la key real, disparar el job `node scripts/jobs.mjs briefing-ia` una vez que exista al menos un corte de E5, y pegar acá la respuesta — fecha, `tokensEntrada`/`tokensSalida`/`costoUsd` reales devueltos por OpenRouter, y el texto final persistido.)

### Estimación de costo (referencia, sin llamada real)

Con la tarifa fija verificada (USD 0,035/M tokens de entrada + USD 0,29/M de salida) y una corrida típica de 800 tokens de entrada + 300 de salida:

- Costo por corrida: ≈ USD 0,000115
- Corriendo cada hora (24 × 30 = 720 corridas/mes): ≈ **USD 0,083/mes**

Muy por debajo del techo por defecto (`E8_PRESUPUESTO_USD_MES=5`). Ver el test `estimación de costo` en `generar-briefing-asistido.test.ts` para el cálculo reproducible.

## UX

- Estados cubiertos por `BriefingPanel`: sin briefing (no renderiza nada), fuente `plantilla` (leyenda "Resumen automático por reglas."), fuente `ia` con referencias por afirmación y leyenda con hora UTC del corte, y caída defensiva a texto plano si `salidaIa` viene con forma corrupta.
- **Pendiente**: walkthrough con 1–2 operadores reales (plan-ejecución §7). El componente no está montado en ninguna página todavía (a propósito, ver decisión #9) — no hay superficie operativa que recorrer hasta que N1 decida dónde y cuándo exponerlo. Queda marcado como pendiente para cuando se monte.

## Verificaciones finales

Repetidas al cerrar el batch, sobre el worktree ya mergeado con `feat/renovación`, todas envueltas en `flock $HOME/.cache/enos-n3/heavy.lock` (instrucción de N1 para evitar picos de memoria entre N2 concurrentes):

| Comando | Exit | Notas |
|---|---|---|
| `pnpm exec tsc --noEmit` | 0 | limpio |
| `pnpm lint` | 0 | limpio |
| `pnpm test -- --maxWorkers=2` | 0 | **1675 passed, 201 archivos** (incluye los ~172 tests nuevos de E8; la falla preexistente del baseline en `actualizacion-form.test.tsx` no reapareció) |
| `pnpm build` | 0 | limpio; `/api/infraestructura/briefings/[id]` y `/api/infraestructura/briefings/ultimo` aparecen en la tabla de rutas generadas |

## Gate

_(la completa N1)_

## Correcciones del gate N1

Revisión independiente sobre este batch devolvió veredicto **REJECT** con 2 hallazgos bloqueantes y 3 mayores. Corregidos todos, N2 despachando N3 de a uno en primer plano (`opencode run --auto -m opencode-go/deepseek-v4.1-flash`, `OPENCODE_CONFIG=$HOME/.config/opencode/n3-sin-mcp.json`, `XDG_DATA_HOME=$HOME/.cache/enos-n3/fix-e8`). Nunca se usó la herramienta Agent (regla explícita del brief). Cada corrección fue verificada por mí con `git diff` + tests dirigidos antes de pasar a la siguiente, nunca sólo por el exit code del dispatch.

1. **B1 — filtro léxico** (`validar.ts`, `generar-briefing-asistido.ts`, `validar.test.ts`): se agregó `contieneTerminoProhibido` sobre TODO `frase.texto` (normalizado sin tildes y en minúsculas), con `MOTIVO_TERMINO_PROHIBIDO`. Detecta `alerta(s)`, `SMN`, `Servicio Meteorológico`, `emergencia declarada`, `evacuar`/`evacuación`, y `suspensión` + `clases` en el mismo texto. `oficial` sólo se prohíbe si aparece junto a `alerta`/`aviso`/`advertencia` (evita falsos positivos genéricos, ej. "el parte oficial del día"). `PROMPT_SISTEMA` ahora prohíbe explícitamente esos términos e indica el rótulo correcto "Peligro meteorológico estimado". Tests: 4 casos positivos + 2 negativos (incluye el límite de `oficial` aislado). Verificado: `validar.test.ts` 17/17 (era 10).
2. **B2 — salida no validada nunca expuesta**: nueva columna interna `auditoria_fallback` (`schema.ts`/`seed.ts`/`repositorio.ts`) — cuando la validación de trazabilidad falla, `salidaIa` se persiste como `null` (nunca el texto crudo del modelo) y sólo se guarda un resumen de auditoría (`motivo`, `longitudSalida`, `hashSalida` con sha256, tokens, costo) en ese campo interno. Las rutas API (`app/api/infraestructura/briefings/[id]` y `.../ultimo`) ahora arman un DTO explícito (`lib/infraestructura/briefing-ia/dto.ts`, función `aDtoPublico`) que nunca serializa `parametros`/`validacion`/`auditoriaFallback`, y expone `salidaIa` sólo si `fuente === 'ia'`. Tests nuevos en ambas rutas con un briefing `fuente: 'plantilla'` simulando texto crudo remanente en la fila: se verifica que la respuesta serializada no contiene esa cadena. Verificado: 7 archivos del módulo + ambas rutas, 84 tests.
3. **M1 — costo nunca queda en null en silencio** (`proveedor-openrouter.ts`): cuando OpenRouter no devuelve `usage` (o lo devuelve incompleto), se estima tokens con una heurística de 4 caracteres/token sobre el prompt y la respuesta, y se calcula el costo con las tarifas fijas ya existentes; como respaldo final (defensa en profundidad) hay un `costoMaximoUsdPorLlamada` configurable (`E8_COSTO_MAXIMO_USD_LLAMADA`, default USD 0,01). Tests nuevos: respuesta sin `usage` en absoluto y con `usage: {}`. Verificado: 10/10.
4. **M2 — presupuesto mensual atómico entre procesos**: nueva tabla `infra_briefing_presupuesto_mes` (`schema.ts`/`seed.ts`) y módulo `lib/infraestructura/briefing-ia/presupuesto.ts` (`reservarPresupuestoMes`/`ajustarPresupuestoMes`), mismo patrón CAS con `.returning()` + `conReintentoPorBloqueo` que ya usa `job-run.ts` (evita el defecto de clase H3.1 documentado en E0). `generar-briefing-asistido.ts` reserva una estimación conservadora ANTES de llamar al modelo y ajusta al costo real en un `finally` (reemplaza el viejo select-then-compare de `sumarCostoUsdMesVigente`). Test obligatorio del hallazgo: dos reservas **concurrentes** (`Promise.all`) que juntas superan el techo → exactamente una progresa. Verificado: `presupuesto.test.ts` 5/5 + `generar-briefing-asistido.test.ts` 16/16.
5. **M3 — cuantificadores en palabras evadían la validación numérica** (`validar.ts`): se agregó `contieneCuantificadorEnPalabras`, que rechaza (mismo criterio todo-o-nada, `MOTIVO_CUANTIFICADOR_EN_PALABRAS`) cualquier cardinal en palabras (`siete`, `doce`, `mil`, etc.) o fracción (`mitad`, `tercio`, `cuarta parte`, etc.) en el texto, en vez de intentar convertir palabras a dígitos con precisión. Deliberadamente **no** se incluyó `un`/`una` sueltas en la lista prohibida: son artículos indefinidos normales del español y aparecen decenas de veces en el corpus de tests existente — prohibirlos hubiera generado falsos positivos masivos sin cerrar ningún riesgo real (la evasión relevante es "un tercio"/"la mitad", no el artículo). Tests: 4 casos positivos + 2 negativos con `un`/`una` como artículo. Verificado: incluido en los 17/17 de `validar.test.ts`.

**Dispatches que agotaron el timeout (560s) sin dejar rastro**: la implementación de M2 parte 1 (tabla + `presupuesto.ts` + su test) agotó el timeout **dos veces consecutivas** con la configuración correcta, sin escribir ningún archivo — mismo patrón de contención de máquina que ya había afectado a `BriefingPanel` en la implementación original de este batch. Por la misma regla ("2 fallos con la misma configuración → lo implemento yo"), lo escribí directamente y lo verifiqué (5/5 al primer intento). El primer dispatch de B2 (bloqueante, alcance completo en un solo prompt) también agotó el timeout sin progreso; se corrigió partiéndolo en dos dispatches más chicos (capa de storage, luego DTO/rutas), ambos exitosos.

**Verificaciones finales** (todas bajo `flock $HOME/.cache/enos-n3/heavy.lock`, sobre el worktree con las 5 correcciones aplicadas):

| Comando | Exit | Notas |
|---|---|---|
| `pnpm exec tsc --noEmit` | 0 | limpio |
| `pnpm lint` | 0 | limpio |
| `pnpm test -- --maxWorkers=2` | 0 | **1692 passed, 202 archivos** |
| `pnpm build` | 0 | limpio; ambas rutas de briefings siguen apareciendo en la tabla de rutas |

**Nota para N1**: hay un directorio `.atl/` sin trackear en este worktree (caché local del registro de skills) que **no** está en `.gitignore` en `feat/enos-e8` (sí lo está en `feat/renovación`). No lo commiteé (esta tarea no hizo ningún commit), pero si commiteás desde acá usá rutas explícitas o `git add -A && git reset .atl` para no incluirlo por accidente.

Sin commits de esta corrección (instrucción explícita del brief): el worktree queda con todos los cambios sin commitear, listo para que N1 commitee y mergee.

## Correcciones del gate N1 (segunda revisión)

Segunda revisión independiente sobre este batch devolvió un bloqueante (B1, filtro léxico evadible) y 3 menores. Corregidos todos, N2 despachando N3 de a uno en primer plano (`opencode run --auto -m opencode-go/deepseek-v4.1-flash`, `OPENCODE_CONFIG=$HOME/.config/opencode/n3-sin-mcp.json`, `XDG_DATA_HOME=$HOME/.cache/enos-n3/fix-e8b`). Nunca se usó la herramienta Agent. Cada corrección se le dio a N3 como reemplazo de texto literal exacto (nunca regex), y yo verifiqué cada una con `diff`/`grep` contra el resultado y tests dirigidos antes de avanzar a la siguiente — nunca sólo por el exit code del dispatch.

1. **B1 — filtro léxico evadible con separadores/homoglifos/término partido** (`validar.ts`, `generar-briefing-asistido.ts`): antes de buscar cualquier término prohibido, el texto se normaliza a NFKC, minúsculas, sin diacríticos y con un mapa de confusables que resuelve homoglifos cirílicos/griegos y dígitos usados como letras ("leetspeak": `0→o 1→i 3→e 4→a 5→s @→a`) a su equivalente latino. Sobre ese texto normalizado se buscan los términos en DOS formas: (a) "colapsada" (cualquier corrida de no-letras se colapsa a un espacio, conserva límites de palabra) y (b) "sólo letras" (se eliminan todos los separadores, sin dejar ni un espacio), que es la que atrapa un término partido letra por letra o palabra por palabra (`a-l-e-r-t-a`, `s m n`, `S.M.N.`). La forma (b) es deliberadamente agresiva y puede dar falsos positivos (documentado con un test explícito: "suspendió una obra vial... las clases continúan con normalidad" queda bloqueado igual); el costo se acepta a propósito porque el resultado de un falso positivo es la plantilla determinista, que es el camino seguro. Además, `generar-briefing-asistido.ts` ahora revalida con `contieneTerminoProhibido` el TEXTO FINAL UNIDO de todas las frases (no sólo cada frase por separado): una frase puede partir un término a la mitad y pasar la validación por-frase, pero el texto reconstruido no cuela el término igual. Tests nuevos: separadores/puntuación, homoglifos cirílicos y griegos mezclados con latino, leetspeak, mayúsculas/tilde incorrecta, el falso positivo documentado (`validar.test.ts`, +22 tests, 22/22), y el escenario de término partido entre dos frases válidas individualmente (`generar-briefing-asistido.test.ts`, +1 test, 17/17).
2. **M1 — código muerto en `proveedor-openrouter.ts`**: `costoMaximoUsdPorLlamada` (y su lectura desde `E8_COSTO_MAXIMO_USD_LLAMADA`) nunca se alcanzaba: la estimación de respaldo (`estimarTokensDesdeTexto`) siempre devuelve un número, así que `calcularCosto` con esos dos estimados nunca da `null` y el fallback de `costoMaximoUsdPorLlamada` era inalcanzable. Se eliminó la opción, la constante y la lectura del env var (no existe un caso real de "no se puede estimar"). `E8_COSTO_MAXIMO_USD_LLAMADA` se sigue usando, sin cambios, en `generar-briefing-asistido.ts` para `montoReservaUsd` (uso distinto y sí alcanzable). Verificado: `proveedor-openrouter.test.ts` 10/10 sin cambios (ningún test ejercitaba la rama muerta).
3. **M2 — test de concurrencia del presupuesto usaba una sola conexión**: el test existente de "dos reservas concurrentes" corría ambas contra la misma conexión memoizada por `getDb()` de este proceso. Se agregó un test nuevo con una SEGUNDA conexión física real (`@libsql/client`, mismo patrón que `job-run.test.ts`) contra el mismo `hub.sqlite`, ejecutando a mano el mismo `UPDATE` condicionado por `WHERE` que `reservarPresupuestoMesIntento`, corriendo en paralelo con `reservarPresupuestoMes` de la conexión del proceso: demuestra que sólo una de las dos reservas de 3 USD (que juntas superarían el techo de 5) procede, incluso con dos conexiones físicas distintas. Verificado: `presupuesto.test.ts` 6/6 (era 5).
4. **M3 — `auditoria_fallback` sin migración `ensure*`**: la columna sólo vivía en el `CREATE TABLE` de `infra_briefing` en `HUB_DDL`; una base que ya tenía la tabla creada antes de esa columna no la recibía (`CREATE TABLE IF NOT EXISTS` no altera tablas existentes). Se agregó `ensureBriefingAuditoriaFallbackColumn()` (mismo patrón que `ensureMovimientoIdempotencyKeyColumn`, `ALTER TABLE ADD COLUMN` idempotente), sin índice porque la columna no tiene ninguno declarado en `schema.ts`. Test nuevo en `seed.test.ts`: crea la tabla, la vuelve al estado pre-migración (`DROP COLUMN`), inserta una fila, corre la migración dos veces (idempotencia) y verifica que la fila se preserva. Verificado: `seed.test.ts` 20/20 (era 19).
5. **Menor — `.atl/` sin ignorar**: agregado `.atl/` a `.gitignore` de esta rama (ya estaba en `feat/renovación`, faltaba acá). La nota anterior de este documento sobre este mismo tema queda resuelta.

**Verificación final** (todo bajo `flock $HOME/.cache/enos-n3/heavy.lock`, sobre el worktree con las 5 correcciones de esta segunda revisión aplicadas, sin commits):

| Comando | Exit | Notas |
|---|---|---|
| `pnpm exec tsc --noEmit` | 0 | limpio |
| `pnpm lint` | 0 | limpio (sólo `lib/infraestructura/briefing-ia` + `lib/db/seed.ts`/`seed.test.ts`) |
| `npx vitest run --maxWorkers=2` | 0 | **1700 passed, 202 archivos** |
| `npx next build` | 0 | limpio; ambas rutas de briefings siguen apareciendo en la tabla de rutas |

Sin commits de esta corrección (instrucción explícita del brief): el worktree queda con todos los cambios sin commitear, listo para que N1 commitee y mergee.

## Correcciones del gate N1 (tercera revisión)

Tercera revisión independiente (`docs/ejecucion-enos/E8/revision-3.md`) devolvió veredicto **REJECT** por un único bloqueante (Tarea 3c, bug de migración real en el job programado) y una mejora menor no bloqueante (Tarea 1d, homoglifos de `l` sin mapear). N2 despachó N3 de a uno en primer plano (`opencode run --auto -m opencode-go/deepseek-v4.1-flash`, `OPENCODE_CONFIG=$HOME/.config/opencode/n3-sin-mcp.json`, `XDG_DATA_HOME=$HOME/.cache/enos-n3/fix-e8c`). Nunca se usó la herramienta Agent. Ambas correcciones fueron verificadas independientemente por N2 (no sólo por el exit code del dispatch): se restauró temporalmente el bug (comentando el fix) para confirmar que el test nuevo lo reproduce exactamente antes de restaurar, y se leyó el diff completo de cada archivo antes de darlo por bueno.

1. **Bloqueante (Tarea 3c) — el job programado nunca corre la migración de esquema** (`scripts/jobs.mjs`): la cadena `deploy/systemd/ops1/enos-ops1-briefing-ia.timer` → `scripts/jobs.mjs` → `lib/infraestructura/briefing-ia/job.ts` corre en su PROPIO proceso Node (`docker exec`) y nunca llamaba a `ensureSeeded()` de `lib/db/seed.ts`, a diferencia de las rutas API web que sí la llaman antes de tocar la tabla. Sobre una base sqlite legacy (creada antes de que `auditoria_fallback` se agregara a `infra_briefing`), esto hacía fallar CUALQUIER job programado que tocara esa tabla con `SQLITE_ERROR: table infra_briefing has no column named auditoria_fallback` — no sólo `briefing-ia`, todos los jobs comparten el mismo `correrJob` sin migrar. Corrección: `correrJob(nombre, opts)` ahora valida el nombre primero (`NOMBRES_VALIDOS`), después el flag `ENOS_JOBS_ENABLED` (`jobsActivos()`), y recién ahí llama `ensureSeeded()` UNA sola vez antes de despachar al `switch`. `ensureSeeded()` ya era idempotente y seguro de correr en concurrencia con la app (memoiza `seedPromise` a nivel de proceso, usa WAL y `conReintentoPorBloqueo` para el bloque de siembra) — es el mismo llamado que ya hacen `scripts/job-diagnostico.mjs` y `scripts/job-episodios-derivados.mjs` para sus propios jobs, así que no se introduce un patrón nuevo. No siembra usuarios en producción salvo que la tabla `user` esté vacía Y `ADMIN_EMAIL`/`ADMIN_PASSWORD` estén seteados (comportamiento preexistente de `seedFirstAdmin()`, sin cambios), y no siembra recursos de demo si la base ya tiene `niveles` poblados (guard `count() === 0` preexistente); llamarla desde el job no cambia ese comportamiento, sólo lo hace correr también en el proceso de jobs, igual que ya corre en el proceso web.
   - Test nuevo (`scripts/jobs.migracion-legacy.test.ts`, integración real sin mocks, sin red): crea un DATA_DIR temporal, corre `ensureSeeded()` para tener el esquema completo actual, retrocede `infra_briefing` a estado legacy (`ALTER TABLE ... DROP COLUMN auditoria_fallback`), inserta un `infra_situacion_corte` real, y llama `correrJob('briefing-ia')` por la MISMA vía que usa el timer en producción. `E8_PRESUPUESTO_USD_MES='0.001'` fuerza el fallback determinista a plantilla (presupuesto agotado antes de cualquier llamada al proveedor de IA), evitando red real. Verificado por N2: deshabilitando temporalmente el `ensureSeeded()` nuevo, el test falla exactamente con `SQLITE_ERROR: table infra_briefing has no column named auditoria_fallback` (mismo error de la revisión); restaurado el fix, pasa y confirma persistencia real (`SELECT corte_id FROM infra_briefing`) y la columna presente (`PRAGMA table_info`).
   - Tests actualizados en `scripts/jobs.test.ts`: mock de `ensureSeeded`, aserciones de que NO se llama con nombre inválido ni con el flag desactivado (los 9 casos existentes + `briefing-ia`), y un test nuevo que confirma `toHaveBeenCalledTimes(1)` en el camino feliz.
2. **Menor (Tarea 1d) — homoglifos de `l` sin mapear en `MAPA_CONFUSABLES`** (`validar.ts`): se agregaron `ӏ` (palochka cirílica, U+04CF; su capital U+04C0 hace fold a esta forma vía `toLowerCase()`, no hace falta entrada separada), `ı` (dotless i latina/turca, U+0131, pedido explícito de la revisión aunque visualmente se parece más a una "i" sin punto) y `|` (barra vertical, U+007C — sin mapear, las formas que limpian no-letras la eliminaban ANTES de reconstruir el término y `"a|erta"` evadía el filtro). Decisión documentada con comentario: `л` (El cirílica minúscula, U+043B) NO se mapea a propósito porque no se parece a ninguna letra latina; queda un test que documenta ese comportamiento (`"алерта"` no se detecta). `І`/`Р`/`Ρ` cirílicas y griegas mayúsculas ya quedaban cubiertas indirectamente por el fold de `toLowerCase()` hacia entradas ya existentes (`і→i`, `р/ρ→p`), no hizo falta tocarlas. Tests nuevos: palochka minúscula y capital, dotless i, pipe (los 4 con `contieneTerminoProhibido(...) === true`) y el negativo documentado de `л`. Verificado: `validar.test.ts` 26/26 (era 22).

**Verificación final** (todo bajo `flock $HOME/.cache/enos-n3/heavy.lock`, sobre el worktree con las 2 correcciones de esta tercera revisión aplicadas, sin commits):

| Comando | Exit | Notas |
|---|---|---|
| `npx tsc --noEmit` | 0 | limpio |
| `npx eslint .` | 0 | limpio |
| `npx vitest run --maxWorkers=2` | 0 | **1706 passed, 203 archivos** (incluye el test E2E nuevo) |
| `npx next build` | 0 | limpio; todas las rutas de briefings siguen apareciendo en la tabla de rutas |

Sin commits de esta corrección (instrucción explícita del brief): el worktree queda con todos los cambios sin commitear, listo para que N1 commitee y mergee.
