# Registro G1 — Capas territoriales estáticas automáticas

Batch paralelo G1 del plan ENOS 2026/2027 (líder N2, worktree `enos-g1`, rama
`feat/enos-g1` sobre `feat/renovación` en `59f91f7`). Preparación offline de
E6, corrida en paralelo con E2 (otro N2, otro worktree; sin dependencias
cruzadas de código).

## Baseline (antes de tocar código)

| Verificación | Resultado |
|---|---|
| `pnpm test` | 120 archivos, 999 tests, verde |
| `pnpm lint` | verde |
| `pnpm exec tsc --noEmit` | verde |
| `pnpm build` | verde |

## Decisiones de N2 (dentro del margen que dejó N1)

- **Fuente OSM: Overpass, no extracto Geofabrik.** El extracto de Argentina
  pesa 431 MB; Overpass recortado a bbox departamental es más liviano y N1
  autorizó explícitamente esa alternativa. Se descubrió y corrigió un bug de
  entorno: el chequeo de rate-limit de `osmnx` pega contra
  `overpass-api.de/api/status`, que devuelve 406 al User-Agent por defecto de
  `requests`/`osmnx` y deja a la librería reintentando en un backoff largo.
  Se deshabilitó (`ox.settings.overpass_rate_limit = False`) con un
  `requests_timeout` explícito. Sin este fix, ninguna descarga terminaba.
- **Cabecera departamental: proxy automático, no tabla manual.** Se calcula
  como la localidad con más escuelas del padrón dentro de cada departamento
  (centroide de sus escuelas). Verificado contra geografía real de
  Corrientes: coincide con la cabecera administrativa real en los casos
  contrastables (Ita Ibaté/Gral. Paz, Santa Lucía/Lavalle, La Cruz/San
  Martín, Gob. Virasoro/Santo Tomé, Santa Rosa/Concepción). Es automático,
  reproducible desde el propio padrón — no es ingreso manual.
- **Red por departamento, no un solo grafo provincial.** Un único
  `graph_from_bbox` para toda Corrientes está por encima de 75x el área
  máxima configurada de Overpass y no terminó en varios intentos (>500s).
  Se particiona por departamento (bbox de sus escuelas + margen de 0.15°),
  lo que además refleja mejor la localidad real de las rutas.
- **physrisk: escenario histórico/baseline, no proyección futura**, coherente
  con "capa estática" (nunca pronóstico). `peligro_inundacion_pluvial` queda
  siempre `null`: no hay dataset `PluvialInundation` publicado en el
  inventario embebido de `physrisk-lib==1.9.24` (ver evidencia abajo). No
  bloquea el batch, autorizado por el principio de N1.
- **Entorno Python: `requires-python` 3.11–3.12, no 3.14** (el intérprete por
  defecto del sistema). `physrisk-lib` depende de `zarr`→`numcodecs`, que no
  tiene wheel para 3.14 y falla al compilar. `uv python install 3.12`
  resuelve todo el árbol de dependencias sin tocar el Python del sistema.
- **Endpoint `GET /api/infraestructura/accesos/:cueAnexo`: omitido**, por
  indicación explícita de N1 para priorizar el cierre del batch.

## Despachos N3

Todos con `model: opencode-go/deepseek-v4.1-flash`. A partir del mensaje de
N1 a mitad de la corrida, todo despacho posterior usó
`OPENCODE_CONFIG=$HOME/.config/opencode/n3-sin-mcp.json` para evitar que cada
N3 levante los 17 servidores MCP globales.

| Ola | Alcance | Resultado |
|---|---|---|
| 1 | Contrato de datos + tablas Drizzle + bloque DDL en `HUB_DDL` | Éxito 1er intento. Verificado con `tsc --noEmit` completo y `git diff` línea por línea contra el contrato. |
| 2a | `physrisk_susceptibilidad.py` (funciones puras) + tests | Éxito tras acotar drásticamente el alcance (2 intentos previos con `osmnx` real en paralelo con la ola 2b timeoutearon sin producir ningún archivo — ver "Fallas" abajo). |
| 2b | `osm_aislamiento.py` + tests con red sintética | **Falló 2 veces** (timeout a los 560s, cero archivos, logs vacíos) incluso corrido en solitario. Implementado directamente por N2 según el protocolo (2 fallos de la misma tarea). |
| 3 | Importador TS (`scripts/importar-geo-static.mjs`) + tests Vitest | **Falló 2 veces** (mismo patrón: timeout sin output). Implementado directamente por N2. |
| 4 (revisor distinto) | Casos borde en `osm_aislamiento.py`, parser CSV del importador, nodos degenerados | Éxito. Encontró y corrigió un bug real: la rama de índice 0 usaba `sin_cruces_relevantes OR tiene_alternativa`, permitiendo índice 0 con un cruce con puente presente (violaba el contrato: 0 = sin cruces relevantes). Corregido a `AND`, test ajustado (el test anterior con `assert indice in (0,1)` ocultaba el bug), 18/18 tests siguen verdes. |

