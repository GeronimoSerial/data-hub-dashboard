# Registro OPS1 — Programación automática y continua de todos los jobs

Batch OPS1 del plan de ejecución ENOS 2026/2027. N2: sonnet, líder de batch.
Commit de partida: `1665124` en `feat/renovación` (E0, E1 sin episodios, E2, E3a,
E3b, E7a y el arreglo de migración ya mergeados). Worktree propio, rama
`feat/enos-ops1`. Este registro lo redacta N2; N1 escribe la sección **Gate**
por separado (no se creó abajo).

Principio rector: el único ingreso manual del sistema sigue siendo el parte
que carga la escuela. Este batch no agrega carga ni operación manual para
operadores, supervisores ni directores — sólo automatiza jobs que antes había
que disparar a mano.

## Baseline (antes de tocar código)

Todo verde, sin partir de nada roto:

| Verificación | Resultado |
|---|---|
| `pnpm test` | 160 archivos, 1312 tests, exit 0 |
| `pnpm lint` | exit 0, sin warnings |
| `pnpm exec tsc --noEmit` | exit 0 |
| `pnpm build` | exit 0 |

## Decisiones locales

1. **No se agregaron tablas nuevas** a `lib/db/schema.ts` ni a `HUB_DDL` de
   `lib/db/seed.ts`. La salud/cadencia se calcula en código a partir de
   `infra_job_run` y `hazard_source_health`, que ya existen (E0/E2). No hay
   bloque `// OPS1: ...` en esos archivos porque no hizo falta — se documenta
   acá para que quede explícito que la ausencia es deliberada, no un olvido.
2. **`importar-geo-static` (job manual trimestral) NO se registró en
   `scripts/jobs.mjs`.** El batch G1 (capas estáticas), que define ese job,
   todavía no está mergeado en este worktree (confirmado: no existe ningún
   archivo `*geo-static*` ni función `importarGeoStatic` en el repo al momento
   de este batch). Registrar un nombre de job que no existe habría sido
   inventar trabajo hipotético. Cuando G1 mergee, el seguimiento es: agregar un
   `case 'importar-geo-static':` al switch de `correrJob` en
   `scripts/jobs.mjs` (import diferido de la función real de G1) y una entrada
   en `CADENCIAS` de `lib/infraestructura/riesgo/cadencias.ts` con
   `minutos: 0` (manual/trimestral) — no se necesita ningún otro cambio de
   arquitectura, el runner y el runbook ya están preparados para un job más.
3. **Mapeo `tipo` interno de `infra_job_run` → nombre CLI.** Cada job define su
   propio `TIPO_JOB` interno para `infra_job_run` (p. ej.
   `sync-hazard-pronostico-caudal`, `calcular-riesgo-v0`,
   `episodios-derivados-v0`), que NO coincide con el nombre por el que se
   invoca desde `scripts/jobs.mjs` (`sync-pronostico-caudal`,
   `calcular-riesgo`, `episodios-derivados`). Esto lo encontró la revisión
   adversarial (ver más abajo) — se resolvió centralizando la traducción en
   `TIPO_INFRA_JOB_RUN_A_NOMBRE_JOB` (`lib/infraestructura/riesgo/cadencias.ts`),
   fuente única usada tanto por la UI de salud como por cualquier futuro
   consumidor.
4. **Gating de flags a nivel del runner, no de cada job.** Ninguno de los 8
   jobs existentes chequea `RISK_ENGINE_ENABLED` ni el flag de episodios
   derivados por su cuenta (confirmado con `rg` antes de escribir el runner).
   Se decidió que `scripts/jobs.mjs` sea el único punto que gatea: si el flag
   correspondiente está apagado, el job real ni se importa (no toca la DB),
   se responde `{ ejecutado: false, motivo: 'flag_deshabilitado' }` y sale con
   código 0. `RISK_ENGINE_ENABLED` gobierna geo-perfiles, los 3 sync, las 2
   climatologías y calcular-riesgo; `EPISODIOS_DERIVADOS_ENABLED` gobierna
   sólo episodios-derivados.
