# E2 — Señales externas y ficha territorial mínima

Registro único del batch (decisión de producto 2026-09-26, ver plan-ejecucion §7/§9). N2 = este agente
(sonnet, worktree `enos-e2`). N3 = `opencode run --auto -m opencode-go/deepseek-v4.1-flash`, siempre.

## 0. Baseline (antes de tocar código)

Commit de partida: `59f91f7` (merge `feat/enos-e1-sin-episodios`), rama `feat/enos-e2`.

| Comando | Exit code | Resumen |
|---|---|---|
| `pnpm test` | 0 | 120 test files, 999 tests, todos pasando |
| `pnpm lint` | 0 | sin hallazgos |
| `pnpm exec tsc --noEmit` | 0 | sin errores |
| `pnpm build` | 0 | build completo, todas las rutas listadas |

Sin fallas preexistentes que documentar.

Untracked no creado por esta tarea, no tocado: `.atl/` (reportado, se deja intacto).

## 1. Decisiones locales (N2, dentro del alcance fijado por N1)

1. **`hazard_observation`: se omite en E2.** Ninguna de las tres fuentes integradas (ECMWF pronóstico,
   ERA5 archive/climatología, GloFAS caudal) entrega una medición "observada" en tiempo casi real distinta
   de un pronóstico/climatología — Open-Meteo no expone red de estaciones propia en estos endpoints.
   `hazard_forecast` cubre pronosticado (incluido horizonte 0 = corrida más reciente) y
   `hazard_climatology` cubre histórico agregado. Se revisita si E6+ integra una fuente realmente
   observacional (ej. INA series, si se verifica su contrato).
2. **`hazard_river_point`: configuración versionada del repo, no tabla de DB.** Seguimos el patrón ya
   existente de `LIMITES_CORRIENTES` (`lib/mapas/departamentos.ts`): un conjunto fijo (~10) de puntos que
   cambia rara vez, revisado por humano, versionado por git. Archivo:
   `lib/infraestructura/riesgo/puntos-rio.ts`.
3. **Celda de grilla:** redondeo de lat/lon a 0,1° (≈11 km en esta latitud), clave de texto
   `"{lat}_{lon}"` con 1 decimal. Documentado en `lib/infraestructura/riesgo/celda.ts`.
4. **Columna común `geometryRef`** en `hazard_forecast`/`hazard_climatology`/`infra_geo_profile`: para
   variables atmosféricas contiene la celda de grilla; para caudal contiene el id del punto de río
   (`puntos-rio.ts`). Nombre alineado al modelo canónico del plan base (§9.2, `geometry_ref`).
5. **Flag `HAZARD_CONTEXT_ENABLED`** (default apagado): gobierna la UI nueva (ficha territorial + vista
   técnica de fuentes). Las APIs `/fuentes`, `/peligro`, `/geo-perfiles/:cueAnexo` existen siempre
   (protegidas por ACL); el flag sólo oculta los componentes de UI nuevos, siguiendo el patrón de
   `RISK_ENGINE_ENABLED` de E0 (`lib/infraestructura/riesgo/flags.ts`).
6. **ACL de las APIs nuevas:** reutilizar `verificarAccesoLectura()` (staff `admin`/`editor` vía
   `getSessionUser()`); el director no tiene `SessionUser` (entra por contraseña compartida u enlace de
   verificación), por lo que ya queda excluido sin lógica adicional — igual que hoy en
   `/api/mapas/infraestructura`.
7. **Percentiles de climatología:** se guardan ambos denominadores (`todos_los_dias` y `dias_humedos`,
   umbral ≥1 mm), como recomienda el research previo, sin decidir todavía cuál usa E3 para colorear.

## 2. Despachos N3

### Ola 0 — Esquema común + tipos/fixtures

