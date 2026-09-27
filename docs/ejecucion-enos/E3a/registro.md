# E3a — Señales v2 y capa de peligro estimado

Registro único del batch (decisión de producto 2026-09-26, ver plan-ejecucion §7/§9). N2 = este agente
(sonnet, worktree `enos-e3a`). N3 = `opencode run --auto -m opencode-go/deepseek-v4.1-flash`, siempre
(costos: todo subagente Agent de este batch usa `haiku`, la implementación va siempre a N3).

## 0. Baseline

Commit de partida: `2446fea` (merge `feat/enos-e2`), rama `feat/enos-e3a`.

| Comando | Exit code | Resumen |
|---|---|---|
| `pnpm test` | 0 | 134 test files, 1083 tests, todos pasando |
| `pnpm lint` | 0 | sin hallazgos |
| `pnpm exec tsc --noEmit` | 0 | sin errores |
| `pnpm build` | 0 | build completo, todas las rutas listadas |

Baseline capturado después de tres cambios fundacionales mecánicos hechos directamente por N2 (mismo
patrón que E2 con `cliente-http.ts`/`flags.ts`: sin ambigüedad de diseño, contrato ya fijado por N1):
bloque `// E3a: ...` en `lib/db/schema.ts`/`HUB_DDL` de `lib/db/seed.ts` (tablas `infra_geo_rio`,
`hazard_ensemble_prob`, `hazard_observation`) y los tipos fijos de `lib/infraestructura/riesgo/peligro/nivel.ts`
(`NivelPeligro`, `HorizontePeligro`, `NivelPeligroCelda`, `NivelCaudalPunto` — copiados literalmente del
contrato de N1, sin funciones todavía). Sin fallas preexistentes que documentar.

Untracked no creado por esta tarea, no tocado: `.atl/` (reportado, se deja intacto).

## 1. Decisiones locales (N2, dentro del alcance fijado por N1)

1. **Asociación río: tabla propia `infra_geo_rio`, no columna en `infra_geo_profile`.** Evita competir por
   `infra_geo_profile` (propiedad de E2/E3b) en la misma ola; `puntoRioId`/`distanciaKm` nulos ambos
   significan explícitamente "fuera de radio", nunca el punto más lejano.
2. **Georef Argentina sólo da centroides, no polígonos**, verificado en vivo el 2026-09-26 (`campos=completo`
   y por id devuelven `geometry.type: "Point"`, nunca polígono). El plan asumía importar "los 25 polígonos
   departamentales"; con este endpoint eso no es posible. Alcance real de E3a: importar y versionar los 25
   `{id, nombre}` de departamento (suficiente para validar nombres contra `infra_geo_profile`, que es lo que
   pide el punto 4 del brief) y dejar documentado que la construcción de la coropleta de E4 va a necesitar
   otra fuente de polígonos (Overpass/IGN, o el propio import de OSM de E6). Reportado, no resuelto aquí.
3. **IMERG: sin Python/HDF5, sin `services/imerg/`.** N1 verificó en vivo (2026-09-26, con `EARTHDATA_TOKEN`
   ya aprobado por GES DISC) que el subsetting server-side vía OPeNDAP ASCII funciona directo: reemplazar
   `data.gesdisc.earthdata.nasa.gov/data/` por `gpm1.gesdisc.eosdis.nasa.gov/opendap/` en la URL del gránulo
   (CMR) y pedir `.ascii?precipitation[0][lon0:lon1][lat0:lat1],lat[...],lon[...]`. Confirmado con curl real:
   `precipitation` tiene forma `[time=1][lon=3600][lat=1800]` (el primer índice espacial es longitud, el
   segundo latitud — documentado porque no es obvio del nombre). Se parsea en TS puro. Fixture real guardado
   en `lib/infraestructura/riesgo/__fixtures__/hazard/imerg-subset-2026-09-26.ascii` (+ `.dds` con la
   estructura completa del dataset).
4. **Ensemble Open-Meteo confirmado en vivo:** `ensemble-api.open-meteo.com/v1/ensemble` con
   `models=ecmwf_ifs025` devuelve `precipitation` (control) + `precipitation_member01`..`precipitation_member50`
   (50 miembros nombrados + control = 51). Fixture real en
   `lib/infraestructura/riesgo/__fixtures__/hazard/ensemble-2026-09-26.json`.
5. **Denominador de climatología para el acumulado de 24h de Capa 1:** `todos_los_dias` (fijado por N1 en el
   brief, no una decisión local).
6. **Capa de peligro sin tabla de snapshot propia:** `obtenerNivelesPeligro()`/`obtenerNivelCaudal()` son
   funciones puras que leen `hazard_forecast`/`hazard_ensemble_prob`/`hazard_climatology`/`hazard_observation`
   en el momento de la consulta — no se persiste un snapshot de nivel en E3a (eso es lo que hará el snapshot
   de riesgo de E3b, `infra_risk_snapshot`, consumiendo este puerto). Evita una tabla más para sincronizar
   entre batches hermanos.

## 2. Despachos N3

Nota de infraestructura: a partir del aviso de N1 en medio de esta ola, todo despacho usa
`OPENCODE_CONFIG=$HOME/.config/opencode/n3-sin-mcp.json` (evita que cada N3 levante los 17 MCP
globales de opencode) y como máximo 2 N3 simultáneos por batch.

