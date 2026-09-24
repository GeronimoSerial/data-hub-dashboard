# Reporte E0 — Base operativa, contratos y recuperación

Batch E0 del plan de ejecución ENOS 2026/2027. N2: sonnet, líder de batch.
Commit de partida: `f4cc0eb` en `main`. Worktree propio, rama `feat/enos-e0`.
Este reporte lo redacta N2; N1 escribe `gate.md` por separado (no se creó
aquí, según instrucción explícita).

## Qué se hizo

### 1. Contratos Zod/TS transversales de riesgo
`lib/infraestructura/riesgo/tipos.ts`: `identidadCueAnexoSchema` (string,
preserva ceros a la izquierda), `claseDatoSchema` (observado/pronosticado/
calculado/confirmado), `tiempoUtcSchema` (ISO 8601 UTC estricto, exige `Z`),
`estadoJobSchema` (pendiente/en_progreso/completado/fallido), con sus tipos
TS inferidos.

### 2. Flags de feature
`lib/infraestructura/riesgo/flags.ts`: módulo único de lectura para
`RISK_ENGINE_ENABLED`, `RISK_RADAR_ENABLED`, `AI_BRIEFING_ENABLED` (default
`false`) y `RISK_MODE` (default `'shadow'`, sólo `'advisory'` con ese valor
exacto). Verificado con `rg` que ningún otro archivo del repo lee esas claves
de entorno directamente. Como ningún flujo existente los consulta todavía,
apagados o no el comportamiento de la app hoy es idéntico — no hay código de
producción que se ramifique sobre ellos aún; eso es intencional en E0.

### 3. Tabla `infra_job_run` + lease renovable
Agregada a `lib/db/schema.ts` (Drizzle) y al bloque `HUB_DDL` de
`lib/db/seed.ts` (única convención de migración del repo: DDL aditivo
idempotente, `CREATE TABLE IF NOT EXISTS`). Columnas: tipo, clave
idempotente, intento, inicio/fin, estado, contadores (JSON), error saneado,
versión, lease owner/expiración, timestamps de auditoría. Índice único sobre
`(tipo, claveIdempotente)`.

`lib/infraestructura/riesgo/job-run.ts` implementa `adquirirLease`,
`renovarLease` y `publicarResultado`. **Iteración importante**: la primera
versión (implementada por N2 tras 2 fallos de N3, ver "Dispatches") usaba
select-then-act; una revisión N3 independiente encontró una condición de
carrera real (dos invocaciones concurrentes podían recuperar el mismo lease
vencido y ambas publicar resultado). Se reescribió como operaciones
compare-and-swap: `INSERT ... ON CONFLICT DO NOTHING` + `UPDATE ...
WHERE ... RETURNING` condicionados, de forma que sólo una invocación
concurrente puede ganar cada transición de estado. Una segunda revisión
independiente confirmó el fix (ver `dispatches.json`, d15/d17).

### 4. Backup, restore y runbook de migración
`scripts/backup-sqlite.mjs` (checkpoint WAL + copia, verifica `busy` del
checkpoint y falla explícito si quedó incompleto) y
`scripts/restore-sqlite.mjs` (copia a temporal + `renameSync` atómico, en vez
de sobrescribir el destino directo). `docs/ejecucion-enos/E0/runbook-migracion-backup.md`
documenta migración aditiva, backup, restore y dependencia explícita de un
host de staging que **no existe todavía** (pendiente, con comando exacto).

### 5. Job de diagnóstico + empaquetado Docker
`scripts/job-diagnostico.mjs`: ejecución finita, usa `adquirirLease`/
`publicarResultado` con clave de idempotencia diaria por defecto, chequea
conectividad DB y que `DATA_DIR` sea escribible. El `Dockerfile` ya copiaba
`scripts/`/`lib/` al runner (patrón preexistente para el espejo GE); se
agregó un stage `dbtools` (mismo patrón que el stage `pgdriver` ya existente)
porque `drizzle-orm` no queda en `node_modules` del standalone de Next (el
servidor lo bundlea vía webpack, pero un script batch fuera de ese bundle
necesita el paquete real). **Probado end-to-end**: `docker build`, `docker
run`, dos `docker exec ... node scripts/job-diagnostico.mjs` con la misma
clave — la segunda no publica un segundo resultado (evidencia en
`evidencias/docker-diagnostico.log`). Limpieza de contenedor/imagen/volumen
de prueba realizada al terminar.

