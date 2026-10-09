# Mapa de infraestructura: datos, cálculo y flujo

> Análisis generado el 2026-10-08 (rama feat/inundacion-v2-datos).

## 1. Fuentes de datos e ingesta

Alcance: documentación de solo lectura del worktree `inundacion-modelo` (rama `feat/inundacion-v2-datos`). No se ejecutó ningún sync, import ni llamada a APIs externas. Las rutas son relativas a la raíz del repo. Las cadencias provienen de los `.timer` de systemd y de `docs/ejecucion-enos/OPS1/runbook-scheduler.md`.

### 1.1 Resumen

| # | Fuente | Origen | Formato | Carga | Destino | Cadencia |
|---|--------|--------|---------|-------|---------|----------|
| A | Padrón nominal (Gestión Educativa) | Postgres de GE (`PADRON_PG_URL` / `ConnectionStrings`) o tablero HTML local | Filas posicionales / gzip+base64 | Manual: `scripts/import-padron.mjs --ge` o `<html>` | Schema `ge` (`ge_corte`, `ge_seccion`, `ge_alumno_seccion`, `ge_alumno_identidad`) | Manual, por ciclo lectivo |
| B | Localizaciones de establecimientos | `public/data/localizaciones.json` y `public/data/establishments.geojson` | JSON / GeoJSON | Manual: `scripts/sync-ge.mjs --fixture` (upsert en `ge.ge_localizacion`) | `ge.ge_localizacion` | Manual |
| C | Capas geo-static de aislamiento, susceptibilidad, geometría de accesos y exposición de ruta | Jobs Python offline en `services/geo-static` (salidas versionadas en `output/`) | CSV / NDJSON.gz | Manual: `scripts/importar-geo-static.mjs` | `infra_aislamiento_osm`, `infra_susceptibilidad_estatica`, `infra_acceso_osm_geometria`, `infra_exposicion_ruta_inundacion` | Manual, por versión de job |
| D | Fuentes de inundación (JRC, GSW, Copernicus DEM) | Descarga directa desde CDN/S3 públicos | GeoTIFF/recortes | Job `descargar_fuentes_inundacion` (offline) | Directorio local `.data/` y `manifest.json` (no en DB) | Manual (`--force` para redescargar) |
| E | Pronóstico hidrometeorológico (Open-Meteo: ECMWF, flood, ensemble) | API Open-Meteo | JSON | Jobs `sync-pronostico-caudal` y `sync-ensemble` | `hazard_climatology`, `hazard_ensemble_prob` (ver nota sobre `hazard_forecast`) | Cada 6 h |
| F | Climatología (ERA5 archive y GloFAS flood) | Open-Meteo archive / flood-api | JSON | Jobs `calcular-climatologia` y `calcular-climatologia-caudal` | `hazard_climatology` | Mensual, con cursor resumable |
| G | Estacional (Open-Meteo Seasonal) | `seasonal-api.open-meteo.com` | JSON | Job `sync-seasonal` | `hazard_seasonal_trend` | Diaria, opcional |
| H | Observación satelital IMERG (NASA GES DISC / CMR) | CMR (`cmr.earthdata.nasa.gov`) y GES DISC, con `EARTHDATA_TOKEN` | JSON (CMR) / HDF5 | Job `sync-imerg` | `hazard_observation` | Cada 1 h |
| I | Alertas SMN (CAP) | RSS `https://ssl.smn.gob.ar/CAP/AR.php` | RSS/CAP XML | Job `sync-smn-alertas` | `smn_alerta` | Cada 15 min |
| J | Radar meteo (pronóstico) | Job `sync-radar-meteo` y `sync-radar-ensemble` | JSON | Jobs en `lib/infraestructura/radar-meteo/` | `radar_meteo_run`, `radar_meteo_ensemble_run` | 3 h y 6 h |
| K | Georreferencia de localidades y cabeceras | `apis.datos.gob.ar/georef` y censo de Corrientes (CSV) | JSON / CSV | Snapshots versionados en `services/geo-static/data/` | Entradas de `calcular_aislamiento` (no DB) | Manual, última consulta 2026-10-04 |
| L | Extracto OSM `argentina-latest.osm.pbf` | Descarga manual a `services/geo-static/.data/osm/` | PBF | Lectura local con pyrosm (fallback Overpass) | Salidas de geo-static (`accesos_osm_geometria`, `aislamiento_osm`) | Manual, extracto fechado 2026-09-26 |
| M | Derivados locales (perfiles geográficos, ríos, riesgo, situación) | Base de datos | SQL | Jobs `geo-perfiles`, `asociacion-rio`, `calcular-riesgo`, `episodios-derivados`, `situacion-corte` | `infra_geo_profile`, `infra_geo_rio`, `infra_risk_run`, `infra_risk_snapshot`, `infra_episodio_derivado`, `infra_situacion_corte` | Diaria a horaria |

### 1.2 Padrón nominal de Gestión Educativa (A)

- **Origen.** Base Postgres de Gestión Educativa. La conexión se toma de `PADRON_PG_URL` o `ConnectionStrings` (formato URL o .NET). `scripts/padron-ge.mjs:94-100`. Se lee en páginas de 25.000 filas (`TAMANO_PAGINA`, `scripts/padron-ge.mjs`, cerca de la línea 38), filtrando `alumnos.ciclo_lectivo` y `status = 'activo'` (`scripts/padron-ge.mjs:22-33`). El recorrido vive en `recorrerPadronDesdeGe` (`scripts/padron-ge.mjs:142`).
- **Origen alternativo.** Tablero HTML local con `const STUDENTS_GZ_B64="..."` (base64 de gzip de JSON `{c, r}`). `scripts/import-padron.mjs:1-9`, lectura en `scripts/import-padron.mjs:402`.
- **Ingesta.** `scripts/import-padron.mjs`:
  - Exige que `ge.ge_localizacion` esté poblada, si no aborta con la indicación de correr `sync-ge.mjs --fixture` (`scripts/import-padron.mjs:456-460`).
  - Reconcilia CUE contra `ge_localizacion` y descarta filas sin localización (`consumirOrigen`, líneas 349-420; `reconciliarFilas`, línea 98).
  - Crea el corte en estado `importando` (`scripts/import-padron.mjs:476`).
  - Inserta secciones, membresías e identidades cifradas en lotes de 1.000 (`insertarSecciones` 305, `insertarMembresias` 314, `insertarIdentidades` 323).
  - Activa el corte con `activarCorte` (`lib/infraestructura/ge-db.ts:215`), que marca el anterior como `historico` y el nuevo como `vigente`. Después relee el corte para verificarlo.
- **Tablas.** DDL en `lib/infraestructura/ge-db.ts:141-178`: `ge.ge_corte` (estados `importando|vigente|historico`), `ge.ge_seccion`, `ge.ge_alumno_seccion`, `ge.ge_localizacion`, `ge.ge_alumno_identidad`.
- **Privacidad.** El DNI se usa solo en memoria para derivar `gePersonId`. La identidad se guarda cifrada en `ge_alumno_identidad.payload_cifrado`, vía `lib/infraestructura/identidad-cripto.ts`.
- **Cadencia.** Manual, por ciclo lectivo (`--ciclo`, por defecto el año en curso). No se encontró timer para esta carga.

### 1.3 Localizaciones de establecimientos (B)

- `scripts/sync-ge.mjs:176-189` lee `public/data/localizaciones.json` y `public/data/establishments.geojson`. Ambos son consumidos por el mapa, y `sync-ge` los reconcilia para poblar `ge.ge_localizacion`. El upsert está en `scripts/sync-ge.mjs:108-125` y usa `ON CONFLICT(cue_anexo)`.
- `public/data/establishments.geojson` lo produce `scripts/extract-map-data.mjs` a partir de `Mapa_Evolucion_Matricula_2023_2026.html` (salida en líneas 338-339). Ese HTML no está versionado en el repo.
- No se encontró en el repo el script que genera `public/data/localizaciones.json`. Sus lectores son `scripts/sync-ge.mjs`, `services/geo-static/src/geo_static/padron_geo.py:37` y `scripts/extract-natalidad.mjs` (docstring, líneas 9-18).
- El fixture (`sync-ge.mjs --fixture`, líneas 146-175) crea un corte sintético `ciclo_lectivo = 2026`. No es padrón real.

