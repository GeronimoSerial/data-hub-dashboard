# mapa-reorganizacion

Objetivo: mapa nativo `/mapas/reorganizacion` con paridad funcional del mockup V29. Plan completo: `docs/plan-mapa-reorganizacion.md` (fuente de verdad de alcance y reglas).
Rama: `feat/mapa-reorganizacion`. Entrega: `ask-on-risk`. Runner: `npx vitest run <archivo>` solo sobre los archivos tocados (CI es la compuerta). Workers: Haiku (Agent tool, `model: haiku`), una tarea por worker.

## Specs

- S1: Importar el corte V29 sin ejecutar scripts del HTML: 265 CUE-Anexo únicos, 1.376 alumnos, 262 importes salariales positivos, POF vacía (0 registros), 64 centros, 62 zonas ocupadas, 89 aislados, 1.166 referencias frente a 1.167 claves de agregados (la diferencia se informa, nunca se descarta en silencio).
- S2: Datos en `lib/reorganizacion/data/v29.json`, solo servidor; nunca en `public/`. Decisión del usuario: "JSON en repo, solo servidor".
- S3: Los filtros reducen listado e indicadores, pero el mapa mantiene todo el universo como contexto (coincidencias resaltadas, resto atenuado). La clasificación salarial modifica solo el resaltado, no el conjunto filtrado.
- S4: Tendencia zonal 2023 vs 2026 solo con establecimientos comparables; zona sin comparables = "sin comparación". Historia faltante no es cero.
- S5: Economía por zona completa: `potencial bruto mensual = costo informado - importe de la referencia retenida`; calculable solo con al menos 2 establecimientos y 2 importes positivos; nunca extrapolar faltantes.
- S6: Página y APIs respetan sección y audiencia del recurso `/mapas/reorganizacion`; alta idempotente que no pisa audiencias; sin acoplar a permisos de infraestructura.
- S7: Mapa con MapLibre/React Map GL (sin Leaflet ni iframe); abre encuadrando Corrientes como natalidad; no reinicia la cámara al volver de otra vista; control de volver al encuadre provincial y pantalla completa.
- S8: Capas: zonas (círculo de 20 km de diámetro), universo (amarillo), otras primarias (celeste), secundarias (verde), selección/coincidencias (anillo + etiqueta).
- S9: Fichas de escuela y de zona con toda la información disponible y advertencias metodológicas.
- S10: Recorridos por proveedor encapsulado en API protegida (URL configurable por entorno, timeout, cancelación); los errores nunca producen distancia lineal falsa.
- S11: Fondos vial/topográfico/calles/satélite sin perder capas. El proveedor satelital y el servicio vial de producción quedan como PENDIENTES: ningún worker elige fuente de tiles ni proveedor.
- S12: Ningún control visible sin comportamiento (las pestañas inertes del mockup no se trasladan). Móvil y teclado funcionan. UI en español neutro.
- S13: Matriz de paridad que relaciona cada comportamiento del mockup con implementación y prueba.

## Tasks

Oleadas: W1 -> W2 (paralelas, superficies disjuntas) -> W3 (alto riesgo, commit propio cada una) -> W4 -> W5. Todas las rutas: delegated (pedido explícito del usuario: Haiku).

