# Mejoras de detección de inundaciones (plan 06)

## Objetivo

Implementar en el repositorio las acciones del plan `docs/investigacion-inundaciones-corrientes/06-plan-mejoras.md` (investigación en el checkout principal, sin trackear) que hoy son ejecutables desde código o documentación.

## Problema y por qué

La investigación de octubre 2026 mostró que el sistema no detectó ningún hecho público: jobs que informan éxito sin procesar (P-1), consultas no as-of (I-6), distancia en grados (G-3), sin salud de fuente para radar/SMN (I-8), fallas IMERG sin motivo (P-2), purga de radar sin archivo (I-5), atenuación amenaza × vulnerabilidad (I-7) y runbook desalineado con producción (P-4).

## Alcance autorizado

Código, pruebas y docs del repo en la rama `GeronimoSerial/refactor`. Commits por unidad de trabajo. Sin push, PR, cambios en producción/staging ni Coolify.

## Restricciones

- Sin cambios de pesos ni umbrales sin datos de calibración.
- Workers: Haiku, una tarea atómica por vez, un solo writer.
- Checks: `pnpm exec vitest run <archivo>` por tarea; al cierre de cada tarea `pnpm exec tsc --noEmit` y `pnpm lint`.
- RDD: off (global). Estrategia de entrega: `ask-on-risk` → cadena `stacked-to-main` (elegida por el usuario 2026-10-13); slices de ~400 líneas, registrar commits por PR.

## Checklist

- [x] T1 P-1: `calcular-climatologia-caudal` publica `fallido` con error por punto si 0 procesados; fallas parciales quedan en `contadores`/`errorSaneado`
- [x] T2 G-3: distancia geodésica (haversine, 40 km) en `motor/adaptadores/territorio.ts`
- [x] T3 I-6a: `cargarPronostico` (y variante por lote) filtra `corridaEn <= ahora`
- [x] T4 I-6b/c: umbrales de climatología as-of + limpiar referencias a `replay/consulta.ts`
- [x] T5 I-8a: salud de fuente en sync de radar-meteo
- [x] T6 I-8b: salud de fuente en sync SMN (429 → degradado)
- [x] T6b: un fallo al escribir la salud de fuente no altera el resultado de la corrida (radar y SMN)
- [x] T7 P-2: motivo por gránulo IMERG fallido (no publicado vs error)
- [x] T8 I-5a: exportar corridas de radar antes de la purga
- [x] T9 I-7a: exponer amenaza separada de la prioridad en el motor (sin cambiar pesos)
- [x] T10 I-1b: lista de jobs esperados en `riesgo/salud.ts`
- [x] T10b: un job esperado cuya última corrida es `fallido` se reporta como `fallando` (no como al día)
- [x] T11 P-4: runbook del scheduler por entorno (Coolify en prod, systemd en staging; reflejar timers de staging apagados el 2026-10-13)
- [x] T12 V-3: completar `scripts/exportar-dataset-desidentificado.mjs` con la consulta real y su test
- [x] T13 G-4: quitar el caudal hardcodeado del comentario de `parana-goya` (`puntos-rio.ts:59`); los umbrales los calcula `climatologia-caudal`
- [x] T14 I-2 (código): impedir que `scripts/seed-demo-partes.mjs` corra contra producción
- [x] T15 Q7: checklist de rotación de credenciales + SQL de rol de solo lectura en `docs/`

## Bloqueados (fuera de este ciclo)

- I-2: usuario decidió borrar los partes de prueba de producción (2026-10-13); pendiente autorización operativa (alcance, respaldo, acceso).
- Desbloqueados por decisiones (próximo ciclo): I-3 + G-1 (Q4), F-1/F-4 (Q5, Q6).
- Datos: G-4 (valor original de caudal de `parana-goya`), G-1 (coordenadas de estaciones).
- Operativos: I-4, P-6, I-1c. Dependientes: G-2, F-2, F-3, V-1, V-2, M-1, I-7b/c.

## Decisiones del usuario (2026-10-13)