### 1.4 Capas geo-static (C)

- **Jobs offline.** `services/geo-static/src/geo_static/jobs/`: `calcular_aislamiento.py`, `calcular_susceptibilidad.py`, `calcular_exposicion_ruta.py`, `calcular_exposicion_ruta_v2.py`, `calcular_inundacion_v2.py`. Se ejecutan a mano con `PYTHONPATH=src uv run python -m ...` (ver `calcular_aislamiento.py:3-6`). No se encontró timer para ellos.
- **Entradas.** `calcular_aislamiento.py:65-85` define:
  - `PADRON_PATH` = `public/data/localizaciones.json` (vía `padron_geo.py:37`).
  - `CABECERAS_PATH` = `services/geo-static/data/cabeceras_departamentales.json` (fuente Georef, línea 4).
  - `LOCALIDADES_URBANAS_PATH` = `services/geo-static/data/localidades_urbanas.json` (README con CSV de población del Censo 2022 y Georef).
  - `PBF_LOCAL_DEFAULT` = `services/geo-static/.data/osm/argentina-latest.osm.pbf` (línea 81) y `FECHA_EXTRACTO_OSM = "2026-09-26"` (línea 85). La licencia es ODbL (línea 60).
- **Salidas versionadas.** `output/` con nombres `<capa>-v<VERSION>-<fecha>.{csv|ndjson.gz}`. `VERSION_JOB = "4"` (línea 59). Por ejemplo: `aislamiento_osm-v4-2026-10-08.csv`, `aislamiento_osm_sin_ruta-v4-2026-10-08.csv`, `accesos_osm_geometria-v4-2026-10-08.ndjson.gz`, `exposicion_ruta_inundacion-v2-2026-10-08.ndjson.gz`, `inundacion_v2-v1-2026-10-08.csv`, `susceptibilidad_estatica-v1-2026.csv`.
- **Importador.** `scripts/importar-geo-static.mjs`:
  - Descubre los archivos más recientes por patrón en `GEO_STATIC_OUTPUT_DIR` o `services/geo-static/output` (líneas 34 y 63-72).
  - Inserta CSV con `onConflictDoUpdate` por `(cueAnexo, versionJob)` (`importarCsv`, líneas 220-236).
  - Inserta NDJSON.gz de la misma forma (`importarNdjson`, líneas 386-400). Descomprime con `gunzipSync`.
  - Las capas v2 solo hacen `UPDATE` de sus columnas en filas existentes por `cue_anexo` (`actualizarV2`, líneas 566-574) y no tocan las v1.
  - Despacho por flags en líneas 639-655.
- **Tablas destino.** Definidas en `lib/db/schema.ts`: `infra_aislamiento_osm` (1123), `infra_susceptibilidad_estatica` (1152), `infra_acceso_osm_geometria` (1202), `infra_exposicion_ruta_inundacion` (1224). Migraciones: `drizzle/0003_acceso_osm_geometria.sql`, `drizzle/0004_exposicion_ruta_inundacion.sql`, `drizzle/0012_inundacion_v2_columnas.sql`. No verifiqué la migración de `infra_aislamiento_osm`; no aparece en 0003 a 0007 ni en 0012.
- **Cadencia.** Manual. La versión del job es la que determina el nombre del archivo y la clave de conflicto.

### 1.5 Fuentes de inundación (D)

- `services/geo-static/src/geo_static/fuentes_inundacion.py:39-46`:
  - `DATA_DIR` = `services/geo-static/.data`, con `manifest.json` (línea 40).
  - `JRC_BASE_URL` = `https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/CEMS-GLOFAS/flood_hazard` (línea 43).
  - `GSW_BASE_URL` = `https://storage.googleapis.com/global-surface-water/downloads2021/occurrence` (línea 45).
  - `DEM_BASE_URL` = `https://copernicus-dem-30m.s3.amazonaws.com` (línea 46).
- El job `services/geo-static/src/geo_static/jobs/descargar_fuentes_inundacion.py` (1-12, 30-33) descarga, recorta a Corrientes y escribe `manifest.json` con URL, sha256, fecha y licencia por salida. Es idempotente salvo `--force`.
- Los archivos de `.data/` no van a la DB. Los consume `lib/` o los jobs de geo-static vía `padron_geo`/`lector_jrc`/`lector_laguna`.

### 1.6 Open-Meteo, IMERG, SMN y radar (E a J)

Hosts de Open-Meteo configurados en `lib/infraestructura/riesgo/providers/config-fuentes.ts`:

| Host | Línea | Uso | Origen en código |
|------|-------|-----|------------------|
| `api` (ECMWF) | 18 | Pronóstico 10 días | `providers/ecmwf.ts:108-113` |
| `flood-api` | 28 | Caudal pronosticado | `providers/flood.ts:19,42` |
| `ensemble-api` | 38 | Ensemble 3 días | `providers/ensemble.ts:40,164` |
| `seasonal-api` | 49 | Estacional 95 días | `providers/seasonal.ts:72,149` |
| `archive-api` | 63 | Climatología ERA5 | `providers/climatologia.ts:338` |
| `flood-api` (climatología) | 75 | Climatología GloFAS | `providers/climatologia-caudal.ts:145` |

Otras fuentes:

- **IMERG.** CMR en `cmr.earthdata.nasa.gov` (línea 90, ventana de backfill de 72 h en línea 95). Datos en `data.gesdisc.earthdata.nasa.gov` y `gpm1.gesdisc.eosdis.nasa.gov` (líneas 100-101). Requiere `EARTHDATA_TOKEN`, que no se persiste ni se loguea (`lib/infraestructura/riesgo/jobs/sync-imerg.ts:8, 138`). Sin token, la fuente se marca `no_disponible` en `hazard_source_health`. Escribe en `hazard_observation` con upsert por gránulo (`sync-imerg.ts:243-245`).
- **SMN.** `lib/infraestructura/radar-meteo/smn-alertas.ts:22` (RSS CAP). Escribe en `smn_alerta` con upsert por `id` (`smn-alertas.ts:433-435`). No consume cupo de Open-Meteo.
- **Radar meteo.** `lib/infraestructura/radar-meteo/job-sync.ts` escribe `radar_meteo_run` (líneas 49 y 68). `lib/infraestructura/radar-meteo/ensemble.ts:318` escribe `radar_meteo_ensemble_run`. Verificación en `radar-meteo/verificacion.ts`.
- **Escritores de hazard.** `sync-ensemble.ts:209` → `hazard_ensemble_prob`. `calcular-climatologia.ts:233` y `calcular-climatologia-caudal.ts:167` → `hazard_climatology`. `sync-seasonal.ts:134` → `hazard_seasonal_trend`. `salud-fuente.ts:35` → `hazard_source_health`.
- **Pronóstico de caudal.** `sync-pronostico-caudal.ts` lee `infra_geo_profile` (línea 318) para las celdas de los establecimientos. **No encontré ningún insert sobre `hazard_forecast`**; solo lo leen `lib/infraestructura/riesgo/peligro/nivel.ts`. Conviene verificar esto antes de asumir que la tabla se alimenta.
- **Cuota.** `providers/cupo-om.ts` controla el peso de llamadas. `OPEN_METEO_API_KEY` habilita cuota paga (runbook, línea 191). La cuota se aplica en `sync-radar-ensemble` (25 departamentos, tope diario 600 de peso, runbook línea 133).

### 1.7 Derivados locales (M)

Jobs en `lib/infraestructura/riesgo/jobs/` y `lib/infraestructura/episodios-derivados/`. No hacen llamadas externas (runbook, línea 193):

- `geo-perfiles` → `infra_geo_profile` (`lib/infraestructura/riesgo/geo-perfil.ts:101`).
- `asociacion-rio` → `infra_geo_rio` (`lib/infraestructura/riesgo/rio-asociacion.ts:114`).
- `calcular-riesgo` → `infra_risk_run` (`calcular-riesgo.ts:270`) e `infra_risk_snapshot` (`calcular-riesgo.ts:347`).
- `episodios-derivados` → `infra_episodio_derivado` (`lib/infraestructura/episodios-derivados/recompute.ts:155`).
- `situacion-corte` lee `infra_risk_snapshot` y `infra_episodio_derivado` (`lib/infraestructura/riesgo/situacion/corte.ts:84-155`).