| Tarea | Archivos | Resultado | Verificación |
|---|---|---|---|
| N3-Datos-A | `lib/db/schema.ts`, `lib/db/seed.ts` | Agregó `infra_geo_profile`, `hazard_forecast`, `hazard_climatology`, `hazard_source_health` (tablas Drizzle + DDL aditivo en `HUB_DDL`), siguiendo la convención existente. No agregó siembra de datos (arrancan vacías). | `pnpm vitest run lib/db/seed.test.ts` → 1 test file, pasa (ese test ya reaplica el DDL completo dos veces sobre una base poblada — cubre instalación vacía + upgrade + idempotencia genéricamente para las 4 tablas nuevas). Revisado el diff línea por línea por N2: nombres/columnas coinciden con lo pedido. |
| N3-Datos-B | `lib/infraestructura/riesgo/celda.ts` (+test), `lib/infraestructura/riesgo/tipos-hazard.ts` (+test) | `celdaDeCoordenada`/`agruparEnCeldas` (grilla 0.1°) y contratos Zod (`HazardForecastPunto`, `HazardClimatologiaPunto`, `HazardSourceHealthEntrada`) + interfaz `HazardProvider`. | `pnpm vitest run lib/infraestructura/riesgo/celda.test.ts lib/infraestructura/riesgo/tipos-hazard.test.ts` → 2 test files, pasan. |

Escrito directamente por N2 (mecánico, sin ambigüedad de diseño tras la investigación de puntos de río):
`lib/infraestructura/riesgo/puntos-rio.ts` + test — ver §4.

### Ola 1 — Geo y Providers (en paralelo, archivos disjuntos)

Escrito por N2 antes de esta ola (mecánico/fundacional, especificación cerrada):
`lib/infraestructura/riesgo/providers/cliente-http.ts` (+test) — timeout vía carrera contra promesa propia
(no depende de que el `fetchImpl` de test respete `AbortSignal`), backoff exponencial acotado, 429 con
`Retry-After` si viene, cuarentena de payload inválido sin reintentar. `pnpm vitest run
.../cliente-http.test.ts` → 7/7 pasan.

| Tarea | Archivos | Resultado | Verificación |
|---|---|---|---|
| N3-Geo | `lib/infraestructura/riesgo/geo-perfil.ts` (+test) | `calcularGeoPerfiles()` lee `ge_localizacion` vía `attachGe`, normaliza `departamento` (mayúsculas sin tilde, corrige el duplicado CONCEPCION/CONCEPCIÓN), asigna `geometryRef` con `celdaDeCoordenada` o `motivoExclusion` ('sin_coordenadas'/'coordenada_invalida'), upsert idempotente por `cueAnexo`. | `pnpm vitest run lib/infraestructura/riesgo/geo-perfil.test.ts` → pasa; incluye caso de segunda corrida sin duplicar filas. |
| N3-ECMWF | `lib/infraestructura/riesgo/providers/ecmwf.ts` (+test) | `crearProviderEcmwf()` implementa `HazardProvider`; `pasoHoras` se deriva de la diferencia real entre timestamps consecutivos del array (no interpolado); descarta nulls del borde del horizonte. | `pnpm vitest run .../ecmwf.test.ts` → pasa, con fixture real. |
| N3-Flood | `lib/infraestructura/riesgo/providers/flood.ts` (+test) | Consulta por `PUNTOS_RIO` (no por celda libre); id inexistente → `punto_no_configurado` en diagnóstico, no rompe el resto. | `pnpm vitest run .../flood.test.ts` → pasa. |
| N3-Climatología | `lib/infraestructura/riesgo/providers/climatologia.ts` (+test) | `calcularPercentilesPrecipitacion` (percentil `ceil(p/100·n)-1`, ambos denominadores) + `obtenerSerieHistorica` (descarta nulls, no imputa 0). | `pnpm vitest run .../climatologia.test.ts` → pasa. **N2 verificó a mano** la serie sintética de 20 días (10 secos + 1..9,100 mezclados) contra el método de percentil documentado en el test: p90/p95/p99 = 8/9/100 (todos_los_dias) y 9/100/100 (días húmedos) — coincide con el cálculo manual. |

Verificación conjunta de la ola: `pnpm vitest run lib/infraestructura/riesgo/geo-perfil.test.ts lib/infraestructura/riesgo/providers/ecmwf.test.ts lib/infraestructura/riesgo/providers/flood.test.ts lib/infraestructura/riesgo/providers/climatologia.test.ts` → 4 test files, 18 tests, todos pasan.