5. **Cadencia de ECMWF/Open-Meteo (6h + margen).** Se verificó en
   `open-meteo.com/en/docs/ecmwf-api`: corridas cada 6h (00/06/12/18 UTC) y "la
   distribución open-data tiene un retraso adicional de 2 horas respecto a la
   distribución en tiempo real". La documentación no da la latencia exacta de
   la distribución en tiempo real, así que se documentó un margen conservador
   de ~8h total (6h de latencia real-time habitual + 2h adicionales de
   open-data) — `OnCalendar=*-*-* 08,14,20,02:00:00` — con nota explícita en el
   runbook de que conviene ajustar si Open-Meteo publica un número más preciso.
6. **`calcular-riesgo` encadenado por offset, no por cola/orquestador.** No hay
   Redis ni colas en este repo (fuera de alcance). Se documentó como offset de
   +15min sobre los timers de 6h de los sync, y como decisión abierta si
   conviene un segundo timer horario con offset tras `sync-imerg` — el lease
   de `job-run.ts` ya impide que dos corridas se pisen aunque los offsets
   fallen.
7. **`.env.local` con `EARTHDATA_TOKEN` real: NO se copió.** Pedí permiso al
   coordinador para copiar `/home/gero/orca/data-hub-dashboard/.env.earthdata.local`
   (el sandbox del terminal lo bloqueó por estar fuera del worktree); N1
   respondió que no se copia la credencial y que el ensayo de `sync-imerg`
   debe validar el camino sin token (`fuente_no_configurada`, sin romper). Eso
   es exactamente lo que se ensayó (ver más abajo). El comando exacto para
   cuando haya token real:
   ```
   docker exec <CONTENEDOR> env EARTHDATA_TOKEN=<token> node scripts/jobs.mjs sync-imerg
   ```
   (o la variable ya seteada en el entorno del contenedor, sin pasarla en la
   línea de comando en producción para no dejarla en el historial de shell).

## Despachos N3

Todos con `OPENCODE_CONFIG=$HOME/.config/opencode/n3-sin-mcp.json`, modelo
`opencode-go/deepseek-v4.1-flash`, máximo 2 concurrentes. Cada despacho se
verificó de forma independiente (no se confió en el "listo" del propio N3):
`git diff`, `git status` y el vitest focalizado exacto que el brief pedía,
corridos por N2.

### Wave 1 (paralelo, 2 N3)

- **N3-Runner** — `scripts/jobs.mjs` + `scripts/jobs.test.ts` (archivos
  nuevos). Punto de entrada único por nombre, con el mismo patrón de loader
  ESM de `job-diagnostico.mjs`, gating de flags, envoltura de lease externa
  para geo-perfiles y contrato de exit codes 0/1/2/3. Verificación:
  `pnpm exec vitest run scripts/jobs.test.ts` → 7/7 OK (confirmado por N2
  además del reporte del N3).
- **N3-Cadencias** — `lib/infraestructura/riesgo/cadencias.ts` +
  `cadencias.test.ts` (archivos nuevos). Registro de cadencias por job,
  `estaAtrasado`, `proximaCorridaEsperada`. Verificación:
  `pnpm exec vitest run lib/infraestructura/riesgo/cadencias.test.ts` → 6/6 OK.

### Wave 2 (paralelo, 2 N3, dependen de Wave 1)

- **N3-UI** — edita `lib/infraestructura/riesgo/salud.ts` (agrega
  `ultimaCompletadaEn`) y `app/(hub)/admin/operacion/page.tsx` (columnas
  "última corrida"/"próxima esperada"/"atrasado"); crea
  `lib/infraestructura/riesgo/salud.test.ts`. Verificación:
  `pnpm exec vitest run lib/infraestructura/riesgo/salud.test.ts` → 2/2 OK.
  N2 revisó el diff completo de ambos archivos línea por línea.
- **N3-Docs** — crea `deploy/systemd/ops1/enos-ops1@.service`,
  `deploy/systemd/ops1/enos-ops1@.timer` y
  `docs/ejecucion-enos/OPS1/runbook-scheduler.md`. Sólo documentación/config,
  sin tests. Verificación: N2 corrió `systemd-analyze verify` sobre copias
  temporales de ambas unidades (ver más abajo) — exit 0 en las dos.

