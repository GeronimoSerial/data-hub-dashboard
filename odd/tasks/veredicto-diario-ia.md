# Veredicto diario asistido por IA

Branch: `GeronimoSerial/veredicto-diario-ia`
Spec: `docs/propuestas/veredicto-diario-ia.md` (D1–D11, S-1..S-8; P-1 y P-2 resueltos abajo)

## Objetivo

Implementar el veredicto diario de inundación (nivel por reglas deterministas + texto IA trazable),
persistido, visible en un modal desde el mapa de infraestructura y exportable para autoridades
(enlace sin login con vencimiento diario + PDF), reemplazando al briefing E8.

## Decisiones resueltas

- P-1: solo operadores autenticados crean y revocan enlaces; el envío es manual (copiar enlace / descargar PDF).
- P-2: E8 se retira de una vez al publicar el veredicto (se quitan el job horario y `BriefingPanel`; se conserva
  el código reutilizado del pipeline).

## Defaults adoptados en la implementación

- Módulo nuevo `lib/infraestructura/veredicto/`; reutiliza por import el código de `lib/infraestructura/briefing-ia/`
  (proveedor, validador, presupuesto). No se mueve E8 de lugar para no inflar el diff.
- IDs `text` y timestamps `text` ISO, igual que `hidro_lectura` (`drizzle/0013_hidro_lectura.sql`).
- Clasificación de altura de río propia y pura en el módulo veredicto (la rama hermana trae
  `hidrometria/estado-altura.ts`; al fusionar, unificar — ver Integración).
- Celda → departamento: punto-en-polígono del centro de cada celda 0,1° contra
  `public/data/departamentos-corrientes-georef-2026-09-27.geojson`, calculado en memoria y cacheado.
- PDF en servidor con `pdf-lib` (fuentes estándar, sin archivos externos).
- Presupuesto: variables `VEREDICTO_PRESUPUESTO_USD_MES` / `VEREDICTO_COSTO_MAXIMO_USD_LLAMADA` con alias `E8_*`.
- Flag `AI_VEREDICTO_ENABLED` (por defecto apagado, igual que `AI_BRIEFING_ENABLED`).
- Diferido (fuera de esta entrega): V-04b (IMERG aguas arriba), V-06b (job ECMWF determinista),
  V-14 con datos reales (la sección "confirmado en terreno" acepta eventos por prop; la fuente llega con la rama
  hermana), V-16/V-17 (calibración formal), V-19 (IMERG Late/Final). Los veredictos se publican "en calibración".

## Integración con la rama hermana `GeronimoSerial/mapa-peligro-visible`

El modal es autocontenido (`components/veredicto/veredicto-modal.tsx`). El único punto de entrada en el mapa
es un botón agregado en `app/(hub)/mapas/infraestructura/map-client.tsx` (ver tarea T9 para la línea exacta).
Al fusionar la rama hermana, mover ese botón al grupo "Situación actual" de `components/mapas/panel-capas.tsx`
y pasar los eventos reportados de `lib/mapas/eventos-inundaciones.ts` al prop `eventos` del modal.

## Checks

- `npx vitest run <archivos del task>` por tarea; `npx tsc --noEmit -p .` al cierre de cada tarea.
- Línea base: la suite completa ya tiene fallas previas (lista en el scratchpad de la sesión; p. ej.
  `scripts/jobs.migracion-legacy.test.ts`, `scripts/backup-postgres.test.ts`). Solo cuentan fallas nuevas.
- E2E: Postgres 18 local descartable con el dump `prod-20261013T2313Z-post-imerg.dump` (nunca prod).

## Tareas

Ruta por tarea: delegado (writer Haiku) salvo indicación. Disparador: escritura de 2+ archivos no triviales.

- [ ] T1 (V-03) Migración `0015` + esquema drizzle `infra_veredicto_dia` y `infra_veredicto_enlace` + repositorio idempotente con `reemplazado_por`.
- [ ] T2 (V-02, V-04) Celda → departamento y agregador de lluvia observada por departamento-día con cobertura.
- [ ] T3 (V-05, V-06) Agregadores de ríos y de pronóstico (GloFAS vs climatología, ensamble, SMN).
- [ ] T4 (V-07) Reglas deterministas `reglas-veredicto-v0.1` con traza.
- [ ] T5 (V-01, V-08) Prompt, esquema zod, términos prohibidos propios, plantilla de fallback, presupuesto único.
- [ ] T6 (V-09, V-10) Orquestador por corrida + job `veredicto-diario` (cadencia 6 h + cierre de día, timer, `jobs.mjs`, flag).
- [ ] T7 (V-11) API de lectura (vigentes por rango, historial).
- [ ] T8 (V-12, V-13, V-14) Modal autocontenido + punto de entrada en el mapa.
- [ ] T9 (V-15, V-15b) Enlaces con token (crear/revocar, vencimiento 23:59 ART, 410) + vista pública + PDF.
- [ ] T10 (V-18) Retiro de E8 (job, timer, panel, rutas, flag).
- [ ] T11 E2E local con el dump.

## Progreso y evidencia

(se completa por tarea: commit, checks observados)
