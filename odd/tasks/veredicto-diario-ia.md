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
es un botón "Veredicto diario" en `components/mapas/map-infraestructura-page.tsx` (bloques marcados con el comentario
`// Veredicto diario: punto de entrada mínimo`: import, estado `veredictoAbierto`, handler `centrarDepartamentoVeredicto`
junto a `seleccionarDepartamentoRadar`, y botón + `<VeredictoModal>` antes de `FullscreenButton`).
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
- [x] T6 (V-09, V-10) Orquestador por corrida + job `veredicto-diario` (cadencia 6 h + cierre de día, timer, `jobs.mjs`, flag).
- [x] T7 (V-11) API de lectura (vigentes por rango, historial).
- [x] T8 (V-12, V-13, V-14) Modal autocontenido + punto de entrada en el mapa.
- [x] T9 (V-15, V-15b) Enlaces con token (crear/revocar, vencimiento 23:59 ART, 410) + vista pública + PDF.
- [x] T10 (V-18) Retiro de E8 (job, timer, panel, rutas, flag).
- [x] T11 E2E local con el dump.

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
- T6c (delegado en dos workers: el primero se detuvo cerca del tope; el segundo, acotado, ~79k): `job.ts` (lease por slot de 6 h UTC y por día ART para el cierre), flag `AI_VEREDICTO_ENABLED`, cadencias, `jobs.mjs` (gate por `ENOS_JOBS_ENABLED` + `AI_VEREDICTO_ENABLED`), timers `00,06,12,18:45 UTC` y `03:30 UTC`, `DEPLOY.md` y runbook. GREEN: veredicto/job 10, flags+cadencias 41, `scripts/jobs.test.ts` 30; `node --check` ok; tsc limpio.
- T7 (delegado, ~91k): `dto.ts` (sin tokens/costo/modelo/hash), `GET /api/infraestructura/veredictos` (rango ≤ 31 días, por defecto la ventana 7+hoy+3) y `/veredictos/historial`. Ajuste del coordinador: el listado devuelve `version: null` (la numeración vive en el historial). GREEN 20 tests; tsc/eslint limpios.
- T8a (delegado, ~89k): `components/veredicto/veredicto-modal.tsx` + `nivel-chip.tsx` (autocontenido: timeline, detalle, traza, fuentes ausentes, departamentos con señal, "confirmado en terreno" por prop `eventos`, `acciones` por prop). Correcciones del coordinador: la etiqueta observado/hoy/pronóstico y el día por defecto salen de `tipoDia` (no del reloj del navegador); con frases de IA no se repite `texto`. GREEN 7 tests; tsc/eslint limpios.
- T8b (delegado, ~79k): entrada mínima en el mapa. Ajuste del coordinador: botón con clases Tailwind y `bottom-24` para no pisar el botón de pantalla completa en mobile. tsc limpio; `map-client.test.tsx` 24 verdes. La sincronización de la capa IMERG con el día elegido queda para la integración con la rama hermana.
- T9a (delegado, ~90k): `enlaces.ts` (token de 32 bytes, solo hash SHA-256, vence 23:59:59.999 ART, revocación de los enlaces del día) y `POST/DELETE /api/infraestructura/veredictos/enlaces` (solo staff). Ajuste del coordinador: vencimiento ausente o ilegible = vencido (fail-closed). GREEN 20 tests; tsc/eslint limpios.
- T9b1 (delegado, ~82k): `pdf.ts` (pdf-lib, registro no técnico, saneo WinAnsi, `lineasPdf` testeable). Corrección del coordinador: `etiquetaNivel` se movió a `veredicto/niveles.ts` (sin 'use client'), porque el PDF de servidor no puede importar de un módulo de cliente. GREEN 19 tests (PDF + modal); tsc/eslint limpios.
- T9b2 (delegado, ~101k, levemente sobre el tope): PDF para staff (`/api/infraestructura/veredictos/pdf`), PDF público por token (`/api/veredicto/compartido/[token]/pdf`: 404 inexistente, 410 vencido/revocado sin datos, `X-Robots-Tag: noindex`), página pública `/veredicto/compartido/[token]` (noindex; enlace vencido/revocado sin datos) y `veredicto-publico.tsx`. Ajuste del coordinador: `nombreDepartamento` compartido en `niveles.ts` (el id ya es el nombre normalizado). Desvío registrado: la página Next devuelve 200 con la vista de "Enlace no disponible"; el 410 lo dan las rutas JSON/PDF. Diferidos: rate limit por IP y auditoría de accesos. GREEN 35 tests; tsc/eslint limpios.
- T9b3 (delegado, ~76k): `veredicto-acciones.tsx` (copiar enlace con fallback manual, descargar PDF, revocar enlaces del día con confirmación), renderizado por defecto en el modal. GREEN 20 tests de componentes; tsc/eslint limpios.
- T10 (delegado en dos workers; T10a se detuvo correctamente ante un conflicto y retomó con la decisión del coordinador: se conservan `briefing-ia/puertos.ts` y `test-utils/` porque `metricas.ts` los usa). Retirados: job `briefing-ia` (cadencia, timer, `jobs.mjs`), rutas `/api/infraestructura/briefings/*`, `job/generar-briefing-asistido/repositorio/dto`, flag `AI_BRIEFING_ENABLED` (salud ahora reporta `aiVeredictoEnabled`), `BriefingPanel` y su sección en Situación, `scripts/jobs.migracion-legacy.test.ts` (luego restaurado y portado al veredicto, ver fix post-revisión 1). Se conservan proveedor, validador, esquema, métricas y presupuesto, y la tabla `infra_briefing` como histórico. tsc limpio; 334 tests verdes en las áreas afectadas.
- T11 (inline, coordinador): Postgres 18 local descartable (`postgres:18-alpine`, puerto 127.0.0.1:55432) con el dump
  `prod-20261013T2313Z-post-imerg.dump` (675.636 gránulos IMERG, 26 lecturas de Prefectura; `hazard_forecast` y
  `hazard_ensemble_prob` vacías). Job real `node scripts/jobs.mjs veredicto-diario` sin clave de OpenRouter:
  14 veredictos (11 días + 3 departamentos con señal), todos por plantilla (`sin_api_key`). 13/10: provincia
  **severo**, Paso de los Libres e Ituzaingó **severo** (Prefectura en evacuación: 9,33 m / 8,5 m y 4,03 m / 4 m),
  San Martín **alerta** (La Cruz 10,32 m / 9,5 m): coherente con la crecida registrada. 06–10/10 `sin_dato` (IMERG
  con cobertura < 80 % y sin lecturas de Prefectura, tabla nueva); pronóstico `sin_dato` (tablas vacías en el dump).
  Segunda corrida: 14 sin cambios, 0 insertados (idempotencia). PDF generado y revisado visualmente; enlace válido a
  las 23:59 ART, vencido a las 00:01, revocado tras `revocarEnlacesDelDia`.
  Correcciones surgidas del E2E: la plantilla ya no repite fecha/nivel (la primera oración es la señal), el río se
  describe con estación, estado, altura y umbral, las fuentes ausentes y la lista de fuentes usan nombres legibles.
  Checks: 256 tests verdes en veredicto/componentes/rutas; tsc y eslint limpios.
