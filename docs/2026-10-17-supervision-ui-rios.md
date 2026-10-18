# Supervisión UI y Ríos

## Estado vigente tras revisión manual

La automatización `4cdff315-5912-440b-aace-3e8ac013a611` está **deshabilitada** por corrección del usuario; se cerró su terminal Codex extra. No hay cron de supervisión activo. Las notas anteriores se conservan debajo como historial, no como estado actual.

- **UI:** entrega sobre la ruta real; revisados diff de `map-client.tsx`, CSS local y capturas antes/después de escritorio. Falta devolución visual del usuario. Se solicitó al mismo worker corregir exclusivamente `scrollTo({ behavior: 'smooth' })`, que fuerza movimiento pese al media query de movimiento reducido. Solicitud aceptada `a7d19ed7-8da7-4e40-8185-3bb2e0c44e91`; aplicación pendiente de comprobar. No hay autorización para otra sección.
- **Ríos:** revisada nueva ruta corregida: autorización antes de consultar y sin importación/invocación de `ensureSeeded`. Worker reporta 153 tests tras ajustes. Revisión manual de esta pasada ejecutó las pruebas de la nueva ruta junto con navegación/filtros: 4 archivos, **96 tests aprobados**; no se repitió toda la suite hidrométrica.
- **Verificación visual:** se inspeccionaron capturas del worker, no una sesión autenticada de navegador propia. No confundir esa revisión con una nueva comprobación interactiva.

## Historial de la primera pasada automatizada

Pasada anterior: 2026-10-16 21:42 -03:00. Sin autorización para avanzar sección/batch, integrar, commit o push.

## UI sección 1

- Worker: `term_d2b5b11c-eec9-465b-ba49-2a97f359d3f6`, identidad AGY confirmada en este worktree.
- Última actividad: creó `app/(hub)/mapas/infraestructura/map-header.module.css`; anuncia edición de map-client.tsx. Captura inicial había fallado; no hay entrega ni evidencia visual antes/después revisada.
- Último cambio leído: CSS local en elaboración (temas, tabs, filtros, responsive y movimiento reducido); map-client.tsx aún sin diff al inspeccionarlo. Lectura preliminar, sin aprobación funcional ni visual.
- Acción: ayuda puntual para resolver entorno Node/captura, sin reenviar encargo. `accepted: true`, solicitud `09833df9-368c-4a96-8c32-a7087e48f3bb`; proveedor no certifica turn_started. No duplicar por silencio.
- Pendiente: entrega acotada y verificación real en navegador, preservando filtros/hash/flags/fullscreen/MapLibre. No considerar tsc/HTTP evidencia visual.

## Ríos técnico

- Worker: `term_b7da1793-7eac-43c7-b1a6-e7bb3f88bd61`, identidad AGY confirmada; entrega inicial seguida de informe actualizado. Ahora muestra Generating tras corrección.
- Diff leído: estado-altura.ts, lecturas-repo.ts, pruebas y nueva ruta estaciones/[id]/lecturas; informe propio. API de últimas lecturas preservada.
- Identificación del código revisado: SHA256 diff de los dos módulos `25817fb5c9499ac17f5432936dc2f6bbdace304dab62328b41d60125e856396d`; nueva route.ts `98d640ed20b5854e3e9ecbf65520db5b388a9a0e695739a03e8259bb15070225`, route.test.ts `e2b6f231128920cc415de0d767efd218e1af15d46b3e39067f9b1d149176eb08`.
- Verificación independiente: Vitest 12 archivos / 152 tests aprobados, 3.48 s, BD efímera; no consulta ni escritura a BD dev. tsc informado por worker, no repetido por supervisión. No repetir esta suite sobre el mismo diff.
- Resultado: requiere corrección. Nueva GET ejecuta ensureSeeded antes de autorización, con potenciales escrituras; informe mezcla 21:24:25-03:00 con 03:24:25Z del día siguiente (diferencia de tres horas).
- Acción: solicitar retirar siembra solo de nueva ruta, verificar ausencia de escrituras y corregir horario según evidencia propia. `accepted: true`, solicitud `47e42e39-14bd-4251-be97-94efb45d5e96`; proveedor no certifica turn_started; salida posterior muestra el prompt y Generating.
- Pendiente: revisar diff corregido y pruebas pertinentes. No implementar desde supervisión ni modificar entregables.

En esa pasada se preservaron eliminaciones previas, planes, next.config.mjs y trabajo concurrente. El cron se deshabilitó posteriormente por pedido del usuario, como indica el estado vigente.