### Ola 2 — Jobs y API (en paralelo, archivos disjuntos)

Escrito por N2 antes de esta ola (mecánico, edición de un único archivo compartido, patrón ya existente):
`lib/infraestructura/riesgo/flags.ts` (+test): agregado `hazardContextEnabled()` leyendo
`HAZARD_CONTEXT_ENABLED`, default apagado, mismo patrón que `riskEngineEnabled()`.

| Tarea | Archivos | Resultado | Verificación |
|---|---|---|---|
| N3-Jobs | `lib/infraestructura/riesgo/jobs/sync-pronostico-caudal.ts` (+test) | Job de 6h: lease por bloque horario (idempotente), llama ECMWF+Flood, upsert en `hazard_forecast`, actualiza `hazard_source_health` por proveedor (una fuente caída no tira abajo el job). | `pnpm vitest run .../sync-pronostico-caudal.test.ts` → pasa; incluye repetir el sync en la misma ventana de 6h → no duplica (lease ya completado). |
| N3-Jobs-Clima | `lib/infraestructura/riesgo/jobs/calcular-climatologia.ts` (+test) | Job bajo demanda: lease por (período, versión), calcula percentiles por celda vía `climatologia.ts`, upsert idempotente. | `pnpm vitest run .../calcular-climatologia.test.ts` → pasa; incluye celda con fuente caída no bloquea las demás. |
| N3-API | `app/api/infraestructura/fuentes/route.ts`, `.../peligro/route.ts`, `.../geo-perfiles/[cueAnexo]/route.ts` (+tests) | 3 endpoints Zod + `verificarAccesoLectura()` (excluye director automáticamente, sin lógica nueva) + `Cache-Control: private, no-store`. `/geo-perfiles/:cueAnexo` devuelve 404 si no hay fila (anomalía real, no "sin cobertura") y 400 si el CUE no pasa Zod. | `pnpm vitest run` sobre los 3 test files → pasa (401/403/200/400/404 cubiertos). |

### Ola 3 — UI

| Tarea | Archivos | Resultado | Verificación |
|---|---|---|---|
| N3-UI-Ficha | `components/infraestructura/ficha-territorial.tsx` (+test), edición en `ficha-parte-modal.tsx` | Ficha territorial con los tres estados textuales exigidos («sin cobertura», «sin peligro estimado», «fuente vencida»), resumen de lluvia/ráfagas 72h y caudal si aplica. Integrada vía prop `habilitado?: boolean` (default false) en el modal existente — el padre decide con `hazardContextEnabled()`. | `pnpm vitest run ficha-territorial.test.tsx ficha-parte-modal.test.tsx` → 14/14 pasan (el test preexistente de la ficha del parte sigue pasando). |
| N3-UI-Fuentes | `app/(hub)/admin/operacion/page.tsx` (edición) | Sección "Fuentes de amenazas" en el panel técnico ya existente (mismo gate `adminPageGate`, staff-only); columna "vencida" en texto cuando la frescura real supera el TTL aunque `estado` diga 'ok'; atribución CC-BY visible. | No existía test previo para esa página (sólo para el endpoint subyacente); se dejó así, documentado. |

**Integración de UI en la app real:** la prop `habilitado` de `FichaTerritorial`/el flag `hazardContextEnabled()` todavía no está cableada desde el Server Component que renderiza `FichaParteModal` en `components/mapas/map-infraestructura-page.tsx` — ese cableado final (pasar el flag como prop desde el server al client) queda como pendiente explícito de la ola de revisión/cierre, ver §6.

### Correcciones de integración hechas directamente por N2 (no un fallo de la misma tarea N3 repetido — son hallazgos de las 4 verificaciones globales tras integrar todas las olas, responsabilidad de integración de N2)