- Entrega: `stacked-to-main`. Slice 1 = T1-T3 en `GeronimoSerial/refactor` (3e3a758, 25e3046, 054ccbe; ~371 líneas). Slice 2 = T4-T7 + licencia SMN en `GeronimoSerial/refactor-s2` (9c5dd62, 3a1be2d, 9105ad8, ee844f5, 10254bc, fbef7cd; ~473 líneas), apilada sobre slice 1. Slice 3 = T8-T10 en `GeronimoSerial/refactor-s3` (e455c5b, eb6d977, 4f83ec7; ~440 líneas). Slice 4 = T10b + T11 en `GeronimoSerial/refactor-s4` (9d18406, 4a3fbb8; ~660 líneas, mayoría reescritura del runbook). Slice 5 = T12-T15 en `GeronimoSerial/refactor-s5` (a5aa6a8, b764aae, 112ddbb, 003d234; ~740 líneas).
- Pendiente del usuario: agregar `RADAR_ARCHIVO_DIR` a `.env.example` (permisos bloquean `.env*`) y en Coolify con volumen persistente.
- Licencia SMN: uso no comercial con atribución según el usuario (dijo CC BY 2.0, que no restringe uso comercial); registrada como CC BY-NC, pendiente de fuente oficial.
- I-2: borrar todo `infra_parte` y dependientes en producción. **Ejecutado 2026-10-13** (SSH autorizado): respaldo `/root/backups/infra_parte_hub_prod_20261013T170619Z.dump` (4 tablas); conteos 76/129/135/139 → 0/0/0/0 en una transacción (cascada). Restaurar con `pg_restore --data-only`.
- Q1: motor en producción solo tras I-6, I-7, G-3 e I-2 cerradas.
- Q3: apagar climatologías en staging. **Ejecutado**: `enos-ops1-climatologia-{precipitacion,caudal}.timer` deshabilitados.
- Q4: captura horaria de la tabla de Prefectura (revisar términos de uso antes) → desbloquea I-3, G-1.
- Q5: vigencias provisorias de 05 como configuración editable.
- Q6: eventos de medios entran como `pendiente`; publica un admin; fuentes oficiales se publican directo.
- Q7: rotación de credenciales a cargo del usuario; entregar checklist + SQL de rol de solo lectura.
- Q8: revertir timer IMERG en staging. **Ejecutado**: `enos-ops1-sync-imerg.timer` deshabilitado.
- V-3: completar el export. G-4: el valor lo calcula el job, solo corregir el comentario.

## Progreso y evidencia

(Por tarea: ruta, checks observados, commit.)

