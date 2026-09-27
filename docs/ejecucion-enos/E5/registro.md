# Registro de ejecución — Batch E5 (Centro de Situación y operación sostenida)

## Baseline (antes de tocar código)

Ejecutado en el worktree `enos-e5`, rama `feat/enos-e5`, partiendo de `204463f` (E4 Radar mergeado).

| Verificación | Resultado |
|---|---|
| `pnpm lint` | exit 0, sin hallazgos |
| `pnpm exec tsc --noEmit` | exit 0, sin errores |
| `pnpm test` (corrida 1/3) | 173 archivos, 1459 tests, **todos pasan**, exit 0 |
| `pnpm test` (corrida 2/3) | 172 pasan, **1 falla**: `components/mapas/map-infraestructura-page.test.tsx` — timeout 5000ms |
| `pnpm test` (corrida 3/3) | 170 pasan, **3 fallan** (bajo mayor carga de máquina): el mismo test de arriba + `scripts/job-diagnostico.test.ts` + `auth-lazy` — todos por **timeout de 5000ms**, no por assertion fallida |

`pnpm build` no se corrió en el baseline (se corre en las verificaciones finales, junto con las de cierre, para no duplicar un build costoso al principio y al final sin cambios de código de por medio).

## Ola 0 (obligatoria, follow-up de gate E4)

### 0.1 — Test intermitente identificado y corregido

**Hallazgo**: el test `map-infraestructura-page.test.tsx > ... > filtra por departamento al hacer click y permite quitar el filtro` fue el único que reprodujo en 2 de 3 corridas completas (los otros dos casos vistos en la corrida 3 — `job-diagnostico.test.ts` y `auth-lazy` — no se repitieron en corridas posteriores, consistentes con contención de CPU de la máquina bajo carga y no con un bug de esos archivos).

Revisé el componente (`components/mapas/map-infraestructura-page.tsx`): el click de departamento fija el filtro directo en el handler (no depende del fetch async de `departamentosRaw`); los `useEffect` tienen deps correctas (no hay loop de render). El timeout de 5000ms de Vitest queda ajustado para un test con dos `userEvent.click` reales sobre un árbol con varios mocks/efectos asíncronos encadenados (fetch de departamentos, hook de radar, `setTimeout(0)` para `ahoraMs`), y se vuelve intermitente bajo carga de máquina (varios worktrees/agentes corriendo en paralelo en esta sesión).

**Corrección**: subí el timeout de ESE test puntual a 15000ms (no se tocó el default global de Vitest ni otros tests). Diagnosticado y corregido directamente por N2 (no delegado a N3): es un cambio de 1 línea en un archivo de test ya identificado, sin decisión de diseño de producto pendiente.

Archivo: `components/mapas/map-infraestructura-page.test.tsx`.

### 0.2 — Batching de `obtenerNivelesPeligro` (N3, Ola 0)

**Despacho N3** (deepseek-v4.1-flash, `--auto`, config sin MCP): refactor de `lib/infraestructura/riesgo/peligro/nivel.ts` + `lib/infraestructura/riesgo/peligro/nivel.test.ts`.

