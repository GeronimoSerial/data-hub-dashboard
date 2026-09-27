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
| `distancia_cabecera_departamental_m` | float \| vacío | Distancia en metros a la cabecera departamental. |
| `tramos_sin_pavimentar_count` | int | Cantidad de tramos sin pavimentar identificados. |
| `cruces_agua_count` | int | Cantidad total de cruces de agua. |
| `cruces_agua_con_puente_count` | int | Cruces de agua con puente. |
| `cruces_agua_con_vado_count` | int | Cruces de agua con vado (sin puente). |
| `tiene_alternativa_sin_cruce` | 0 \| 1 \| vacío | Existe un camino alternativo que evita los cruces sin puente. |
| `indice_aislamiento` | 0 \| 1 \| 2 \| 3 \| vacío | Índice de aislamiento (ver escala). |
| `motivo_sin_datos` | vacío \| `'sin_conexion_red'` | Motivo por el que no se pudo calcular el índice. |
| `snap_distancia_m` | float | Distancia en metros entre el punto y la red vial (snap). |
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

Si `snap_distancia_m` supera el umbral documentado (se propone **5000 m**), el
`indice_aislamiento` se deja **vacío** y `motivo_sin_datos` se completa con
`'sin_conexion_red'`. Nunca se asume que un punto sin conexión a la red es
seguro por defecto.

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

## Refresco

- **Aislamiento OSM:** refresco **trimestral** (depende de la fecha del extracto
  de OpenStreetMap).
- **Susceptibilidad physrisk:** refresco **anual**.
- Ambos se ejecutan mediante un **comando manual reproducible** en
  `services/geo-static/`. No se agrega ningún scheduler nuevo: la frecuencia de
  refresco es una convención operativa, no una automatización.