- T1 — ruta: delegated direct (Haiku); RED/GREEN observed (RED: 2 tests nuevos fallaban, `completado` en vez de `fallido` y `contadores` sin `puntosConError`; GREEN: 6/6); checks: vitest caudal 6/6, vitest `riesgo/jobs` 51/51, `tsc --noEmit` ok, eslint ok; commit: 3e3a758 (`fix(riesgo): mark climatologia-caudal run fallido when no point is processed`).
- T2 — ruta: delegated direct (Haiku); RED/GREEN observed (RED: 2 tests nuevos fallaban, la escuela a 0.5° al este (~49 km) se asociaba a `parana-bella-vista`; GREEN: territorio + rio-asociacion 14/14, `riesgo` completo 415 passed / 2 skipped); reutiliza `elegirPuntoRioMasCercano` (40 km) de `rio-asociacion.ts`, sin haversine duplicado; checks: vitest territorio + rio-asociacion 14/14, vitest `riesgo` 415 passed, `tsc --noEmit` ok, eslint ok; commit: ver git log (`fix(riesgo): use geodesic distance in territory adapter`).
- T3 — ruta: delegated direct (Haiku); RED/GREEN observed (RED: 2 tests nuevos fallaban, `obtenerNivelCaudal` y lote devolvían la corrida posterior a `ahora`; GREEN: `nivel.test.ts` 45/45); `ahora` se filtra con `corridaEn <= ahora` (`corrida_en` en `hazard_forecast`) en `cargarPronostico` y `cargarPronosticosPorLote`; sin `ahora` se conserva el comportamiento actual; climatología sin cambios (T4); checks: vitest `nivel.test.ts` 45/45, vitest `riesgo` serial 417 passed / 2 skipped (en paralelo hubo timeouts de hook de DB, ajenos al cambio), `tsc --noEmit` ok, eslint ok; commit: ver git log (`fix(riesgo): make flow forecast lookup as-of`).
- T4 — ruta: delegated direct (Haiku); RED/GREEN observed (RED: 2 tests nuevos fallaban, con `ahora` entre dos versiones de climatología devolvían los umbrales nuevos en vez de los viejos; GREEN: `nivel.test.ts` + `sync-imerg.test.ts` 58/58); `calculadoEn` (text, `hazard_climatology`) es el instante as-of: con `ahora` sólo cuentan filas `calculadoEn <= ahora` en `cargarUmbralesClimatologia` y `cargarUmbralesPorLote`, sin `ahora` sin cambios; `corridaVigente` renombrado a `emitidoHastaAhora`; fixture de un test as-of previo ajustado a una climatología calculada antes de `ahora` (aserción intacta); referencias a `replay/consulta.ts` (inexistente) reemplazadas en nivel.ts y sync-imerg.ts; checks: vitest `nivel.test.ts` + `sync-imerg.test.ts` 58/58, vitest `riesgo` serial 419 passed / 2 skipped, `tsc --noEmit` ok, eslint ok (3 archivos); commit: ver git log (`fix(riesgo): make climatology thresholds as-of`).

- T5 — ruta: delegated direct (Haiku); RED/GREEN observed (RED: 2 tests nuevos fallaban, sin fila en `hazard_source_health`; GREEN: `job-sync.test.ts` 5/5); provider `open-meteo-radar` (convención `open-meteo-<tipo>` de ensemble/seasonal), ttl 240 min (cron cada 3 h), licencia igual a la de ensemble; éxito → `ok`; excepción del proveedor → `no_disponible` con mensaje fijo `fallo al sincronizar radar meteorológico` (sin cuerpo de respuesta ni secretos); sin ruta de éxito parcial en este job (`obtenerPronosticoRadar` lanza al primer lote fallido), por eso `degradado` no es alcanzable y no se fabricó; purga intacta (T8); checks: vitest `radar-meteo` 73/73, vitest `riesgo/jobs` serial 51/51, `tsc --noEmit` ok, eslint ok (1 warning preexistente `import()` en el test); commit: ver git log (`feat(radar-meteo): record source health on sync`).

- T6 — ruta: delegated direct (Haiku); RED/GREEN observed (RED: `smn-alertas.test.ts` 3 fallidos (ok, degradado, no_disponible) sin fila en `hazard_source_health`, 12 pasaban; GREEN: 15/15); provider `smn-alertas`, ttl 60 min (cron `7-59/15`); licencia `SMN CAP público — licencia no verificada` (no se encontró licencia documentada en el repo, no se inventó); `HttpSmnError` tipado con `status` → HTTP 429 → `degradado` con mensaje fijo `SMN limitó las consultas (HTTP 429)`; otros errores y `OrigenSmnBloqueadoError` → `no_disponible` con mensaje fijo `fallo al sincronizar alertas del SMN`; escritura de salud después de `publicarResultado` en las tres ramas; errores originales relanzados/devueltos igual que antes; checks: vitest `smn-alertas.test.ts` 15/15, vitest `radar-meteo` 76/76, `tsc --noEmit` ok, eslint ok en los dos archivos cambiados; commit: ver git log (`feat(smn): record source health on alerts sync`).