### 6. Endpoint y panel de salud
`GET /api/infraestructura/operacion/salud` (protegido con `staffGuard`,
`dynamic='force-dynamic'`, sólo lectura, nunca dispara jobs) y
`lib/infraestructura/riesgo/salud.ts` (módulo de consulta compartido entre el
endpoint y el panel). `app/(hub)/admin/operacion/page.tsx`: panel interno
mínimo, mismo gate que `/admin` (`adminPageGate`), muestra flags y último
estado por tipo de job, resaltando fallas/leases vencidos. Entrada de
navegación agregada en `components/admin-shell.tsx` ("Operación → Salud").

### 7. Scheduler
`docs/ejecucion-enos/E0/scheduler.md`: una sola opción operativa (timer
`systemd` del host, plantillas de unidades incluidas). Ensayo contra staging
real queda pendiente explícito porque el host no está definido en este
batch (ver plan §1).

### 8. UX
`docs/ejecucion-enos/E0/ux.md`: inventario de pantallas/componentes
existentes, mapa de tareas por persona/permiso, boceto en texto del panel de
salud, qué reemplaza cada bloque nuevo, matriz de estados. Capturas
baseline reales y prueba con participantes quedan pendientes explícitos (no
se levantó la app en navegador durante este dispatch); ver esa sección para
el comando exacto de cómo producirlas.

## Mapeo de nombres (plan → implementación)

| Plan | Implementación |
|---|---|
| `infra_job_run` | `infraJobRun` (Drizzle), tabla SQL `infra_job_run` — sin cambios de nombre |
| Flags | Nombres exactos del plan, sin cambios |
| Lease renovable con expiración | `adquirirLease`/`renovarLease`/`publicarResultado` (nombres en español, no estaban fijados por el plan) |
| `GET /api/infraestructura/operacion/salud` | Sin cambios |
| Panel interno | `/admin/operacion` (integrado al `/admin` existente en vez de una ruta nueva fuera de ese gate, para reusar `adminPageGate` sin duplicar lógica de acceso) |

## Comandos y códigos de salida

Baseline (antes de tocar código), en `evidencias/*-baseline.log`:
`pnpm test` exit 0 (96 archivos/773 tests), `pnpm lint` exit 0, `pnpm exec tsc
--noEmit` exit 0, `pnpm build` exit 0. **Sin fallas preexistentes** que
documentar.

Final (con todos los cambios integrados), en `evidencias/*-final.log`:
`pnpm test` exit 0 (**103 archivos / 811 tests**, +7 archivos/+38 tests sobre
baseline), `pnpm lint` exit 0 (0 warnings), `pnpm exec tsc --noEmit` exit 0,
`pnpm build` exit 0 (incluye `/admin/operacion` y
`/api/infraestructura/operacion/salud` en la salida de rutas).

Docker: `docker build` exitoso, `docker run` + dos `docker exec` (ver
`evidencias/docker-diagnostico.log`).

## Aceptación observable (§6-E0 + §7) — estado

| Criterio | Estado | Evidencia |
|---|---|---|
| Instalación vacía y upgrade conservan partes/movimientos | Cumplido | `lib/db/seed.test.ts` (12/12), reaplica DDL dos veces sobre base poblada sin alterar conteos, incluido `infra_job_run` |
| Reejecutar migración no altera filas | Cumplido | Mismo test |
| Backup restaurado permite leer datos | Cumplido (con datos sintéticos, no un parte real de la app) | `scripts/restore-sqlite.test.ts` |
| Dos invocaciones del mismo job no publican dos resultados | Cumplido | `job-run.test.ts` (CAS) + `job-diagnostico.test.ts` + verificado end-to-end en Docker |
| Muerte del proceso → lease expira y se recupera controladamente | Cumplido | `job-run.test.ts` ("lease vencido... recuperación controlada") |
| Flags apagados conservan comportamiento previo | Cumplido por diseño | Ningún código de producción nuevo se ejecuta con los flags en su default; suite completa sin regresiones (811/811) |
| Endpoint de salud 401/403 sin permiso, 200 con permiso | Cumplido | `route.test.ts` (5/5): sin sesión→401, rol `consulta`→403, `editor`/`admin`→200 |
| Baseline de tests/lint/build con fallas preexistentes documentadas | Cumplido (sin fallas preexistentes) | `evidencias/*-baseline.log` |
| Backup restaurado permite abrir un parte real (staging) | **Pendiente** | Host de staging no definido; procedimiento exacto en `scheduler.md`/`runbook-migracion-backup.md` |
| Ensayo del scheduler en staging | **Pendiente** | Ídem |
| Gate UX con participantes humanas | **Pendiente / no aplica** | Batch puramente técnico según §7; sin participantes, según restricción explícita de la tarea |
| Capturas baseline reales | **Pendiente** | No se levantó la app en navegador en este dispatch |

## Riesgos residuales

