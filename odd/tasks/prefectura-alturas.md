# Captura horaria de alturas de Prefectura (I-3 + G-1)

## Objetivo

Ingerir cada hora la tabla de alturas hidrométricas de Prefectura Naval Argentina (PNA) con sus umbrales oficiales de alerta y evacuación (I-3), y modelar las estaciones como entidad (G-1).

## Problema y por qué

El sistema no tiene alturas observadas ni umbrales oficiales por estación; los puntos de río actuales son celdas de caudal GloFAS (`puntos-rio.ts`), no estaciones. Plan: `docs/investigacion-inundaciones-corrientes/06-plan-mejoras.md:42-50` (I-3), `:153-157` (G-1); contrato `LecturaHidrometrica` en `05-diseno-deteccion.md`; operación en `07-actualizacion-continua.md:7`.

## Alcance autorizado

Código, pruebas y docs en la rama `GeronimoSerial/prefectura-alturas` (desde `origin/main` 4aa1882). Commits por unidad de trabajo. Sin push, PR, cambios en producción/staging ni Coolify. Única red: GETs públicos a `contenidosweb.prefecturanaval.gob.ar` para fixtures.

## Restricciones y supuestos

- Q4 (usuario, 2026-10-13): captura horaria, User-Agent identificado, backoff; revisar términos antes.
- Términos revisados 2026-10-13: `contenidosweb.prefecturanaval.gob.ar` no publica términos, aviso legal ni robots.txt (404); argentina.gob.ar licencia su contenido CC BY 4.0 con `Crawl-delay: 10`. Nada impide la captura. Licencia registrada como "sin términos publicados; atribución a Prefectura Naval Argentina".
- Fuente de registro: tabla `alturas/index.php` (`table.fpTable`). `mapa.php` (JSON embebido con coordenadas) solo para G-1.
- Fechas `DD/MON/YY - HHMM` sin zona: se asume hora de Argentina (UTC-3), inferido del histórico; pendiente confirmar con PNA.
- Excluir estaciones de caudal (m³/s): Caixa, Capanema, Guayra, Itaipú. `S/E` y `-` → null. Lecturas inconsistentes se marcan, no se descartan. No trasladar umbrales entre estaciones.
- Dedup `(estacion_id, medida_en)`. Siguiente migración: `0013`.
- Workers: una tarea atómica por vez, un solo writer. Checks: `pnpm exec vitest run <archivo>` por tarea; al cierre `pnpm exec tsc --noEmit` y `pnpm lint`.
- RDD: off (global). Entrega: `ask-on-risk` → cadena `stacked-to-main` (elegida por el usuario 2026-10-13). Slice 1 = T1 en `GeronimoSerial/prefectura-alturas` (4d128b1, 7f0b2d5). Slice 2 = T2-T3 en `GeronimoSerial/prefectura-alturas-s2` (50b5522, b911b04; ~490 líneas sin snapshot generado), apilada sobre slice 1. Slice 3 = T4-T5 en `GeronimoSerial/prefectura-alturas-s3` (11589f5, a9c9121), apilada sobre slice 2. Slice 4 = T6-T7 en `GeronimoSerial/prefectura-alturas-s4` (62f9939, 66ed1f7), apilada sobre slice 3.

## Checklist

- [x] T1 Parser puro `index.php` → lecturas (fixture HTML guardado, error de cambio de estructura, inconsistencias)
- [x] T2 Catálogo versionado de estaciones PNA de Corrientes + aguas arriba (nombre PNA, id histórico, río, `estacionId`)
- [x] T3 Tabla `hidro_lectura` + migración `0013`
- [x] T4 Cliente de descarga con User-Agent identificado y reintentos (429/5xx → degradado; estructura → no_disponible)
- [x] T5 Job `sync-prefectura-alturas`: lease horario, upsert, `publicarResultado`, salud de fuente
- [x] T6 Registro del job (`jobs.mjs`, `cadencias.ts`, `jobs-esperados.ts` con `habilitado:false`) + timer systemd + fila del runbook
- [x] T7 G-1a: coordenadas declaradas por PNA (`mapa.php`) en el catálogo con `verificada:false`

## Bloqueados / decisiones abiertas

- G-1b: asignación localidad → estación por tramo de río la decide una persona (¿quién?).
- ¿Las coordenadas de `mapa.php` cuentan como verificadas?
- Backfill desde el histórico (7 días) — opcional.
- Programar en Coolify: acción del usuario.

## Progreso y evidencia

(Por tarea: ruta, checks observados, commit.)