### Revisión adversarial (N3 distinto, sólo reporte)

Se pidió revisar `scripts/jobs.mjs`, `cadencias.ts`, el diff de `salud.ts` y de
`page.tsx` buscando doble corrida/lease, manejo de 429/outage, flags
apagados, casos geográficos e idempotencia. Encontró **2 hallazgos
bloqueantes**, ambos corregidos por N2 (no por un nuevo N3, siguiendo la regla
de que N2 puede escribir directo cuando el fix es mecánico y ya entendido):

1. **`job.tipo` (interno) ≠ nombre CLI**: la UI comparaba el `tipo` real de
   `infra_job_run` contra los nombres CLI de `cadencias.ts` — sólo
   `geo-perfiles` coincidía por casualidad, los otros 7 jobs nunca se
   marcaban "atrasado" (justo la única señal de alerta que el runbook
   describe). **Fix**: `TIPO_INFRA_JOB_RUN_A_NOMBRE_JOB` en `cadencias.ts` +
   uso en `page.tsx`, con test de completitud (`cadencias.test.ts`, verifica
   que el mapeo cubre exactamente los 8 nombres, uno a uno).
2. **`sync-imerg` nunca recibía el token**: `scripts/jobs.mjs` llamaba
   `ejecutarSyncImerg()` sin argumentos; el job lee el token sólo por
   parámetro (nunca por `process.env` — diseño intencional de E2 para no
   acoplar el job al entorno). Con la invocación tal cual documentada, IMERG
   habría sido un no-op permanente aun con token válido en el contenedor.
   **Fix**: `ejecutarSyncImerg({ earthdataToken: process.env.EARTHDATA_TOKEN })`,
   con test que confirma el forward exacto.

Hallazgos menores encontrados y también corregidos por N2 (bajo riesgo,
mecánicos): geo-perfiles usaba reloj de pared en vez de `opts?.ahora` para la
clave de idempotencia (rompía si a futuro se le pasa una fecha explícita), y
el `catch` de geo-perfiles podía perder el error original si
`publicarResultado` también fallaba al reportar `'fallido'`. Un hallazgo
documentado pero NO corregido (fuera de alcance de OPS1, es código de E7a ya
mergeado): el comentario de `episodiosDerivadosEnabled()` en
`lib/infraestructura/episodios-derivados/flags.ts` dice que gobierna "sólo la
UI de solo lectura", pero OPS1 ahora también lo usa para gatear el job batch
que sí muta datos — el comportamiento es correcto (el flag debe seguir
apagado por defecto para todo lo relacionado a episodios derivados), pero el
comentario en ese archivo ajeno quedó desactualizado; se deja para quien
toque ese archivo la próxima vez.

Verificación post-fix: `pnpm exec tsc --noEmit` (exit 0), `pnpm lint` (exit 0,
0 warnings), `pnpm exec vitest run scripts/jobs.test.ts
lib/infraestructura/riesgo/cadencias.test.ts` (16/16 OK, incluye los tests
nuevos del forward de token y de completitud del mapeo).

## Pruebas reales fechadas

Ensayo local completo, 2026-09-27, contra la DB de desarrollo
(`.data/hub.sqlite`, `DATA_DIR` por defecto), con `RISK_ENGINE_ENABLED=true`
y `EPISODIOS_DERIVADOS_ENABLED=true`. Sin `EARTHDATA_TOKEN` (pendiente, ver
decisión local 7). Aviso del coordinador respetado: cada job se corrió **una
sola vez** (Open-Meteo venía devolviendo 429 por el volumen de corridas de
otros batches en el día).

Secuencia real, en orden, con el comando exacto y el resultado:

```
$ node scripts/jobs.mjs geo-perfiles
{"ejecutado":true,"procesados":2005,"conPerfilValido":2001,"excluidos":4,"perfilVersion":"geo-perfil-v1","leasePerdido":false}
exit 0 — 0.86s total (0.94s user + 0.22s system)
```