### 1.8 Calendario systemd (OPS1)

El servicio plantilla es `deploy/systemd/ops1/enos-ops1@.service:9-11`, que ejecuta `/usr/local/bin/enos-ops1-exec %i`. El flag global es `ENOS_JOBS_ENABLED` (runbook, línea 26). Los timers están en `deploy/systemd/ops1/*.timer`:

| Job | OnCalendar (UTC) | Fuente |
|-----|------------------|--------|
| sync-smn-alertas | `*:07/15` | SMN CAP |
| sync-imerg | `*-*-* *:00:00` | IMERG |
| episodios-derivados | `*-*-* *:00:00` | Derivado |
| sync-radar-meteo | `*-*-* 00/3:12:00` | Open-Meteo |
| sync-radar-ensemble | `*-*-* 03,09,15,21:40:00` | Open-Meteo |
| sync-pronostico-caudal | `*-*-* 08,14,20,02:00:00` | Open-Meteo flood |
| sync-ensemble | `*-*-* 08,14,20,02:00:00` | Open-Meteo ensemble |
| calcular-riesgo | `*-*-* 08,14,20,02:15:00` | Derivado |
| situacion-corte | `*-*-* *:20:00` | Derivado |
| geo-perfiles | `*-*-* 03:00:00` | Derivado |
| asociacion-rio | `*-*-* 03:10:00` | Derivado |
| sync-seasonal | `*-*-* 09:00:00` | Open-Meteo seasonal (opcional) |
| climatologia-precipitacion | `*-*-01 06:40:00` | Open-Meteo archive (ERA5) |
| climatologia-caudal | `*-*-01 06:40:00` | Open-Meteo flood (GloFAS) |
| briefing-ia | `*-*-* *:30:00` | OpenRouter |
| verificar-radar-meteo | `*-*-* 11:30:00` | Derivado |

Los timers tienen `Persistent=true`. Ver `docs/ejecucion-enos/OPS1/runbook-scheduler.md:130-145` para la tabla de cadencias.

### 1.9 Seeds y catálogo

- `lib/infraestructura/recurso-seed.ts` (catálogo): upsert idempotente del recurso "Mapa de infraestructura" en `recursos`, `categorias` y `tags` (líneas 1-76). No carga datos de escuelas ni de alertas.
- `lib/seed-files.ts`: copia HTML y PDF de `public/` a storage como uploads. No es ingesta de datos del mapa.
- `lib/db/seed.ts`: no lo revisé en detalle.

### 1.10 Inconsistencias y huecos detectados

- `scripts/padron-ge.mjs:1-12` describe la fuente como "tabla `asistencias`", pero la consulta real usa `alumnos`, `personas` y `secciones` (líneas 22-33).
- `scripts/import-padron.mjs:4` dice "carga en ge.sqlite", pero el código escribe en el schema `ge` de Postgres (`ge-db.ts:195-199`). `ge-db.ts:133` conserva `getGeSqlitePath` como resto legado.
- `hazard_forecast` no tiene escritor localizado en `lib/` (ver 1.6).
- Los jobs de geo-static y los importadores son manuales. No encontré timers para ellos, así que la capa estática depende de que alguien recorra el flujo a mano.
- `public/data/localizaciones.json` se consume en varios lugares, pero no encontré en el repo el script que lo genera.
- Extracto OSM con fecha fija (`FECHA_EXTRACTO_OSM = "2026-09-26"`, `calcular_aislamiento.py:85`). Hay que actualizarlo a mano si cambia el extracto.


## 2. Cálculos y modelos

Alcance: cálculos del mapa de infraestructura (`mapa de infraestructura`) en el worktree `inundacion-modelo`. Rutas relativas a la raíz del repo. Los números de línea corresponden a la lectura actual de los archivos; los marcados con `~` se ubicaron por símbolo y conviene confirmarlos antes de citarlos literalmente.

Nota de método: CodeGraph no tiene índice en este proyecto (`.codegraph/` no fue encontrado al consultar), así que la búsqueda se hizo con `rg` sobre fuentes. No se ejecutaron syncs, jobs ni llamadas externas.

### 2.1 Dos capas distintas: afectación reportada y riesgo estimado

El mapa mezcla dos cálculos independientes que no deben confundirse:

| Capa | Qué mide | Dónde se calcula |
|---|---|---|
| **Afectación** (`estado`, `gravedad`, `severidad`) | Escuelas con un parte vigente de afectación reportado por el director | `lib/infraestructura/parte-mapa.ts:648-673`, `lib/infraestructura/mapa/agregar.ts`, `lib/infraestructura/totales-mapa.ts` |
| **Riesgo estimado** (`scoreRiesgo`, `nivelRiesgo`, `riesgoAcceso`) | Score 0-100 a partir de peligro, lluvia, historial, susceptibilidad y aislamiento | `lib/infraestructura/riesgo/motor/calculo.ts`, `riesgo/motor/riesgo-acceso.ts`, `riesgo/motor/config.ts` |

No se verificó en esta lectura qué capa muestra exactamente cada pestaña del mapa; eso requiere revisar `lib/infraestructura/mapa/*` y los componentes de UI.

### 2.2 Afectación por escuela, departamento y provincia

**Estado de cada escuela.** Una escuela está `afectada` si tiene un parte vigente; si no, `sin_afectacion_reportada`:

```ts
// lib/infraestructura/parte-mapa.ts:665-673
const parte = partePorCue.get(fila.cueAnexo)
...
estado: parte ? 'afectada' : 'sin_afectacion_reportada',
```

`partePorCue` se arma con `listarPartesVigentes(filtros)` (`parte-mapa.ts:648`). Las escuelas sin coordenadas (`fila.lat === null || fila.lon === null`) van a `sinUbicacion` y nunca pueden figurar como afectadas (`parte-mapa.ts:655-663`).

**Severidad.** Escala ordinal de cuatro niveles (`lib/infraestructura/validacion.ts:3`): `['Baja', 'Media', 'Alta', 'Crítica']`. La gravedad numérica es el índice más uno (`lib/infraestructura/mapa/gravedad.ts`):

```ts
export function gravedadDeSeveridad(severidad: Severidad): GravedadMapa {
  return (SEVERIDADES.indexOf(severidad) + 1) as GravedadMapa // 0 = sin afectación
}
```

Los criterios textuales por nivel están en `lib/infraestructura/severidad.ts:26-42`, con dos categorías (`establecimiento` y `alumnos`). El criterio distingue el dictado de clases (Baja: se dicta normal; Alta: impide dictar clase en parte del establecimiento; Crítica: impide el funcionamiento o hay riesgo para las personas). Es texto de referencia, no entra en ningún cálculo numérico.

**Totales por departamento** (`lib/infraestructura/totales-mapa.ts`):

- `totalEscuelas` = padrón completo del departamento, con y sin coordenadas (líneas ~60-75: `sinUbicacion` suma al total pero no a afectadas).
- `escuelasAfectadas` = conteo de `escuela.estado === 'afectada'` (`totales-mapa.ts:68`).
- `porcentajeAfectadas = round(afectadas / total * 1000) / 10` (un decimal). Si `total === 0` devuelve `0`.
- Provincia: suma de los conteos por departamento; el porcentaje provincial se calcula sobre los totales sumados, no como promedio de porcentajes (comentario en el código).
- Agrupación por departamento usa `normalizarNombreDepartamento` (mayúsculas sin tildes); el nombre visible es el primero encontrado.

**Agrupaciones de la lista** (`lib/infraestructura/mapa/agregar.ts`, función `agrupar`, líneas 58-101):

- Cuenta una escuela como afectada si `escuela.gravedad > 0` (línea 87).
- Porcentaje entero: `Math.round(afectadas / escuelas * 100)` (línea 95).
- Orden: afectadas desc, escuelas desc, nombre (`localeCompare` en español).

**Divergencia a verificar.** Hay dos criterios de "afectada": `estado === 'afectada'` (totales) y `gravedad > 0` (agrupaciones). Son equivalentes sólo si `gravedad` es `0` exactamente cuando no hay parte vigente; eso depende de cómo se enriquece `EscuelaMapaEnriquecida` (`lib/infraestructura/mapa/enriquecer.ts`, no revisado en detalle). Además, los porcentajes difieren en precisión: un decimal en totales y entero en `agrupar`.

