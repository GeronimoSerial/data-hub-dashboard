# G1 — Contrato de datos de los jobs offline (`services/geo-static/`)

Este documento define el **contrato de salida** de los jobs offline de
`services/geo-static/`. Los jobs aún no están implementados: esto es lo que
deben cumplir. Los CSV son la interfaz estable entre el job y el importador que
carga los datos en SQLite.

Reglas generales para ambos archivos:

- CSV con header, codificación UTF-8.
- Nombres de columna en `snake_case`.
- Un registro por `cue_anexo` y por versión de job.
- `cue_anexo` usa el mismo formato `XXXXXXX-XX` que `localizaciones.json`.
- Valores vacíos se representan como campo vacío (no `NULL`, no `-`, no `N/A`).
- Fechas en formato ISO (`YYYY-MM-DD`).
- `version_job` es un string incremental (por ejemplo `'1'`) que identifica la
  versión del algoritmo del job.

## Archivo 1: `aislamiento_osm-v{N}-{fechaExtractoOSM}.csv`

Columnas:

| Columna | Tipo | Descripción |
| --- | --- | --- |
| `cue_anexo` | string | Código de anexo, formato `XXXXXXX-XX`. |
| `distancia_via_pavimentada_m` | float \| vacío | Distancia en metros a la vía pavimentada más cercana. |
| `distancia_cabecera_departamental_m` | float \| vacío | Distancia en metros por la red vial a la cabecera departamental (desde `version_job` 2: sede oficial de Georef Argentina, ver «Cabecera departamental»). |
| `tramos_sin_pavimentar_count` | int | Cantidad de tramos sin pavimentar identificados. |
| `cruces_agua_count` | int | Cantidad total de cruces de agua. |
| `cruces_agua_con_puente_count` | int | Cruces de agua con puente. |
| `cruces_agua_con_vado_count` | int | Cruces de agua con vado (sin puente). |
| `tiene_alternativa_sin_cruce` | 0 \| 1 \| vacío | Existe un camino alternativo que evita los cruces sin puente. |
| `indice_aislamiento` | 0 \| 1 \| 2 \| 3 \| vacío | Índice de aislamiento (ver escala). |
| `motivo_sin_datos` | vacío \| `'coordenada_fuera_de_departamento'` \| `'red_vial_no_conectada'` \| `'sin_via_osm_cercana'` \| `'sin_conexion_red'` | Motivo verificable por el que no se pudo calcular el índice (ver «Regla de datos insuficientes»). |
| `snap_distancia_m` | float | Distancia en metros entre el punto de la escuela y la red vial. Desde `version_job` 2 es la distancia perpendicular a la ARISTA vial más cercana (antes, al nodo más cercano). |
| `version_job` | string | Versión del job (por ejemplo `'1'`). |
| `fecha_extracto_osm` | fecha ISO | Fecha del extracto de OpenStreetMap usado. |
| `licencia` | string fija | `'© OpenStreetMap contributors, ODbL'`. |

### Escala de `indice_aislamiento` (0–3)

- **0** — Sin cruces de agua y con vía pavimentada cercana.
- **1** — Cruces con puente y/o tramos sin pavimentar menores, con alternativa.
- **2** — Cruces sin puente (vado) con alternativa, o varios tramos sin
  pavimentar sin alternativa.
- **3** — Sin alternativa que evite cruces sin puente, o el único acceso es un
  vado.

### Regla de datos insuficientes

`indice_aislamiento` se deja **vacío** y `motivo_sin_datos` se completa con un
motivo verificable (`version_job` 2). Nunca se asume que un punto sin conexión
a la red es seguro por defecto ni se inventa una ruta o un enlace entre
caminos no conectados:

| `motivo_sin_datos` | Condición | Evidencia (Archivo 4) |
| --- | --- | --- |
| `coordenada_fuera_de_departamento` | La coordenada del padrón cae a más de **2,0 km** fuera del polígono de su propio departamento (Georef departamentos 2026-09-27). No se calcula nada en un lugar equivocado ni se reubica la escuela. | `distancia_poligono_departamento_km` |
| `red_vial_no_conectada` | Hay una vía conducible de OSM a menos de 5 km de la escuela, pero pertenece a un componente aislado de la red principal (no llega a la cabecera). | `via_no_conectada_m`, `via_no_conectada_clase`, `via_a_red_principal_m` |
| `sin_via_osm_cercana` | No hay ninguna vía conducible de OSM a menos de 5 km (islas, esteros, dato inexistente en OSM). | `snap_nodo_red_m` |
| `sin_conexion_red` | Solo como respaldo: fallo del cálculo de un departamento o red obtenida por Overpass. | — |

El umbral de snap sigue siendo **5000 m** (`UMBRAL_SNAP_SIN_CONEXION_M`).

### Red vial y cabecera departamental (`version_job` 2)