```
$ node scripts/jobs.mjs sync-pronostico-caudal
```
**BLOQUEANTE de ensayo, NO de OPS1** (código ajeno a este batch, ya
mergeado en E3a/E3b): el proceso murió con `RangeError: Maximum call stack
size exceeded` antes de llegar a cualquier `catch`. Diagnóstico:
- El runner (`scripts/jobs.mjs`) se comportó bien: la excepción SÍ fue
  atrapable en el `try/catch` del bloque CLI (confirmado reproduciendo el
  crash una segunda vez tras esperar a que el lease anterior expirara),
  `error.message` se imprimió en stderr sin stack crudo ni secretos, y el
  proceso salió con **exit 1** (`≠ 0`, tal como exige la aceptación).
- La fila de `infra_job_run` (`tipo: sync-hazard-pronostico-caudal`) queda
  **`en_progreso`** con un lease nuevo cada vez que se reintenta (intento 2
  confirmado): el crash ocurre en un punto tan profundo que ni el propio
  `catch` interno del job (el que llama `publicarResultado('fallido')`)
  llega a ejecutarse — el error se reproduce también ahí. Consecuencia
  operativa real: este job queda perpetuamente "atrasado" en la UI de salud
  hasta que se corrija en origen (evidencia útil, ver sección UX).
- Consultado el coordinador (N1): confirmó que es un bug pre-existente de
  E3a/E3b, no de OPS1, con causa probable "volumen (~387 celdas × 240h × 5
  variables ≈ 460k puntos) con un spread de array grande (`push(...x)`,
  `Math.max(...x)`) o un único `insert().values()` gigante". N1 abre una
  corrección aparte en `fix/sync-pronostico-stack`. Instrucción explícita:
  no arreglarlo desde este worktree.
- Reproducido 2 veces (primera corrida real + un reintento tras expirar el
  lease), consistente en ambas. No se reintentó una tercera vez.

```
$ node scripts/jobs.mjs sync-ensemble
{"ok":true,"resultado":{"celdasConsultadas":387,"filasInsertadas":0,"llamadasRealizadas":20}}
exit 0
```
`filasInsertadas: 0` — degradación esperada por el 429 del día (confirmado en
`hazard_source_health`: `open-meteo-ensemble` quedó `degradado`, error
saneado `"http_error: error de red en intento 3/3: fetch failed"`, sin
secretos ni datos nominales).

```
$ node scripts/jobs.mjs sync-imerg
{"ok":true,"resultado":{"celdasActualizadas":0,"motivo":"fuente_no_configurada","granulosProcesados":0,"granulosFallidos":0}}
exit 0
```
Camino sin token verificado: no rompe, marca `nasa-imerg` como
`no_disponible` en `hazard_source_health` con
`"fuente no configurada: falta EARTHDATA_TOKEN"`. Comando real pendiente
para cuando exista el token (ver decisión local 7).

```
$ node scripts/jobs.mjs calcular-riesgo
{"ejecutado":true,"runId":"ab3c7e27-00d9-4561-8813-9666d0b9d9a5","escuelasProcesadas":6003,"conEvidencia":0,"sinEvidencia":6003}
exit 0
```
`conEvidencia: 0` es consistente con el estado degradado de las fuentes de
arriba (sin datos frescos de pronóstico, no hay evidencia de riesgo que
calcular con datos nuevos) — no es un bug de este ensayo.

```
$ node scripts/jobs.mjs episodios-derivados
{"ejecutado":true,"episodiosCreados":0,"escuelasExcluidas":0,"departamentosProcesados":0}
exit 0
```

**Aceptación adicional verificada con comandos reales** (no sólo tests):

```
$ node scripts/jobs.mjs nombre-inventado
Job desconocido: "nombre-inventado". Jobs válidos: geo-perfiles, sync-pronostico-caudal, sync-ensemble, sync-imerg, climatologia-precipitacion, climatologia-caudal, calcular-riesgo, episodios-derivados
exit 2
```

```
$ env -u RISK_ENGINE_ENABLED -u EPISODIOS_DERIVADOS_ENABLED node scripts/jobs.mjs calcular-riesgo
{"ejecutado":false,"motivo":"flag_deshabilitado"}
exit 0
$ env -u RISK_ENGINE_ENABLED -u EPISODIOS_DERIVADOS_ENABLED node scripts/jobs.mjs episodios-derivados
{"ejecutado":false,"motivo":"flag_deshabilitado"}
exit 0
```