1. `pnpm exec tsc --noEmit` falló con 4 errores en archivos de test (tipos de `vi.fn()` sin parámetro tipado, un `.find()` con el tipo de callback pegado mal en `peligro/route.test.ts`). Corregidos: `app/api/infraestructura/peligro/route.test.ts`, `lib/infraestructura/riesgo/providers/ecmwf.test.ts`, `lib/infraestructura/riesgo/providers/climatologia.test.ts`.
2. `pnpm lint` falló por `react-hooks/purity` (`Date.now()` invocado directamente en el cuerpo del Server Component `app/(hub)/admin/operacion/page.tsx`, aun siendo async). Corregido moviendo el cálculo a una función de módulo `calcularFrescuraMinutos` fuera del componente, mismo patrón que ya usa `obtenerEstadoOperativo()` para `generadoEn`. También corregidos 4 warnings de `@typescript-eslint/consistent-type-imports` (`typeof import(...)` inline) en `lib/infraestructura/riesgo/jobs/*.test.ts`, reemplazados por `import type {...}` de nivel de módulo.
3. Tras estas correcciones: `pnpm test` (1082/1082), `pnpm lint` (limpio), `pnpm exec tsc --noEmit` (limpio), `pnpm build` (completo, rutas nuevas listadas) — ver §7 para el detalle final.

### Revisión (N3 distinto de los implementadores, sólo reporte, sin tocar archivos)

Revisó: casos geográficos, outages/429/timeout, dato vencido, idempotencia, conteo de llamadas, ACL,
carrera de fetches en la ficha. Confirmó `git status` limpio tras su pasada (revisión de solo lectura
respetada). Hallazgos, de más a menos severo, y qué hizo N2 con cada uno:

| # | Severidad | Hallazgo | Acción de N2 |
|---|---|---|---|
| H1 | Bloqueante funcional | `HAZARD_CONTEXT_ENABLED`/`hazardContextEnabled()` no estaba cableado: la ficha territorial nunca se montaba, ni con el flag encendido (`FichaParteModal` recibía `habilitado` sin que ningún padre lo pasara). | **Corregido por N2**: cableado `page.tsx` (lee `hazardContextEnabled()`) → `map-client.tsx` → `map-infraestructura-page.tsx` → `FichaParteModal habilitado=...`, mismo patrón que la prop existente `mostrarEnlaceNominal`. |
| H2 | Mayor | El lease del sync (5 min) no se renueva (`renovarLease` nunca se llama); con ~387 celdas reales el job puede exceder los 5 min y otra invocación recupera el lease en paralelo. | **No corregido, documentado como pendiente.** Corregirlo bien (renovar el lease periódicamente durante el loop de consultas, o subir la duración con un cálculo basado en la cantidad de celdas) es un cambio de diseño no trivial que excede el alcance de una corrección puntual de cierre; queda para una tarea de N3 dedicada antes de habilitar el job en producción. Mitigado parcialmente por H3 (ver abajo): aunque el lease se recupere y corran dos invocaciones en paralelo, ya no duplican filas de pronóstico dentro de la misma ventana de 6h. |
| H3 | Mayor | `corridaEn` se fijaba al instante exacto de invocación (milisegundos), no al bloque de 6h — dos invocaciones de la MISMA ventana (ej. por la recuperación de lease de H2) podían generar `corridaEn` distintos y el índice único de `hazard_forecast` no dedupicaba pese a ser la misma corrida. | **Corregido por N2**: `corridaEn` ahora se ancla al inicio del bloque de 6h (`inicioDeBloqueUtc`), estable para cualquier invocación dentro de esa ventana. Test de regresión agregado (`sync-pronostico-caudal.test.ts`, verifica `corridaEn` idéntico). Costo aceptado y documentado: `horizonteHoras` queda relativo al inicio del bloque, no al instante exacto de consulta — un desvío de hasta <6h en el número reportado, nunca en el signo (no descarta puntos futuros reales). |
| H4 | Menor | Si AMBOS proveedores fallan en la misma corrida, el job igual publica `estado:'completado'` con 0 filas (en vez de `'fallido'`). | **No corregido.** Decisión de producto razonable tal como está: una fuente degradada no debe tumbar el job (exigencia explícita del plan), y el apagón total ya es visible en `hazard_source_health` (ambos proveedores en `'degradado'`). Documentado como comportamiento intencional, no bug. |
| H5 | Menor | Las 3 rutas nuevas llaman `ensureSeeded()` antes de `verificarAccesoLectura()`; un archivo del repo (`app/api/mapas/infraestructura/parte/route.ts`) hace el orden inverso. | **No corregido.** Se verificó que el propio repo es inconsistente: `app/api/mapas/infraestructura/route.ts` (patrón que se siguió para E2) TAMBIÉN llama `ensureSeeded()` primero. Reordenar unilateralmente arriesga romper el arranque en frío si `verificarAccesoLectura()` (que lee `recurso_access`, poblada por `ensureSeeded()`) corre antes de que la DB exista. Queda como pregunta de convención transversal para N1, no específica de E2. |
| H6 | Menor (UI) | La ficha territorial marcaba "Fuente vencida" por `estado !== 'ok'`, ignorando la frescura real — un proveedor `degradado` con dato fresco se mostraba vencido igual, y uno `ok` con dato viejo no avisaba. | **Corregido por N2**: ahora compara `frescuraMinutos > ttlMinutos` (con frescura desconocida tratada como vencida por precaución). Tests existentes ajustados + uno nuevo que cubre el caso "degradado pero fresco → no vencida". |
| H7 | Menor | El conteo de llamadas (`llamadasRealizadas`) no contempla reintentos internos de `cliente-http.ts`. | **No corregido, documentado.** Es una aproximación aceptable para la unidad lógica de consulta (1 request por celda/punto, sin batching multi-coordenada); el plan pide "registrar el conteo", no un conteo exacto de bytes en la red. |
| H8 | Menor/cosmético | Normalización de `departamento`: `''` queda como `''` en vez de `null`; sólo NFC, no colapsa dobles espacios. | **No corregido.** Verificado contra los 25 departamentos reales de Corrientes (ver cobertura real en §5): no hay ningún caso de departamento vacío ni NFD en el dato fuente real. Documentado como límite conocido para datos futuros. |
| H9 | Menor | `calcular-climatologia.ts` hace un `select()` por celda dentro del loop (N+1, ~387 queries evitables). | **No corregido.** Correcto pero ineficiente; el job es de baja frecuencia (bajo demanda, no cada 6h), así que el costo de N+1 es aceptable para el volumen actual (387 celdas). Candidato a optimización si el padrón crece significativamente. |