- T1 — ruta: delegated direct (Haiku); RED (import fallaba, módulo inexistente) / GREEN 14/14; checks: vitest parser 14/14 (re-ejecutado por el padre), `tsc --noEmit` ok, eslint ok; commit 4d128b1 (`feat(hidrometria): parse Prefectura river heights table`), ~650 líneas (192 de fixture). Hallazgos: clase `table table-hover fpTable`; `<th>` sin `data-label` → columnas por posición tras validar los 13 encabezados; Caixa se publica `CAXIA (BRASIL)`; estado `S/E.` con punto.

- T2 — ruta: delegated direct (Haiku); RED (import fallaba) / GREEN 25/25 en `hidrometria`; checks: vitest `hidrometria` 25/25 (re-ejecutado por el padre), `tsc --noEmit` ok, eslint ok; commit 50b5522 (`feat(hidrometria): add versioned Prefectura station catalogue`). 21 estaciones (18 Corrientes + 3 contexto aguas arriba), nombres verificados contra la página en vivo; búsqueda por `idHistorico` con respaldo por nombre normalizado.
- T3 — ruta: delegated direct (Haiku); RED (import fallaba) / GREEN 30/30 en `hidrometria` (tests de DB ejecutados en PGlite en memoria); checks: vitest `hidrometria` 30/30 (re-ejecutado por el padre), `tsc --noEmit` ok, eslint ok, sin drift en la migración; commit b911b04 (`feat(hidrometria): add hidro_lectura table and idempotent save`). `doublePrecision` para metros; `ON CONFLICT DO NOTHING` sobre `(estacion_id, medida_en)`; filas sin fecha se cuentan como `sinFecha`.
- T4 — ruta: delegated direct (Haiku); RED (import fallaba) / GREEN 40/40 en `hidrometria`; checks: vitest 40/40 (re-ejecutado por el padre), `tsc --noEmit` ok, eslint ok; commit 11589f5 (`feat(hidrometria): add Prefectura download client with identified user agent`). No reutiliza `ejecutarConReintentos` (no admite headers, parsea JSON, sleep no inyectable); loop local con la misma política. UA sin email personal. Nota: las descargas de fixture de T1/T2 enviaron el email del usuario en el UA (informado al usuario).
- T5 — ruta: delegated direct (Haiku); RED (import fallaba) / GREEN 46/46 en `hidrometria`; checks: vitest `hidrometria` 46/46 (re-ejecutado por el padre), `job-run.test.ts` 11 passed / 1 skipped (requiere `DATABASE_URL_TEST`), `tsc --noEmit` ok, eslint ok; commit a9c9121 (`feat(hidrometria): add hourly Prefectura heights sync job`). Lease por hora UTC; segunda corrida en la misma hora → `omitido`; 0 estaciones del catálogo → `fallido`; mensajes fijos en `errorSaneado`. El job devuelve resultado sin relanzar en fallas controladas: T6 debe mapear `fallido` a código de salida ≠ 0 en `jobs.mjs`.
- T6 — ruta: delegated direct (Haiku); RED 8 tests / GREEN 108/108 (jobs, cadencias, salud, hidrometria); checks: `tsc --noEmit` ok, `pnpm lint` ok (14 warnings preexistentes), jobs+cadencias re-ejecutados por el padre; commit 62f9939 (`feat(jobs): register hourly Prefectura heights sync`). `fallido` → exit 1 solo para este job; `habilitado:false` → `no_programado`; timer `*:17` sin habilitar; runbook con fila pendiente en Coolify (`17 * * * *`). Hallazgo fuera de alcance: `sync-smn-alertas` devuelve `fallido` y sale con 0.
- T7 — ruta: delegated direct (Haiku); RED 8 / GREEN 51/51 en `hidrometria`; checks: `tsc --noEmit` ok, eslint ok; commit 66ed1f7 (`feat(hidrometria): add publisher-declared station coordinates`). Catálogo `estaciones-prefectura-v2`: 21/21 estaciones con coordenadas de `mapa.php`, `verificada:false`; Corrientes, Goya e Itatí publicadas con 2 decimales (~1 km).

## Próximo paso

Cierre local: `tsc --noEmit` ok, `pnpm lint` ok (0 errores, 14 warnings preexistentes); suite completa de vitest local no terminó en 10 min (corrida interrumpida, coincidió con un cambio de rama ajeno en el worktree) → gate de suite completa = CI de cada PR. Usuario autorizó (2026-10-13) mergear la cadena hasta prod. Pendiente usuario: programar en Coolify (`17 * * * *`) y luego `habilitado:true`; decisiones G-1b. Espejo Engram pendiente.