**Otros umbrales de la capa de afectación.**

- `UMBRAL_SIN_ACTUALIZAR_HORAS = 72` (`lib/infraestructura/umbrales.ts:20`): una escuela se marca `sinActualizar` si su última novedad supera 72 h (uso en `agregar.ts:44`).

### 2.3 Modelo de riesgo estimado (motor v0.2)

Versión: `MOTOR_VERSION = 'motor-v0.2'` (`lib/infraestructura/riesgo/motor/config.ts:6`). Cualquier cambio de peso o umbral exige subirla (comentario en `config.ts:1-5`).

**Escala de nivel** (`config.ts:10-12`, clasificación en `calculo.ts:96-101`):

```ts
// score < 25 → bajo; 25 ≤ score < 50 → moderado; 50 ≤ score < 75 → alto; ≥ 75 → muy_alto
export const UMBRAL_MODERADO = 25
export const UMBRAL_ALTO = 50
export const UMBRAL_MUY_ALTO = 75
```

**Peligro por celda** (`config.ts:41-50`): mapeo fijo a 0..100:

| Nivel | Valor |
|---|---|
| verde | 0 |
| amarillo | 33 |
| naranja | 66 |
| rojo | 100 |
| sin_dato | `null` (nunca se trata como 0) |

**Amenaza** (`config.ts:19-23`; cálculo `calculo.ts:175-273`):

```ts
PESOS_AMENAZA = { peligroCelda: 0.5, caudal: 0.3, lluviaAntecedente: 0.2 }
```

- Peligro por celda: nivel del horizonte elegido (24, 72 o 240 h) convertido con la tabla anterior. Si el método fue `umbral_provisorio`, cuenta como faltante a efectos de confianza (`calculo.ts:208`).
- Caudal en el punto de río asociado: mismo mapeo, sólo si la escuela tiene `puntoRioId` (`calculo.ts:219-243`).
- Lluvia antecedente (`calculo.ts:251`): `valor = clamp0a100((mm / LLUVIA_72H_SATURACION_MM) * 100)` con `LLUVIA_72H_SATURACION_MM = 150` (`config.ts:56`). Para horizonte 24 usa `acumuladoMm24h`; para 72 y 240 usa `acumuladoMm72h` (no hay acumulado de más largo plazo, comentario en `calculo.ts:245-248`).
- Cierre de la dimensión (`cerrarDimension`, `calculo.ts:39-52`): si falta un componente, su peso se **redistribuye** entre los presentes (`pesoNormalizado = pesoBase / sumaPesos`); nunca se imputa 0. Sin componentes devuelve `null`.

**Vulnerabilidad** (`config.ts:36-39`; `calculo.ts:284-349`):

```ts
PESOS_VULNERABILIDAD = { historial: 0.7, susceptibilidad: 0.3 }
```

- Historial (`calculo.ts:284-288`), promedio de tres términos saturados a 100:

```ts
scoreHistorialCrudo = (
  min(100, cantidad / HISTORIAL_TOPE_CANTIDAD * 100) +        // tope 5
  min(100, duracionHoras / HISTORIAL_TOPE_DURACION_HORAS * 100) +  // tope 24*30 = 720 h
  min(100, accesoInterrumpido / HISTORIAL_TOPE_ACCESO_INTERRUMPIDO * 100)  // tope 3
) / 3
```

  Ventana: `VENTANA_HISTORIAL_DIAS = 365` (`config.ts:61`). Sólo cuentan antecedentes con `rigeDesde <= asOf`; la duración se corta en `asOf` si la retirada es posterior o nula (`calculo.ts:72-94`). La comparación temporal es numérica (`Date.parse`).
- Susceptibilidad (physrisk, `calculo.ts:323-349`): promedio de los indicadores del catálogo × 100, acotado a 0..100. Un catálogo vacío cuenta como ausencia.
- Score de vulnerabilidad: `cerrarDimension` con los dos componentes (`calculo.ts:374`). El historial siempre está presente, por lo que la dimensión nunca es `null`.

**Aislamiento OSM salió de vulnerabilidad** en `motor-v0.2` (comentario `config.ts:29-35`). Ahora alimenta sólo la dimensión de riesgo de acceso (ver 2.5).

**Score de riesgo y confianza** (`calculo.ts:378-393`):

```ts
evidenciaValida = scoreAmenaza !== null
scoreRiesgo = clamp0a100(Math.round((scoreAmenaza * scoreVulnerabilidad) / 100))  // producto 0..100
nivelRiesgo = clasificarNivel(scoreRiesgo)
```

Confianza:

- `baja` si no hay evidencia de amenaza.
- `alta` si `cantidadFaltantes === 0`.
- `media` si `cantidadFaltantes <= CONFIANZA_MEDIA_MAX_FALTANTES` (= 1, `config.ts:74`).
- `baja` en otro caso.

Faltantes contados: peligro celda, caudal, lluvia, aislamiento, susceptibilidad, y los provisorios (2.4).

**Validez** (`calculo.ts:445`): `validoHasta` es el más temprano de los `validoHasta` de peligro/caudal usados; si no hubo ninguno, es `asOf`.

**Exposición y urgencia** no entran en el score: exposición es matrícula y secciones (`calculo.ts:396-409`); urgencia está fuera de alcance en v0 (`calculo.ts:411-424`, `horasDesdeUltimaVerificacion: null`).

Observación: el comentario de `config.ts:17-18` cita `normalizarPesos()` en `motor/calculo.ts`, pero la función real es `cerrarDimension`. Es un comentario desactualizado.

### 2.4 Peligro: umbrales provisorios y ensemble

Hay tres vías para el nivel de peligro de una celda, con prioridad implícita por método:

1. **Percentiles de climatología** (método `percentiles`, `lib/infraestructura/riesgo/peligro/nivel.ts:103-113`): estrictos (igualar un percentil no lo supera).

```ts
if (mm > p99) return 'rojo'      // P99
if (mm > p95) return 'naranja'   // P95
if (mm > p90) return 'amarillo'  // P90
return 'verde'
```

2. **Ensemble** (`nivel.ts:88-92`, `nivelDesdeEnsemble`): probabilidad de superar P99 ≥ 0.5 → rojo; P95 ≥ 0.5 → naranja; P95 > 0.1 → amarillo. Son decisiones de umbral, no leyes físicas (comentario en `nivel.ts:80-83`).

3. **Umbral provisorio** (`lib/infraestructura/riesgo/peligro/umbrales-provisorios.ts`, versión `umbrales-provisorios-v0.1`): sólo mientras no exista climatología completa para la celda. No se mezcla con percentiles.

| Horizonte | Amarillo | Naranja | Rojo | mm |
|---|---|---|---|---|
| 24 h | 50 | 80 | 120 | explícitos |
| 72 h | 80 | 120 | 180 | `UMBRALES_72H` |
| 240 h | 120 | 180 | 270 | 72 h × `ESCALA_240H = 1.5` |

Regla estricta (`>`). El propio archivo advierte que son "decisión razonable de arranque, NO un umbral oficial".

**Percentil aproximado** para la ficha (`nivel.ts:130-136`): grueso, sin interpolación entre P90, P95 y P99.

### 2.5 Riesgo de acceso (dimensión separada)

Versión: `REGLA_ACCESO_VERSION = 'acceso-v1'` (`config.ts:81`). Es independiente de `MOTOR_VERSION` y **nunca** entra en `scoreRiesgo` ni en `scoreVulnerabilidad` (`calculo.ts:351-355`).

**Base por nivel de aislamiento** (`config.ts:89-94`):

| Nivel OSM | Base |
|---|---|
| 0 | 0 |
| 1 | 20 |
| 2 | 45 |
| 3 | 70 |

**Agravantes aditivos** (`config.ts:100-114`, aplicación en `riesgo-acceso.ts:103-126`):

| Agravante | Puntos | Condición |
|---|---|---|
| `cruceDeRiesgo` | +25 | Cruce de agua sin puente/vado conocido (`hayCruceDeRiesgo`, `riesgo-acceso.ts:37-55`: hay vado, o puente desconocido, o falta puente) |
| `peligroAlto` | +25 | Peligro celda o caudal ≥ 66 (`UMBRAL_PELIGRO_ALTO = 66`, `riesgo-acceso.ts:35`; naranja o rojo) |
| `sinAlternativa` | +15 | `tieneAlternativaSinCruce === false` |
| `alternativaDesconocida` | +20 | `tieneAlternativaSinCruce === null` (mutuamente excluyente con la anterior; un dato faltante nunca abarata el riesgo) |
| `accesoInterrumpido` | +15 | Antecedentes confirmados con motivo "Acceso interrumpido" > 0 |