**Causa raíz probable de los timeouts 2b/3 (no confirmada):** las tareas que
timeoutearon compartían un patrón: exploración de la red/repo antes de
escribir, y coincidieron en tiempo con la ola 2a corriendo en paralelo (antes
del límite de "máximo 2 N3 simultáneos" que impuso N1). No se investigó más
a fondo por prioridad de cierre; queda como hipótesis para N1.

## Corrida real sobre el padrón

Padrón: `public/data/localizaciones.json`, 2005 escuelas, 2001 con
coordenadas (confirmado con lectura directa, coincide con lo esperado por el
brief; duplicado de grafía `CONCEPCION`/`CONCEPCIÓN` confirmado, normalizado
en runtime por `lib/mapas/departamentos.ts` — no afecta a G1, que usa
`cueAnexo` como clave, no el nombre del departamento).

### Aislamiento OSM (`services/geo-static/output/aislamiento_osm-v1-2026-09-26.csv`)

Corrida completa sobre los 25 departamentos, 231.6s. **Sólo el departamento
SAN COSME completó** (55 escuelas, 10702 nodos, 30078 aristas, 9.0s): los 24
restantes recibieron `ConnectionError`/`ConnectTimeout` de
`overpass-api.de` (conexión rechazada) tras la primera consulta exitosa —
comportamiento consistente con un límite de conexiones concurrentes/por
IP del servidor público de Overpass, no con un bug del job (la lógica
funcionó correctamente para el departamento que sí conectó).

- Total filas escritas: 2001 (todas, con `motivo_sin_datos=sin_conexion_red`
  para las que no tuvieron red).
- **Con índice calculado: 55/2001 (2.7%)**. Distribución: índice 1 → 36,
  índice 3 → 19 (0 y 2 no aparecieron en esta muestra).
- Sin datos de red: 1946/2001 (97.3%), motivo `sin_conexion_red` en todos los
  casos (nunca se asumió "seguro").
- **Pendiente para N1**: re-correr `uv run python -m
  geo_static.jobs.calcular_aislamiento` (acepta lista de departamentos como
  argumento) desde una infraestructura con mejor acceso a Overpass, o migrar
  a un extracto Geofabrik pre-descargado y recortado con `osmium`/`pyrosm`
  para las corridas de producción (recomendación de N2: Overpass en vivo no
  es confiable para volumen completo, sólo para validaciones puntuales).

### Susceptibilidad estática physrisk (`services/geo-static/output/susceptibilidad_estatica-v1-2026.csv`)

Corrida completa, 178.9s (bloques de 200 escuelas por golpe de red, ver
`docs/ejecucion-enos/G1/evidencia-physrisk.md`).

- Total filas: 2001.
- **Con dato physrisk: 91/2001 (4.5%)**, todas de inundación fluvial
  (`peligro_inundacion_fluvial`). `peligro_viento` y `peligro_calor`
  quedaron en `null` para toda la corrida completa, pese a que una prueba
  aislada anterior (200 escuelas, ver evidencia) sí devolvió datos reales de
  calor para todas y de viento NaN para todas — la degradación parcial
  sugiere el mismo patrón de límite de conexiones del bucket público S3 bajo
  carga sostenida que el caso de Overpass.
- `peligro_inundacion_pluvial`: siempre `null` (sin dataset publicado en
  `physrisk-lib`, ver evidencia).
- `peligro_viento`: sin cobertura real verificada para Corrientes en el
  dataset `wind/wisc/v1` (NaN en todos los puntos probados, gap de grilla,
  no error).
- **Pendiente para N1**: re-correr `uv run python -m
  geo_static.jobs.calcular_susceptibilidad` con reintentos/backoff entre
  bloques, o desde una infraestructura con acceso sostenido al bucket S3.

### Importación a SQLite

`node scripts/importar-geo-static.mjs --aislamiento <csv> --susceptibilidad <csv>`
corrida real contra la base de desarrollo: **2001/2001 filas OK en ambas
tablas, 0 fallidas**. Upsert idempotente (`onConflictDoUpdate` por
`cue_anexo`+`version_job`) verificado corriendo el importador dos veces sin
error ni duplicados.

## Informe de cobertura (resumen)

| Capa | Escuelas con dato | % | Motivo de faltante |
|---|---|---|---|
| Índice de aislamiento OSM | 55/2001 | 2.7% | Rate-limit/conexión rechazada de Overpass público tras el primer departamento |
| Susceptibilidad — fluvial | 91/2001 | 4.5% | Degradación de conexión al bucket S3 público bajo carga sostenida |
| Susceptibilidad — pluvial | 0/2001 | 0% | Sin dataset publicado en physrisk-lib (documentado, no bloquea) |
| Susceptibilidad — viento | 0/2001 | 0% | Sin cobertura de grilla verificada para Corrientes + degradación de conexión |
| Susceptibilidad — calor | 0/2001 | 0% | Degradación de conexión (funcionó en prueba aislada de 200 escuelas) |