### Ola 1 — Follow-ups obligatorios de E2 + Georef (en paralelo, archivos disjuntos, 4 N3 simultáneos
antes del aviso de límite de concurrencia)

| Tarea | Archivos | Resultado | Verificación |
|---|---|---|---|
| N3-Rio | `lib/infraestructura/riesgo/rio-asociacion.ts` (+test) | Follow-up 1a de E2. `elegirPuntoRioMasCercano` (haversine, radio 40km default, null si fuera de radio, empate → primero del array) + `calcularAsociacionesRio()` upsert idempotente en `infra_geo_rio`. | `pnpm vitest run rio-asociacion.test.ts` → pasa. Revisado por N2: lógica de radio/empate/null correcta. |
| N3-Lease | `lib/infraestructura/riesgo/jobs/sync-pronostico-caudal.ts` (+test) | Follow-up 1b (H2 de E2). Renueva el lease cada 25 celdas/puntos consultados (tandas), corta el loop y no persiste más si pierde el lease (`lease_perdido_durante_ejecucion`, extensión compatible del tipo de retorno). | `pnpm vitest run sync-pronostico-caudal.test.ts` → pasa. Revisado por N2: fencing correcto, no publica resultado con lease perdido. |
| N3-Batch | `lib/infraestructura/riesgo/providers/ecmwf.ts`, `providers/climatologia.ts` (+tests) | Follow-up 1c. Consultas multi-coordenada por lote (50 coordenadas/request para ECMWF y Archive), parseo por índice del array de respuesta de Open-Meteo confirmado en vivo. | `pnpm vitest run ecmwf.test.ts climatologia.test.ts` → pasa. Revisado por N2. |
| N3-Georef | `lib/mapas/georef-departamentos.ts` (+test), `public/data/georef-departamentos-corrientes.json` | Punto 4 del brief. 25 departamentos versionados (sólo id+nombre — Georef no expone polígonos, ver §1.2), `normalizarNombreDepartamento` (misma regla que geo-perfil.ts) + `compararDepartamentosConGeoref`. | `pnpm vitest run georef-departamentos.test.ts` → pasa. |

Verificación conjunta de la ola: `pnpm vitest run` sobre los 5 archivos → 5 test files, 37 tests, todos
pasan. `pnpm exec tsc --noEmit` y `pnpm lint` limpios tras integrar.

### Ola 2 — Ensemble e IMERG, sólo providers puros (en paralelo, 2 N3 simultáneos)

| Tarea | Archivos | Resultado | Verificación |
|---|---|---|---|
| N3-Ensemble | `lib/infraestructura/riesgo/providers/ensemble.ts` (+test) | Punto 2 del brief. `contarProbabilidadSuperarUmbral`, `calcularDispersion`, `obtenerProbabilidadesEnsemble` (lotes de 20 coordenadas — payload más pesado que el determinístico — modelo `ecmwf_ifs025`, acumulado 24h por miembro sin imputar ceros). | `pnpm vitest run ensemble.test.ts` → pasa con fixture real `ensemble-2026-09-26.json`. |
| N3-IMERG-Provider | `lib/infraestructura/riesgo/providers/imerg.ts` (+test) | Punto 3 del brief, mitad "parser puro" (sin red, sin Python/HDF5 por indicación de N1 — ver §1.3). `elegirGranuloMasReciente` (CMR), `calcularIndicesGrillaImerg`/`construirUrlSubsetImerg` (grilla global 0,1°, fórmula verificada), `parsearRespuestaAsciiImerg`, `mapearAsciiImergACeldas` (colisión de grilla IMERG/E2 documentada, se queda con el primer valor). | `pnpm vitest run imerg.test.ts` → pasa con los 2 fixtures reales (CMR + ascii). Esta tarea excedió el timeout de 560s del comando (exit 124) pero había dejado ambos archivos completos; el único problema real era un typo de nombre (`elegirGranuloMasRecente` vs `elegirGranuloMasReciente`) en 6 líneas del test, dentro del mismo archivo que ya tocaba esa tarea — **corregido directamente por N2** (mecánico, un solo identificador, no una tarea nueva) en vez de redespachar. |

Verificación conjunta: `pnpm vitest run` sobre los 2 archivos → 2 test files, 25 tests, todos pasan.
`pnpm exec tsc --noEmit` y `pnpm lint` limpios tras integrar.

### Ola 3 — Jobs de persistencia (Ensemble, IMERG) (2 N3 simultáneos)

| Tarea | Archivos | Resultado | Verificación |
|---|---|---|---|
| N3-Job-Ensemble | `lib/infraestructura/riesgo/jobs/sync-ensemble.ts` (+test) | Job de 6h: lease con renovación cada 25 celdas (mismo patrón que N3-Lease), lee climatología p95/p99 (`todos_los_dias`) por celda, llama `obtenerProbabilidadesEnsemble`, upsert en `hazard_ensemble_prob`. | `pnpm vitest run sync-ensemble.test.ts` → pasa. |
| N3-Job-IMERG | `lib/infraestructura/riesgo/jobs/sync-imerg.ts` (+test) | Punto 3 del brief, job. `earthdataToken` se recibe por parámetro (nunca lee `process.env` ni loguea el valor); sin token → `hazard_source_health` en `no_disponible` con "fuente no configurada", sin llamar a la red. Con token: CMR → subset OPeNDAP ASCII → parseo → dedup por colisión de grilla → upsert en `hazard_observation`. | `pnpm vitest run sync-imerg.test.ts` → pasa, con los fixtures reales de CMR/ASCII. |