Cierre: `score = clamp(round(score), 0, 100)` (`riesgo-acceso.ts:126`). Clasificación con los mismos umbrales 25/50 (`riesgo-acceso.ts:65-66`; el tramo `>= 75` se resuelve con el mismo patrón, no se revisó la línea exacta). Si el aislamiento es `null` o `sin_datos_red`, el resultado es `null`, nunca `bajo`.

### 2.6 Aislamiento geo-static (job G1, versión 4)

Código: `services/geo-static/src/geo_static/jobs/calcular_aislamiento.py` y `services/geo-static/src/geo_static/osm_aislamiento.py`.

**Versión del job.** `VERSION_JOB = "4"` (`jobs/calcular_aislamiento.py:59`). El comentario de la línea 58 la describe como "vados probables, distancia real a la red pavimentada y nivel 0 <= 2 km". Los CSV y NDJSON de salida se nombran `aislamiento_osm-v{VERSION_JOB}-{fecha}.csv` y `accesos_osm_geometria-v{VERSION_JOB}-{fecha}.ndjson.gz` (líneas 219, 292, 697). Extracto OSM fijado: `FECHA_EXTRACTO_OSM = "2026-09-26"` (línea 85).

**Importación y selección de versión** (TypeScript):

- `scripts/importar-geo-static.mjs` hace upsert con clave `[cueAnexo, versionJob]` (líneas ~236 y ~395).
- `lib/infraestructura/riesgo/motor/adaptadores/aislamiento.ts`: gana la fila con mayor `importadoEn`; ante empate, mayor `versionJob`. La comparación de `versionJob` es numérica cuando ambos valores son numéricos, para que `'10' > '9'` (líneas ~36-57).
- `nivelDeFila` (líneas 72-77): sólo acepta enteros 0..3; cualquier otro valor se trata como dato corrupto y no como nivel.

**Constantes de geometría y umbrales** (`osm_aislamiento.py`):

| Constante | Valor | Línea |
|---|---|---|
| `UMBRAL_SNAP_SIN_CONEXION_M` | 5000 m | 143 |
| `UMBRAL_VIA_PAVIMENTADA_CERCANA_M` | 10 000 m | 144 |
| `UMBRAL_DISTANCIA_RED_PAVIMENTADA_NIVEL0_M` | 2000 m | 145 |
| `UMBRAL_VIA_NO_ALCANZABLE_M` | 30 000 m | 146 |
| `UMBRAL_KM_SIN_PAVIMENTAR_NIVEL0` | 2.0 km | 147 |
| `UMBRAL_KM_SIN_PAVIMENTAR_NIVEL2` | 15.0 km | 148 |
| `METROS_NUCLEO_URBANO_DESTINO` | 1000 m | 149 |
| `TOLERANCIA_DEDUP_CRUCE_M` | 30 m | 433 |
| `TOLERANCIA_FORD_M` | 25 m | 441 |

Las longitudes de tramos sin pavimentar excluyen los últimos 1000 m antes del destino (comentario en `osm_aislamiento.py:~128-134`).

**Costo de ruteo** (`asignar_costo`, `osm_aislamiento.py:167-181`):

```python
factor = FACTOR_VIA.get(highway, 3.0)        # tipos desconocidos: 3.0
if highway != "track" and surface in SUPERFICIES_NO_PAVIMENTADAS:
    factor *= 1.5
datos["costo"] = length * factor
```

`FACTOR_VIA` (líneas 154-165): motorway, trunk, primary = 1.0; secondary = 1.2; tertiary = 1.5; unclassified y residential = 2.0; track y service = 3.0. `length` se conserva para distancias físicas.

**Cruces de agua y vados.**

- Clasificación de cruce (`clasificar_cruce`, líneas 451-463): `puente` gana sobre `ford`; luego `vado` si hay `ford=yes`; luego `vado_probable`; si no, `sin_evidencia`.
- Vado explícito: tag `ford=yes` en la arista o un nodo `ford=yes` a menos de `TOLERANCIA_FORD_M = 25` m del cruce (comentario en líneas 435-441).
- Vado probable (líneas ~1069-1074): cruce sin ford explícito, sin puente, sin túnel, y sobre un tramo sin pavimentar.

**Índice de aislamiento 0..3** (`calcular_indice_aislamiento`, `osm_aislamiento.py:502` en adelante). Orden de evaluación:

1. Si falta alguno de `tramos_sin_pavimentar_count`, `cruces_agua_con_puente_count` o `cruces_agua_con_vado_count`, devuelve `None` (nunca asume "seguro").
2. Si hay al menos un vado: **nivel 2** si hay alternativa sin cruce, **nivel 3** si no.
3. Si no hay distancia a pavimento: `None`.
4. Distancia contra la localidad (cabecera departamental si existe; si no, la distancia al pavimento). Si supera `30 000 m`: **nivel 3**.
5. **Nivel 2** si `tramos_sin_pavimentar_km >= 15` y no hay alternativa pavimentada, o si no hay km y `tramos_sin_pavimentar_count >= 5` sin alternativa sin cruce.
6. **Nivel 0** si no hay vados, la distancia al pavimento es `<= 2000 m`, la localidad está a `<= 10 000 m`, y los tramos sin pavimentar son `<= 2 km` (o `<= 1` tramo si no hay km).
7. **Nivel 1** en cualquier otro caso (alternativa pavimentada, alternativa sin cruce, o residual).

Observación para revisar: el paso 5 con km usa `tiene_alternativa_pavimentada`, mientras que el paso sin km usa `tiene_alternativa_sin_cruce`. Es posible que sea intencional, pero no lo documenta el código.

**Aislamiento a escuela (`null` vs `sin_datos_red`)**: el adaptador TS distingue la ausencia de fila (`null`) de `sin_datos_red` (fila existe pero la ruta no se pudo calcular). Ambas son ausencia y no cuentan como 0.

### 2.7 Peligro de inundación (JRC, v2) y márgenes

- `services/geo-static/src/geo_static/jobs/calcular_inundacion_v2.py:28`: `VERSION_JOB = "1"`. Salida `inundacion_v2-v{VERSION_JOB}-{fecha}.csv` (línea 99).
- Fuente: JRC Global River Flood Hazard Maps v2.1 (línea 29).
- Clasificación de río (`services/geo-static/src/geo_static/clase_inundacion_v2.py`, `clasificar_rio`, líneas 40-64): un periodo de retorno "alcanza" el río si su profundidad es `>= UMBRAL_PROFUNDIDAD_M`. Requiere RP10, RP100 y RP500 presentes; si falta alguno, la clase es `sin_dato`. Los valores exactos del umbral no se verificaron.
- Periodos de retorno de la fuente: `PERIODOS_RETORNO = (10, 20, 50, 75, 100, 200, 500)` (`fuentes_inundacion.py:37`).
- Márgenes por RP: `RPS_MARGEN = (10, 100, 500)` (`services/geo-static/src/geo_static/margen_inundacion.py:37`), con DEM Copernicus GLO-30 (`lector_laguna.py:41`).
- Laguna/cuerpos de agua: lectura GSW, `NODATA_GSW = 255` (`fuentes_inundacion.py:50`).

### 2.8 Lluvia y umbrales de peligro (resumen)

| Dato | Valor | Dónde |
|---|---|---|
| Saturación de lluvia 72 h | 150 mm → 100 | `config.ts:56` |
| Umbrales provisorios 72 h | 80 / 120 / 180 mm | `umbrales-provisorios.ts` |
| Umbral peligro alto para acceso | nivel ≥ 66 (naranja) | `riesgo-acceso.ts:35` |
| Umbrales de score | 25 / 50 / 75 | `config.ts:10-12` |

### 2.9 Hallazgos y puntos a verificar