**El código, el esquema, el importador y los tests están completos y
verdes.** La corrida real quedó con cobertura baja por límites de las APIs
públicas externas (Overpass, S3 de OS-Climate) bajo el volumen completo de
2001 escuelas en una sola sesión — no por defectos del pipeline, que se
demostró correcto tanto en pruebas sintéticas offline (18 tests Python) como
en las porciones que sí conectaron. Re-ejecutar los dos jobs (comandos de
arriba) desde una infraestructura con mejor conectividad sostenida, o con
reintentos/backoff añadidos, debería subir la cobertura sin cambiar ni una
línea de la lógica de negocio.

## Validación de muestra

`docs/ejecucion-enos/G1/validacion-muestra.md`: 30 escuelas (15 con índice
más alto = 3, 15 con índice más bajo disponible = 1; no hubo escuelas con
índice 0 o 2 en la muestra real) con enlaces a Google Maps satelital y Esri
World Imagery por coordenada. **Revisión visual marcada como pendiente**:
no se pudo abrir imagen satelital desde este entorno de ejecución (sin
navegador). Queda para N1/usuario.

## Tests

- Python (`cd services/geo-static && uv run pytest tests/ -q`): **18/18
  verdes** (9 de `osm_aislamiento`, 9 de `physrisk_susceptibilidad`),
  sin red.
- TS/Vitest (`pnpm exec vitest run scripts/importar-geo-static.test.ts`):
  **4/4 verdes**, fixtures chicos inline, sin red ni DB real (DB falsa
  inyectada).

## Verificaciones finales (después de la corrida real)

| Verificación | Resultado |
|---|---|
| `pnpm test` | verde — 121 archivos, 1003 tests (999 baseline + 4 nuevos) |
| `pnpm lint` | verde (se agregó `services/geo-static/.venv/**` a los ignores de ESLint) |
| `pnpm exec tsc --noEmit` | verde |
| `pnpm build` | verde |

Sin regresiones sobre el baseline.

## Archivos tocados / creados

- `lib/db/schema.ts`, `lib/db/seed.ts`: bloque propio `// G1: capas
  territoriales estáticas` al final de cada uno, sin tocar nada existente.
- `services/geo-static/`: `pyproject.toml`, `uv.lock`, código fuente
  (`osm_aislamiento.py`, `physrisk_susceptibilidad.py`, dos jobs), tests,
  `output/` (2 CSV reales), `.gitignore` (excluye `.venv/`, `.data/`).
- `scripts/importar-geo-static.mjs` + `scripts/importar-geo-static.test.ts`.
- `package.json`: agregado `import:geo-static`.
- `docs/ejecucion-enos/G1/`: `contrato-datos.md`, `evidencia-physrisk.md`,
  `validacion-muestra.md`, este `registro.md`.

## Pendientes explícitos para N1

1. Re-correr ambos jobs completos desde infraestructura con mejor
   conectividad sostenida (o con reintentos/backoff) para subir la cobertura
   real por encima del 2.7%/4.5% actual.
2. Revisión visual efectiva de `validacion-muestra.md` (o delegarla).
3. Decidir si migrar la fuente OSM de Overpass en vivo a un extracto
   Geofabrik pre-descargado para las corridas de producción trimestrales.
4. Endpoint `GET /api/infraestructura/accesos/:cueAnexo`: omitido por pedido
   explícito de N1, no implementado.

## G1-fix1 — corrección de cobertura real (2026-09-26)

Corrección posterior al cierre de G1, siguiendo el diagnóstico de N1: la
lógica del batch estaba bien, pero la corrida real había dependido de
servicios públicos en vivo bajo volumen (Overpass rechazó conexiones tras el
primer departamento; el bucket S3 público de OS-Climate degradó bajo carga
sostenida). Objetivo: subir la cobertura real de 2.7%/4.5% a ≥95%, sin
cambiar el contrato de datos.

### Método

**Aislamiento OSM — de Overpass en vivo a extracto local Geofabrik.**

- Se descargó **una vez** el extracto de Argentina de Geofabrik
  (`https://download.geofabrik.de/south-america/argentina-latest.osm.pbf`,
  431.6 MB, ~8 min) a `services/geo-static/.data/osm/argentina-latest.osm.pbf`
  (gitignorado, fuera del repo). **Fecha real del extracto: 2026-09-26**
  (el redirect del servidor resuelve a `argentina-260926.osm.pbf`, convención
  Geofabrik `YYMMDD`). Licencia: © OpenStreetMap contributors, ODbL.