- T6b — ruta: delegated direct (Haiku); RED/GREEN observed (RED: `job-sync.test.ts` falla con insert duplicado de `radar_meteo_run` (pkey) y `fallido` extra tras fallo de salud; `smn-alertas.test.ts` reemitía el error `SQLITE_BUSY` hacia el llamador; GREEN: radar-meteo 78/78); escritura de salud envuelta en best-effort en radar (`.catch`) y SMN (`try/catch` en `registrarSaludSmn`), ambas con `console.warn` de mensaje fijo sin detalle del error; resultado, retorno y errores originales intactos; checks: vitest `radar-meteo` 78/78, vitest `--no-file-parallelism riesgo/jobs` 51/51, `tsc --noEmit` ok, eslint 0 errores en los cuatro archivos (warning `import()` preexistente en `job-sync.test.ts`); commit: ver git log (`fix(radar-meteo): keep run outcome when source health write fails`).

- T7 — ruta: delegated direct (Haiku); RED/GREEN observed (RED: 2 tests fallaban, `contadores` sin `granulosNoPublicados`/`granulosConError` y sin `error_saneado`; GREEN: `sync-imerg.test.ts` 12/12); clasificación en el job: `subset HTTP 404` → `no_publicado`, otro status o error sin status → `error`; el adaptador no expone un "gránulo ausente" por gránulo (el listado CMR ya trae sólo gránulos existentes), así que `no_publicado` = HTTP 404 del subset; `errorSaneado` = `<granuloIso>: <clase> <status>; ...` acotado a 500 caracteres, sin cuerpo, URL ni token; salud: degrada sólo si falla el gránulo más reciente con clase `error` (un 404 del más reciente deja `ok`, igual que un fallo de backfill, sin cambiar la política de umbral); checks: vitest `sync-imerg.test.ts` 12/12, vitest `--no-file-parallelism riesgo/jobs` 52/52, `tsc --noEmit` ok, eslint limpio en los dos archivos; commit: ver git log (`feat(imerg): record failure reason per granule`).

- T8 — ruta: delegated direct (Haiku); RED/GREEN observed (RED: `archivo.test.ts` sin módulo y 2 tests de `job-sync.test.ts` fallaban: sin archivo y con purga sin archivar; GREEN: radar-meteo 84/84); `archivarRuns` (`archivo.ts`) escribe NDJSON gzip a `.tmp` y renombra tras flush, crea el directorio recursivamente; con `RADAR_ARCHIVO_DIR` se archivan las filas a purgar y se borran por id sólo tras archivar; si el archivo falla se omite la purga y se avisa con mensaje fijo (la sincronización completa igual); sin la variable la purga es la de siempre; `.env.example` existe pero no se pudo leer ni editar (acceso denegado en esta sesión), la variable queda pendiente de documentar ahí; checks: vitest radar-meteo 84/84, `tsc --noEmit` ok, eslint 0 errores (warning `import()` preexistente en `job-sync.test.ts`); commit: ver git log (`feat(radar-meteo): archive runs before purge`).

- T9 — ruta: delegated direct (Haiku); RED/GREEN observed (RED: `calculo.test.ts` T-AMN1 y T-AMN3 fallaban, `nivelAmenaza` undefined; GREEN: motor 62/62, tests de tipos sin cambios de fixtures); `scoreAmenaza` y `nivelAmenaza` (mismo `clasificarNivel` que `nivelRiesgo`, null si no hay amenaza) en `ResultadoRiesgoEscuela`; `scoreRiesgo`, pesos y umbrales intactos; sólo `calculo.ts` construye el tipo, así que el campo requerido no rompió fixtures; persistencia y consumidores sin tocar (I-7b/c); checks: vitest motor 62/62, vitest `--no-file-parallelism riesgo` 423 passed / 2 skipped, `tsc --noEmit` ok, eslint limpio en los tres archivos; commit: ver git log (`feat(riesgo): expose hazard score separately from priority`).