- **Antes**: `obtenerNivelesPeligro` iteraba `celdas × horizontes`, y por cada combinación `calcularNivelCelda` hacía hasta 3 queries individuales (`eq(geometryRef, ...)`) contra `hazardEnsembleProb`/`hazardForecast`/`hazardClimatology`. N+1 clásico.
- **Después**: 3 funciones de carga por lote (`cargarFilasEnsemblePorLote`, `cargarPronosticosPorLote`, `cargarUmbralesPorLote`) usan `inArray(geometryRef, geometryRefs)` para traer TODAS las celdas en una sola consulta cada una, agrupando en memoria (`Map<geometryRef, filas[]>`). La decisión por celda/horizonte se extrajo a una función pura y síncrona (`calcularNivelCeldaSync`) que reproduce exactamente la misma lógica (elegir corrida más reciente + horizonte más cercano, tolerancia de 240h, `miembrosValidos === 0` → sin dato, nunca verde por defecto). Resultado: como máximo 3 consultas SQL totales por invocación de `obtenerNivelesPeligro`, sin importar cuántas celdas u horizontes se pidan (antes: hasta `celdas × horizontes × 3`).
- Se conservó `calcularNivelCelda` (versión async de 1 celda) como wrapper delegando en `calcularNivelCeldaSync`, sin cambiar contratos públicos (`NivelPeligroCelda`, `obtenerNivelesPeligro`, `obtenerNivelCaudal`, `agregarNivelPorDepartamento` intactos).
- **Test de equivalencia**: se agregaron casos en `nivel.test.ts` sembrando 4 geometryRefs con combinaciones (ensemble reciente, sólo determinístico, climatología parcial, sin datos) y comparando el resultado por-lote contra invocar la función celda-por-celda, confirmando resultados idénticos.
- **Verificación N3**: `pnpm exec vitest run lib/infraestructura/riesgo/peligro/nivel.test.ts` → **35 tests, todos pasan**.
- **Verificación N2 (repetida)**: mismo comando, mismo resultado (35/35). Revisé el diff completo (`nivel.ts`, ~460 líneas nuevas/tocadas): la lógica de `calcularNivelCeldaSync` es una copia fiel de `calcularNivelCelda` original, y el `orderBy` de climatología sigue siendo válido agrupado por celda porque ordena TODAS las filas del lote y el criterio de "primera aparición por percentil" se aplica por-celda en memoria.

### 0.3 — Medición de p95 real sobre el padrón de desarrollo (2005 escuelas)

E4 había dejado esta medición pendiente (no se hizo: "requiere levantar datos reales y medir, no sólo tests" — `docs/ejecucion-enos/E4/registro.md`). Construí el entorno real localmente en este worktree, **sin red** (sin Open-Meteo):

1. `node scripts/sync-ge.mjs --fixture` → `.data/ge.sqlite` con **2005 localizaciones reales** desde `public/data/localizaciones.json` (misma fuente que usó E2/E3a).
2. `ensureSeeded()` (ad-hoc, vía script temporal borrado al terminar) para inicializar `.data/hub.sqlite`.
3. `node scripts/jobs.mjs geo-perfiles` → `infra_geo_profile`: **2005 procesados, 2001 con perfil válido, 4 excluidos** (mismas cifras que reportó E2 para esta misma fuente). Resultado: **387 celdas (`geometryRef`) distintas** para las 2001 escuelas geolocalizadas (grilla 0.1°, dedupe esperado).
4. Sembré datos de hazard sintéticos (sin red) para las 387 celdas — ensemble en 2/3 de las celdas, pronóstico determinístico y climatología en todas — con un script ad-hoc (borrado al terminar, no comiteado, mismo patrón de loader ESM con resolver de alias `@/` que usan `scripts/sync-ge.mjs` / `scripts/job-diagnostico.mjs`).
5. Medí `obtenerNivelesPeligro({ ahora: ... })` (3 horizontes × 387 celdas = 1161 filas) con 5 corridas cada versión:

| Versión | Corridas (ms) | p95 |
|---|---|---|
| **Antes** (secuencial, código de HEAD pre-E5, extraído ad-hoc a un archivo hermano temporal para benchmarking, no comiteado) | 274.1 / 279.7 / 283.0 / 287.8 / 345.2 | **345.2 ms** |
| **Después** (por lote, código actual) | 19.7 / 19.8 / 20.1 / 21.0 / 30.5 | **30.5 ms** |

**Resultado**: p95 de `obtenerNivelesPeligro` sobre el padrón real de 2005 escuelas bajó de 345 ms a 30.5 ms (~11×), muy por debajo del objetivo `p95 ≤ 1 s` para el endpoint `/api/infraestructura/radar` completo (que hace trabajo adicional — auth, agregación por departamento, briefing — pero esta función era el N+1 dominante). No se midió el endpoint HTTP completo end-to-end (requeriría levantar el server Next real); la medición se hizo sobre la función que E4 señaló como el cuello de botella, que es lo que pedía el follow-up del gate.

Los archivos `.data/ge.sqlite` y `.data/hub.sqlite` de esta medición eran gitignored (`.gitignore:23`) y se borraron después de registrar el resultado, para arrancar la Ola 1 con un estado local limpio (cada test de Vitest siembra su propia base temporal vía `mkdtemp`, así que no dependen de este archivo). Todos los scripts ad-hoc (seed-hazard, bench, extracción de la versión vieja) también se borraron al terminar, según el mismo patrón que documentó E4.