- Herramienta elegida para recortar y construir la red: **`pyrosm`**
  (paquete Python puro, instalable con `uv add`), no `osmium-tool` (el
  binario CLI no está disponible en este entorno, ni vía `apt` ni `brew`) ni
  los bindings de bajo nivel `pyosmium` (requieren reimplementar a mano la
  extracción de bbox con "complete ways", innecesario habiendo una opción
  más simple). `pyrosm.OSM(pbf_path, bounding_box=...).get_network(
  network_type="driving", ...).to_graph(..., osmnx_compatible=True)` produce
  un `networkx.MultiDiGraph` verificado compatible con el resto del código
  osmnx existente (nodos con `x`/`y`, aristas con `highway`/`surface`/
  `bridge`, `ox.distance.nearest_nodes` funciona y devuelve metros). Nueva
  función `construir_red_local` en `osm_aislamiento.py`.
  `construir_red` (Overpass/osmnx en vivo) se mantiene **sin cambios de
  firma ni comportamiento**, documentada como fallback: si el extracto local
  no está presente, el job cae automáticamente a ese camino anterior
  (comportamiento de G1 original, con su misma cobertura baja conocida).
- **Cambio de diseño respecto a G1 original: un solo grafo para toda la
  provincia, no uno por departamento.** La partición por departamento en G1
  existía para sortear el límite de área de Overpass (que ya no aplica con
  datos locales). Con el extracto local se construye una única red para el
  bbox de las 2001 escuelas (margen 0.15°): 272.806 nodos, 590.449 aristas,
  ~10 min de construcción, una sola vez por corrida completa.
- **Bug real preexistente, no introducido por este fix, corregido en
  `physrisk_susceptibilidad.py` (ver más abajo) — no aplica a aislamiento.**
  Se comprobó (viendo el bbox de `osmnx.settings.useful_tags_way` por
  defecto) que el atributo `waterway` nunca estuvo disponible en las
  aristas del grafo de aislamiento, ni con Overpass en G1 original ni con
  pyrosm ahora — es un comportamiento preexistente e idéntico en ambas
  fuentes, no un regresión de este fix. Consecuencia ya visible en la
  distribución final: el **índice 2** (cruce sin puente con alternativa)
  nunca aparece, en ninguna corrida — es estructuralmente inalcanzable con
  la lógica actual dado que `cruces_agua_con_vado_count` siempre da 0. Se
  documenta para que N1 decida si amerita revisión de la escala en una
  iteración futura; no se tocó la lógica de negocio en G1-fix1.

**Susceptibilidad physrisk — cacheo local de zarr + bug de unpacking corregido.**

- **Hallazgo y corrección de un bug real preexistente**: `ZarrReader.get_curves`
  (physrisk-lib 1.9.24) devuelve `(curvas, in_bounds, indices, unidades)`
  (verificado leyendo el código fuente instalado), pero
  `physrisk_susceptibilidad.py` lo desempaquetaba como
  `(curvas, return_periods, in_bounds, _)` — orden equivocado. Esto hacía
  que el chequeo de límites usara el array de índices/períodos en vez del
  booleano real de `in_bounds`, y que la selección de período de retorno
  comparara contra booleanos. Corregido en `intentar_leer_peligro` y
  `leer_peligro_lote`; mocks de test actualizados al orden real. Este bug
  explica gran parte de la cobertura artificialmente baja del 4.5% original
  (muchos puntos con dato válido se descartaban por el chequeo de bounds
  incorrecto).
- **Cacheo local del bucket S3 con `fsspec`**: nueva `_crear_store_cacheado`
  usa `fsspec.get_mapper("filecache::s3://os-climate-physical-risk/
  hazard-indicators/hazard.zarr", filecache={"cache_storage":
  ".data/physrisk_cache"}, s3={"anon": True})`. Cada fragmento zarr leído
  queda en disco local (`services/geo-static/.data/physrisk_cache/`,
  gitignorado); corridas posteriores no vuelven a golpear el bucket para
  los mismos fragmentos.
- **Reintentos acotados + bloques más chicos**: `TAMANO_BLOQUE_LOTE` bajó de
  200 a 50 escuelas por request; hasta `MAX_INTENTOS_POR_BLOQUE = 3` con
  backoff exponencial corto (1s/2s), siempre secuencial (nunca hilos ni
  async contra el bucket).
- **Viento sin cobertura real para Corrientes, confirmado con lectura real
  (no supuesto)**: 7 puntos de prueba en la provincia (capital, Goya, Paso
  de los Libres, Santo Tomé, Curuzú Cuatiá, Mercedes, Saladas) devuelven
  `NaN` en los 7 períodos de retorno del dataset `wind/wisc/v1` histórico,
  con `in_bounds=True` — es decir, gap real de grilla del dataset, no error
  de conexión. Documentado en comentario de código y en la tabla de abajo.
  `peligro_inundacion_pluvial` sigue sin dataset publicado (ya documentado
  en G1 original, sin cambios).

### Corrida real (2026-09-26)