**Validación sintáctica de las unidades systemd** (local, sin instalar nada,
sin tocar ningún host):

```
$ cp deploy/systemd/ops1/enos-ops1@.service /tmp/enos-ops1@geo-perfiles.service
$ systemd-analyze verify /tmp/enos-ops1@geo-perfiles.service
exit 0
$ cp deploy/systemd/ops1/enos-ops1@.timer /tmp/enos-ops1@geo-perfiles.timer
$ systemd-analyze verify /tmp/enos-ops1@geo-perfiles.timer
exit 0
```

## UX — estados de la UI de salud (`/admin/operacion`)

Gobernada por `RISK_ENGINE_ENABLED` (el mismo flag de E0; no se creó ningún
flag nuevo). Verificado con datos reales del ensayo (no sintéticos), llamando
`obtenerEstadoOperativo()` directamente sobre la DB de desarrollo tras la
secuencia de arriba:

| job (tipo interno) | estado | última completada | atrasado |
|---|---|---|---|
| `episodios-derivados-v0` | completado | sí | no (próxima en +1h) |
| `calcular-riesgo-v0` | completado | sí | no (próxima en +6h) |
| `sync-hazard-ensemble` | completado | sí | no (próxima en +6h) |
| `sync-hazard-pronostico-caudal` | **en_progreso** (crasheado) | **nunca** | **sí** |
| `geo-perfiles` | completado | sí | no (próxima al día siguiente) |

La fila de `sync-pronostico-caudal` es evidencia real (no fabricada) de que
la columna "atrasado" funciona: un job que nunca llega a `completado` queda
marcado como atrasado de forma permanente hasta que se corrija, con texto
explícito ("atrasado" / "al día"), no sólo color, tal como pide la
aceptación.

**Pendiente explícito — gate UX con operadores reales**: no hubo operadores
disponibles durante este batch. Recorrido guiado reproducible para cuando
haya uno disponible:
1. Entrar a `/admin/operacion` con sesión `admin` o `editor`.
2. Mostrar la tabla "Jobs": explicar que "atrasado" es texto explícito (no
   depende de distinguir colores) y que aparece cuando pasaron más de 2
   cadencias sin una corrida exitosa.
3. Mostrar la tabla "Fuentes de amenazas": `estado` (`ok`/`degradado`/
   `no_disponible`) y `aviso` ("vencida" si superó su `ttlMinutos`).
4. Preguntar: ¿el texto "atrasado"/"al día" es suficiente para decidir si hay
   que investigar, sin necesitar journalctl? ¿Falta algún dato para decidir
   una acción (pausar/reanudar un timer, ver runbook)?
Queda marcado como **pendiente**, no como hecho.

**Alertas operativas mínimas**: documentadas en
`docs/ejecucion-enos/OPS1/runbook-scheduler.md` (sección final) — la única
señal es visual, en este mismo panel; no se agrega ningún canal nuevo (sin
Slack/email/webhook), consistente con "sin operación manual nueva" y "sin
frameworks nuevos".

## Verificaciones finales

| Verificación | Resultado |
|---|---|
| `pnpm test` | 163 archivos, 1330 tests, exit 0 (+3 archivos / +18 tests sobre el baseline) |
| `pnpm lint` | exit 0, 0 warnings |
| `pnpm exec tsc --noEmit` | exit 0 |
| `pnpm build` | exit 0 |

## Archivos tocados (resumen)

Nuevos:
- `scripts/jobs.mjs`, `scripts/jobs.test.ts`
- `lib/infraestructura/riesgo/cadencias.ts`, `lib/infraestructura/riesgo/cadencias.test.ts`
- `lib/infraestructura/riesgo/salud.test.ts`
- `deploy/systemd/ops1/enos-ops1@.service`, `deploy/systemd/ops1/enos-ops1@.timer`
- `docs/ejecucion-enos/OPS1/runbook-scheduler.md`, `docs/ejecucion-enos/OPS1/registro.md` (este archivo)