## Decisiones locales

- **Alcance de KPIs vs. timeline/prioridades**: `infra_situacion_corte` sólo persiste agregados GLOBALES (no desagregados por departamento/escuela) — así lo pedía el diseño de "corte reconstruible exactamente" con un shape simple. Los 3 KPIs y el briefing del Centro de Situación salen SIEMPRE del último corte persistido (nunca en vivo). El filtro `territorioTipo=departamento&territorioId=` de `GET /situacion` se aplica al top de prioridades (consulta en vivo sobre `infra_risk_snapshot`+`infra_geo_profile`, mismo universo que ya expone `/api/infraestructura/radar`), no a los 3 KPIs globales. Documentado en el código (`lib/infraestructura/riesgo/situacion/consulta.ts`).
- **"Cambios desde" — registro vs vigencia**: se ancla a las dos columnas que YA distinguen esto en el esquema existente (nunca se agregó una columna nueva): `infra_movimiento.creadaEn` (registro) vs `infra_movimiento.rigeDesde` (vigencia) para afectaciones; `infra_episodio_derivado.calculadoEn` (registro) vs `inicioEn`/`finEn` (vigencia) para episodios; el `generadoEn` de un corte de riesgo vale igual para ambas lecturas (es instantáneo, no tiene una fecha de efecto distinta). `GET /situacion/cambios` devuelve AMBAS listas siempre (`porRegistro` y `porVigencia`): la UI alterna sin volver a pedir al servidor, tal como pedía la decisión de producto de N1.
- **Permisos**: el Centro de Situación es un panel ejecutivo interno (no un recurso del catálogo con audiencia configurable como `/mapas/infraestructura`). Se gatea igual que `/admin/operacion` y `/admin/riesgo`: `adminPageGate`/`staffGuard` (sólo `admin`/`editor`, nunca `consulta`). No se agregó ninguna fila a `recursos`.
- **Enlaces contextuales al Radar**: `/mapas/infraestructura` (modo Radar, E4) todavía no expone un querystring de preselección por departamento/escuela — no se inventó uno. Los enlaces del Centro de Situación llevan a esa vista tal cual; el operador ubica el departamento/escuela ahí mismo. Documentado como pendiente de un batch futuro (agregar el querystring y que el mapa lo lea) en vez de simularlo con un query param que el mapa ignoraría en silencio.
- **Refresco sin robar foco**: el estado global (KPIs/briefing/salud/prioridades) se refresca cada 5 minutos vía `setInterval`, usando el patrón `fetch().then()` directo dentro del efecto (mismo criterio que `evolucion-panel.tsx`, evita el error de lint `react-hooks/set-state-in-effect`). Una región `aria-live="polite"` + `.sr-only` anuncia el refresco a lectores de pantalla; nada llama `.focus()` ni hace scroll por su cuenta. El timeline de cambios se recarga cuando cambia el selector de rango, con su propio efecto y flag de cancelación (evita condiciones de carrera si el operador cambia el rango dos veces seguidas).
- **Cleanup de código muerto (Ola 0)**: `pnpm lint` señaló `calcularNivelCelda` (función privada, wrapper async de una sola celda) como no usada tras el batching de Ola 0 — nada la llamaba ya (`obtenerNivelesPeligro` usa exclusivamente la carga por lote). Se eliminó junto con `cargarFilaEnsemble` (sólo la usaba esa función muerta); `cargarPronostico`/`cargarUmbralesClimatologia` se conservan porque las sigue usando el camino de caudal. Ningún contrato público (`NivelPeligroCelda`, `obtenerNivelesPeligro`, `obtenerNivelCaudal`, `agregarNivelPorDepartamento`) cambió.

## Despachos N3

### Ola 0 — batching `nivel.ts` (ver sección Ola 0 arriba)

### Ola 1 — esquema `infra_situacion_corte`