- T10 — ruta: delegated direct (Haiku); RED/GREEN observed (RED: suite `salud.test.ts` no carga, falta `riesgo/jobs-esperados.ts`; GREEN: `salud.test.ts` 11/11 con 6 casos nuevos: `sin_corridas`, `atrasado` a 2×+1 min, `ok` a 2×−1 min, fila más reciente aunque fallida, `no_programado`, `sin_trazabilidad`, y nombres de la lista presentes en `NOMBRES_VALIDOS` de `scripts/jobs.mjs`); `jobs-esperados.ts` declara 13 jobs con `TOLERANCIA_ATRASO_JOB = 2`; `evaluarJobsEsperados` (puro) se expone en `obtenerEstadoOperativo` como `jobsEsperados` (campo nuevo, API y UI sin cambios). Hallazgos: (a) `infra_job_run.tipo` no coincide con el nombre de despacho para 9 de 13 jobs (p. ej. `sync-imerg` → `sync-hazard-imerg`, `climatologia-caudal` → `calcular-hazard-climatologia-caudal`), la lista guarda ambos; (b) `verificar-radar-meteo` no llama a `adquirirLease`, así que no escribe `infra_job_run`: queda como `sin_trazabilidad` (no como falso `sin_corridas` permanente); (c) intervalos de los deshabilitados tomados de `CADENCIAS` en `cadencias.ts`, porque el brief no los fijó; (d) `atrasado` usa la última fila de cualquier estado, según el brief; `ultimaCompletadaEn` no se usa aquí; checks: vitest `salud.test.ts` 11/11, vitest `--no-file-parallelism riesgo` 430 passed / 2 skipped, `tsc --noEmit` ok, eslint limpio en los tres archivos; commit: ver git log (`feat(riesgo): flag expected jobs that never ran or are late`).

- T10b — ruta: delegated direct (Haiku); RED/GREEN observed (RED: 3 tests nuevos fallaban (`fallando` ausente, `errorSaneado` y `ultimaCompletadaEn` no expuestos); GREEN: `salud.test.ts` 15/15; el caso fallido viejo → `atrasado` ya pasaba y queda como guarda de regresión); precedencia `no_programado`/`sin_trazabilidad` > `sin_corridas` > `atrasado` > `fallando` > `ok`; `filas` acepta `estado` y `errorSaneado` opcionales (sin ellos se comporta como antes); `errorSaneado` sólo se rellena en `fallando` y viene de la última fila; `ultimaCompletadaEn` por job = última `completado` del tipo; checks: vitest `salud.test.ts` 15/15, vitest `--no-file-parallelism riesgo` 434 passed / 2 skipped, `tsc --noEmit` sin errores, eslint limpio en los tres archivos; commit: ver git log (`feat(riesgo): report expected jobs whose last run failed`).
- T11 — ruta: delegated direct (Haiku); doc pasivo, lectura estructural; runbook reescrito por entorno (Coolify en prod con 7 tareas y crons del brief; systemd sólo en staging con 4 timers activos y 3 deshabilitados); verificación: `rg` de IPs/hosts/secretos sin coincidencias, todos los crons de prod presentes; prettier no está configurado en el repo (no hay dependencia ni config; `pnpm exec prettier` no encontrado); cruce de cadencias contra `jobs-esperados.ts` consistente (sin inconsistencias); commit: ver git log (`docs(ops): align scheduler runbook with production Coolify tasks`).

- T12 — ruta: delegated direct (Haiku); RED/GREEN observed (RED: 4 tests nuevos fallaban con `construirFilasDataset is not a function`; GREEN: 7/7); contrato de columnas en el encabezado del script: una fila por snapshot de run publicado (`instante` = `calculado_en`), `afectacionConfirmadaEnT` = reporte no retirado con `creada_en <= t`, `targetAfectacion24h/72h` = reporte con `creada_en` en (t, t+h], null si la ventana no llega a `ahora`, idEscuela = HMAC(sal, CUE) sin CUE en claro; `nivelPeligroDepartamento` y `lluviaObservadaMm` quedan null (supuesto: no hay fuente as-of conectada); cero reportes válido (targets false); el script ahora hace `ensureSeeded()` y el JSON es la última línea de stdout; checks: vitest export 7/7, `tsc --noEmit` ok, eslint sin errores (los dos archivos están en ignore del config, sin lint efectivo); commit: ver git log (`feat(scripts): implement de-identified dataset export query`).