1. **Dos criterios de afectación** (`estado` en totales vs `gravedad > 0` en `agrupar`) y dos precisiones de porcentaje (1 decimal vs entero). Requiere confirmar equivalencia en `enriquecer.ts`.
2. **Comentario obsoleto** en `motor/config.ts:17-18` (`normalizarPesos()` no existe; la función es `cerrarDimension`).
3. **Confianza**: el peligro provisorio cuenta como faltante, lo que baja la confianza un escalón. Está documentado en `calculo.ts:204-208`.
4. **Asimetría en `calcular_indice_aislamiento`** entre el paso 5 con y sin km (ver 2.6).
5. **Aislamiento es ausencia, no riesgo bajo**: `null` y `sin_datos_red` nunca se leen como 0 ni como `bajo`, en el motor (`riesgo-acceso.ts:83-88`) y en el adaptador.
6. **Versiones**: cualquier cambio de pesos o umbrales en `motor/config.ts` exige subir `MOTOR_VERSION`; cambios en agravantes o base de acceso exigen `REGLA_ACCESO_VERSION`; cambios de algoritmo de aislamiento exigen subir `VERSION_JOB` (actualmente `"4"`).
7. **Umbral de lluvia y umbrales de peligro provisorios** son valores de arranque; el propio código los declara no calibrados.

### 2.10 No verificado en esta pasada

- Detalle de `mapa/enriquecer.ts` (origen de `gravedad` por escuela).
- Valor exacto de `UMBRAL_PROFUNDIDAD_M` en `clase_inundacion_v2.py`.
- Lógica de la capa de radar meteorológico (`riesgo/radar-meteo/*`) y de la climatología ERA5 (`riesgo/jobs/calcular-climatologia.ts`).
- Qué componente visual consume `scoreRiesgo` frente a `estado`.


## 3. Flujo de datos hasta la UI

Ruta de referencia: `/mapas/infraestructura` (repo `inundacion-modelo`, worktree de solo lectura salvo este archivo). Todas las rutas de archivo son relativas a la raíz del repo.

### 3.1 Resumen del flujo

```
Postgres (o PGlite en dev)            lib/db/driver.ts
  tablas infra_* (públicas) + schema ge (padrón, secciones, localizaciones)
        │
        ▼
Funciones de consulta (lib/infraestructura/parte-mapa.ts, totales-mapa.ts, territorio-mapa.ts)
        │
        ▼
Route handlers GET /api/mapas/infraestructura/*  (app/api/mapas/infraestructura/**)
   - ensureSeeded + verificarAccesoLectura (ACL) + jsonComprimido
        │  polling cada 15 s (escuelas, partes, totales) / una sola vez (territorio)
        ▼
Hooks cliente (lib/infraestructura/use-*.ts) sobre usePollingMapa
        │
        ▼
Contenedor de pestañas (app/(hub)/mapas/infraestructura/map-client.tsx)
   - estado de pestaña (hash), filtros, búsqueda en chips, padrón filtrado
        │
        ├── Estadísticas / Metodología (fuera del mapa, mismo padrón filtrado)
        ▼
MapInfraestructuraPage (components/mapas/map-infraestructura-page.tsx, cargado con next/dynamic ssr:false)
   - MapGL (MapLibre): fuentes GeoJSON y capas
   - Paneles laterales: situación actual, radar, planificación, ficha, capas
```

### 3.2 Entrada de servidor: página y flags

- `app/(hub)/mapas/infraestructura/page.tsx`
  - Línea 17: `export default async function InfraestructuraMapRoute()`.
  - Línea 18: `ensureSeeded()`; líneas 19-20: sesión (`getSessionUser`) con redirección a `/login`.
  - Línea 21: `loadRecursoAccessByRuta('/mapas/infraestructura')` y `puedeAbrir` (ACL por recurso); si falla, redirige a `/forbidden`.
  - Línea 23: `puedeVerNominal` decide si se muestra el enlace nominal.
  - Líneas 26-28: se pasan como props al cliente `hazardContextEnabled()`, `riskRadarEnabled()` y `seasonalEnabled()`. Son los únicos flags que llegan al mapa.
- `lib/infraestructura/riesgo/flags.ts` es la única fuente de lectura de flags del motor de riesgo (comentario de cabecera).
  - Línea 19: `riskRadarEnabled()` lee `RISK_RADAR_ENABLED`.
  - Línea 30: `hazardContextEnabled()` lee `HAZARD_CONTEXT_ENABLED` (valor exacto `"true"`). Gobierna solo la UI de contexto territorial (ficha territorial, accesos, vista técnica de fuentes). Las APIs `/territorio`, `/geometria`, `/exposicion-inundacion` existen siempre y están protegidas por ACL; el flag solo oculta en el frontend.
  - Línea 39: `seasonalEnabled()` lee `SEASONAL_ENABLED`; solo muestra la tarjeta de perspectiva estacional en el radar.
  - Línea 59: `listarFlagsOperativas()` enumera el flag en `/admin/operacion`.
- Documentación del flag: `.env.example:60` (comentado, por defecto `false`) y `docs/DEPLOY.md:178`.
- Uso de `HAZARD_CONTEXT_ENABLED` en tests: `lib/infraestructura/riesgo/flags.test.ts`.
- Los tareas ODD (`odd/tasks/inundacion-modelo-v2.md:175`, `odd/tasks/mapa-accesos-territoriales.md:25,60`) indican que la demo requiere `HAZARD_CONTEXT_ENABLED=true`.

### 3.3 Cliente de pestañas: `map-client.tsx`

- Carga diferida: línea 16-22, `dynamic(cargarMapa, { ssr: false })` sobre `components/mapas/map-infraestructura-page`. Línea 26-28 precarga el chunk en el cliente.
- Línea 36: `tab` (`useState<PestanaMapa>`), valor inicial `'actual'`.
- Línea 44: `useEscuelasMapa()` obtiene el padrón completo con partes (`/api/mapas/infraestructura/escuelas`).
- Líneas 45-47: `filtrarEscuelas(padron.escuelas, filtros)` aplica los filtros en memoria. Líneas 49-52 construyen `escuelasMapa` (padrón filtrado) que se pasa al mapa.
- Línea 67 (`onTab`): resuelve la pestaña con `resolverPestana` y escribe `window.location.hash`. Líneas 80-89: `hashchange` sincroniza la pestaña con la URL, así se pueden compartir enlaces como `#evolucion`.
- Pestañas (líneas 106-125):
  - `actual` ("Situación actual", con contador de escuelas con situaciones abiertas, `cantidadConReporte`).
  - `radar` (línea 121): solo si `props.riskRadarEnabled`.
  - `planificacion`, `estadisticas`, `capas`, `metodologia`.
- Línea 128: `<FiltrosChips>` (barra de búsqueda y filtros, ver 3.6).
- Línea 150: `<MapInfraestructuraPage>` recibe `pestana`, `panel`, `escuelasMapa`, `hazardContextEnabled`, `riskRadarEnabled`, `seasonalEnabled`, `mostrarEnlaceNominal`, `contenedorPantallaCompleta`.
- Regla de montaje (comentario en líneas 136-148): el mapa no se desmonta al cambiar de pestaña; se oculta con el atributo `hidden`, para conservar el encuadre y el basemap.
- Líneas 164-170: `PanelEstadisticas` recibe `escuelasFiltradas` y `filtros` (no hace una petición propia). Línea 178: `MetodologiaInundacion`.

Resolución de pestañas: `lib/infraestructura/mapa/pestanas.ts`
- Líneas 3-5: `pestanaDeMapa` convierte `capas` en `actual` para el mapa (el panel de capas vive en el panel lateral del mapa).
- Líneas 7-8: `VALIDAS` y alias `operativa -> actual`, `evolucion -> estadisticas`.
- Líneas 12-27: `resolverPestana`. Sin hash válido cae a `actual`; `radar` sin flag cae a `actual`; `?modo=radar` sin hash abre radar si está habilitado.
- Tipo: `lib/infraestructura/mapa/tipos.ts:3` (`PestanaMapa`).

### 3.4 Hooks de datos y polling

- `lib/infraestructura/use-polling-mapa.ts`
  - Línea 5: `INTERVALO_POLLING_MS = 15000`.
  - Línea 7: `usePollingMapa<T>(ruta, mensajeError)`. Hace `fetch` con `cache: 'no-cache'`, compara el JSON anterior y conserva la identidad del objeto si no cambió. Se pausa cuando la pestaña está oculta (`document.hidden`) y se reanuda al volver.