- Fix post-revisión 1 (inline): `scripts/jobs.migracion-legacy.test.ts` restaurado y portado a `veredicto-diario`
  (PGlite sin migrar, presupuesto 0.001 → plantilla sin red). Protege que `jobs.mjs` migra antes de despachar.
  GREEN 1 test; prueba de mutante: comentando `await ensureSeeded()` falla con
  `relation "infra_job_run" does not exist`; `jobs.mjs` restaurado sin diff.
- Fix post-revisión 2 (inline): producción programa con Coolify Scheduled Tasks, no con systemd (los timers solo
  corren staging). Documentado en `docs/DEPLOY.md` ("Jobs del veredicto diario") y en la tabla de producción del
  runbook, junto a los timers:

  | Tarea Coolify | Comando | Cron (UTC) | Timeout |
  |---|---|---|---|
  | `veredicto-diario` | `node scripts/jobs.mjs veredicto-diario` | `45 0,6,12,18 * * *` | 600 s |
  | `veredicto-cierre` | `node scripts/jobs.mjs veredicto-cierre` | `30 3 * * *` | 300 s |

  Ambos jobs se registran en `jobs-esperados.ts` con `habilitado: false` hasta crear las tareas (el panel de salud
  los reporta como `no_programado`, no como alarma). Hallazgo: `sync-pronostico-caudal` y `sync-ensemble` tampoco
  están programados en producción, así que los días de pronóstico saldrán "Sin dato" hasta programarlos.

## Operación permanente