- T13 — ruta: delegated direct (Haiku); solo comentarios/docs; sin RED/GREEN (no hay comportamiento nuevo); `parana-goya` ya no lleva el caudal hardcodeado y remite a `climatologia-caudal` / `hazard_climatology`; `docs/DEPLOY.md` describe el export real (una fila por snapshot, `idEscuela` HMAC, targets 24h/72h desde `infra_afectacion`, dos columnas `null`); la cabecera de `export-desidentificado.ts` apunta a `docs/DEPLOY.md`; sin tocar coordenadas ni código. Pendiente: `puntos-rio.ts:43` (Corrientes, caudal 17740.9 m³/s) tiene la misma cifra sin verificar; no se modificó. checks: vitest `puntos-rio.test.ts` 5/5, `tsc --noEmit` ok; commit: ver git log (`docs(riesgo): drop unverified parana-goya flow and fix stale export docs`).

- T14 — ruta: delegated direct (Haiku); RED/GREEN observed (RED: 4 tests nuevos de guardia fallaban (`status` 0 con NODE_ENV=production y con URL `_prod`, sin rechazo); GREEN: `seed-demo-partes.test.ts` 6/6); guardia tras el gate DEMO_OK y antes de cualquier import de DB: refusa si `NODE_ENV=production` o si el nombre de base/host de `DATABASE_URL` contiene "prod" (sin imprimir la URL); override sólo con `--permitir-produccion` + `CONFIRMAR_SEED_PRODUCCION=si`, con un solo factor sale con código 1 y sin escribir (verificado: no se crea `DATA_DIR/pg`); aplica también a `--limpiar`; documentado en la cabecera del script. Sin exportar función pura: el script tiene efectos al cargar, así que los casos se cubren por spawn (el test de guardia no necesita DB). Otros inserts de reportes: sólo `lib/infraestructura/test-utils/parte-fixtures.ts` (helper de test vía drizzle, no es script); ningún otro script de `scripts/` inserta en `infra_parte`/`infra_afectacion`; no se modificaron. checks: vitest `seed-demo-partes.test.ts` 6/6, `tsc --noEmit` ok; commit: ver git log (`fix(scripts): refuse to seed demo reports into production`).

- T15 — ruta: delegated direct (Haiku); doc pasivo, lectura estructural; verificación: `rg` de IP/host/usuario/UUID sobre los dos archivos tocados sin coincidencias (sobre `docs/` completo hay coincidencias preexistentes fuera de este cambio, en `docs/DEPLOY.md` y muestras CAP/reportes; no se tocaron); ubicación: `docs/rotacion-credenciales-2026-10.md` junto a `docs/rotacion-clave-nominal.md` (no existía `docs/ops/`); link agregado en la sección "Credenciales de red por job" del runbook; commit: ver git log (`docs(ops): add credential rotation checklist and read-only audit role`).

## Verificación de cierre (2026-10-13, rama s5)

- `pnpm exec vitest run --no-file-parallelism`: 331/332 archivos, 3032 tests ok, 25 omitidos. Única falla: `scripts/backup-postgres.test.ts` por `spawn podman ENOENT` (entorno sin podman; archivo no tocado).
- `pnpm lint`: 0 errores, 14 warnings. `pnpm exec tsc --noEmit`: ok.
- Escaneo de secretos de la sesión en el árbol y en `git log -p main..HEAD`: sin coincidencias.

## Siguiente paso

Abrir los 5 PRs encadenados (decisión del usuario). Pendientes del usuario: rotar credenciales (`docs/rotacion-credenciales-2026-10.md`), `RADAR_ARCHIVO_DIR` en `.env.example` y Coolify, confirmar zona horaria y comando de las tareas de Coolify, limpiar hostnames/UUIDs preexistentes en `docs/DEPLOY.md`. Próximo ciclo: I-3 + G-1 (Prefectura horaria), F-1/F-4 con cola de revisión admin, I-7b/c, y P-6 (programar motor) cuando P-5 esté mergeado.