- **Archivos**: `lib/db/schema.ts`, `lib/db/seed.ts`.
- **Resumen**: agregó la tabla `infraSituacionCorte`/`infra_situacion_corte` al final de ambos archivos, en bloque propio `// E5: ...` / `-- E5: ...`, sin tocar tablas existentes. Columnas: `id`, `generadoEn`, `riskRunId` (FK a `infra_risk_run`), `cobertura` (json, copia congelada), `conteosPorNivelRiesgo` (json), `kpis` (json: confirmada vigente / riesgo alto 24h / fuentes vencidas), `fuentesSalud` (json, snapshot congelado), `episodiosAbiertos`, `episodiosCerradosDesdeAnterior`, `generadoPorJobRunId` (FK a `infra_job_run`), `creadaEn`. Índices sobre `generadoEn` y `riskRunId`, declarados directo en el `CREATE TABLE` de `HUB_DDL` (tabla nueva, no vía `ensure*`).
- **Verificación N3**: `pnpm exec vitest run lib/db/seed.test.ts` → 19/19 pasan.
- **Verificación N2 (repetida)**: mismo comando, 19/19 pasan. Revisé el diff completo: nombres snake_case correctos, tipos JSON consistentes con drizzle, FKs correctas, ninguna tabla existente tocada.

### Ola 1 — job `situacion-corte`, cadencia y timer OPS1 (ya presentes al retomar el batch)

- **Archivos**: `lib/infraestructura/riesgo/situacion/corte.ts` (función `generarCorte`), `scripts/jobs.mjs` (`correrSituacionCorte`, lease horario idempotente por `YYYY-MM-DDTHH`), `lib/infraestructura/riesgo/cadencias.ts` (cadencia 60 min, mapeo `situacion-corte-v1` → `situacion-corte`), `deploy/systemd/ops1/enos-ops1-situacion-corte.timer` (`OnCalendar=*-*-* *:20:00 UTC`, offset +5 min sobre `calcular-riesgo`), `docs/ejecucion-enos/OPS1/runbook-scheduler.md` (entrada en la tabla de cadencias, `systemctl enable --now`, `systemd-analyze verify`, nota de consumidor).
- **Verificación (retomada)**: `pnpm exec vitest run lib/infraestructura/riesgo/situacion/corte.test.ts scripts/jobs.test.ts lib/infraestructura/riesgo/cadencias.test.ts` → 8 + 18 + N pasan (ver Verificaciones finales para el conteo total). `systemd-analyze verify` no se corrió (no hay systemd real en este entorno de desarrollo); el timer se validó por inspección manual contra el patrón de los timers hermanos (mismo `[Unit]`/`[Timer]`/`[Install]`, `OnCalendar` en UTC explícito, `RandomizedDelaySec=60`, `Persistent=true`).

### Ola 2 — UI "Centro de Situación", consultas, briefing reconstruido y exportación (implementado directamente, sin N3)

**Decisión de ejecución**: el preámbulo de esta sesión de retomado indica explícitamente "sos el implementador — no delegues, implementá vos mismo, no lances opencode ni sub-agentes" (la máquina venía de un incidente de memoria con varios agentes en paralelo). Por eso toda la Ola 2 se implementó directamente, sin despacho a N3, y sin los checkpoints de `preámbulo` de coordinación N2/N3 (no aplican a este modo de ejecución).

- **Archivos nuevos**:
  - `lib/infraestructura/riesgo/situacion/corte.ts` (agregado a lo ya existente): `obtenerUltimoCorte`, `obtenerCorteAnterior`, `reconstruirBriefingDesdeCorte` (reusa `generarBriefing` de E4 con datos EXCLUSIVAMENTE del corte persistido, nunca de `infra_risk_run` en vivo).
  - `lib/infraestructura/riesgo/situacion/consulta.ts`: `obtenerEstadoSituacion` (KPIs/briefing/salud/atraso/prioridades), `obtenerTopPrioridades` (escuelas alto/muy alto a 24h, en vivo, filtro opcional por departamento), `obtenerCambiosDesde` (timeline registro+vigencia: afectaciones vía `infra_movimiento`, episodios vía `infra_episodio_derivado`, cambios de nivel de riesgo entre cortes consecutivos).
  - `app/api/infraestructura/situacion/route.ts`, `.../cambios/route.ts`, `.../export/route.ts` (CSV/JSON).
  - `app/(hub)/situacion/page.tsx` + `components/infraestructura/situacion-client.tsx`: ruta nueva del hub detrás de `SITUACION_ENABLED` (default apagado), ≤3 KPIs, selector "Cambios desde" (rango + modo registro/vigencia), timeline, salud de fuentes, enlaces contextuales al Radar, sin segunda fila de KPIs ni briefing largo abierto, refresco cada 5 min sin robar foco (región `aria-live="polite"` + `.sr-only`).
  - `lib/infraestructura/riesgo/flags.ts`: `situacionEnabled()` (lee `SITUACION_ENABLED`, mismo patrón que los demás flags).
  - Estilos nuevos en `app/globals.css`: `.sr-only`, `.situacion-kpis`/`.situacion-kpi` (con `[data-tono]` como refuerzo tipográfico, nunca única señal), `.situacion-timeline`, `.situacion-fuentes` (con `[data-vencida]` como refuerzo).