- **Red:** vías conducibles de OSM incluyendo `highway=track` y `service` (los
  accesos rurales de Corrientes son mayormente tracks); se mantienen las
  exclusiones de acceso privado y `motor_vehicle=no`, y se descartan valores de
  `highway` no conducibles o basura del extracto. Solo cuenta la componente
  conectada: nunca se rutea por caminos no conectados.
- **Cabecera departamental:** sede oficial de cada departamento (centroide de la
  localidad según Georef Argentina, archivo versionado
  `services/geo-static/data/cabeceras_departamentales.json`, con fuente y
  fecha de consulta). En `version_job` 1 era el centroide de las escuelas de la
  localidad con más escuelas del padrón (errores de hasta 55 km).
- **Snap:** cada escuela se ubica en la arista vial dirigida más cercana y se
  rutea desde el punto de proyección (la distancia parcial sobre esa arista se
  suma a la distancia total).

### Nota G1-fix2 — detección de cruces de agua

Los cursos de agua (`waterway=river|stream|canal|drain`) son entidades OSM
separadas de la red vial: nunca aparecen como atributo de una arista de
camino. La detección real se hace por **intersección geométrica** entre la
geometría de cada arista de la ruta y las geometrías de agua del mismo
extracto local (ver `registro.md`, sección G1-fix2), no por un atributo
`waterway` sobre la arista. Se excluye deliberadamente `waterway=ditch`
(zanjas de borde de campo, sin entidad suficiente); se incluye `drain`
(canales de desagüe, con relevancia real en Corrientes).

Clasificación de cada cruce detectado:

- **Con puente** (`cruces_agua_con_puente_count`): la arista que cruza el
  curso de agua tiene `bridge=*` (cualquier valor salvo `'no'`) o
  `tunnel=culvert` (paso cubierto, tratado como puente a efectos de
  seguridad del cruce).
- **Con vado / sin puente conocido** (`cruces_agua_con_vado_count`): incluye
  tanto los vados confirmados (`ford=yes` en la arista o en alguno de sus dos
  nodos) **como los cruces detectados sin ninguna evidencia de puente ni de
  vado**. Decisión explícita de N2: nunca se asume que un cruce sin etiqueta
  de puente es seguro, así que el caso "desconocido" se cuenta junto con los
  vados confirmados en vez de agregar una columna nueva al contrato (que
  debía quedar sin cambios). Esto es conservador: puede sobreestimar
  levemente los vados reales, nunca subestimarlos.
- Cruces del **mismo** curso de agua detectados a menos de **30 m** entre sí
  a lo largo de una misma ruta se deduplican como un único cruce (tolerancia
  `TOLERANCIA_DEDUP_CRUCE_M` en `osm_aislamiento.py`, documentada ahí).
- `tiene_alternativa_sin_cruce` se recalcula sobre un grafo sin las aristas
  con cruce "sin puente conocido" (vado confirmado + desconocido), nunca solo
  sin las de vado confirmado.
- Esta detección solo está implementada contra el extracto local Geofabrik
  (pyrosm). En el camino de fallback por Overpass (sin extracto local,
  documentado como poco confiable para volumen completo) no hay capa de
  agua: `cruces_agua_count` queda en 0 para todas las escuelas en ese camino,
  documentado en el código y en el registro.

## Archivo 2: `susceptibilidad_estatica-v{N}-{anio}.csv`

Columnas:

| Columna | Tipo | Descripción |
| --- | --- | --- |
| `cue_anexo` | string | Código de anexo, formato `XXXXXXX-XX`. |
| `peligro_inundacion_fluvial` | float \| vacío | Peligro de inundación fluvial. |
| `peligro_inundacion_pluvial` | float \| vacío | Peligro de inundación pluvial. |
| `peligro_viento` | float \| vacío | Peligro de viento. |
| `peligro_calor` | float \| vacío | Peligro de calor. |
| `periodo_retorno_anios` | int | Período de retorno en años (por ejemplo `100`). |
| `fuente` | `'physrisk'` \| `'no_disponible'` | Fuente del dato. |
| `version_job` | string | Versión del job (por ejemplo `'1'`). |
| `fecha_corrida` | fecha ISO | Fecha de la corrida del job. |
| `licencia` | string fija | `'Apache-2.0, OS-Climate physrisk'`. |

**Importante:** esta capa es **riesgo estático de largo plazo por período de
retorno**. NUNCA es un pronóstico ni un dato en tiempo real. No debe
presentarse ni consumirse como una predicción de un evento en curso.

## Archivo 3: `accesos_osm_geometria-v{N}-{fecha_extracto}.ndjson.gz`

Tercer archivo de salida, **gzip NDJSON** (no CSV): un objeto JSON por
escuela, ordenado por `cue_anexo`. El gzip se escribe con `mtime=0`, de modo
que una misma entrada produce **bytes idénticos** (artefacto reproducible,
apto para diff). Lo escribe **únicamente** el camino de extracto local de
`calcular_aislamiento`; el camino de fallback por Overpass no tiene capa de
agua y **no escribe geometría**.