| Job | Tiempo total | Detalle |
|---|---|---|
| Aislamiento OSM (`PYTHONPATH=src uv run python -m geo_static.jobs.calcular_aislamiento`) | 1788.9s (~29.8 min) | Construcción de red (~10 min) + cálculo de 2001 escuelas contra un único grafo provincial. |
| Susceptibilidad physrisk (`PYTHONPATH=src uv run python -m geo_static.jobs.calcular_susceptibilidad`) | 2.1s | Con el store cacheado ya poblado por pruebas previas de verificación; una corrida en frío (cache vacío) tarda más por la lectura inicial a S3, pero igual de acotada (bloques de 50, secuencial). |
| Importación (`node scripts/importar-geo-static.mjs --aislamiento ... --susceptibilidad ...`) | segundos | 2001/2001 OK en ambas tablas, 0 fallidas. Verificado idempotente corriendo el importador dos veces seguidas, sin error ni duplicados. |

### Cobertura nueva

| Capa | Escuelas con dato | % | Motivo de faltante |
|---|---|---|---|
| Índice de aislamiento OSM | 1985/2001 | **99.2%** | 16 escuelas con `snap_distancia_m` > 5000 m (genuinamente lejos de cualquier camino del extracto, `motivo_sin_datos=sin_conexion_red`) — no es fallo de conexión. |
| Susceptibilidad — fluvial | 2001/2001 | **100%** | — |
| Susceptibilidad — pluvial | 0/2001 | 0% | Sin dataset publicado en physrisk-lib (documentado, no bloquea, sin cambios respecto a G1 original). |
| Susceptibilidad — viento | 0/2001 | 0% | Sin cobertura de grilla verificada para Corrientes en `wind/wisc/v1` histórico (NaN confirmado con lectura real en 7 puntos, `in_bounds=True`, no error de conexión). |
| Susceptibilidad — calor | 2001/2001 | **100%** | — |

Distribución `indice_aislamiento` (2001 escuelas): 0 → 504, 1 → 727, 2 → 0
(ver nota sobre inalcanzabilidad estructural arriba), 3 → 754, vacío → 16.

### Tests

- Python (`cd services/geo-static && uv run pytest tests/ -q`): **26/26
  verdes** (12 de `osm_aislamiento` — 9 previos + 3 nuevos de
  `construir_red_local`/fallback; 14 de `physrisk_susceptibilidad` — 9
  previos + 5 nuevos de cacheo/reintentos/orden real de `get_curves`).
- TS/Vitest: sin cambios en esta corrección (no se tocó el importador ni su
  contrato).

### Verificaciones finales

| Verificación | Resultado |
|---|---|
| `pnpm test` | verde — 121 archivos, 1003 tests (igual al baseline post-G1, sin regresiones) |
| `pnpm lint` | verde |
| `pnpm exec tsc --noEmit` | verde |
| `pnpm build` | verde |
| `uv run pytest tests/ -q` (services/geo-static) | verde — 26/26 |

### Archivos tocados / creados en G1-fix1

- `services/geo-static/src/geo_static/osm_aislamiento.py`: nueva
  `construir_red_local` (pyrosm); `construir_red` (Overpass) intacta,
  redocumentada como fallback.
- `services/geo-static/src/geo_static/jobs/calcular_aislamiento.py`: camino
  de producción con red única provincial desde el extracto local;
  fallback documentado si falta el extracto; docstring de uso corregido
  con `PYTHONPATH=src` (omisión del registro original, el comando sin esa
  variable no encuentra el paquete).
- `services/geo-static/src/geo_static/physrisk_susceptibilidad.py`: fix del
  orden de desempaquetado de `get_curves`; `_crear_store_cacheado` (fsspec
  filecache); reintentos acotados con backoff; bloques de 50.
- `services/geo-static/src/geo_static/jobs/calcular_susceptibilidad.py`:
  docstring de uso corregido con `PYTHONPATH=src`.
- `services/geo-static/tests/test_osm_aislamiento.py`,
  `tests/test_physrisk_susceptibilidad.py`: tests nuevos (ver arriba).
- `services/geo-static/pyproject.toml`, `uv.lock`: nueva dependencia
  `pyrosm` (fsspec/s3fs/aiohttp ya venían transitivamente de
  `physrisk-lib`).
- `services/geo-static/output/aislamiento_osm-v1-2026-09-26.csv`,
  `output/susceptibilidad_estatica-v1-2026.csv`: regenerados con la corrida
  real de G1-fix1 (reemplazan los CSV de baja cobertura de G1 original;
  ambos < 300 KB, versionados).
- `services/geo-static/.data/`: extracto pbf y cache de physrisk, **fuera
  del repo** (gitignorado desde G1 original).

### Pendientes explícitos para N1 (actualizado)

1. ~~Re-correr ambos jobs completos desde infraestructura con mejor
   conectividad~~ — **hecho en G1-fix1**, cobertura ≥95% alcanzada.
2. ~~Revisión visual efectiva de `validacion-muestra.md`~~ — **muestra
   regenerada en G1-fix2** contra el CSV corregido (26 escuelas, las 4
   categorías del índice, ver más abajo); la **revisión visual en sí sigue
   pendiente del usuario** (no se pudo ver imagen desde este entorno de
   ejecución).