- Hooks que usan el polling:
  - `use-escuelas-mapa.ts:8` → `/api/mapas/infraestructura/escuelas` (padrón con partes; línea 5 define la ruta).
  - `use-alertas.ts:14` → `/api/mapas/infraestructura` (lista de partes vigentes, uno por escuela; línea 6).
  - `use-totales-mapa.ts:8` → `/api/mapas/infraestructura/totales` (línea 6).
- Hooks sin polling (una sola carga):
  - `use-territorio-mapa.ts:19` → `/api/mapas/infraestructura/territorio` (línea 6). Solo se dispara cuando `habilitado` pasa a `true` (líneas 15-17 y 33). Con `HAZARD_CONTEXT_ENABLED` apagado no se hace ninguna petición.
  - `use-geometria-acceso.ts` → `/api/mapas/infraestructura/accesos/{cue}/geometria`. Se activa con `contextoTerritorial && cueRuta !== null` (`components/mapas/map-infraestructura-page.tsx:1093`).
  - `use-exposicion-ruta.ts` → `/accesos/{cue}/exposicion-inundacion`, misma condición (línea 1097).
  - `use-ficha-parte.ts` → `/parte?cue=` e `/historial?cue=` (líneas 93 y 111), al abrir la ficha.
- Hook de radar: `lib/infraestructura/use-radar.ts` (línea 754 en el componente de mapa), solo en modo radar.

### 3.5 Rutas API y consultas

Patrón común: `lib/infraestructura/mapa-ruta.ts`
- Línea 5: `crearGetMapaInfraestructura(listar)`.
- Línea 8: `ensureSeeded()` antes del ACL (comentario explícito: el orden lo requieren rutas existentes).
- Línea 10: `verificarAccesoLectura()` (`lib/infraestructura/acceso-lectura.ts:10`). Devuelve 401 o 403.
- Respuesta: `jsonComprimido` con `Cache-Control: private, no-cache`.

Rutas (todas `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`):

| Ruta | Archivo | Función de datos |
|---|---|---|
| `GET /api/mapas/infraestructura` | `app/api/mapas/infraestructura/route.ts` | `listarPartesVigentes()` (`lib/infraestructura/parte-mapa.ts:350`) |
| `GET /escuelas` | `.../escuelas/route.ts` | `listarEscuelasMapaEnriquecidas()` (`parte-mapa.ts:698`) |
| `GET /totales` | `.../totales/route.ts` | `obtenerTotalesMapa()` (`lib/infraestructura/totales-mapa.ts:37`) |
| `GET /territorio` | `.../territorio/route.ts` | `cargarTerritorioMapa()` (`lib/infraestructura/territorio-mapa.ts:280`); ACL primero, luego `ensureSeeded` |
| `GET /accesos/[cueAnexo]/geometria` | `.../accesos/[cueAnexo]/geometria/route.ts` | `obtenerGeometriaAcceso()` (`territorio-mapa.ts:352`) |
| `GET /accesos/[cueAnexo]/exposicion-inundacion` | `.../exposicion-inundacion/route.ts` | `lib/infraestructura/exposicion-ruta.ts` |
| `GET /parte?cue=` | `.../parte/route.ts` | `lib/infraestructura/parte-consulta.ts` (ficha) |
| `GET /historial?cue=` | `.../historial/route.ts` | ficha / historial del parte |
| `GET /nominal` | `.../nominal/route.ts` | nominal (modal de alcance, `identidad.ts`, permiso `permiso-nominal.ts`) |
| `GET /evolucion` | `.../evolucion/route.ts` | `lib/infraestructura/evolucion.ts` (comentario en línea 15) |

Consultas principales (`lib/infraestructura/parte-mapa.ts`):

- `listarEscuelasMapa` (línea 631):
  - Padrón base sin período ni corte: `cargarPadronEscuelas` (línea 573) sobre `ge.ge_localizacion`. Filtros posibles: `territorio` (departamento sin acentos o localidad), `cueAnexo`, `nivel` (requiere corte vigente y `EXISTS` sobre `ge.ge_seccion`).
  - Luego llama a `listarPartesVigentes(filtros)` y cruza por CUE. Estado: `afectada` si tiene parte, `sin_afectacion_reportada` si no (líneas 657-680). Las escuelas sin lat/lon van a `sinUbicacion`.
- `listarEscuelasMapaEnriquecidas` (línea 698): agrega conteos de situaciones abiertas (`infra_afectacion` JOIN `infra_parte`, excluye `cierre = 'retirada'`) y de solucionadas recientes (ventana `VENTANA_CAUSA_DIAS`).
- `listarPartesVigentes` (línea 350): resuelve período y corte vigentes (`obtenerPeriodoVigente`, `getCorteVigente`), luego `cargarPartes` (línea 189, con `filtros`), y en paralelo `cargarAfectacionesDeVariosPartes` (línea 237), `cargarServicioAlcanceDeVariosPartes` (línea 318) y secciones por CUE. Aplica dedupe y vigencia.
- `obtenerTotalesMapa` (`totales-mapa.ts:37`): llama a `listarEscuelasMapa` una sola vez y agrega en memoria por departamento (`TotalesDepartamento`, línea 9).
- `cargarTerritorioMapa` (`territorio-mapa.ts:280`): capas estáticas de aislamiento OSM y susceptibilidad physrisk de todo el padrón (`construirTerritorioMapa`, línea 200). El comentario indica que nunca devuelve datos nominales.

Esquema de tablas (`lib/db/schema.ts`):
- `infraParte` (línea 296), `infraAfectacion` (324), `infraAfectacionSeccion` (361), `infraAfectacionAlumno` (376), `infraAccesoOsmGeometria` (1202).
- Esquema `ge` (padrón, secciones, localizaciones): nativo de la misma base en Postgres. `asegurarGeAdjuntada` (`lib/infraestructura/impacto.ts:36`) re-ejecuta el DDL idempotente.
- Driver: `lib/db/driver.ts`. `DATABASE_URL` selecciona `postgres`; sin esa variable usa `pglite` (línea 9-13).

Observación de rendimiento: cada ciclo de 15 s lanza `/escuelas`, `/totales` y `/` (partes). `/escuelas` y `/totales` recalculan `listarEscuelasMapa`/`listarPartesVigentes`, y `/` consulta de nuevo los partes. No hay caché compartida entre rutas. Es una observación de lectura, no medida.

### 3.6 Filtros y búsqueda

- Cliente: `components/mapas/filtros-chips.tsx`
  - Línea 188: `FiltrosChips`.
  - Línea 313: `<input type="search">` con placeholder "Buscar escuela o CUE" (línea 320).
  - Filtros en chips con `Popover` por dimensión (departamento, nivel, gravedad, clase, apoyo, sin actualizar, solucionadas recientes), con opciones tomadas de `opcionesDisponibles` y conteos de `contarOpciones` (`lib/infraestructura/mapa/filtrar.ts`).
- Modelo: `lib/infraestructura/mapa/tipos.ts:32` (`FiltrosMapa`), `:43` (`FILTROS_MAPA_VACIOS`).
- Lógica en memoria: `lib/infraestructura/mapa/filtrar.ts:18` (`filtrarEscuelas`). Normaliza acentos y minúsculas; la búsqueda por nombre o por CUE ignora guiones.
- Búsqueda de escuela para seleccionar en el mapa: `components/mapas/map-infraestructura-page.tsx:1276-1278` registra `handleSeleccionarEscuelaBuscada` mediante `onRegistrarSeleccion`; `map-client.tsx:` `seleccionarEscuela` (`map-client.tsx`, función local tras `onTab`; número exacto no verificado) busca por CUE en el padrón y cambia de pestaña si estaba en Estadísticas o Metodología.
- Filtro servidor: `listarPartesVigentes(filtros)` y `cargarPadronEscuelas` aceptan `FiltrosMapa` del servidor (`parte-mapa.ts:41`). El cliente hoy filtra en memoria sobre el padrón completo.
- Búsqueda de escuelas en otros mapas (no es el de infraestructura): `lib/mapas/buscar-escuelas.ts:84`.

### 3.7 Componente del mapa: `components/mapas/map-infraestructura-page.tsx` (2010 líneas)