Requisito: el veredicto funciona en producción de forma continua, sin pasos manuales ni fechas o valores fijos de un
evento. Cada camino de datos es un job programado, idempotente y monitoreado.

### Jobs del veredicto

| Job (`jobs.mjs`) | Cadencia (`cadencias.ts`) | Coolify (UTC) | `infra_job_run.tipo` | Idempotencia | `jobs-esperados.ts` |
|---|---|---|---|---|---|
| `veredicto-diario` | 360 min | `45 0,6,12,18 * * *`, 600 s | `veredicto-diario-v0` | lease por slot de 6 h; por ámbito-día solo escribe si cambia `inputs_hash` | `habilitado: false` hasta crear la tarea |
| `veredicto-cierre` | 1440 min | `30 3 * * *`, 300 s | `veredicto-cierre-v0` | lease por día ART; `marcarCerrado` es idempotente | `habilitado: false` hasta crear la tarea |

Comando de ambas tareas: `node scripts/jobs.mjs <nombre>`. `jobs.mjs` migra la base antes de despachar
(cubierto por `scripts/jobs.migracion-legacy.test.ts`). Al crear las tareas en Coolify, pasar ambos a
`habilitado: true`.

### Fuentes que consume y su salud

| Fuente | Job que la alimenta | Programado en prod | `hazard_source_health.provider` (TTL) |
|---|---|---|---|
| Lluvia IMERG | `sync-imerg` (60 min) | sí | `nasa-imerg` (60 min) |
| Alturas Prefectura | `sync-prefectura-alturas` (60 min) | sí | `prefectura-alturas` (120 min) |
| Avisos SMN | `sync-smn-alertas` (15 min) | sí | `smn-alertas` (60 min) |
| Climatología lluvia / caudal | `climatologia-precipitacion` / `climatologia-caudal` (mensual) | sí | — (tabla versionada) |
| Caudal GloFAS | `sync-pronostico-caudal` (360 min) | **no** (decisión P-5) | `open-meteo-flood` (360 min) |
| Ensamble de lluvia | `sync-ensemble` (360 min) | **no** (decisión P-5) | `open-meteo-ensemble` (360 min) |
| Registro de eventos en terreno | registro manual (`public/data/eventos-inundaciones/`) | n/a | `registro-eventos-inundaciones` (7 días), lo reporta el job del veredicto |

El propio veredicto reporta `veredicto-diario` (TTL 360 min) en `hazard_source_health`. Queda `degradado` si una
fuente no está disponible o la IA cayó a plantilla, y `no_disponible` si la corrida falla. Así aparece en el panel
de salud junto con el estado del job (`infra_job_run`, `jobs-esperados.ts`).

### Comportamiento ante fallas (degradación explícita)

- Una fuente cuenta como no disponible si no tiene registro de salud, está `no_disponible`, no tiene éxito o su
  último éxito supera `TTL × 2` (`TOLERANCIA_ATRASO_JOB`). Sus datos no se usan para hoy ni para el pronóstico, y
  figura en "Sin datos de: …".
- Sin ninguna fuente cuantitativa disponible, el nivel es **Sin dato**, nunca "Sin señal". SMN caído no se lee como
  "sin avisos".
- IMERG con cobertura < 80 % no cuenta como dato. Las lecturas de Prefectura de más de 36 h no cuentan como lectura
  previa. Las inconsistentes se descartan.
- Si la IA falla (sin clave, timeout, HTTP, JSON inválido, presupuesto agotado o validación), se publica la
  plantilla determinista. El motivo queda en `motivo_fallback` y en la salud del veredicto.
- Si el registro de eventos no existe o tiene más de 7 días, la sección "Confirmado en terreno" queda vacía o
  desactualizada y la salud lo marca. Nunca altera el nivel.
- Todo se calcula relativo al reloj (`fechasVentana(ahora)`). No hay fechas ni valores de un evento en el código
  (los únicos literales son umbrales de reglas versionados en `reglas-veredicto-v0.1`, "en calibración").

### Bloqueantes para operación completa

- Programar `sync-pronostico-caudal` y `sync-ensemble` en Coolify (hoy fuera por P-5). Sin ellos, los días de
  pronóstico salen "Sin dato" (degradación explícita, no silenciosa).
- Crear las tareas `veredicto-diario` y `veredicto-cierre` en Coolify y configurar `AI_VEREDICTO_ENABLED=true` y
  `OPENROUTER_API_KEY`.