3. ~~Decidir si el índice de aislamiento 2 amerita revisión~~ — **resuelto
   en G1-fix2**: el índice 2 era inalcanzable por un bug de clasificación
   (`NaN` de pyrosm tratado como puente), no por ausencia real de datos de
   vado; corregido, el índice 2 aparece en 114/2001 escuelas (5.7%),
   concentrado en departamentos con ríos/esteros reales — la escala 0-3 no
   necesitó cambios, ver detalle abajo.
4. Endpoint `GET /api/infraestructura/accesos/:cueAnexo`: sigue omitido por
   pedido explícito de N1, no implementado.
5. Refresco trimestral (OSM) / anual (physrisk): el extracto Geofabrik y el
   cache de physrisk quedan en `.data/` (fuera del repo); el próximo
   refresco requiere volver a descargar el extracto (o verificar si hay uno
   más nuevo) y puede reusar/limpiar el cache de physrisk según conviena.

## G1-fix2 (cruces de agua) — diagnóstico, corrección y optimización

### Diagnóstico: "todos los cruces son puente", índice 2 inalcanzable

N1 reportó que en la corrida `aislamiento_osm-v1-2026-09-26.csv` de G1-fix1
**todo** cruce de agua detectado se clasificaba como "con puente"
(`cruces_agua_con_puente_count == cruces_agua_count` en el 100% de las 890
escuelas con cruces) y que el **índice 2 nunca aparecía** (0/2001).

Evidencia muestreada (≈15 cruces reales del grafo de Corrientes,
`.data/osm/corrientes_graph.pkl`, ver `bridge_yes_samples`/`nan_samples` del
análisis):

| Tipo de cruce | `bridge` (crudo) | `tunnel` | `ford` | `highway` | Clasificación vieja | Clasificación real |
|---|---|---|---|---|---|---|
| Puente real tageado | `"yes"` | `nan` | `nan` | `secondary`/`primary` | con puente | con puente (correcto, casualidad) |
| **Cruce sin tag `bridge`** (mayoría, ~99% de los 4665 cruces detectados) | `nan` (float, no `None`) | `nan` | `nan` | `unclassified`/`track`/`residential` | **con puente (BUG)** | sin puente conocido (nunca vado confirmado con `ford`, pero tampoco puente) |
| Vado con `ford=yes` explícito | `nan` | `nan` | `"yes"` | `track` | **con puente (BUG)** | vado confirmado |

Causa raíz (`waterway_lookup.py`, `analizar_cruces.py`, `sample_crossings.py`
en el análisis de esta sesión): `pyrosm.OSM.get_network(...,
extra_attributes=["bridge", "tunnel", "ford", ...])` devuelve
`float('nan')` — nunca `None` ni clave ausente — para un atributo no
tageado en una arista. La clasificación vieja comparaba
`valor not in (None, "", "no")`; `nan not in (...)` da `True` sin excepción,
así que **toda** arista sin tag `bridge` se contaba como puente. Efecto:
`cruces_agua_con_vado_count` daba 0 en el 100% de los casos, por lo tanto
`tiene_alternativa_sin_cruce` daba `True` siempre (nunca se quitaba ninguna
arista del grafo seguro) y el índice 2 (`cruces_agua_con_vado_count >= 1` y
`tiene_alternativa_sin_cruce`) era estructuralmente inalcanzable — exactamente
lo reportado por N1.

### Corrección

- `_primer_valor` (nueva, única normalización): convierte `NaN` flotante a
  `None` además de manejar listas — un solo punto de normalización usado por
  `_tiene_puente`, `_tiene_ford` y `_es_tramo_sin_pavimentar`.
- `_tiene_puente`: puente si `bridge` está presente y no es `"no"` (cualquier
  `bridge=*` real: `yes`, `viaduct`, `movable`, etc.), **o** si
  `tunnel=culvert` (paso cubierto, documentado y tratado como seguro igual
  que un puente — no es un vado a cielo abierto). Un cruce sin tag `bridge`
  ni `tunnel=culvert` **nunca** se clasifica como puente.