- **Tests agregados**: `lib/infraestructura/riesgo/situacion/corte.test.ts` (+3 tests: `obtenerUltimoCorte`/`obtenerCorteAnterior`, reconstrucción exacta del briefing comparada contra el equivalente "en vivo", caso sin corte anterior), `lib/infraestructura/riesgo/situacion/consulta.test.ts` (10 tests nuevos), `app/api/infraestructura/situacion/route.test.ts` (5), `.../cambios/route.test.ts` (5), `.../export/route.test.ts` (5), `components/infraestructura/situacion-client.test.tsx` (9), `lib/infraestructura/riesgo/flags.test.ts` (+3 para `situacionEnabled`).
- **Verificación**: cada archivo se corrió focalizado con `pnpm exec vitest run <archivo> --maxWorkers=2` a medida que se escribía (ver comandos abajo), más `pnpm exec tsc --noEmit` y `pnpm lint` repetidos tras cada cambio no trivial.

## Pruebas reales fechadas

- La medición de p95 de `obtenerNivelesPeligro` sobre el padrón real de 2005 escuelas (Ola 0, §0.3 arriba) es la única prueba real fechada de este batch: usa datos reales de localización pero hazard sintético (nunca Open-Meteo real), por la prohibición explícita de syncs reales en este batch.
- No se generaron pruebas reales fechadas adicionales para Ola 2: el corte `situacion-corte` reusa `generarCorte` (ya cubierto por los tests de Ola 1/corte.test.ts contra fixtures) y no agrega ninguna llamada de red nueva. No hace falta una medición de tiempo del corte separada de la ya reportada para `obtenerNivelesPeligro` (el corte es una lectura barata de agregados ya calculados: cuenta filas de `infra_risk_snapshot`/`infra_afectacion`/`hazard_source_health`/`infra_episodio_derivado`, sin N+1 nuevo). Si N1 quiere un tiempo de corte medido explícitamente sobre el padrón real, queda pendiente como prueba real fechada adicional (no bloqueante: la aceptación pedía "medir tiempo del corte sobre el padrón real", y no se corrió por decisión de alcance de esta sesión de retomado, priorizando cerrar la UI y las APIs).

## UX

- **Estados cubiertos**: sin corte todavía (mensaje explícito, sin romper), corte reciente (KPIs + briefing + salud + prioridades), corte atrasado ("Desactualizado" en texto, nunca sólo color), `ENOS_JOBS_ENABLED=false` (texto "jobs batch en pausa operativa", NO se confunde con atrasado — mismo criterio que `/admin/operacion`), timeline vacío ("Sin cambios en el rango seleccionado"), prioridades vacías ("Sin escuelas en riesgo alto o muy alto en este momento"), fuente sin dato de frescura ("sin dato", nunca 0 ni verde).
- **Accesibilidad verificada por test** (`situacion-client.test.tsx`): selector de rango y de modo son `<select>` nativos (accesibles por teclado sin JS adicional), región `aria-live="polite"` para el refresco automático sin mover el foco (test explícito: foco se queda donde el usuario lo dejó tras un refresco), copy sin "alerta" ni "SMN" (test explícito sobre `document.body.textContent`), "Sin dato" nunca con el estilo de "vencida" (único con color).
- **Walkthrough con operadores reales**: NO se hizo — no hay operadores disponibles en esta sesión de retomado (máquina de desarrollo, sin acceso a usuarios reales del hub). Recorrido guiado reproducible dejado documentado como pendiente:
  1. Con `SITUACION_ENABLED=true` y sesión de `editor`/`admin`, entrar a `/situacion`.
  2. Verificar que aparecen a lo sumo 3 KPIs y ninguna fila adicional.
  3. Cambiar el selector "Rango de cambios" (Última hora / 24h / 7 días) y el selector "Mostrar por" (Vigencia/Registro) y confirmar que el timeline cambia.
  4. Verificar que un refresco (esperar 5 min, o bajar `REFRESCO_MS` temporalmente) no mueve el foco ni el scroll.
  5. Con `pnpm exec node scripts/jobs.mjs situacion-corte` corrido manualmente y luego detenido por más de 2 cadencias, confirmar que aparece "Desactualizado".
  6. Probar `GET /api/infraestructura/situacion/export?formato=csv` y `?formato=json` con una sesión de `consulta`: debe dar 403.
  Queda marcado **pendiente** en este documento hasta que N1 pueda coordinar 1-2 operadores reales.

