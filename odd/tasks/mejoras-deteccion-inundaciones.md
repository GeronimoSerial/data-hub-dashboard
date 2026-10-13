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
- [ ] T7 P-2: motivo por gránulo IMERG fallido (no publicado vs error)
- [ ] T8 I-5a: exportar corridas de radar antes de la purga
- [ ] T9 I-7a: exponer amenaza separada de la prioridad en el motor (sin cambiar pesos)
- [ ] T10 I-1b: lista de jobs esperados en `riesgo/salud.ts`
- [ ] T11 P-4: runbook del scheduler por entorno (Coolify en prod, systemd en staging; reflejar timers de staging apagados el 2026-10-13)
- [ ] T12 V-3: completar `scripts/exportar-dataset-desidentificado.mjs` con la consulta real y su test
- [ ] T13 G-4: quitar el caudal hardcodeado del comentario de `parana-goya` (`puntos-rio.ts:59`); los umbrales los calcula `climatologia-caudal`
- [ ] T14 I-2 (código): impedir que `scripts/seed-demo-partes.mjs` corra contra producción
- [ ] T15 Q7: checklist de rotación de credenciales + SQL de rol de solo lectura en `docs/`

## Bloqueados (fuera de este ciclo)

- I-2: usuario decidió borrar los partes de prueba de producción (2026-10-13); pendiente autorización operativa (alcance, respaldo, acceso).
- Desbloqueados por decisiones (próximo ciclo): I-3 + G-1 (Q4), F-1/F-4 (Q5, Q6).
- Datos: G-4 (valor original de caudal de `parana-goya`), G-1 (coordenadas de estaciones).
- Operativos: I-4, P-6, I-1c. Dependientes: G-2, F-2, F-3, V-1, V-2, M-1, I-7b/c.

## Decisiones del usuario (2026-10-13)

- Entrega: `stacked-to-main`. Slice 1 = T1-T3 en `GeronimoSerial/refactor` (3e3a758, 25e3046, 054ccbe; ~371 líneas). Slice 2 desde T4 en `GeronimoSerial/refactor-s2`, apilada sobre slice 1.
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

## Siguiente paso

T7.