Puntos que la revisión encontró **bien resueltos** (sin acción): P1 (bordes geográficos inclusivos y
normalización de tildes completa, no sólo Concepción), P2 (backoff realmente acotado, timeout por carrera
de promesa propia, cuarentena sin reintentar), P3 (`/fuentes` expone `frescuraMinutos` calculado, no sólo
`estado`), P6 (ACL real en las 3 rutas, sin datos nominales en ninguna respuesta), P7 (sin carrera entre
`/geo-perfiles` y `/peligro` en la ficha; con el flag apagado no hay fetches).

Verificación tras las correcciones de esta sección: `pnpm vitest run` sobre los archivos tocados (job de
sync, ficha territorial, ficha del parte) → pasa; ver §7 para las 4 verificaciones globales repetidas.

## 3. Pruebas reales fechadas

Ejecutadas por N2 el **2026-09-26** desde el servidor de este worktree (con acceso de red real).
Guardadas como fixture en `lib/infraestructura/riesgo/__fixtures__/hazard/` para que los adapters las
usen en tests (los tests nunca golpean la red; usan estos archivos).

**(a) ECMWF — pronóstico horario:**
```
curl "https://api.open-meteo.com/v1/ecmwf?latitude=-27.5&longitude=-58.8&hourly=precipitation,cape,wind_gusts_10m,temperature_2m,wind_speed_10m&forecast_days=10&timezone=UTC"
```
Respuesta real (200 OK, 11088 bytes, guardada en `ecmwf-forecast-2026-09-26.json`), celda resuelta
`(-27.5, -58.75)`, extracto:
```json
{"latitude":-27.5,"longitude":-58.75,...,"hourly_units":{"precipitation":"mm","cape":"J/kg","wind_gusts_10m":"km/h",...},"hourly":{"time":["2026-09-26T00:00","2026-09-26T01:00",...],"precipitation":[...]}}
```

