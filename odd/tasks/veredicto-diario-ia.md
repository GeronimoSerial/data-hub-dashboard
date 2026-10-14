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
- Limitación ambiental conocida: la suite completa de vitest se cuelga en esta máquina (workers al ~97 % de CPU
  por más de 20 min). No se corre localmente; se usa `timeout 300 npx vitest run <archivos relacionados>` (o
  `--changed origin/main`) + typecheck + lint. La suite completa corre en CI.
- Fallas previas observadas en archivos relacionados: `scripts/jobs.migracion-legacy.test.ts` (caso briefing-ia).
  Solo cuentan fallas nuevas.
- E2E: Postgres 18 local descartable con el dump `prod-20261013T2313Z-post-imerg.dump` (nunca prod).

## Tareas

Ruta por tarea: delegado (writer Haiku) salvo indicación. Disparador: escritura de 2+ archivos no triviales.

- [x] T1 (V-03) Migración `0015` + esquema drizzle `infra_veredicto_dia` y `infra_veredicto_enlace` + repositorio idempotente con `reemplazado_por`.
- [x] T2 (V-02, V-04) Celda → departamento y agregador de lluvia observada por departamento-día con cobertura.
- [x] T3 (V-05, V-06) Agregadores de ríos y de pronóstico (GloFAS vs climatología, ensamble, SMN).
- [x] T4 (V-07) Reglas deterministas `reglas-veredicto-v0.1` con traza.
- [x] T5 (V-01, V-08) Prompt, esquema zod, términos prohibidos propios, plantilla de fallback, presupuesto único.
- [ ] T6 (V-09, V-10) Orquestador por corrida + job `veredicto-diario` (cadencia 6 h + cierre de día, timer, `jobs.mjs`, flag).
- [ ] T7 (V-11) API de lectura (vigentes por rango, historial).
- [ ] T8 (V-12, V-13, V-14) Modal autocontenido + punto de entrada en el mapa.
- [ ] T9 (V-15, V-15b) Enlaces con token (crear/revocar, vencimiento 23:59 ART, 410) + vista pública + PDF.
- [ ] T10 (V-18) Retiro de E8 (job, timer, panel, rutas, flag).
- [ ] T11 E2E local con el dump.

## Progreso y evidencia

- T1 (delegado, writer Haiku): tablas `infra_veredicto_dia` / `infra_veredicto_enlace`, migración `0015`, repositorio.
  RED observado (import inexistente) → GREEN 8 tests; tsc y eslint limpios. Ajuste del coordinador: el índice
  `(fecha, ambito, inputs_hash)` pasa a no único para permitir volver a un hash anterior (A→B→A); la idempotencia
  la dan el chequeo del vigente y el índice parcial `infra_veredicto_dia_vigente_uidx`.
- T2 (delegado; worker detenido al superar el tope de ~100k tokens, cierre inline del coordinador): `dia.ts`,
  `celda-departamento.ts` (punto-en-polígono propio), `lluvia-observada.ts`. El worker dejó 35/37 en verde; el
  coordinador corrigió el fixture (clave única `observado_en` repetida) y el lector de climatología (orden
  descendente + mapeo de percentiles). GREEN 37 tests; tsc y eslint limpios. Unidad IMERG verificada: `mm/30min`
  (`providers/imerg.ts:263`).
- T3a (delegado): `rios.ts` (clasificación, agregado por estación-día, lector con ventana de 36 h; estación → departamento por coordenadas PNA). RED (import) → GREEN 13 tests; tsc/eslint limpios.
- T3b (delegado; el worker cerró en ~107k tokens, por encima del tope): `pronostico.ts` (caudal GloFAS vs climatología, ensamble, avisos SMN). Correcciones del coordinador: el caudal diario GloFAS se ancla a `T00:00Z`, así que se filtra por día calendario UTC (test de regresión agregado); `smn_alerta.nivel_sat` se guarda siempre nulo (`smn-alertas.ts:446`), así que el color sale de la `severity` CAP (Moderate=amarillo, Severe=naranja, Extreme=rojo). GREEN 6 tests; tsc/eslint limpios.
- T4 (delegado; worker en ~119k tokens, por encima del tope): `reglas.ts` `reglas-veredicto-v0.1`. Corrección del coordinador: el SMN sin avisos no alcanza para `sin_senal`; se exige una fuente cuantitativa (4 tests actualizados). Defaults aceptados: el tope de ensamble aplica solo a días `pronostico`; la lluvia provincial no dispara nivel (el provincial es el máximo departamental); estaciones fuera de la provincia aparecen en la traza provincial sin subir el nivel. GREEN 50 tests; tsc/eslint limpios.
- T5a (delegado, ~95k tokens): validador E8 con verificador de términos opcional (sin cambio para E8), `esquema.ts` (zod; se descarta `factores` porque la traza ya los lleva), `terminos.ts` (prohibidos propios con permiso por ref). RED → GREEN 60 tests; E8 completo 117 verdes; tsc/eslint limpios.
- T5b (delegado; ~112k tokens, por encima del tope): `metricas.ts` (ids alineados con las refs de reglas, URL de fuente), `prompt.ts`, `plantilla.ts`, `hash.ts`. Correcciones del coordinador: métricas `rio.<id>.evacuacion_m` / `alerta_m` (altura máx + margen); prompt reescrito en español neutro y con la forma real del esquema (`veredictos[]`). GREEN 14 tests; tsc/eslint limpios.
- T6a (delegado, ~100k tokens): `entradas.ts` (`fechasVentana` 7+hoy+3, `calcularDia`), `listarDepartamentos`. Default: celdas fuera de los polígonos departamentales no cuentan para la lluvia provincial. RED → GREEN; veredicto 158 tests verdes; tsc/eslint limpios.
- T6b (delegado, ~107k tokens): `generar.ts` (una llamada por corrida, validación por ámbito-día, plantilla, presupuesto con reserva y ajuste, `cerrarDiaAnterior`). Formas persistidas: `traza_reglas = { reglas }`, `metricas = { metricas }`; tokens/costo solo en la primera fila de cada llamada. GREEN 6 tests; tsc/eslint limpios.