Modificados:
- `lib/infraestructura/riesgo/salud.ts` (agrega `ultimaCompletadaEn`)
- `app/(hub)/admin/operacion/page.tsx` (columnas de salud OPS1)

Sin cambios (deliberado, ver decisiones locales 1 y 2):
- `lib/db/schema.ts`, `lib/db/seed.ts` (no hizo falta bloque `// OPS1: ...`)
- `package.json` / lockfile (sin dependencias nuevas)

## Pendientes explícitos

1. Bug de `sync-pronostico-caudal` (stack overflow bajo volumen real) — fuera
   de alcance de OPS1, en manos de N1 (`fix/sync-pronostico-stack`).
2. Ensayo de `sync-imerg` con `EARTHDATA_TOKEN` real — comando documentado en
   decisión local 7 y en el runbook; pendiente de que N1 provea el token de
   forma segura.
3. Gate UX con 1-2 operadores reales — recorrido guiado reproducible
   documentado arriba, sin operadores disponibles durante este batch.
4. Instalación real del timer contra un host de staging/producción — fuera de
   alcance explícito de este batch (repo + documentación + ensayo local
   únicamente, igual que E0).
5. Registrar `importar-geo-static` en el runner cuando G1 mergee (instrucciones
   exactas en decisión local 2).

## Correcciones del gate N1

Bounded writer, worktree propio (`enos-ops1`, rama `feat/enos-ops1`),
respondiendo a 4 hallazgos del review de N1 sobre este mismo batch.

### 1. BLOQUEANTE — con config por defecto no corría nada

**Confirmado antes de decidir:** con `rg` se verificó que `RISK_ENGINE_ENABLED`
(vía `riskEngineEnabled()`) sólo se leía en `app/(hub)/admin/riesgo/page.tsx`,
`app/(hub)/admin/riesgo/[snapshotId]/page.tsx` y `salud.ts` (para reportarlo
en el panel) — es decir, **sólo gobernaba dos pantallas de UI** (`/admin/
riesgo` lista y detalle), nunca ejecución de datos, antes de que este batch lo
usara también para gatear 7 de los 8 jobs. Mismo patrón confirmado para
`EPISODIOS_DERIVADOS_ENABLED` (el propio comentario del archivo dice
"gobierna SÓLO la UI de sólo lectura").

**Decisión: opción (a), decouplar.** Se creó un flag propio y ortogonal,
`ENOS_JOBS_ENABLED` (`lib/infraestructura/jobs/flags.ts`), con **default
encendido** (`!== 'false'`, a diferencia de los flags de UI que son
apagados-por-defecto/opt-in). `scripts/jobs.mjs` ahora gatea los 8 jobs
únicamente con este flag; se sacaron las referencias a `riskEngineEnabled()`
y `episodiosDerivadosEnabled()` del runner. Razón para (a) sobre (b): las
UIs son de sólo lectura y no hacían nada con los datos que los jobs escriben,
así que acoplar la ejecución del batch de datos a un flag de visibilidad de
pantalla habría sido acoplar dos preocupaciones no relacionadas — el batch
completo habría seguido sin correr con la config documentada por defecto
apenas alguien reactivara ese acoplamiento por error. Con (a), instalar el
scheduler basta para que los 8 jobs corran; las dos UIs siguen ocultas por
defecto, sin cambios.

Se agregó además un WARN a stderr (`[jobs] "<nombre>" no ejecutado:
ENOS_JOBS_ENABLED=false`) cada vez que un job se salta por el flag, visible en
`journalctl`, para que una pausa deliberada (o un `false` puesto por error) no
pase inadvertida en el log.

**UI de `/admin/operacion`:** se agregó `estadoAtrasoJob()` (puro, en
`cadencias.ts`, con tests) que centraliza la regla: con
`ENOS_JOBS_ENABLED=false` la columna muestra explícitamente
**"Desactivado por configuración"** en vez de "atrasado" (y no resalta la fila
como alerta) — evita que un operador confunda una pausa deliberada con un
incidente real. `salud.ts` expone el flag nuevo en `EstadoOperativo.flags`.