**(b) Open-Meteo Archive (ERA5) — climatología:**
```
curl "https://archive-api.open-meteo.com/v1/archive?latitude=-27.5&longitude=-58.8&start_date=2020-01-01&end_date=2020-03-31&daily=precipitation_sum&timezone=UTC"
```
Respuesta real (200 OK, 1917 bytes para el rango de prueba acotado; el rango productivo es
1991-01-01..2020-12-31, guardado en `era5-archive-2020q1.json` como muestra), extracto:
```json
{"latitude":-27.521969,"longitude":-58.75699,...,"daily_units":{"precipitation_sum":"mm"},"daily":{"time":["2020-01-01","2020-01-02",...],"precipitation_sum":[...]}}
```

**(c) Flood API (GloFAS) — caudal en punto de río fijo (`parana-corrientes-paso-patria`):**
```
curl "https://flood-api.open-meteo.com/v1/flood?latitude=-27.4692&longitude=-58.9306&daily=river_discharge,river_discharge_mean,river_discharge_max,river_discharge_p75&forecast_days=5&timezone=UTC"
```
Respuesta real (200 OK, 679 bytes, guardada en `flood-parana-corrientes-2026-09-26.json`):
```json
{"latitude":-27.474998,"longitude":-58.924995,...,"daily":{"time":["2026-09-26","2026-09-27","2026-09-28","2026-09-29","2026-09-30"],"river_discharge":[17740.90,17781.80,17659.39,17457.23,17257.38],...}}
```
Caudal del orden de ~17.700 m³/s, consistente con el tramo del Paraná inmediatamente aguas abajo de la
confluencia con el río Paraguay — muy distinto del 0,67 m³/s del caveat verificado sobre el centro
urbano de Corrientes sin ajustar la coordenada (ver §4).

## 4. Puntos de río elegidos

Método: barrido automatizado (N2, con acceso de red real) de una grilla ±0,2° en pasos de 0,1° alrededor
de la coordenada de cada localidad, eligiendo la celda con el **caudal máximo reportado por la Flood API**
el 2026-09-26 — bajo el supuesto de que el cauce principal domina el caudal de cualquier celda vecina.
Config versionada en `lib/infraestructura/riesgo/puntos-rio.ts` (`PUNTOS_RIO_VERSION = 'puntos-rio-v1'`).

| id | Río | Localidad | lat, lon | Caudal máx. hallado (m³/s) |
|---|---|---|---|---|
| `parana-ituzaingo` | Paraná | Ituzaingó | -27.49, -56.80 | 14756.07 |
| `parana-corrientes-paso-patria` | Paraná | Corrientes / Paso de la Patria | -27.4692, -58.9306 | 17740.90 |
| `parana-bella-vista` | Paraná | Bella Vista | -28.3069, -59.1387 | 17822.79 |
| `parana-goya` | Paraná | Goya | -29.0382, -59.2649 | 17740.90 |
| `parana-esquina` | Paraná | Esquina | -30.0022, -59.6314 | 17659.39 |
| `uruguay-santo-tome` | Uruguay | Santo Tomé | -28.6511, -56.1459 | 12734.03 |
| `uruguay-paso-de-los-libres` | Uruguay | Paso de los Libres | -29.5061, -56.9866 | 14124.38 |
| `uruguay-monte-caseros` | Uruguay | Monte Caseros | -30.0639, -57.5389 | 12851.87 |

**Magnitudes del Paraná** (14.700–17.800 m³/s) son consistentes con la referencia conocida del tramo
posterior a la confluencia con el río Paraguay.

**Advertencia sobre el río Uruguay:** los tres puntos dieron 12.700–14.100 m³/s, un orden de magnitud
mayor a la referencia histórica habitual de ese tramo (miles, no decenas de miles). No se descartaron los
puntos porque las coordenadas caen claramente sobre el río Uruguay (longitud ~-56 a -57.5°, lejos del
Paraná) y el método de barrido es el mismo que validó correctamente los puntos del Paraná — pero la
magnitud absoluta **no se contrastó en esta sesión contra la climatología de caudal** (podría tratarse de
una crecida real de esa fecha, o de una particularidad del dato GloFAS en ese tramo). Se documenta como
riesgo declarado: no usar estos valores absolutos para un umbral operativo sin esa comparación previa.