- El registro de eventos sigue siendo manual (I-4 lo automatiza). Su salud hace visible el atraso.

## Pendientes y diferidos

- La IA real no se probó (sin credenciales en el E2E, por regla). Primer despliegue: setear `OPENROUTER_API_KEY`,
  `AI_VEREDICTO_ENABLED=true`, aplicar la migración `0015` e instalar los timers `enos-ops1-veredicto-*`.
- Cambios de plantilla no regeneran filas existentes (el `inputs_hash` no incluye el texto); se regeneran al
  cambiar los datos.
- Nombres de estación en mayúsculas (vienen del catálogo PNA).
- Diferidos: V-04b (IMERG aguas arriba), V-06b (job ECMWF determinista), eventos reales en "confirmado en terreno"
  (rama hermana), sincronizar la capa IMERG con el día elegido, rate limit y auditoría del enlace público,
  V-16/V-17 (calibración formal), V-19 (IMERG Late/Final).
- La suite completa de vitest no se corrió (se cuelga en esta máquina); corre en CI.
- Fix UI 1–3 (CSS inline del coordinador + worker para las clases, ~112k): el repo no usa Tailwind (solo `tailwind-merge`), así que las clases utilitarias no aplicaban nada. Bloque "Veredicto diario" en `app/globals.css` con tokens existentes (`--card`, `--line`, `--fill`, `--s-*`, `--r-*`, `--nivel-peligro-*`, `.badge`, `.chip`, `.ui-button`); el modal usa `.ui-dialog-popup` opaco con backdrop y scroll interno; botón de entrada = `Button secondary sm` como "Pantalla completa", apilado encima; vista pública con layout propio. Sin clases Tailwind ni `style` inline en los componentes del veredicto. 44 tests verdes; tsc/eslint limpios.
- Fix 5 aguas arriba (worker ~115k + cierre inline): solo estaciones `rol: 'corrientes'` fijan nivel; las `contexto-aguas-arriba` (Iguazú, Libertador, Posadas) van a `aguasArriba` del veredicto provincial (persistido en `traza_reglas.aguasArriba`, expuesto en el DTO, incluido en el hash solo cuando hay contexto). Una estación de Corrientes sin departamento sí sube el nivel provincial. Regla documentada en la §7 de la propuesta. 224 tests verdes; tsc/eslint limpios.
- Fix 4 traza legible (worker ~146k, muy por encima del tope): `traza-texto.ts` (`describirTraza`, `describirAguaArriba`, `horaArt`, números es-AR, nombres de estación y río desde el catálogo) usado por el modal, la vista pública, el PDF y la plantilla; sección "Aguas arriba (contexto, no modifica el nivel)". Ej.: "Prefectura Paso de los Libres (río Uruguay): 9,33 m ≥ evacuación 8,50 m". Limitación: los acentos de nombres de estación se restituyen con una tabla fija. 250 tests verdes; tsc/eslint limpios.
- Fix 6a eventos en terreno (worker ~93k + ajuste inline): `eventos-terreno.ts` lee `public/data/eventos-inundaciones/{eventos,evidencias}.csv` del lado servidor (vacío si no existen; los publica la rama hermana) y `GET /api/infraestructura/veredictos/eventos` (staff). Regla: fuera confianza "muy baja", fuera eventos sin fuente con URL verificada (`verificada_url` o `verificado por orquestador`), "Confianza baja" solo con enlace; fuera mediciones hidrométricas y filas sin afectación informada (ya están en la traza de Prefectura). Títulos en español llano, lugar, fecha y fuente (medio + fecha), orden por fecha, tipo y confianza. Contra el registro real del 13/10: 10 eventos. **Deduplicar al fusionar** con `lib/mapas/eventos-inundaciones.ts` de la rama hermana (parser CSV y lectura de evidencias repetidos; esa rama aún no filtra por confianza). 19 tests verdes; tsc/eslint limpios.
- Fix 6b eventos en la UI (worker ~126k, sobre el tope): "Confirmado en terreno (no modifica el nivel)" en el modal (fetch a la API con el rango de los veredictos), la vista pública (carga en servidor) y ambos PDF; cada evento con título, lugar (departamento) · fecha, "Confianza …" y enlace "medio, fecha". Imports de tipo únicamente en componentes cliente. Pendiente menor: el bloque de eventos está duplicado entre modal y vista pública. 310 tests verdes; tsc/eslint limpios; RED no observado (implementación y tests juntos).
