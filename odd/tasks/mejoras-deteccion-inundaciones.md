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
- [ ] T4 I-6b/c: umbrales de climatología as-of + limpiar referencias a `replay/consulta.ts`
- [ ] T5 I-8a: salud de fuente en sync de radar-meteo
- [ ] T6 I-8b: salud de fuente en sync SMN (429 → degradado)
- [ ] T7 P-2: motivo por gránulo IMERG fallido (no publicado vs error)
- [ ] T8 I-5a: exportar corridas de radar antes de la purga
- [ ] T9 I-7a: exponer amenaza separada de la prioridad en el motor (sin cambiar pesos)
- [ ] T10 I-1b: lista de jobs esperados en `riesgo/salud.ts`
- [ ] T11 P-4: runbook del scheduler por entorno (Coolify en prod, systemd en staging)

## Bloqueados (fuera de este ciclo)

- I-2: usuario decidió borrar los partes de prueba de producción (2026-10-13); pendiente autorización operativa (alcance, respaldo, acceso).
- Decisión del equipo (09): I-3 (Q4), F-1/F-4 (Q5, Q6), P-3 (Q3), V-3 (terminar o quitar export).
- Datos: G-4 (valor original de caudal de `parana-goya`), G-1 (coordenadas de estaciones).
- Operativos: I-4, P-6, I-1c. Dependientes: G-2, F-2, F-3, V-1, V-2, M-1, I-7b/c.

## Progreso y evidencia

(Por tarea: ruta, checks observados, commit.)

- T1 — ruta: delegated direct (Haiku); RED/GREEN observed (RED: 2 tests nuevos fallaban, `completado` en vez de `fallido` y `contadores` sin `puntosConError`; GREEN: 6/6); checks: vitest caudal 6/6, vitest `riesgo/jobs` 51/51, `tsc --noEmit` ok, eslint ok; commit: 3e3a758 (`fix(riesgo): mark climatologia-caudal run fallido when no point is processed`).
- T2 — ruta: delegated direct (Haiku); RED/GREEN observed (RED: 2 tests nuevos fallaban, la escuela a 0.5° al este (~49 km) se asociaba a `parana-bella-vista`; GREEN: territorio + rio-asociacion 14/14, `riesgo` completo 415 passed / 2 skipped); reutiliza `elegirPuntoRioMasCercano` (40 km) de `rio-asociacion.ts`, sin haversine duplicado; checks: vitest territorio + rio-asociacion 14/14, vitest `riesgo` 415 passed, `tsc --noEmit` ok, eslint ok; commit: ver git log (`fix(riesgo): use geodesic distance in territory adapter`).
- T3 — ruta: delegated direct (Haiku); RED/GREEN observed (RED: 2 tests nuevos fallaban, `obtenerNivelCaudal` y lote devolvían la corrida posterior a `ahora`; GREEN: `nivel.test.ts` 45/45); `ahora` se filtra con `corridaEn <= ahora` (`corrida_en` en `hazard_forecast`) en `cargarPronostico` y `cargarPronosticosPorLote`; sin `ahora` se conserva el comportamiento actual; climatología sin cambios (T4); checks: vitest `nivel.test.ts` 45/45, vitest `riesgo` serial 417 passed / 2 skipped (en paralelo hubo timeouts de hook de DB, ajenos al cambio), `tsc --noEmit` ok, eslint ok; commit: ver git log (`fix(riesgo): make flow forecast lookup as-of`).

## Siguiente paso

T4.