**Afluentes (Corriente, Santa Lucía, Miriñay, Aguapey): pendiente explícito, no resuelto en E2.** El
método de barrido por caudal máximo converge sistemáticamente al cauce principal (Paraná/Uruguay) más
cercano, que domina cualquier celda vecina — no sirve para aislar un afluente mucho más chico sin conocer
su curso real (polígono/línea), que no está disponible en este repo (no hay hidrografía de afluentes en
`public/data/`, ver E2-prep `cobertura-geo.md`). No bloquea la aceptación de E2: la integración mínima
exigida por el plan es Paraná + Uruguay.

## 5. Cobertura

Generada corriendo `calcularGeoPerfiles()` real (no fixture) contra la siembra de desarrollo del
worktree (`.data/ge.sqlite`, 2005 registros de `public/data/localizaciones.json` — la misma fuente
medida en E2-prep `cobertura-geo.md`). Confirma que el 100% del padrón queda representado: perfil válido
o motivo explícito.

| Métrica | Valor |
|---|---|
| Procesados | 2005 |
| Con perfil válido (`motivoExclusion = null`) | 2001 |
| Excluidos | 4 (todos `sin_coordenadas`) |
| Departamentos distintos tras normalizar | 25 (coincide con el GeoJSON oficial — el duplicado `CONCEPCION`/`CONCEPCIÓN` del dato fuente quedó fusionado en un solo departamento con 78 registros, 77 válidos + 1 excluido) |

Calidad de coordenada (`geoCalidad`): 1998 sin registrar, 4 "Sin georreferenciación" (los mismos 4
excluidos), 1 "Heredada del establecimiento sede/anfitrión", 1 "Aproximada por departamento", 1
"Aproximada por localidad" — igual a lo medido en E2-prep.

Departamentos con algún registro excluido: CAPITAL (365 total, 2 excluidos), CONCEPCION (78 total, 1
excluido), SAN COSME (56 total, 1 excluido). Los 22 departamentos restantes tienen cobertura 100%.

## 6. UX

**Estados textuales** (gate exigido, no sólo color): la ficha territorial distingue con texto explícito
«Sin cobertura geográfica» (+ motivo legible), «Sin peligro estimado» y «Fuente vencida» (+ proveedor
afectado, dato igual visible). La vista técnica de salud de fuentes vive separada del mapa operativo
(`/admin/operacion`, sólo staff), sin tarjeta permanente por proveedor en la ficha de la escuela.

**Flag que gobierna la UI nueva:** `HAZARD_CONTEXT_ENABLED` (default apagado). Cableado de punta a punta
verificado (§2, corrección H1): `app/(hub)/mapas/infraestructura/page.tsx` → `map-client.tsx` →
`map-infraestructura-page.tsx` → `FichaParteModal` → `FichaTerritorial`. Las 3 APIs (`/fuentes`,
`/peligro`, `/geo-perfiles/:cueAnexo`) NO están gateadas por este flag — existen siempre, protegidas por
ACL, tal como exige el plan (el flag sólo oculta la UI, nunca el contrato).

**Atribución de licencia:** visible en la vista técnica de fuentes (`app/(hub)/admin/operacion/page.tsx`):
"Datos meteorológicos: Open-Meteo.com (CC BY 4.0), ECMWF."

**Gate UX (walkthrough con 1-2 operadores reales, estándar permanente §7):** no hubo operadores
disponibles durante esta ejecución. **Pendiente explícito** — se deja documentado el recorrido guiado
reproducible para cuando haya disponibilidad:
1. Abrir el mapa de infraestructura (staff autenticado) con `HAZARD_CONTEXT_ENABLED=true`.
2. Hacer clic en una escuela con perfil geográfico válido → abrir la ficha del parte → confirmar que
   aparece la sección "Contexto territorial" con departamento, celda, calidad de coordenada y resumen de
   72h.
3. Repetir sobre una escuela con `motivoExclusion` (de las 4 sin coordenadas) → confirmar el texto «Sin
   cobertura geográfica» sin datos meteorológicos.