Corrección directa de N2 (mecánica, un solo archivo cada una): 2 constantes sin uso (`VARIABLE`/`UNIDAD`) eliminadas de `sync-imerg.ts`; `eslint --fix` sobre un import type en `sync-ensemble.test.ts`. `pnpm lint` quedó en 0 hallazgos tras esto (había 3 warnings).

Verificación conjunta: `pnpm vitest run` sobre los 2 archivos → 2 test files, 12 tests, todos pasan.
`pnpm exec tsc --noEmit` y `pnpm lint` limpios.

### Ola 3.5 — Climatología de caudal (follow-up necesario para el punto 5 del brief: "caudal vs su propia climatología")

| Tarea | Archivos | Resultado | Verificación |
|---|---|---|---|
| N3-Climatologia-Caudal | `providers/climatologia-caudal.ts`, `jobs/calcular-climatologia-caudal.ts` (+tests) | E2 sólo calculó climatología de precipitación; sin esto `obtenerNivelCaudal` no tendría contra qué comparar el caudal pronosticado. Mismo patrón que climatología de precipitación pero sin distinción `dias_humedos` (no aplica a caudal), `variable: 'caudal_diario'`, período histórico GloFAS 2015–2024, sobre los 8 `PUNTOS_RIO`. | `pnpm vitest run climatologia-caudal.test.ts calcular-climatologia-caudal.test.ts` → pasa, 9 tests. |

`pnpm exec tsc --noEmit` y `pnpm lint` limpios tras integrar.

### Ola 4 — Capa 1 (nivel.ts) + API + ficha UI

| Tarea | Archivos | Resultado | Verificación |
|---|---|---|---|
| N3-Nivel | `lib/infraestructura/riesgo/peligro/nivel.ts` (funciones, sobre los tipos ya escritos por N2), `nivel.test.ts` | Punto 5 del brief. `nivelDesdeEnsemble`/`nivelDesdeDeterministico` (umbrales documentados: P99≥0.5→rojo, P95≥0.5→naranja, P95>0.1→amarillo), `obtenerNivelesPeligro` (ensemble preferido en 24/72, determinístico siempre en 240, `sin_dato` explícito nunca 'verde' por defecto ante falta de dato), `obtenerNivelCaudal` (contra la climatología de caudal de la ola 3.5). | `pnpm vitest run nivel.test.ts` → falló 1/26 por un test con una celda no sembrada en `infraGeoProfile` (bug del propio test, no de la lógica) — **corregido por N2** agregando la fila faltante. `pnpm exec tsc --noEmit` encontró un error real (`Math.abs` con `objetivo` tipado `number \| 'menor'`) — **corregido por N2**: la tolerancia de horizonte 240 sólo aplica cuando `objetivo` es numérico. Tras ambas correcciones: 26/26 pasan, tsc limpio. |
| N3-API-Peligro | `app/api/infraestructura/peligro/route.ts`, `app/api/infraestructura/geo-perfiles/[cueAnexo]/route.ts` (+tests) | Cierra el follow-up 1a de E2 a nivel API: `/geo-perfiles/:cueAnexo` agrega `rioAsociacion`; `/peligro` agrega `niveles`, `caudal` (con `puntoRioId` opcional) y `observado` (IMERG), sin romper `pronostico`/`climatologia`. | `pnpm vitest run` sobre ambos → 21/21 pasan. `tsc`/`lint` limpios. |
| N3-UI-Ficha | `components/infraestructura/ficha-territorial.tsx` (+test) | Corrige el bug de E2 ("la ficha no puede mostrar caudal"): ahora pasa `puntoRioId` a `/peligro`, muestra los 3 niveles de peligro con texto explícito (nunca sólo color), caudal con percentil, y lluvia observada IMERG rotulada "estimada por satélite". | `pnpm vitest run ficha-territorial.test.tsx` → 17/17 pasan. |

Corrección directa de N2 adicional (mecánica, un archivo, función pura bien especificada): `agregarNivelPorDepartamento` (peor nivel entre celdas con escuelas del departamento, `sin_dato` nunca se completa a 'verde') — faltaba del punto 5 del brief ("Agregación por departamento") y no había sido incluida en el despacho de N3-Nivel; agregada directamente por N2 con 5 tests propios en `nivel.test.ts` en vez de abrir una ronda más de despacho para una función de ~25 líneas ya completamente especificada por el plan.

Verificación conjunta de la ola: `pnpm test` completo → 143 test files, 1177 tests, todos pasan (baseline 134/1083 → +9 archivos, +94 tests contando además olas 1-3.5). `pnpm exec tsc --noEmit` y `pnpm lint` limpios.

### Ola 5 — Revisión (N3 distinto de los implementadores, sólo lectura)