Entradas (`export default function MapInfraestructuraPage`, línea 595): `pestana`, `panel`, `visible`, `escuelasMapa`, `hazardContextEnabled`, `riskRadarEnabled`, `seasonalEnabled`, `mostrarEnlaceNominal`, `onRegistrarSeleccion`, `contenedorPantallaCompleta`.

Estado y derivados clave:
- Línea 609: si `panel === 'radar'` y el radar está apagado, cae a `actual`.
- Línea 615: `capasVisibles` (`CAPAS_VISIBLES_DEFAULT`, `lib/infraestructura/mapa/capas.ts`).
- Línea 686: `modoRadar = pestana === 'radar' && riskRadarEnabled`.
- Línea 697: `radarActivo = modoRadar`.
- Línea 710: `ocultarPartes = radarActivo || esPlanificacion`. Oculta las capas de escuelas en radar y planificación.
- Línea 784: `contextoTerritorial = hazardContextEnabled` (el flag de la demo).
- Línea 1078: `hazardOn = contextoTerritorial && !modoRadar`. Gobierna las capas de accesos territoriales (línea 1533) y la ruta.
- Datos:
  - Línea 775: `useAlertas()` (partes).
  - Línea 789: `useTerritorioMapa(contextoTerritorial)`.
  - Línea 794: `useTotalesMapa()`.
  - Línea 754: `useRadar` (solo modo radar); línea 698: `useResumenRadarMeteo(radarActivo)`.
  - Línea 801 / 808-809: `filtrarDepartamentoEscuelasMapa` y `construirEscuelasMapaFeatureCollection(escuelas)`, que se convierte en GeoJSON para la fuente de escuelas.
  - Línea 929: `fetch(DEPARTAMENTOS_URL)`.

Fuentes y capas MapLibre (`<MapGL>` en línea 1402):

| Línea | Fuente / capa | Contenido |
|---|---|---|
| 1438 | `NavigationControl` | Zoom y brújula |
| 1442-1443 | `infra-mascara-src` / `CAPA_MASCARA_ID` | Máscara de la provincia (`MASCARA_URL`, `lib/mapas/departamentos.ts:49`) |
| 1453-1484 | `infra-departamentos-src` (`DEPARTAMENTOS_URL`, `departamentos.ts:17`) | Relleno, borde, resaltado del departamento seleccionado y etiqueta (`infra-departamentos-etiqueta`, visibilidad según `capasVisibles.nombresDepartamentos`) |
| 1496-1502 | `infra-peligro-src` (solo radar) | Capas de peligro, `lib/mapas/peligro-capas.ts` |
| 1514 | `infra-riesgo-acceso-src` | Desactivado (`false &&`) |
| 1533-1545 | `hazardOn` | Capas de accesos territoriales (`AccesosCapas`, `lib/mapas/accesos-capas.ts`) |
| 1548-1593 | `infra-partes-src` (`featureCollectionPadron`) | Capa de puntos `CAPA_PARTES_ID` con clusters |
| 1615-1645 | Iconos por escuela afectada y solucionada | `iconosClusterListos` gate |
| 1661-1716 | Clusters de evacuados y centro de evacuados | Filtros `point_count`, `esCentroEvacuados` |
| 1723 | `CapaRiesgoSituacion` | Riesgo de situación (solo pestaña `actual`, línea 838) |
| 1763 | `CapaPuntosNivel` | Puntos de nivel (`lib/infraestructura/mapa/puntos-nivel.ts`) |
| 1771 | `RadarMeteo` | Radar meteorológico |
| 1788, 1808 | `Popup` | Popups de escuela y radar |
| 1840 | `Marker` | Marcadores DOM de riesgo y evacuación |
| 1860-1864 | `LeyendaMapa` | Leyenda por pestaña |
| 2006 | `FullscreenButton` | Pantalla completa sobre `contenedorPantallaCompleta` |

Íconos:
- Íconos de cluster y de badge (SVG de lucide copiados como texto): `lib/mapas/iconos-mapa.ts` (ids en líneas 47-48; `ICONOS_CLUSTER_MAPA` en línea 88).
- Íconos de accesos territoriales: `lib/mapas/accesos-capas.ts:338` (`ICONOS_ACCESOS_MAPA`).
- Registro en el estilo: `registrarIconosCluster` (líneas 1324-1337) llama a `cargarIconoEnMapa` (línea 504, convierte SVG a imagen con `map.addImage`) y marca `iconosClusterListos`. Se llama en `handleMapLoad` (línea 1339) y en cada `styledata`.
- Ícono por punto según estado: `lib/infraestructura/mapa/punto.ts:8` (`iconoPunto`).
- Color por severidad: `colorPorSeveridadRango` (línea 367) y `lib/infraestructura/severidad.ts` (`colorSeveridad`). Escuelas sin afectación: `COLOR_SIN_AFECTACION = '#8a8886'` (`lib/mapas/construir-escuelas-mapa-feature-collection.ts:25`).
- El componente importa de `lucide-react` (bloque de import que termina en la línea 57). El comentario de la línea 884 indica "un ícono lucide por punto" para el badge de estado; no revisé el cuerpo de esa lógica.
- Preferencia de diseño registrada en memoria del usuario: íconos lucide, sin anillos ni círculos grises (`map-icons-lucide`). No verifiqué su aplicación en el código.

Paneles laterales (`PanelLateral`, línea 1887):
- `actual`: `PanelSituacionActual` (línea 1375).
- `radar`: `PanelRadar` (línea 1950), con pestaña de horizonte.
- `planificacion`: `PanelPlanificacion` (línea 1975).
- `capas`: `PanelCapas` (línea 1989) con `onCapasVisiblesChange={setCapasVisibles}` (línea 1997).
- Ficha de escuela: `FichaEscuelaPanel` (línea 1929) con `BloqueAcceso` (línea 1933), que usa `geometria` y `exposicion` solo cuando `hazardOn`.
- Selección: `SeleccionEscuela` (línea 1894) y `ResumenDepartamento` (línea 1911).
- Modales: `AlcanceNominalModal` (1867) y `HistorialParteModal` (1872).

Estadísticas: no es una capa del mapa. `map-client.tsx:164-170` renderiza `PanelEstadisticas` (`components/mapas/panel-estadisticas.tsx:39`) con el padrón filtrado. Gráficos cargados de forma diferida (comentario en línea 11 de ese archivo).

### 3.8 Flags y comportamiento visible

| Flag | Lectura | Efecto en la UI | Efecto en el servidor |
|---|---|---|---|
| `HAZARD_CONTEXT_ENABLED` | `riesgo/flags.ts:30` | `contextoTerritorial` (mapa l.784), `hazardOn` (l.1078), `useTerritorioMapa` (l.789), ficha territorial y accesos | Ninguno: las APIs de territorio, geometría y exposición siempre responden con ACL |
| `RISK_RADAR_ENABLED` | `riesgo/flags.ts:19` | Pestaña "Radar" (`map-client.tsx:121`), `modoRadar` (mapa l.686), `resolverPestana` | Ninguno en rutas de infraestructura |
| `SEASONAL_ENABLED` | `riesgo/flags.ts:39` | Tarjeta de perspectiva estacional en el radar | Ninguno en el mapa |

La regla de que el flag solo gobierna la UI está escrita en `riesgo/flags.ts:26-29`.

Replay: los documentos ODD (`odd/tasks/mapa-accesos-qa-ux.md:43`, `odd/tasks/mapa-accesos-territoriales.md:25`) dicen que el flag tiene una exclusión de Replay. No encontré esa exclusión en el código revisado (`rg -i replay` sin resultados en `components/mapas`, `app/(hub)/mapas`). Queda sin verificar.

### 3.9 Puntos no verificados y límites

- No se ejecutó la app ni se hicieron llamadas externas (indicación de la tarea).
- `components/mapas/map-infraestructura-page.tsx` tiene 2010 líneas; cubrí los puntos de entrada, fuentes y paneles, no cada expresión de estilo.
- Las consultas SQL de `cargarPartes` y `cargarAfectacionesDeVariosPartes` no se leyeron completas (líneas 189-300 de `parte-mapa.ts`).
- Las rutas `/parte`, `/historial`, `/nominal` y `/evolucion` se citaron por su archivo; no se leyó su cuerpo.
- El panel `PanelEstadisticas` no se leyó en detalle.