Columnas de cada objeto:

| Columna | Tipo | Descripción |
| --- | --- | --- |
| `cue_anexo` | string | Código de anexo, formato `XXXXXXX-XX`. |
| `version_job` | string | Versión del job (por ejemplo `'1'`). |
| `fecha_extracto_osm` | fecha ISO | Fecha del extracto de OpenStreetMap usado. |
| `licencia` | string fija | `'© OpenStreetMap contributors, ODbL'`. |
| `ruta` | GeoJSON LineString \| null | Camino realmente usado por la métrica, en coordenadas `[lon, lat]` con 6 decimales. |
| `cruces` | array | Lista de objetos `{ lon, lat, clasificacion }` con los cruces de agua detectados sobre `ruta`. |
| `motivo_sin_geometria` | null \| `'coordenada_fuera_de_departamento'` \| `'red_vial_no_conectada'` \| `'sin_via_osm_cercana'` \| `'sin_conexion_red'` \| `'ruta_degenerada'` | Motivo por el que no hay ruta dibujable (los cuatro primeros coinciden con `motivo_sin_datos`). |

### Semántica de `ruta`

`ruta` es el **camino realmente usado por la métrica**: el camino más corto
de Dijkstra desde el nodo vial más cercano a la escuela hasta la cabecera
departamental (`version_job` 2: desde el punto de la arista vial más cercana a la escuela, no desde el nodo más cercano). Para cada salto se toma, entre las aristas paralelas, la de
**menor `length`** (la que usó Dijkstra) y su **geometría real de OSM** (el
atributo `geometry` de la arista, o sus dos nodos OSM si no existe — nunca
una recta inventada). La ruta **arranca en el punto de la vía más cercano a la escuela** (`version_job` 2;
en `version_job` 1, en el nodo vial tras el snap), no en el punto de la escuela: `snap_distancia_m` en el CSV del Archivo 1 indica a
qué distancia quedó el punto original. La longitud de la ruta coincide con
`distancia_cabecera_departamental_m` dentro de ±0,5 %.

### Semántica de `cruces`

`cruces` se produce en el **mismo bucle y con la misma deduplicación** que los
conteos del Archivo 1, por lo que se cumple siempre:

- `len(cruces) == cruces_agua_count`
- cantidad de cruces con `clasificacion == 'puente'` == `cruces_agua_con_puente_count`
- `vado` + `sin_evidencia` juntos == `cruces_agua_con_vado_count`

La métrica nunca asume que un cruce sin evidencia es seguro: la separación
entre `vado` y `sin_evidencia` es **solo para la visualización**. La
clasificación `con_puente` gana sobre `es_ford` (un cruce con puente nunca se
reporta como vado).

### Importación

`node scripts/importar-geo-static.mjs --geometria <file>` carga el archivo en
la tabla `infra_acceso_osm_geometria` (migración 0003), con clave primaria
`(cue_anexo, version_job)`. Las filas inválidas se cuentan y se omiten sin
interrumpir la importación.

**Importante:** es contexto territorial derivado de OpenStreetMap. NUNCA es un
pronóstico ni el estado confirmado del edificio.

## Archivo 4: `aislamiento_osm_sin_ruta-v{N}-{fecha_extracto}.csv`

Auditoría de las escuelas **sin índice** (una fila por escuela sin
`indice_aislamiento`, ordenada por `cue_anexo`), escrita solo por el camino de
extracto local. Es evidencia versionada del motivo; no se importa a la base.

Columnas: `cue_anexo, nombre, departamento, localidad, lat, lon,
motivo_sin_datos, snap_nodo_red_m, via_no_conectada_m, via_no_conectada_clase,
via_a_red_principal_m, distancia_poligono_departamento_km, fuente, licencia`.

- `snap_nodo_red_m`: distancia al nodo más cercano de la red principal.
- `via_no_conectada_m` / `via_no_conectada_clase`: distancia y clase (`highway`) de la
  vía conducible más cercana que NO está conectada a la red principal.
- `via_a_red_principal_m`: distancia desde ese punto de la vía al nodo más cercano de la red principal.
- `distancia_poligono_departamento_km`: solo para `coordenada_fuera_de_departamento`.
- `fuente` y `licencia`: OpenStreetMap (ODbL) y, en el gate, Georef departamentos 2026-09-27.

## Refresco

- **Aislamiento OSM:** refresco **trimestral** (depende de la fecha del extracto
  de OpenStreetMap).
- **Susceptibilidad physrisk:** refresco **anual**.
- Ambos se ejecutan mediante un **comando manual reproducible** en
  `services/geo-static/`. No se agrega ningún scheduler nuevo: la frecuencia de
  refresco es una convención operativa, no una automatización.