Revisó, sin tocar archivos (confirmado: `git status --short` idéntico antes/después de su pasada): casos
geográficos, outages/429/timeout, dato vencido, idempotencia, conteo de llamadas, ACL, carrera de fetches
en la ficha, integridad del contrato fijo de `nivel.ts`, la regla "`sin_dato` nunca verde", el hallazgo de
Georef y ausencia de secretos. Ejecutó por su cuenta `pnpm vitest run nivel.test.ts rio-asociacion.test.ts`
(38/38 en ese momento) y `pnpm exec tsc --noEmit` (limpio).

Hallazgos, de más a menos severo, y qué hizo N2 con cada uno:

| # | Severidad | Hallazgo | Acción de N2 |
|---|---|---|---|
| A | Bloqueante funcional | `nivel.ts`: `cargarFilaEnsemble` no seleccionaba `miembrosValidos`; una fila de ensemble con `miembrosValidos: 0` (todos los miembros `null`) se evaluaba igual con `nivelDesdeEnsemble(0,0)` → `'verde'` — exactamente el camino prohibido de falta de dato pintada de verde. El fixture real usado en los tests de `ensemble.ts` no tiene nulls, así que el camino nunca se había ejercitado hasta la revisión. | **Corregido por N2**: `cargarFilaEnsemble` ahora selecciona `miembrosValidos` y descarta la fila (cae al fallback determinístico, o `sin_dato` si tampoco hay determinístico) cuando `miembrosValidos === 0`. Test de regresión agregado en `nivel.test.ts`. |
| B | Mayor | `sync-pronostico-caudal.ts` seguía calculando `llamadasRealizadas = celdasConsultadas + puntosRioConsultados` (comentario "una por celda"), pero desde el batching de esta misma ola `ecmwf.ts` agrupa hasta 50 coordenadas por request — el conteo persistido en `infra_job_run.contadores.llamadas` quedaba inflado ~50× respecto de las requests HTTP reales. | **Corregido por N2**: `DiagnosticoFlood`/`ProveedorConDiagnostico.obtenerPronosticoConDiagnostico` ahora exponen `llamadasRealizadas` real (ecmwf.ts ya lo hacía; se agregó a `flood.ts` — 1 por punto de río deduplicado, sin batching porque son sólo 8 puntos fijos); el job suma el valor reportado por cada tanda, con fallback a `geometryRefs.length` sólo si un provider/fake no lo declara (compatibilidad hacia atrás). Test de regresión agregado con un fake que batchea y reporta 1 sola llamada por tanda. |
| C | Menor | Tres normalizadores de nombre de departamento (`geo-perfil.ts`, `lib/mapas/departamentos.ts`, `georef-departamentos.ts` de este batch) divergen en el colapso de espacios múltiples — `georef-departamentos.ts` lo colapsa, los otros dos no. No dispara con los 25 nombres reales (sin dobles espacios), pero es una inconsistencia latente. | **No corregido, documentado como pendiente para N1** (afecta 3 archivos de 2 batches distintos — no es un fix de un solo archivo/dueño). |
| D | Menor | `mapearAsciiImergACeldas` (`providers/imerg.ts`) recibe `lonIndiceInicio`/`latIndiceInicio` sin usarlos (la función ya resuelve la coordenada absoluta desde `parseado.lon`/`parseado.lat`). No es un bug de resultado, sólo contrato ruidoso. | **No corregido, documentado como pendiente** — limpieza cosmética de firma, sin urgencia. |
| F | Cosmético | El hallazgo de Georef (sólo centroides, no polígonos) es plausible y consistente con el fixture versionado, pero el fixture se pidió con `campos=id,nombre`: no queda un fixture propio de `campos=completo` que pruebe por sí solo la ausencia de polígonos para quien audite sin red. | **No corregido, documentado como pendiente** — versionar también ese payload si hace falta auditar offline en el futuro. |

Puntos confirmados **correctos** sin hallazgo: radio de 40km aplicado de forma inclusiva y consistente
(único punto de aplicación), sin error de signo en la asociación de río; Ñ/NFD equivalentes entre
normalizadores; ningún `throw` sin capturar en los providers nuevos (ensemble/imerg/climatologia-caudal);
índices únicos de las 3 tablas nuevas correctamente apuntados por los upserts, con test de segunda corrida
sin duplicar; ACL presente en ambas rutas extendidas antes de tocar datos nuevos, sin datos nominales en
los campos agregados; ninguna respuesta obsoleta se pinta en la ficha (el flag `vigente` protege el
`setState`, aunque sí queda un fetch desperdiciado sin abortar ante cambio rápido de CUE — cosmético, no
listado aparte por ser de la misma familia que E); el contrato fijo de `nivel.ts` (tipos y nombres) permanece
intacto, ninguna tarea posterior lo alteró; `EARTHDATA_TOKEN` nunca aparece fuera de `sync-imerg.ts`/su test,
siempre recibido por parámetro, nunca `process.env` en la lógica de negocio, nunca logueado.

Verificación tras las correcciones de esta sección: `pnpm vitest run` sobre los archivos tocados (nivel,
sync-pronostico-caudal, flood) → 43 tests, todos pasan. Ver §5 para las 4 verificaciones globales finales.

## 3. Pruebas reales fechadas