Tests nuevos: `lib/infraestructura/jobs/flags.test.ts` (default encendido,
`'false'` apaga, cualquier otro valor no apaga), `scripts/jobs.test.ts`
(`it.each` sobre los 8 jobs con `enosJobsEnabled=false`, más el WARN),
`cadencias.test.ts` (`estadoAtrasoJob`), `salud.test.ts` (el flag nuevo se
expone y refleja `ENOS_JOBS_ENABLED`).

### 2. MAJOR — `OnCalendar` no fijado a UTC

Se agregó ` UTC` a los 6 `OnCalendar` de los timers explícitos nuevos (ver
punto 3) y a toda mención de horarios en el runbook. Sin esto, systemd
interpreta el calendario en la zona horaria local del host, que puede no
coincidir con los horarios UTC de ECMWF/Open-Meteo/IMERG documentados.

### 3. MAJOR — drop-ins de `systemctl edit` se acumulan

Se reemplazó el mecanismo de una sola plantilla `enos-ops1@.timer` +
overrides por `systemctl edit` (que crea drop-ins fuera del repo, no
versionados ni auditables en un diff) por **timers explícitos, uno por job
programado**, todos versionados en `deploy/systemd/ops1/`:

- `enos-ops1-sync-pronostico-caudal.timer`
- `enos-ops1-sync-ensemble.timer`
- `enos-ops1-sync-imerg.timer`
- `enos-ops1-calcular-riesgo.timer`
- `enos-ops1-episodios-derivados.timer`
- `enos-ops1-geo-perfiles.timer`

Cada uno fija su propio `[Timer] OnCalendar=... UTC` y
`Unit=enos-ops1@<job>.service` (apuntando a la instancia concreta de la
plantilla de servicio, que no cambió). `enos-ops1@.timer` (la plantilla
genérica de 1h con comentario de "crear un drop-in") se **eliminó**: ya no
hace falta, cada job programado tiene su propio archivo explícito, y los
jobs bajo demanda (climatologías) no usan timer (se documentó cómo agregar
uno igual si hiciera falta, sin volver a drop-ins).

El offset del motor de riesgo (`calcular-riesgo` a `:15` sobre los sync de
6h) se conservó tal cual estaba decidido. Se agregó al runbook (y como
comentario dentro de `enos-ops1-calcular-riesgo.timer`) el caveat de
secuencia entre jobs distintos: sin cola/orquestador, `calcular-riesgo` no
espera a `sync-imerg` (cadencia horaria independiente) y
`episodios-derivados` no tiene offset explícito respecto de `sync-imerg`
pese a compartir cadencia horaria — bajo riesgo, documentado para que no
sorprenda en el panel.

`deploy/systemd/ops1/enos-ops1@.service` se mantuvo como plantilla (sirve a
los 8 jobs, incluidas las climatologías bajo demanda vía `systemctl start
enos-ops1@<job>.service`), con un agregado: `EnvironmentFile=-/etc/enos-ops1/
enos-ops1.env` (opcional) + `docker exec -e ENOS_JOBS_ENABLED` para dar un
interruptor de pausa de los 8 jobs desde el HOST sin tocar el entorno del
contenedor — documentado con permisos `600`, dueño el usuario que corre el
unit (root, sin `User=` declarado).

**Verificación de las 14 unidades con `systemd-analyze verify`** (local, sin
instalar nada, sin tocar ningún host): la plantilla de servicio se copió a
un nombre de instancia por cada uno de los 8 jobs
(`enos-ops1@<job>.service`) y los 6 `.timer` explícitos se verificaron
directos contra su ruta real (referencian esas mismas instancias vía
`Unit=`). **Exit 0 en las 14.**

### 4. Runbook actualizado

`docs/ejecucion-enos/OPS1/runbook-scheduler.md` reescrito: tabla de
variables de entorno (cuáles son de UI, cuál es el flag de jobs, dónde vive
cada una), instrucciones del `EnvironmentFile` opcional (ubicación, permisos
600, comandos), instalación y `enable --now` de cada uno de los 6 timers
explícitos, comandos de verificación (`systemctl list-timers 'enos-ops1-*'`,
`systemd-analyze verify` por archivo, `journalctl`), dos mecanismos de pausa
distintos (por job vía timer, o los 8 a la vez vía `ENOS_JOBS_ENABLED`), y se
conservó sin cambios la sección de renovación del token de Earthdata (vence
2026-11-26, ya documentada en la versión anterior de este runbook).