1. ~~Backup sin atomicidad de snapshot completa~~ — **RESUELTO en fix2**
   (`dispatches.json`, sección `correccionesGateN1Fix2`). `backupSqlite`
   reemplazó checkpoint WAL + `copyFileSync` por una única sentencia
   `VACUUM INTO '<destino>'`, atómica y consistente incluso bajo escritura
   concurrente; verificado con un test que deja la conexión origen abierta
   en modo WAL sin checkpoint manual y confirma que la fila igual aparece en
   el backup, más `PRAGMA integrity_check='ok'`. Confirmado por revisión N3
   independiente sin hallazgos adicionales.
2. **Archivo temporal de restore sin limpieza si el proceso muere a mitad**
   (hallazgo Q4, d17): `${sqlitePath}.tmp-restore-<timestamp>` puede quedar
   huérfano. Aceptado para el alcance documentado (un solo host, ventana de
   mantenimiento). **Dueño: quien opere el próximo restore real**, sin fecha.
3. **`GET /api/infraestructura/operacion/salud` ejecuta `ensureSeeded()`
   antes del guard de autorización** (hallazgo H4.1 de la primera revisión,
   d15): `ensureSeeded()` puede escribir DDL/seed idempotente en un proceso
   frío incluso sin sesión válida. **No se corrigió deliberadamente**: es el
   mismo patrón que usa cada route handler existente del repo (`ensureSeeded()`
   antes del guard, ver `app/api/mapas/infraestructura/route.ts` y
   `app/api/infraestructura/nominal/permisos/route.ts`); cambiar sólo este
   endpoint introduciría una inconsistencia arquitectónica sin resolver el
   patrón de fondo. Es una escritura de bootstrap idempotente (no un job, no
   datos de negocio), pero técnicamente sí escribe. **Dueño: N1** — decidir
   si vale la pena una refactorización transversal de `ensureSeeded()` fuera
   del alcance de E0.
4. **`.atl/` no rastreado en el worktree**: presente desde antes de que este
   dispatch empezara (visible ya en el primer `git status` de la sesión). No
   fue creado ni modificado por este batch; se dejó exactamente como estaba.

## Dependencias nuevas

Ninguna dependencia de npm/pnpm nueva. El Dockerfile agrega un stage
`dbtools` (mismo mecanismo que el `pgdriver` ya existente) que instala
`drizzle-orm@0.45.2` — la misma versión ya fijada en `package.json` — dentro
de la imagen para que los scripts batch corran; no es una dependencia nueva
del proyecto, es empaquetado de una que ya existía.

## Sobre los dispatches a N3 (ver `dispatches.json` para el detalle completo)

Durante este batch, N1 corrigió tres veces la configuración de N3 en
tiempo real: (1) modelo `deepseek-v4-flash` → `deepseek-v4.1-flash`; (2)
timeout de 420s/480000ms → 560s/600000ms tras diagnosticar que los fallos
silenciosos eran timeouts, no fallas de calidad del modelo; (3) N3 corre sólo
el vitest focalizado de sus archivos, nunca `tsc` ni el suite completo (eso
queda a cargo de N2). Bajo la configuración anterior a esas correcciones,
varias tareas complejas (job-run.ts, backup/restore+runbook,
job-diagnóstico+Docker) fallaron dos veces cada una (timeout o log vacío) y
N2 las implementó directamente, según la regla explícita del preámbulo
("si N3 falla 2 veces en la misma tarea, podés implementarla vos"). Con la
configuración corregida, los dispatches restantes (endpoint de salud, panel
acotado, fix de backup/restore, dos revisiones independientes) tuvieron
éxito en el primer o segundo intento. El detalle completo — qué se despachó,
con qué modelo, resultado y verificación — está en `dispatches.json`.

## Correcciones gate N1 (fix2)

N1 devolvió una segunda ronda de 2 hallazgos, ambos ya integrados y
revisados por un N3 independiente (detalle en `dispatches.json`, sección
`correccionesGateN1Fix2`).

1. **BLOQUEANTE — backup no consistente bajo escritura concurrente**
   (era el riesgo residual 1 de la entrega original, ver arriba): el enfoque
   checkpoint+`copyFileSync` tenía una ventana real donde un auto-checkpoint
   concurrente de la app podía dejar el backup con páginas mezcladas
   (corrupto), detectable recién al restaurar. `scripts/backup-sqlite.mjs`
   ahora usa `VACUUM INTO '<destino>'` en una sola sentencia atómica contra
   la base origen — la forma nativa de sqlite para backups consistentes, sin
   requerir checkpoint manual previo. 3 tests nuevos: `integrity_check='ok'`
   + filas conservadas; una fila que vive sólo en el `-wal` (conexión origen
   dejada abierta a propósito, sin checkpoint) aparece igual en el backup;
   destino no existía antes y el origen queda intacto/legible después.
   `docs/ejecucion-enos/E0/runbook-migracion-backup.md` actualizado para
   describir el mecanismo real.