- `_tiene_ford`: vado si `ford` (cualquier valor no `"no"`, más laxo que
  `ford=yes` estricto porque OSM también usa `ford=stream_crossing` u otros
  valores no-`"no"` con el mismo significado práctico de "cruce a nivel sin
  estructura") está tageado en la arista o en cualquiera de sus dos nodos
  (un vado a veces se tagea sobre el nodo puntual del cruce, no sobre el
  camino).
- **Cruce sin evidencia de puente ni de vado** (el caso más común,
  ~99% de los cruces reales): se cuenta junto con los vados confirmados en
  `cruces_agua_con_vado_count` — **nunca se asume seguro** (documentado en
  `_aristas_inseguras`, que ya tenía este comentario pero ahora es correcto
  en la práctica).
- Escala 0-3 (`calcular_indice_aislamiento`): **sin cambios de lógica** —
  con la clasificación corregida, `cruces_agua_con_vado_count >= 1` empieza
  a darse en la práctica y el índice 2 (vado con alternativa) queda
  alcanzable; no hizo falta rediseñar la escala.

### Tests (RED/GREEN por categoría)

`tests/test_osm_aislamiento.py`: `TestTienePuente`,
`TestReproduccionBugTodosLosCrucesSonPuente`, `TestTieneFord`,
`TestPrimerValor` — cada uno con un caso que reproduce el bug viejo sobre
`NaN` (rojo con la lógica anterior, verde con `_primer_valor`) y un caso de
puente/vado real. `TestCalcularMetricasEscuela` cubre las 4 categorías del
contrato: puente+alternativa, vado sin alternativa, vado con alternativa,
sin cruce (índice 0). 39/39 tests de `osm_aislamiento` en verde.

### Optimización de rendimiento (pedido de N1 sobre la misma tarea)

La corrida real de G1-fix1 tardaba 2377.6s (~40 min) por dos motivos
separados: construir la red+capa de agua (~19 min, sin cambios en esta
optimización) y **2001 búsquedas `nx.shortest_path` punto-a-punto**, una por
escuela, contra un grafo de 272.806 nodos / 590.449 aristas (~1200s
acumulados, verificado con `timing_test.py`: ~0.3-0.5s/escuela).

`calcular_metricas_departamento` (nueva, `osm_aislamiento.py`) reemplaza eso
por, **por departamento** (25 en total, no 2000):

1. Una única `nx.single_source_dijkstra` desde la cabecera departamental
   sobre el grafo invertido (`grafo.reverse(copy=False)`, construido una
   sola vez para toda la corrida) — da distancia y camino a **todas** las
   escuelas del departamento de una vez; el camino invertido reconstruye
   exactamente el mismo camino que `shortest_path` por-escuela hubiera dado.
2. Una única búsqueda de alcanzabilidad (BFS sin pesos,
   `nx.single_source_shortest_path_length`) sobre `grafo_seguro` invertido,
   para resolver `tiene_alternativa_sin_cruce` de todas las escuelas con
   vado de una sola vez en vez de un `nx.has_path` por escuela.
3. Snap a nodo vial batched: una sola llamada vectorizada a
   `ox.distance.nearest_nodes` con listas de lat/lon por departamento.

Equivalencia verificada con `TestCalcularMetricasDepartamentoEquivalencia`
(grafo sintético con las 4 categorías del contrato bajo una cabecera
compartida): resultado idéntico, campo por campo, entre llamar
`calcular_metricas_escuela` una vez por escuela y llamar
`calcular_metricas_departamento` una vez por departamento. Verificado
también contra la corrida real: se compararon las 363 filas de CAPITAL
calculadas con el motor viejo (per-escuela, clasificación ya corregida) contra
las mismas escuelas del CSV final (motor batched) — únicas diferencias:
ruido de punto flotante en `distancia_via_pavimentada_m`/
`distancia_cabecera_departamental_m` del orden de 1e-9 a 1e-6 metros (orden
de suma distinto entre Dijkstra bidireccional y `single_source_dijkstra`),
sin ninguna diferencia en conteos, `motivo_sin_datos` ni índice.

`jobs/calcular_aislamiento.py::correr` ahora construye `grafo_invertido` y
`grafo_seguro_invertido` una sola vez (fuera del loop de departamentos) y
llama `calcular_metricas_departamento` una vez por departamento.

**Resultado medido** (re-corrida completa, reusando el grafo+capa de agua ya
cacheados de la corrida real anterior — no se repitió la construcción de red
desde el `.pbf`, que es un costo aparte no afectado por esta optimización):
25 departamentos, 2001 escuelas, **238.5s** de cálculo puro (antes ~1200s
acumulados vía per-escuela) — **~5x más rápido**, todo en un único proceso
foreground (251.5s de principio a fin incluyendo carga de los pickles y
escritura del CSV), sin recargar el grafo por departamento.

### Re-corrida completa (25/25 departamentos, motor batched)

Distribución `indice_aislamiento` (2001 escuelas): 0 → 471, 1 → 628,
**2 → 114** (antes 0, ver diagnóstico arriba), 3 → 772, vacío → 16
(mismas 16 escuelas sin conexión de red que en G1-fix1, sin cambios).

Distribución por departamento (columnas 0/1/2/3/sin_dato) — extracto de
los departamentos con más presencia de ríos/islas, donde el índice 2 se
concentra como era esperable geográficamente:

| Departamento | 0 | 1 | 2 | 3 | sin_dato |
|---|---|---|---|---|---|
| GOYA | 47 | 33 | 24 | 83 | 1 |
| ITUZAINGO | 0 | 11 | 24 | 40 | 3 |
| SAN COSME | 0 | 24 | 13 | 18 | 0 |
| MERCEDES | 28 | 14 | 9 | 29 | 1 |
| PASO DE LOS LIBRES | 27 | 13 | 9 | 21 | 0 |
| LAVALLE | 17 | 36 | 10 | 29 | 0 |
| CAPITAL | 132 | 220 | 7 | 4 | 0 |
| GENERAL PAZ | 0 | 17 | 0 | 56 | 0 |

(GENERAL PAZ, en la frontera del río Paraná, concentra su aislamiento en el
índice 3 en vez del 2: consistente con cruces mayormente sin alternativa
segura, no con ausencia de cruces.) Distribución completa de los 25
departamentos verificada en el análisis, disponible en el historial de esta
sesión.

Sanity check geográfico: los departamentos ribereños/con islas
(Ituzaingo — cerca del embalse de Yacyretá, Goya, San Cosme, Empedrado,
General Paz, Paso de los Libres) concentran la enorme mayoría del índice 2
y una parte relevante del 3; departamentos sin curso de agua relevante en el
padrón de escuelas (General Alvear, San Martín, San Luis del Palmar, San
Roque, Santo Tomé) dan 0 escuelas en índice 2, consistente con su geografía.
Un caso extremo verificado individualmente: escuela `1800762-00` (Ituzaingo,
cerca del embalse) con `cruces_agua_con_vado_count = 21` — un camino con
muchos esteros/canales sin puente tageado, índice 3 (sin alternativa
completamente segura), consistente con la zona.

### Importación y verificaciones finales (G1-fix2)

| Verificación | Resultado |
|---|---|
| `uv run pytest tests/ -q` (services/geo-static) | verde — 55/55 (39 de `osm_aislamiento`, incluye equivalencia batched; 16 de `physrisk_susceptibilidad`, sin cambios) |
| `node scripts/importar-geo-static.mjs --aislamiento ...` | 2001/2001 OK, 0 fallidas; verificado idempotente corriendo dos veces seguidas |
| `pnpm exec vitest run --maxWorkers=2 scripts/importar-geo-static.test.ts` | verde — 4/4 |
| `pnpm exec vitest run --maxWorkers=2` | verde — 121 archivos, 1003 tests |
| `pnpm lint` | verde |
| `pnpm exec tsc --noEmit` | verde |
| `pnpm build` | verde |

`docs/ejecucion-enos/G1/validacion-muestra.md` regenerado: 26 escuelas de
las 4 categorías del índice, con énfasis en departamentos ribereños para las
categorías 2 y 3. **Revisión visual efectiva sigue pendiente del usuario**
(no se pudo ver imagen satelital desde este entorno de ejecución).

### Archivos tocados en G1-fix2

- `services/geo-static/src/geo_static/osm_aislamiento.py`: `_primer_valor`
  (normalización NaN/lista); `_tiene_puente`/`_tiene_ford` corregidos;
  `_resultado_vacio`; `calcular_metricas_departamento` (batched, nuevo).
- `services/geo-static/src/geo_static/jobs/calcular_aislamiento.py`: usa
  `calcular_metricas_departamento` con grafos invertidos construidos una
  sola vez para toda la corrida.
- `services/geo-static/tests/test_osm_aislamiento.py`: tests de
  `_primer_valor`/`_tiene_puente`/`_tiene_ford` sobre `NaN`; suite de
  equivalencia `TestCalcularMetricasDepartamentoEquivalencia`; fake de
  `nearest_nodes` en `_preparar_job` actualizado para soportar la llamada
  vectorizada.
- `services/geo-static/output/aislamiento_osm-v1-2026-09-26.csv`:
  regenerado (CSV anterior de G1-fix1 respaldado como `.csv.bak` en el mismo
  directorio antes de sobrescribir).
- `docs/ejecucion-enos/G1/validacion-muestra.md`: regenerado contra el CSV
  corregido.
- `docs/ejecucion-enos/G1/registro.md`: esta sección.

## Gate

_(sección para N1 — no completada por N2)_

## Gate (N1)

**Decisión: aceptado con follow-ups (2026-09-27).**

- Verificaciones: pytest 55/55 en services/geo-static y vitest del importador 4/4 (revisión independiente N2 → N3); CSV de aislamiento con 2001 filas, índice 0–3 con las cuatro categorías (0: 471, 1: 628, 2: 114, 3: 772, sin red: 16) y 517 escuelas con vados en su ruta.
- Revisión independiente: sin bloqueantes. Clasificación puente/alcantarilla/vado correcta (el NaN de pyrosm ya no cuenta como puente), el Dijkstra de fuentes múltiples es equivalente al cálculo por escuela, "sin red" nunca implica seguro y physrisk documenta como "sin cobertura del dataset" los indicadores sin datos para Corrientes.
- Corregido por N1 en el gate: services/geo-static/.gitignore ahora excluye cache/ (17 MB de respuestas de Overpass) y output/*.bak.
- Follow-ups: el importador TS valida presencia pero no tipos (usar Zod); falso positivo posible cuando una vía corre solapada a un curso de agua; factor de deduplicación en grados impreciso a esta latitud (~12 %); revisión visual de la muestra de validación, pendiente del usuario.