### Verificación final (post-corrección)

| Verificación | Resultado |
|---|---|
| `pnpm exec vitest run scripts/jobs.test.ts lib/infraestructura/riesgo/cadencias.test.ts lib/infraestructura/riesgo/salud.test.ts lib/infraestructura/jobs/flags.test.ts app/api/infraestructura/operacion/salud/route.test.ts` | 5 archivos, 38 tests, exit 0 |
| `pnpm test` | 164 archivos, 1345 tests, exit 0 |
| `pnpm lint` | exit 0, 0 warnings |
| `pnpm exec tsc --noEmit` | exit 0 |
| `pnpm build` | exit 0 (incluye `/admin/operacion` como ruta dinámica) |
| `systemd-analyze verify` sobre las 14 unidades (8 instancias del `.service` + 6 `.timer` explícitos) | exit 0 en las 14 |

### Archivos tocados en esta corrección

Nuevos:
- `lib/infraestructura/jobs/flags.ts`, `lib/infraestructura/jobs/flags.test.ts`
- `deploy/systemd/ops1/enos-ops1-sync-pronostico-caudal.timer`
- `deploy/systemd/ops1/enos-ops1-sync-ensemble.timer`
- `deploy/systemd/ops1/enos-ops1-sync-imerg.timer`
- `deploy/systemd/ops1/enos-ops1-calcular-riesgo.timer`
- `deploy/systemd/ops1/enos-ops1-episodios-derivados.timer`
- `deploy/systemd/ops1/enos-ops1-geo-perfiles.timer`

Modificados:
- `scripts/jobs.mjs`, `scripts/jobs.test.ts` (gating por `ENOS_JOBS_ENABLED`,
  WARN al saltar un job)
- `lib/infraestructura/riesgo/cadencias.ts`, `cadencias.test.ts` (nuevo
  `estadoAtrasoJob()`)
- `lib/infraestructura/riesgo/salud.ts`, `salud.test.ts` (expone
  `enosJobsEnabled`)
- `app/(hub)/admin/operacion/page.tsx` ("Desactivado por configuración")
- `deploy/systemd/ops1/enos-ops1@.service` (`EnvironmentFile` opcional +
  reenvío de `ENOS_JOBS_ENABLED`)
- `docs/ejecucion-enos/OPS1/runbook-scheduler.md` (reescrito)

Eliminados:
- `deploy/systemd/ops1/enos-ops1@.timer` (reemplazado por los 6 `.timer`
  explícitos de arriba; el mecanismo de drop-in que documentaba ya no se usa)

## Gate

_(Sección reservada para N1 — no completar desde N2/N3.)_

## Gate (N1)

**Decisión: aceptado tras correcciones (2026-09-27).**

- Verificaciones globales tras las correcciones: `pnpm test` 164 archivos / 1345 tests OK; `pnpm lint`, `pnpm exec tsc --noEmit` y `pnpm build` con exit 0; `systemd-analyze verify` con exit 0 sobre las 14 unidades. N1 reverificó los tests del runner, flags y cadencias.
- Revisión independiente (primera pasada): bloqueante porque con la configuración por defecto ningún job corría (estaban atados a flags de interfaz apagados) y el runbook no lo decía; además los `OnCalendar` no estaban fijados en UTC y los overrides por drop-in se acumulaban. Corregido: los jobs dependen sólo de `ENOS_JOBS_ENABLED` (encendido por defecto), los flags de interfaz vuelven a controlar sólo la visibilidad, la UI muestra "Desactivado por configuración", hay un timer explícito por job en UTC y el runbook documenta variables, archivo de entorno, instalación y verificación.
- El ensayo local encontró el desborde de pila de `sync-pronostico-caudal`, corregido y mergeado aparte (`ff04391`).
- Pendientes: instalación en un host real (decisión del usuario), ensayo de `sync-imerg` con token real y licencia de Open-Meteo para producción (el nivel gratuito ya respondió 429 con corridas repetidas).