Ejecutadas por N2 el **2026-09-26** desde el servidor de este worktree (acceso de red real). Guardadas
como fixtures en `lib/infraestructura/riesgo/__fixtures__/hazard/` para que los tests nunca golpeen la red.

**(a) Georef Argentina — departamentos de Corrientes:**
```
curl "https://apis.datos.gob.ar/georef/api/departamentos?provincia=corrientes&campos=id,nombre&max=30&orden=nombre"
```
200 OK, 25 departamentos (coincide con el padrón oficial conocido de Corrientes). Guardado en
`georef-departamentos-corrientes-2026-09-26.json` y versionado en `public/data/georef-departamentos-corrientes.json`.
Verificado además con `campos=completo` y por id (`?provincia=corrientes&campos=completo`) que la
`geometry` devuelta es siempre `{"type":"Point", ...centroide...}` — nunca un polígono (ver hallazgo F sobre
qué de esto quedó versionado).

**(b) Open-Meteo Ensemble:**
```
curl "https://ensemble-api.open-meteo.com/v1/ensemble?latitude=-27.5&longitude=-58.8&hourly=precipitation&models=ecmwf_ifs025&forecast_days=3&timezone=UTC"
```
200 OK, 22833 bytes, 52 claves en `hourly` (`time` + `precipitation` + `precipitation_member01..50` = 51
miembros), 72 horas. Guardado en `ensemble-2026-09-26.json`.

**(c) NASA GPM IMERG — CMR (búsqueda de gránulos, autenticado con `EARTHDATA_TOKEN` de N1, token nunca
guardado ni logueado):**
```
curl -H "Authorization: Bearer $EARTHDATA_TOKEN" \
  "https://cmr.earthdata.nasa.gov/search/granules.json?short_name=GPM_3IMERGHHE&sort_key=-start_date&page_size=1"
```
200 OK. Gránulo real: `GPM_3IMERGHHE.07:3B-HHR-E.MS.MRG.3IMERG.20260926-S183000-E185959.1110.V07C.HDF5`.
Guardado en `imerg-cmr-granulos-2026-09-26.json`.

**(d) NASA GPM IMERG — subsetting OPeNDAP ASCII (receta de N1, sin Python/HDF5), bbox Corrientes:**
```
curl -H "Authorization: Bearer $EARTHDATA_TOKEN" \
  "https://gpm1.gesdisc.eosdis.nasa.gov/opendap/GPM_L3/GPM_3IMERGHHE.07/2026/269/3B-HHR-E.MS.MRG.3IMERG.20260926-S183000-E185959.1110.V07C.HDF5.ascii?precipitation%5B0%5D%5B1203:1244%5D%5B592:628%5D,lat%5B592:628%5D,lon%5B1203:1244%5D"
```
200 OK, 6315 bytes: 42 filas `precipitation[0][i]` (i = índice de longitud) × 37 columnas (latitud),
`lat` -30.75..-27.15, `lon` -59.65..-55.55 (todos los valores 0 mm en el momento de la prueba — sin lluvia
en Corrientes esa hora). Guardado en `imerg-subset-2026-09-26.ascii` + `.dds` con la estructura completa
del dataset (confirma `precipitation[time=1][lon=3600][lat=1800]`, primer índice espacial = longitud).

**(e) Flood API — historia (para climatología de caudal):**
```
curl "https://flood-api.open-meteo.com/v1/flood?latitude=-27.4692&longitude=-58.9306&daily=river_discharge&start_date=2015-01-01&end_date=2015-01-10&timezone=UTC"
```
200 OK — confirma que el mismo endpoint de pronóstico sirve historia con `start_date`/`end_date`, igual
mecanismo que `archive-api.open-meteo.com` para precipitación. Habilitó el diseño de `climatologia-caudal.ts`
sin necesitar otra fuente.

**Pendiente de N1:** ninguna — IMERG quedó completamente destrabado en esta sesión (aviso de N1: EULA de
GES DISC aprobado por el usuario). El único prerrequisito que quedaba (cuenta NASA Earthdata) ya está
resuelto; el job `sync-imerg.ts` está listo para producción en cuanto se configure `EARTHDATA_TOKEN` como
variable de entorno del proceso real (hoy sólo existe en `.env.local` de este worktree, gitignored).

## 4. UX

**Flag que gobierna la UI nueva:** `HAZARD_CONTEXT_ENABLED` (mismo flag de E2, no se agregó uno nuevo — la
ficha territorial ya estaba gateada por él y este batch sólo agrega contenido dentro de la misma ficha).

**Estados textuales nuevos** (nunca sólo color): los 3 niveles de peligro (24h/72h/240h) muestran texto
explícito ("Verde"/"Amarillo"/"Naranja"/"Rojo"/"Sin dato") junto a la marca de color, con la base entre
paréntesis (ensemble/determinístico). Si los 3 horizontes están `sin_dato`, se colapsa a un único texto
"Peligro estimado: sin dato" en vez de 3 líneas repetidas (menos ruido). Caudal: "Caudal del río (percentil
N): nivel X" cuando hay dato; "Caudal del río: sin dato" cuando hay punto asociado pero sin dato aún; sin
ninguna línea cuando no hay punto de río asociado (no es un error, no aplica). Lluvia observada IMERG
siempre rotulada completa: "Lluvia observada estimada por satélite: X mm/30min (fecha)" — nunca sólo
"lluvia observada", para que quede claro que no es un pluviómetro.