4. En `/admin/operacion`, confirmar que la tabla "Fuentes de amenazas" muestra el estado real y, si el
   sync nunca corrió, ninguna fila (mensaje "Sin proveedores registrados todavía").
5. Confirmar que una sesión de director (contraseña compartida, sin `SessionUser`) no puede abrir
   `/admin/operacion` ni las 3 APIs nuevas (401/403).

No se afirma gate operativo aprobado — sólo piloto interno, según el estándar de la sección 7 cuando no
hay operadores disponibles.

## 7. Verificaciones finales

Repetidas al cierre, sobre el estado íntegro (todas las olas + correcciones de revisión):

| Comando | Exit code | Resumen |
|---|---|---|
| `pnpm test` | 0 | 134 test files, 1083 tests, todos pasando (baseline: 120/999 → +14 archivos, +84 tests) |
| `pnpm lint` | 0 | sin hallazgos |
| `pnpm exec tsc --noEmit` | 0 | sin errores |
| `pnpm build` | 0 | build completo; nuevas rutas listadas: `/api/infraestructura/fuentes`, `/api/infraestructura/peligro`, `/api/infraestructura/geo-perfiles/[cueAnexo]` |

## 8. Pendientes explícitos para N1

1. **H2** (job de sync sin renovación de lease para volúmenes reales de ~387 celdas) — riesgo de
   producción, no bloquea el gate técnico de E2 pero sí su habilitación con el scheduler real de 6h.
2. **H4/H5** (semántica de `estado:'completado'` con 0 filas; orden ACL/ensureSeeded) — decisiones de
   convención transversal, no específicas de E2.
3. **Gate UX con operadores reales**: pendiente por falta de disponibilidad (walkthrough reproducible
   documentado en §6).
4. **INA** (fuente hidrométrica complementaria) y **Ensemble API** (probabilidad de precipitación): fuera
   de alcance de E2 por decisión de N1 ya registrada en el plan; no se investigaron en este batch.
5. **Afluentes** (Corriente, Santa Lucía, Miriñay, Aguapey): sin punto de río asignado (ver §4) — no
   bloquea la integración mínima exigida (Paraná + Uruguay).
6. **Payload crudo bajo DATA_DIR:** `rawRef` queda `null` en todas las filas de `hazard_forecast`; la
   escritura del archivo crudo con retención documentada no se implementó (documentado como fuera de
   alcance en `persistirPuntos`, `sync-pronostico-caudal.ts`). No afecta la aceptación funcional (unidad,
   timezone, idempotencia, degradación se cumplen sin el archivo crudo), pero si se necesita diagnóstico
   post-mortem del payload real de un sync fallido, hoy no queda guardado.

## 8. Gate

(N1 completa esta sección — N2 no la completa)

## Gate (N1)

**Decisión: aceptado con follow-ups (2026-09-26).**

- Verificaciones globales repetidas por N1: `pnpm test` 134 archivos / 1083 tests OK; `pnpm lint`, `pnpm exec tsc --noEmit` y `pnpm build` con exit 0.
- Revisión independiente: confirma H1, H3 y H6 corregidos; ACL excluye al director; DDL aditivo seguro; adapters fijan UTC; tests sin red.
- Caudal del río Uruguay (12.700–14.300 m³/s): contrastado por N1 contra la serie GloFAS 2015–2024 en Paso de los Libres (mediana 2.903, P90 9.119, máx. 37.496 m³/s). Es una crecida real por encima del P90, no un error del punto.
- Follow-ups obligatorios, asignados como primeras tareas de E3:
  1. La ficha no puede mostrar caudal: `geometryRef` del perfil es la celda atmosférica y el caudal se indexa por punto de río. Falta asociar cada escuela a su punto de río (por ejemplo, el más cercano sobre la misma cuenca) y consultar `/peligro` con ese id.
  2. H2: renovar el lease durante el sync (o dimensionarlo por cantidad de celdas) antes de programar el job cada 6 h en producción.
  3. Consultas multi-coordenada a Open-Meteo para reducir llamadas (hoy una por celda, ~387 por ciclo, dentro del límite).
- Pendientes que se arrastran: afluentes sin trazado, gate UX con operadores reales, convención H5 y licencia de Open-Meteo para producción.