- [x] T1 (S1,S2) W1: tipos + parser puro `lib/reorganizacion/{tipos,importar-v29}.ts` + test con fixture mínima | delegated | commit: 7cc2e8ab
- [x] T2 (S1,S2) W1: CLI `scripts/importar-reorganizacion-v29.mjs`, generar `data/v29.json` + informe de cobertura, test de conteos sobre el JSON | delegated | commit: 398b9850 (matriculaPrimaria null = sin dato, 901 referencias)
- [x] T3 (S3) W2: `lib/reorganizacion/filtros.ts` búsqueda, filtros, resaltado + test | delegated | commit: ffc07374 (clave de tendencia unificada con zonas.ts)
- [x] T4 (S4) W2: `lib/reorganizacion/zonas.ts` miembros, tendencia comparable, aislados + test | delegated | commit: 0b0418a9
- [x] T5 (S5) W2: `lib/reorganizacion/economia.ts` + test | delegated | commit: 5124e1ac
- [x] T6 (S6) W2: `lib/mapas/recurso-seed-reorganizacion.ts` + hook en `lib/db/seed.ts` + test | delegated | commit: 3c7c64bb
- [x] T7 (S6) W3 ALTO RIESGO ítem 2: rutas en `lib/hub-sections.ts` y `lib/hub-entry-server.ts` + tests | delegated | commit: 47a91662 (verificador independiente: sin bloqueantes)
- [x] T8 (S2,S6) W3 ALTO RIESGO ítem 2: `app/api/mapas/reorganizacion/datos/route.ts` protegida + test de acceso | delegated | commit: 72c30a1b (verificador independiente: sin bloqueantes)
- [x] T9 (S6,S7) W3: `app/(hub)/mapas/reorganizacion/{page,map-client}.tsx` con mapa diferido | delegated | commit: f8f16809
- [x] T10 (S7) W4: mapa base: máscara, límites, nombres, fitBounds, reset, pantalla completa, `visible` | delegated | commit: f4747d85
- [x] T11 (S8) W4: `lib/reorganizacion/capas.ts` constructores GeoJSON puros + test | delegated | commit: 9adf568b
- [x] T12 (S8) W4: cablear capas y atenuado en el mapa | delegated | commit: 0aaf6444 + T12b1 d506be51 + T12b2 bfaceaeb
- [x] T13 (S3,S12) W4: panel de indicadores, filtros y listado | delegated | commit: f585202e
- [x] T14 (S9) W4: ficha de escuela | delegated | commit: 677c38c5
- [x] T15 (S9) W4: ficha de zona + resumen económico | delegated | commit: e9808d1e
- [x] T16 (S11) W4: selector de fondo (satélite marcado pendiente) | delegated | commit: c42c37d5 (solo fondos existentes; topográfico y satelital PENDIENTES)
- [x] T17 (S10) W4: `app/api/mapas/reorganizacion/ruta/route.ts` proxy + test | delegated | commit: fee570c9
- [x] T18 (S10) W4: UI y estado de recorridos | delegated | commit: 0f35ebf1
- [x] T19 (S9,S12) W4: leyenda y metodología | delegated | commit: e95a336d
- [x] T20 (S13) W5: matriz de paridad `docs/paridad-mapa-reorganizacion.md` | delegated | commit: 84489b4e
- [x] T21 W5: tsc, eslint y vitest de archivos tocados; reporte | delegated | commit: n/a (tsc sin errores propios, eslint 0 errores, 299 tests en 31 archivos)

## Log

L1 (2026-10-29): "//home/gero/orca/workspaces/data-hub-dashboard/mapa-reorganizacion/docs/plan-mapa-reorganizacion.md implementalo con haikus, dividi las tareas en subtareas para atomizar los tasks de haiku y no pasar de ~100k tokens"

L2 (2026-10-29): pregunta sobre almacenamiento de importes salariales. Respuesta: "JSON en repo, solo servidor (Recommended)".

Notas del parent: el HTML pesa 611 KB y ningún worker debe leerlo. Extractos disponibles en el scratchpad de la sesión: `mockup-html-css.txt` (líneas 1-50) y `mockup-logic.js` (líneas 56-203, 19 KB). `datosNominales` del mockup es en realidad oferta/matrícula agregada por CUE (`{Primario:{total,turnos,modalidades,orientaciones}}`), sin datos personales. Esquemas: `data[265]{cue,nombre,departamento,localidad,ambito,cui,jurisdiccion,modalidad,matricula,historia{2025,2026},lat,lon,pof{},agentes,zona,sueldos_total,personas_sueldos,clasificacion_zona_sueldos}`; `referentes[1166]{cue,nombre,lat,lon,primaria,secundaria,matriculaPrimaria,localidad,departamento}`; `centers[64]{lat,lon,id}`.

L3 (2026-10-29): verificador independiente T6/T7/T8/T17: 0 bloqueantes. Advisories: A1 la página (T9) debe pasar el literal canónico '/mapas/reorganizacion' (la lista de rutas usa igualdad exacta); A2 el limitador confía en el primer X-Forwarded-For (preexistente); A3 el host OSRM por defecto es el demo público, las coordenadas de escuelas salen a un tercero hasta definir REORGANIZACION_OSRM_URL (proveedor de producción PENDIENTE); A4 cuerpo upstream sin tope de tamaño; A5 el seed reinicia estado/título en cada arranque (igual que natalidad); A6 `datos` entrega importes por escuela a toda la audiencia del recurso (confirmar audiencia).

L4 (2026-10-29): cierre. Pendientes de paridad para iterar en dev: P7 encuadre a coincidencias al filtrar; P8 ocultar nombres de departamentos con zoom < 8 y aviso si falla el proveedor de límites; fondos topográfico y satelital; proveedor vial de producción; procedencia de centros 60-64; verificación en navegador (encuadre inicial, móvil, teclado, capas al cambiar de fondo, cursor). Detalle en docs/paridad-mapa-reorganizacion.md.

L5 (2026-10-29): usuario: "el sidebar se ve PÉSIMO, necesito una refactorizacion total, hacelo vos mismo." Causa raíz: los componentes de Haiku usaban clases utilitarias estilo Tailwind que el repo no incluye. Rehecho por el parent: SidebarReorganizacion (encabezado, pestañas Escuelas/Capas/Recorrido, detalle), PanelCapasReorganizacion (leyenda y control en una fila, fondo), restyle de recorrido, ficha de zona y metodología con clases `rz-*`; se elimina la leyenda separada. Commit 83f9fca5, desplegado a dev en 4d004eb7. Pendiente: verificación en navegador real (móvil, teclado, capas tras cambiar de fondo).