**Gate UX (walkthrough con 1-2 operadores reales, estándar permanente §7):** no hubo operadores disponibles
durante esta ejecución (mismo estado que E2). **Pendiente explícito** — recorrido guiado reproducible:
1. Con `HAZARD_CONTEXT_ENABLED=true` y una escuela con perfil geográfico + asociación de río dentro de
   radio, abrir su ficha → confirmar que aparecen los 3 niveles con texto y color, y la línea de caudal con
   percentil.
2. Repetir sobre una escuela sin punto de río asociado (fuera de radio) → confirmar que NO aparece ninguna
   línea de caudal (no un "sin dato" innecesario).
3. Sin datos de ensemble/determinístico cargados aún (recién desplegado, antes del primer sync) → confirmar
   el texto único "Peligro estimado: sin dato", nunca 3 líneas verdes.
4. Si hay una fila de `hazard_observation` cargada → confirmar el rótulo completo "estimada por satélite"
   con su fecha.

No se afirma gate operativo aprobado — sólo piloto interno, según el estándar de la sección 7 cuando no hay
operadores disponibles (igual criterio que E2).

## 5. Verificaciones finales

Repetidas al cierre, sobre el estado íntegro (todas las olas + correcciones de revisión):

| Comando | Exit code | Resumen |
|---|---|---|
| `pnpm test` | 0 | 143 test files, 1202 tests, todos pasando (baseline E3a: 134/1083 → +9 archivos, +119 tests) |
| `pnpm lint` | 0 | sin hallazgos |
| `pnpm exec tsc --noEmit` | 0 | sin errores |
| `pnpm build` | 0 | build completo; rutas existentes `/api/infraestructura/peligro` y `/api/infraestructura/geo-perfiles/[cueAnexo]` siguen listadas (extendidas, no rutas nuevas) |

## 6. Pendientes explícitos para N1

1. **Hallazgo C** (revisión, menor): 3 normalizadores de nombre de departamento divergen en el colapso de
   espacios múltiples (`geo-perfil.ts`/`departamentos.ts` de E2 vs `georef-departamentos.ts` de E3a). No
   dispara con los 25 nombres reales; se resolvería mejor unificando en un módulo compartido, que toca
   archivos de dos batches — decisión de convención transversal, no un fix de este batch en solitario.
2. **Hallazgo D** (revisión, menor/cosmético): parámetros sin usar en `mapearAsciiImergACeldas` — limpieza
   de firma sin urgencia.
3. **Hallazgo F** (revisión, cosmético): falta versionar el payload de `campos=completo` de Georef para que
   la ausencia de polígonos sea auditable sin red en el futuro.
4. **Georef sólo da centroides, no polígonos** (documentado desde §1.2): impacta a **E4** (coropleta
   provincial), no a este batch — E4 va a necesitar otra fuente de polígonos departamentales (Overpass/IGN,
   o el import OSM de E6).
5. **`EARTHDATA_TOKEN` en producción**: el job `sync-imerg.ts` está completo y probado, pero necesita que la
   variable de entorno real (no `.env.local` de este worktree) esté configurada donde corra el scheduler.
6. **Scheduler real de los 3 jobs nuevos** (`sync-ensemble`, `sync-imerg`, `calcular-climatologia-caudal`):
   quedan implementados y probados como funciones invocables, pero su cableado al scheduler de producción
   (mismo mecanismo que E0 eligió para `sync-pronostico-caudal`/`calcular-climatologia`) queda para la
   habilitación operativa, fuera del alcance de "implementado" de este batch.
7. **Afluentes sin punto de río** (Corriente, Santa Lucía, Miriñay, Aguapey): pendiente heredado de E2, sin
   cambios en este batch — la asociación escuela→río de este batch sólo puede asociar contra los 8 puntos
   ya definidos (Paraná + Uruguay).

## Correcciones del gate N1

Cuatro hallazgos de la revisión de gate N1 sobre IMERG (1 bloqueante, 1 mayor, 2 menores), corregidos por
N2 directamente en este worktree (archivos ya listados en la ola de N3 correspondiente, no se redespachó
a N3 por ser correcciones acotadas y ya especificadas).

### 1. BLOQUEANTE — unidades: `precipitation` es tasa (mm/h), no acumulado de 30 min

`precipitation` en el subset OPeNDAP de IMERG es una TASA en mm/h para el gránulo de media hora
(confirmado con el `.dds` real, `imerg-2026-09-26.dds`: es un flujo instantáneo promediado, no un
acumulado). `mapearAsciiImergACeldas` (`lib/infraestructura/riesgo/providers/imerg.ts`) guardaba ese
valor tal cual con `unidad: 'mm/30min'` — 2x más alto que la lluvia real de la media hora.

**Corrección:** se agregó `FACTOR_TASA_A_ACUMULADO_30MIN = 0.5` y el valor persistido ahora es
`tasa_mm_h * 0.5`; la unidad se mantiene `'mm/30min'` porque ahora sí describe lo que representa.