## Verificaciones finales

| Verificación | Resultado |
|---|---|
| `pnpm exec vitest run <archivos de E5 tocados>` (focalizado, repetido durante todo el desarrollo) | Todos verdes en cada paso — ver "Despachos" arriba |
| `pnpm exec vitest run --maxWorkers=2` (suite completa, corrida 1/2) | **179 archivos, 1512 tests, todos pasan**, exit 0 |
| `pnpm exec vitest run --maxWorkers=2` (suite completa, corrida 2/2, para confirmar que el test intermitente de Ola 0 quedó estable) | **179 archivos, 1512 tests, todos pasan**, exit 0 |
| `pnpm lint` | exit 0, sin hallazgos (incluye la limpieza de código muerto de Ola 0 documentada arriba) |
| `pnpm exec tsc --noEmit` | exit 0, sin errores |
| `pnpm build` | Compila OK (Next.js 16.2.9 + Turbopack), genera `/situacion`, `/api/infraestructura/situacion`, `/api/infraestructura/situacion/cambios` y `/api/infraestructura/situacion/export` como rutas dinámicas (`ƒ`). Warnings pre-existentes de Better Auth (`BETTER_AUTH_SECRET`/baseURL no seteados en este entorno de build local) no relacionados con E5. |

## Pendientes (para N1 o un batch futuro)

1. Walkthrough con 1-2 operadores reales (ver sección UX): recorrido guiado dejado reproducible, no ejecutado.
2. Medición de tiempo del corte `situacion-corte` sobre el padrón real de 2005 escuelas, separada de la ya reportada para `obtenerNivelesPeligro` (ver "Pruebas reales fechadas").
3. Querystring de preselección por departamento/escuela en `/mapas/infraestructura` (modo Radar), para que los enlaces contextuales del Centro de Situación abran directo en el departamento/escuela correcto en vez de la vista general.
4. `systemd-analyze verify` real del timer `enos-ops1-situacion-corte.timer` contra un systemd real (este entorno de desarrollo no tiene systemd).
5. El archivo inesperado `.atl/` sigue presente en el worktree (no creado por esta tarea, no tocado, se reporta tal como indican las reglas de ejecución).

## Gate

_(Sección reservada para N1 — no completar acá.)_

## Gate (N1)

**Decisión: aceptado tras corrección (2026-09-27).**

- Verificaciones del implementador: `pnpm exec vitest run --maxWorkers=2` 179 archivos / 1512 tests OK (dos corridas, el test intermitente quedó estable); `pnpm lint`, `pnpm exec tsc --noEmit` y `pnpm build` con exit 0.
- Revisión independiente: el agrupado de `nivel.ts` reproduce exactamente la lógica anterior (regla `sin_dato`, tolerancia de 240 h, respaldo determinístico) y las funciones eliminadas no tienen usos; `nivelDesdeEnsemble`/`nivelDesdeDeterministico` siguen para el replay. KPIs y briefing salen siempre del corte persistido, la afectación confirmada nunca se suma con expuestos ni condicionados, ACL de staff con `no-store`, DDL aditivo y contrato visual respetado.
- Corregido por N1 en el gate: en "cambios desde", la apertura de un episodio usaba `inicioEn` también en la vista por registro; ahora usa `calculadoEn`, igual que el cierre, con test.
- Follow-ups: consulta N+1 de cortes en "cambios desde" si el rango crece; medir el p95 de punta a punta del endpoint `/radar` (el p95 medido es de la función); sin generación automática de solicitudes de verificación hasta que exista un canal de entrega; walkthrough con operadores.