2. **MENOR — exit code de `job-diagnostico.mjs`**: el CLI ahora sale con
   `3` cuando el job corrió los chequeos pero perdió el lease antes de poder
   publicar (`leasePerdido:true`), y `0` en cualquier otro camino exitoso
   incluida la idempotencia normal (ya completado / lease vigente). La
   lógica vive en una función pura exportada `codigoSalida(resultado)`,
   testeada con los 3 casos sin necesidad de lanzar un subproceso real.
   `docs/ejecucion-enos/E0/scheduler.md` documenta qué debe investigar el
   operador ante cada código (0 nada, 1 falla real, 3 contención de
   lease/scheduling, no un fallo del chequeo en sí).

**Verificación final tras fix2**: `pnpm test` exit 0 (**103 archivos / 821
tests**, +6 sobre fix1), `pnpm lint` exit 0, `pnpm exec tsc --noEmit` exit 0,
`pnpm build` exit 0. Logs en `evidencias/*-fix2.log`.

Con esta ronda, de los 4 riesgos residuales originales sólo quedan 2 abiertos
(el archivo temporal de restore sin limpieza ante muerte a mitad, y
`ensureSeeded()` antes del guard en el endpoint de salud — ambos ya
documentados arriba con dueño); ninguno de los dos fue parte de los
hallazgos del gate en esta ronda.

## Correcciones gate N1 (fix1)

N1 devolvió 3 hallazgos sobre la entrega original de E0. Los tres están
corregidos, integrados y revisados por un N3 independiente del implementador
(detalle completo de cada dispatch en `dispatches.json`, sección
`correccionesGateN1Fix1`).

1. **BLOQUEANTE — lease sin fencing** (`lib/infraestructura/riesgo/job-run.ts`):
   `adquirirLease` ahora devuelve también `leaseOwner` en sus dos caminos de
   éxito (creación e recuperación de lease vencido). `renovarLease` y
   `publicarResultado` ahora exigen `leaseOwner = token` además de `id` y
   `estado='en_progreso'` en su `WHERE`; `publicarResultado` cambió de
   `Promise<void>` a `Promise<boolean>` para que el llamador sepa si perdió
   el lease. `scripts/job-diagnostico.mjs` pasa el `leaseOwner` en ambas
   llamadas (éxito y catch) y expone `leasePerdido: boolean` en su resultado.
   3 tests nuevos de fencing en `job-run.test.ts` (proceso viejo no puede
   publicar/renovar sobre un lease ya recuperado por otro; el nuevo dueño sí
   puede) + 1 test nuevo en `job-diagnostico.test.ts` (mock de
   `publicarResultado→false` verifica `leasePerdido:true`).
2. **MENOR — Cache-Control**: `GET /api/infraestructura/operacion/salud`
   responde `Cache-Control: private, no-store` en las tres formas de
   respuesta (200, 401, 403), mismo patrón que
   `app/api/mapas/infraestructura/route.ts`. Test actualizado, verificado
   real por la revisión independiente (no es un test que pasaría igual sin
   el header).
3. **MENOR — comentario de `lib/db/schema.ts`**: corregido para describir
   correctamente que `iniciadoEn` (NOT NULL) nunca es null; columna y DDL sin
   cambios.

**Verificación final tras el fix**: `pnpm test` exit 0 (**103 archivos / 815
tests**, +4 sobre la entrega original), `pnpm lint` exit 0, `pnpm exec tsc
--noEmit` exit 0, `pnpm build` exit 0. Logs en
`evidencias/*-fix1.log`.

**Observación menor no bloqueante** (fuera de los 3 hallazgos, reportada por
la revisión independiente): el CLI de `job-diagnostico.mjs` sigue saliendo
con `exit 0` aunque `leasePerdido` sea `true` — la señal correcta existe como
campo estructurado en el JSON de salida, pero un caller que sólo mire el
exit code no distingue "corrió pero no logró publicar" de un éxito real.
Sin dueño de fecha asignado; queda para quien integre el scheduler real.

## Siguiente dueño

- **N1**: aceptar/objetar los tres riesgos residuales listados arriba; decidir
  si el ensayo de staging (backup/restore + scheduler) se agenda antes de
  habilitar E1, y con qué host.
- **N1/infraestructura**: proveer el host de staging para poder cerrar los
  dos pendientes explícitos de `scheduler.md`/`runbook-migracion-backup.md`.
- **Próximo batch (E1)**: puede construirse sobre los contratos de
  `lib/infraestructura/riesgo/tipos.ts` sin re-derivar la taxonomía
  observado/pronosticado/calculado/confirmado.