**Tests de regresión** (`providers/imerg.test.ts`): caso numérico exacto pedido por la revisión (4.0 mm/h
crudo → 2.0 mm almacenado), más el caso de la colisión de celda (se actualizó el valor esperado de `1` a
`0.5`, que era exactamente el test que "bloqueaba" el bug) y un caso con 0 mm/h (no rompe con ceros).

### 2. MAYOR — acumulados 24h/72h de lluvia observada por celda

Nuevo módulo puro + lectura DB: `lib/infraestructura/riesgo/peligro/observado.ts`.

- `calcularAcumuladoObservado({ geometryRef, horizonteHoras, granulos, asOf })`: función pura. Ancla la
  ventana en el gránulo más reciente con `validoHasta <= asOf` (as-of aware) y suma los gránulos de media
  hora en `(ancla - horizonteHoras, ancla]`. La ventana es de TIEMPO, no de cantidad de filas — un gap real
  en la ingesta reduce `granulosEncontrados`/cobertura en vez de "recorrerse" hacia atrás e inflar la
  cobertura reportada.
- `obtenerAcumuladoObservado(...)`/`obtenerAcumuladosObservados(...)`: lectura DB sobre `hazard_observation`
  (filtrada por `provider='nasa-imerg'`, `variable='precipitacion_observada_satelital'`, con cota de tiempo
  de seguridad de 2x el horizonte pedido, no un `LIMIT` por cantidad de filas).
- **Umbral de cobertura documentado:** `UMBRAL_COBERTURA_MINIMA = 0.8`. Por debajo, `acumuladoMm` es
  explícitamente `null` ("sin dato"), nunca un número que subestima la lluvia real.
- **Adaptador para E3b:** `PuertoLluviaObservada` (plan base, `motor/puertos.ts`) no existe todavía en este
  worktree (E3b no está mergeado acá) — **no se tocó ningún archivo de `motor/`**. La nota para quien
  implemente el adaptador: llamar directo a `obtenerAcumuladoObservado({ geometryRef, horizonteHoras, asOf })`
  de `lib/infraestructura/riesgo/peligro/observado.ts`; el adaptador sólo necesita mapear
  `horizonteHoras: 24 | 72` y adaptar `AcumuladoObservado` a la forma que pida el puerto — la suma y la
  regla de cobertura ya están acá, no reimplementar.
- **Backfill en el job** (`lib/infraestructura/riesgo/jobs/sync-imerg.ts`): antes sólo pedía el gránulo más
  reciente (`page_size=1`). Ahora pide con `temporal=` la ventana de 72h+6h de margen (`sort_key=-start_date`,
  `page_size=170`), descarta los gránulos ya presentes en `hazard_observation` (chequeo por `observadoEn`,
  una sola fila de cualquier celda alcanza porque el batch se persiste completo) y procesa como mucho
  `MAX_GRANULOS_A_PROCESAR_POR_CORRIDA = 12` gránulos nuevos por corrida (documentado: ~6 KB por gránulo,
  ~72 KB máx. por corrida además del listado CMR). Idempotente (mismo upsert por gránulo); un gránulo de
  backfill que falla se cuenta en `granulosFallidos` y no aborta el resto — sólo el gránulo más reciente
  manda el estado de salud (`ok`/`degradado`). En régimen estable (sin backfill pendiente) esto es 1 CMR + 1
  subset por corrida, igual que antes.
- **API** (`app/api/infraestructura/peligro/route.ts`): campo additivo `observadoAcumulado` (array de 2
  filas, 24h y 72h) junto al `observado` existente (que sigue siendo las 5 lecturas puntuales más
  recientes) — no rompe el contrato previo.
- **UI** (`components/infraestructura/ficha-territorial.tsx`): sección "Lluvia observada estimada por
  satélite (últimas 24 h / 72 h)" con el acumulado en mm y el texto de cobertura (`cobertura NN%`, o "sin
  dato (cobertura NN%, X/Y lecturas)" cuando no alcanza el umbral).

Tests nuevos: `lib/infraestructura/riesgo/peligro/observado.test.ts` (función pura: ventana exacta,
as-of aware, cobertura por debajo/en/por encima del umbral, gap en el medio de la ventana, sin datos; y
lectura DB: suma real, no mezcla celdas, ambos horizontes en un llamado). `sync-imerg.test.ts` reescrito
para el nuevo flujo (ventana con `temporal=`, gránulo ya ingerido no repite el subset, backfill de varios
gránulos en una corrida, un gránulo de backfill que falla no aborta los demás, presupuesto por corrida
acotado). `route.test.ts`: `observadoAcumulado` presente y additivo, sin dato explícito cuando no hay
gránulos que matcheen. `ficha-territorial.test.tsx`: la sección se muestra con dato y con "sin dato" por
cobertura insuficiente, y no se muestra si la ruta no manda el campo (backward compatible).

### 3. MENOR — `calidad` nunca se poblaba

`construirUrlSubsetImerg` no pedía `precipitationQualityIndex` (confirmado en el `.dds` real que la
variable existe en el dataset, sin costo de request adicional — mismo subset, ~6 KB más). Se agregó al
query del subset, se agregó el parseo de esas filas en `parsearRespuestaAsciiImerg`
(`RespuestaAsciiImerg.filasCalidad`) y `mapearAsciiImergACeldas` ahora las propaga a `calidad` (alineadas
por `lonIndiceRelativo`/columna, mismo criterio que `precipitation`). El comentario de
`hazard_observation.calidad` en `lib/db/schema.ts` ya describía este comportamiento (no hacía falta
corregirlo, sólo implementarlo). Tests: parseo de las filas de calidad, y propagación a `calidad` en
`mapearAsciiImergACeldas` con un caso de 2 columnas con calidades distintas.

### 4. MENOR — parámetros sin usar en `mapearAsciiImergACeldas`

`lonIndiceInicio`/`latIndiceInicio` no se usaban (la función ya resuelve la coordenada absoluta desde
`parseado.lon`/`parseado.lat`, que vienen absolutos en la respuesta OPeNDAP). Se quitaron de la firma; se
actualizaron los 2 call-sites (`imerg.test.ts`, `sync-imerg.ts`) y se agregó un comentario explicando por
qué no hacen falta.

### Prueba real fechada — acumulado 24h, celda de Corrientes Capital

Ejecutada el **2026-09-26** desde este worktree, con `EARTHDATA_TOKEN` real cargado sólo en el proceso
del script (nunca impreso; el script sólo imprime números/timestamps). Celda objetivo: `-27.5_-58.8`
(mismo lat/lon de "Capital" usado en los fixtures/tests del batch, -27.47/-58.83).

```
cmr_status 200
granulos_listados 40
granulos_en_ventana_24h 40
granulos_esperados_24h 48
granulos_procesados_ok 40
acumulado_24h_mm 0
cobertura 0.8333333333333334
```

Lectura: 40/48 gránulos esperados en la ventana de 24h más reciente disponible (cobertura 0.833, por
encima del umbral de 0.8 — el acumulado se hubiera reportado como número, no "sin dato"). Acumulado real
= 0 mm: no llovió en Corrientes Capital en esa ventana (consistente con la prueba de subsetting de la
sección 3 original, que también encontró 0 mm en el bbox completo a esa hora). Los 8 gránulos "faltantes"
de la ventana no son un fallo: CMR sólo listó 40 gránulos dentro del margen de 25h pedido por el script
(el job real de producción, con su ventana de 72h+6h y el backfill acotado, los completaría en corridas
sucesivas si existieran).

### Verificaciones tras las correcciones

| Comando | Exit code | Resumen |
|---|---|---|
| `pnpm vitest run` (5 archivos tocados) | 0 | 5 test files, 71 tests, todos pasando |
| `pnpm test` | 0 | 144 test files, 1223 tests, todos pasando (antes de esta sección: 143/1202) |
| `pnpm lint` | 0 | sin hallazgos |
| `pnpm exec tsc --noEmit` | 0 | sin errores |
| `pnpm build` | 0 | build completo; `/api/infraestructura/peligro` sigue listada (extendida, no ruta nueva) |

Archivos tocados en esta sección: `lib/infraestructura/riesgo/providers/imerg.ts` (+test),
`lib/infraestructura/riesgo/jobs/sync-imerg.ts` (+test, reescrito), `lib/infraestructura/riesgo/peligro/observado.ts`
(nuevo, +test), `app/api/infraestructura/peligro/route.ts` (+test), `components/infraestructura/ficha-territorial.tsx`
(+test).

## Gate

(N1 completa esta sección — N2 no la completa)

## 3. Pruebas reales fechadas

(en progreso)

## 4. UX

(pendiente)

## 5. Verificaciones finales

(pendiente)

## 6. Pendientes explícitos para N1

- Georef Argentina no expone polígonos departamentales reales (ver §1.2) — impacto en E4, no en E3a.

## Gate

(N1 completa esta sección — N2 no la completa)

## Gate (N1)

**Decisión: aceptado tras correcciones (2026-09-26).**

- Primera revisión independiente: bloqueante en IMERG (la tasa en mm/h se guardaba como lámina por media hora, valores al doble) y faltaban los acumulados de 24/72 h. Ambos corregidos (ver "Correcciones del gate N1") con tests numéricos de regresión.
- Verificaciones globales tras las correcciones: `pnpm test` 144 archivos / 1223 tests OK; `pnpm lint`, `pnpm exec tsc --noEmit` y `pnpm build` con exit 0. N1 reverificó los tests focalizados de IMERG y peligro, y buscó el token de Earthdata en el árbol (0 apariciones fuera de `.env*`).
- Revisión confirmó: contrato exacto de `peligro/nivel.ts`, `sin_dato` en todos los bordes (nunca verde por defecto), asociación de río con radio y desempate correctos, renovación de lease con fencing, conteo de llamadas real por lote, token nunca registrado, DDL aditivo y APIs compatibles hacia atrás.
- Corrección de un hallazgo del registro: Georef sí publica polígonos oficiales. La API por consulta devuelve centroides, pero la descarga masiva `https://infra.datos.gob.ar/georef/departamentos.geojson` trae los 25 departamentos de Corrientes como MultiPolygon (fuente IGN), verificado por N1. E4 los usa para la coropleta.
- Follow-ups: unificar los tres normalizadores de nombre de departamento; programar los jobs nuevos (ensemble, IMERG, climatología de caudal) en el scheduler real; renovar el token de Earthdata antes del 2026-11-26.
