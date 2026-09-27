# ABS1 — Abstracción de proveedores

Estado: **inventario y propuesta, sin implementar**. Este documento es insumo para
un refactor de abstracción de proveedores de las fuentes externas del módulo de
riesgo hidrometeorológico ENOS. No se tocó ningún archivo de código ni se llamó a
ninguna API externa (Open-Meteo, NASA IMERG/CMR, OpenRouter).

Alcance revisado (lectura completa): `tipos-hazard.ts`, `motor/puertos.ts`,
`motor/tipos.ts`, `providers/cliente-http.ts`, `providers/cupo-om.ts`,
`providers/ecmwf.ts`, `providers/flood.ts`, `providers/ensemble.ts`,
`providers/imerg.ts`, `providers/seasonal.ts`, `providers/climatologia.ts`,
`providers/climatologia-caudal.ts`, `jobs/sync-ensemble.ts`, `jobs/sync-imerg.ts`,
`jobs/sync-seasonal.ts`, `jobs/calcular-riesgo.ts`,
`motor/adaptadores/peligro.ts`, `motor/adaptadores/lluvia.ts`,
`riesgo/briefing.ts` y el módulo `briefing-ia/` (E8/OpenRouter).

## Inventario de fuentes y puntos de fetch

Búsqueda con `rg` (no `grep`) sobre `lib/`, `scripts/` y `app/`. Se listan los
puntos de fetch/HTTP real y los constructores de URL por proveedor. Los tests
quedan excluidos: ninguno golpea la red real (inyectan `fetchImpl`).

| Archivo:línea | Proveedor | Adaptador/módulo actual | Tipo |
|---|---|---|---|
| `lib/infraestructura/riesgo/providers/cliente-http.ts:119` | (genérico) | `ejecutarConReintentos` — gateway HTTP compartido de todos los adapters Open-Meteo (timeout/backoff/429/cuarentena) | fetch real |
| `lib/infraestructura/riesgo/providers/cupo-om.ts:521` | Open-Meteo | `construirBaseUrl` arma `https://[customer-]{host}.open-meteo.com` | URL builder |
| `lib/infraestructura/riesgo/providers/ecmwf.ts:249` | Open-Meteo `api` (`/v1/ecmwf`) | `crearProviderEcmwf` / `obtenerPronosticoConDiagnostico` — **implementa `HazardProvider`** | fetch vía cliente-http |
| `lib/infraestructura/riesgo/providers/flood.ts:129` | Open-Meteo `flood-api` (`/v1/flood`) | `obtenerPronosticoConDiagnostico` / `crearProviderFlood` — **implementa `HazardProvider`** | fetch vía cliente-http |
| `lib/infraestructura/riesgo/providers/ensemble.ts:305` | Open-Meteo `ensemble-api` (`/v1/ensemble`) | `obtenerProbabilidadesEnsemble` — función ad hoc, NO implementa `HazardProvider` | fetch vía cliente-http |
| `lib/infraestructura/riesgo/providers/seasonal.ts:331` | Open-Meteo `seasonal-api` (`/v1/seasonal`) | `obtenerTendenciaEstacional` — función ad hoc, NO implementa `HazardProvider` | fetch vía cliente-http |
| `lib/infraestructura/riesgo/providers/climatologia.ts:428` | Open-Meteo `archive-api` (`/v1/archive`, ERA5) | `obtenerSeriesHistoricas` / `obtenerSerieHistorica` — ad hoc, NO `HazardProvider` (offline) | fetch vía cliente-http |
| `lib/infraestructura/riesgo/providers/climatologia-caudal.ts:197` | Open-Meteo `flood-api` (`/v1/flood` histórico, GloFAS) | `obtenerSeriesHistoricasCaudal` — ad hoc, NO `HazardProvider` (offline) | fetch vía cliente-http |
| `lib/infraestructura/riesgo/jobs/sync-imerg.ts:422` | NASA CMR | `urlCmrVentana` + `fetchImpl` directo dentro del job | fetch real |
| `lib/infraestructura/riesgo/jobs/sync-imerg.ts:299` | NASA GES DISC (OPeNDAP ASCII) | `construirUrlSubsetImerg` (helper puro de `providers/imerg.ts`) + `fetchImpl` directo en el job | fetch real |
| `lib/infraestructura/riesgo/providers/imerg.ts:135-136` | NASA GES DISC / OPeNDAP | hosts `data.gesdisc.earthdata.nasa.gov` y `gpm1.gesdisc.eosdis.nasa.gov/opendap/` — constantes de URL, **sin fetch** (parser puro) | URL builder |
| `lib/infraestructura/riesgo/providers/imerg.ts:148` | NASA GES DISC | `construirUrlSubsetImerg` | URL builder |
| `lib/infraestructura/briefing-ia/proveedor-openrouter.ts:160` | OpenRouter | `generarConOpenRouter` — cliente HTTP **propio**, no usa `cliente-http.ts` | fetch real |

Puntos de fetch dentro de `scripts/`: ninguno externo. `scripts/jobs.mjs:254`
sólo reenvía `EARTHDATA_TOKEN` del entorno a `ejecutarSyncImerg` (el job es quien
toca la red). `scripts/jobs.tsx`/`jobs.mjs` orquestan jobs, no fetchean.

Consumidores (quién llama a cada adaptador):

| Job / consumidor | Adaptadores que usa |
|---|---|
| `jobs/sync-pronostico-caudal.ts` | `crearProviderEcmwf` + `crearProviderFloodConDiagnostico` |
| `jobs/sync-ensemble.ts` | `obtenerProbabilidadesEnsemble` |
| `jobs/sync-seasonal.ts` | `obtenerTendenciaEstacional` |
| `jobs/calcular-climatologia.ts` | `obtenerSeriesHistoricas` / `obtenerSerieHistorica` |
| `jobs/calcular-climatologia-caudal.ts` | `obtenerSeriesHistoricasCaudal` |
| `jobs/sync-imerg.ts` | helpers puros de `providers/imerg.ts` + fetch directo (CMR y OPeNDAP) |
| `briefing-ia/generar-briefing-asistido.ts` | `generarConOpenRouter` (inyectable como `generarConIA`) |

Nota de arquitectura: el **núcleo** `motor/calculo.ts` nunca llama a estos
adapters. Consume `PuertosMotor`, y los adapters reales de esos puertos
(`motor/adaptadores/peligro.ts`, `lluvia.ts`, etc.) leen de la **base** (Capa 1 /
`hazard_*`), no de la red. El fetch vive en los jobs de ingesta y en los
providers; el motor v0 sólo ve datos ya persistidos.

## Formas de salida actuales por fuente

### ECMWF determinístico — `providers/ecmwf.ts`

- Implementa `HazardProvider.obtenerPronostico` → `HazardForecastPunto[]`.
- `HazardForecastPunto` (`tipos-hazard.ts`): `variable` ∈
  `{precipitacion, cape, rafagas, temperatura, viento}`, `geometryRef`,
  `corridaEn`/`validoEn` (ISO datetime **sin offset**, se normaliza con `Z`),
  `horizonteHoras` (int), `valor` (number), `unidad` (string), `pasoHoras` (1|3|6,
  derivado del delta real entre timestamps).
- Unidades efectivas: precipitación `mm`, cape `J/kg`, ráfagas/viento `km/h`,
  temperatura `°C`. `pasoHoras` se castea al paso real.
- Ausencia: Open-Meteo puede devolver `null` en el borde; se descarta punto a
  punto (NO se convierte a 0). El fallo por lote no tumba el resto
  (`erroresPorCelda`).

### Flood / GloFAS caudal — `providers/flood.ts`

- Implementa `HazardProvider.obtenerPronostico` → `HazardForecastPunto[]`.
- `variable: 'caudal'`, `geometryRef` = id de `PUNTOS_RIO` (no coordenada),
  `unidad: 'm3/s'` (ASCII), `pasoHoras: 24` (cast documentado: la Flood API es
  diaria y `tipos-hazard.ts` sólo declara 1|3|6; discrepancia aislada acá).
- `corridaEn`/`validoEn` ISO UTC; horizonte derivado de la fecha del día.
- Ausencia: `river_discharge` nullable se saltea por día; NO se imputa 0.
- `mean/max/p75` llegan en el payload pero **no se emiten** como puntos
  (el contrato sólo tiene un `valor` por punto).

### Ensemble probabilístico — `providers/ensemble.ts`

- **NO** implementa `HazardProvider`. Es `obtenerProbabilidadesEnsemble(params)`,
  una función ad hoc con su propia forma de salida.
- Salida `HazardEnsembleProbPunto[]`:
  - `geometryRef`, `variable: 'precipitacion_24h'`,
    `corridaEn`/`validoEn` (ISO UTC), `horizonteHoras`.
  - `miembrosTotal` (51), `miembrosValidos` (0..51).
  - `probabilidadP95` y `probabilidadP99`: **fracción 0..1** (superan / válidos);
    **sin campo `unidad`**. Cuando `miembrosValidos === 0`, hoy devuelve
    `probabilidad: 0` — el llamador debe inferir "sin dato" por
    `miembrosValidos === 0` (ver `contarProbabilidadSuperarUmbral`). Esto es
    exactamente el caso que un puerto normalizado debe modelar como `null`.
  - `dispersion`: desvío estándar poblacional del acumulado (unidad implícita
    `mm`, sin sufijo en el nombre).
- Requiere umbrales p95/p99 de climatología ya calculados (`Map<geometryRef,
  number>`, mm); si falta cualquiera para una celda, la marca
  `'sin_climatologia'` y no emite puntos para esa celda.
- Acumulado 24 h por miembro: si CUALQUIER hora es null, el acumulado de ese
  miembro es null (no se imputa 0).

### NASA GPM IMERG (observación satelital) — `providers/imerg.ts`

- Módulo **puro**: no hace red ni lee token. Sólo parsea/busca/arma URLs.
- Salida `HazardObservationPunto`: `geometryRef`,
  `variable: 'precipitacion_observada_satelital'`, `valor` (mm en la media hora =
  tasa mm/h × 0.5, ver `FACTOR_TASA_A_ACUMULADO_30MIN`), `unidad: 'mm/30min'`,
  `observadoEn`/`validoDesde`/`validoHasta` (ISO UTC del gránulo), `calidad`
  (`precipitationQualityIndex` | null).
- Salida de búsqueda `GranuloImerg`: `{ titulo, inicioEn, finEn, urlDatos }`;
  payload CMR vacío/inesperado ⇒ lista vacía (fuente vencida = estado esperado,
  no error).
- El fetch real (CMR + OPeNDAP ASCII) vive en `jobs/sync-imerg.ts`; el job
  deduplica por celda y persiste en `hazard_observation`.
- En el motor, la lectura de satélite ya está abstraída por
  `PuertoLluviaObservada` / `LluviaObservadaCelda` (`acumuladoMm24h`,
  `acumuladoMm72h` en **mm**; `null` = sin medición, `0` = se midió y no llovió),
  pero ese puerto lee de la **DB**, no del fetch.

### Climatología precipitación (ERA5) — `providers/climatologia.ts`

- **NO** implementa `HazardProvider` (documentado: cálculo offline, no atado al
  "ahora").
- Salida `HazardClimatologiaPunto[]`: `geometryRef`,
  `variable: 'precipitacion_diaria'`, `percentil` ∈ p90|p95|p99, `muestra` ∈
  `todos_los_dias`|`dias_humedos`, `valor` (**mm**), `periodoDesde`/`periodoHasta`
  (strings de fecha).
- `obtenerSeriesHistoricas` devuelve `seriesPorCelda: Record<geometryRef,
  number[]>` (mm/día, sin nulls) + `erroresPorCelda`. Días null de ERA5 se
  descartan (no se imputan 0). Deduplica por celda ERA5 (~0.25°) y trocea período
  por peso de cupo.

### Climatología caudal (GloFAS) — `providers/climatologia-caudal.ts`

- **NO** implementa `HazardProvider`.
- Salida `HazardClimatologiaCaudalPunto[]`: `geometryRef`,
  `variable: 'caudal_diario'`, `percentil` p90|p95|p99, `muestra:
  'todos_los_dias'` (no existe "día húmedo" para caudal), `valor` en caudal con
  `unidad: 'm3s'` (texto sin `³`), período.
- `obtenerSeriesHistoricasCaudal` devuelve `seriesPorPunto` (m³/s) y
  `erroresPorPunto`. Días null se descartan.

### Tendencia estacional (SEAS5/EC46) — `providers/seasonal.ts`

- **NO** implementa `HazardProvider`. Es `obtenerTendenciaEstacional(params)`.
- Salida `EstadisticaEstacionalDepartamento[]`:
  - `departamento` (centroide, NUNCA escuela), `variable:
    'precipitacion_acumulada'`, `emisionEn`/`validoDesde`/`validoHasta` (fechas
    `YYYY-MM-DD`), `horizonteDesdeDias`/`horizonteHastaDias`.
  - `miembrosTotal` (51), `miembrosValidos`.
  - `mediaMm`, `medianaMm`, `dispersionMm` (**mm**, `null` si no hay valores) y
    `probabilidadSobreNormal` (fracción 0..1 **o null**; fracción de miembros
    perturbados válidos que superan al miembro de control).
- Ventana completa: si cualquier día de una serie es null, su acumulado es null
  (no se imputa 0).

### OpenRouter (E8) — `briefing-ia/proveedor-openrouter.ts`

- Salida `ResultadoProveedorIA`: `ok`, `contenido` (texto | null), `tokensEntrada`,
  `tokensSalida`, `costoUsd`, `latenciaMs`, `motivoFallo` ∈
  `sin_api_key|timeout|http_error|null`.
- No usa `cliente-http.ts`: timeout propio (15 s), sin reintentos, sin cupo OM.

## Puertos propuestos

Criterio transversal: **toda unidad explícita en el nombre del campo** (`Mm`,
`Mm3s`…), todo instante en **UTC ISO con `Z`**, y **ausencia explícita** como
`null` / omisión del punto en el arreglo / entrada en un mapa `sinDato`.
**Nunca se imputa `0`**: `0` siempre significa "se midió y fue cero". Cada
método devuelve diagnósticos por clave además de los datos, para no perder el
motivo de las celdas ausentes.

### 1. Pronóstico determinístico — ya existe

No se propone nada nuevo. El contrato del motor es `PuertoPeligro`
(`motor/puertos.ts`), que devuelve niveles derivados, no puntos crudos:

```ts
// EXISTENTE — no se toca
export interface PuertoPeligro {
  obtenerNivelesCelda(params: {
    geometryRef: string
    horizontes: readonly HorizontePeligro[]   // 24 | 72 | 240
    asOf: string                              // ISO UTC estricto (as-of)
  }): Promise<NivelPeligroCelda[]>            // nivel verde..sin_dato; probabilidadP95/P99 fracción|null; precipitacionMm mm|null
  obtenerNivelCaudal(params: { puntoId: string; asOf: string }): Promise<NivelCaudalPunto | null>
}
```

Ausencia ya modelada: `nivel: 'sin_dato'`, probabilidades/`precipitacionMm` en
`null`. En el borde de red sigue vigente `HazardProvider`
(`tipos-hazard.ts`) para los adapters ECMWF/Flood; un refactor puede mantenerlo
como contrato de adaptador y dejar `PuertoPeligro` como contrato de motor.

### 2. Ensemble probabilístico

```ts
export interface PuntoEnsembleProbabilistico {
  geometryRef: string
  variable: 'precipitacion_acumulada'
  corridaEn: string                 // ISO UTC (con Z)
  validoDesde: string               // ISO UTC
  validoHasta: string               // ISO UTC
  horizonteHoras: number
  acumuladoHoras: 24
  miembrosTotal: number
  miembrosValidos: number
  probabilidadSuperaP95: number | null  // fracción 0..1; null si miembrosValidos === 0
  probabilidadSuperaP99: number | null  // fracción 0..1; null si miembrosValidos === 0
  dispersionMm: number | null           // mm; null si miembrosValidos < 2
}

export interface PuertoPronosticoEnsemble {
  obtenerProbabilidades(params: {
    geometryRefs: string[]
    asOf: string                              // ISO UTC
    umbralesP95Mm: ReadonlyMap<string, number> // mm, climatología ya resuelta
    umbralesP99Mm: ReadonlyMap<string, number> // mm
  }): Promise<{
    puntos: PuntoEnsembleProbabilistico[]
    sinDato: Record<string, string>           // geometryRef -> motivo ('sin_climatologia', 'sin_miembros', ...)
  }>
}
```

Ausencia: `miembrosValidos === 0` ⇒ probabilidades `null` y entrada en
`sinDato` (NO `0`, que significa "0% de superar el umbral"). Falta de
climatología ⇒ celda en `sinDato`, sin punto. Normaliza la discrepancia actual
de `probabilidadP95/P99 = 0` cuando no hay miembros.

### 3. Observación satelital (IMERG)

```ts
export interface GranuloSatelital {
  id: string
  inicioEn: string   // ISO UTC
  finEn: string      // ISO UTC
  urlDatos: string
}

export interface ObservacionPrecipitacionCelda {
  geometryRef: string
  variable: 'precipitacion_observada_satelital'
  valorMm: number      // mm acumulados en la ventana del gránulo (30 min)
  observadoEn: string  // ISO UTC (inicio del gránulo)
  ventanaDesde: string // ISO UTC
  ventanaHasta: string // ISO UTC
  calidad: number | null  // precipitationQualityIndex; null = el producto no lo trajo
}

export interface PuertoObservacionSatelital {
  listarGranulos(params: { desde: string; hasta: string }): Promise<GranuloSatelital[]>
  obtenerObservacion(params: {
    granulo: GranuloSatelital
  }): Promise<{
    observaciones: ObservacionPrecipitacionCelda[]
    celdasSinDato: string[]   // celdas del subset sin valor válido
  }>
}
```

Ausencia: sin gránulos ⇒ `listarGranulos` devuelve `[]` (fuente vencida, estado
esperado, no error). Una celda sin medición se **omite** del arreglo (nunca
`0`); `calidad` null es distinto de "calidad 0". Este puerto es de **ingesta**;
NO reemplaza a `PuertoLluviaObservada`, que es la lectura del motor sobre la DB
y ya está normalizada en mm de 24/72 h.

### 4. Climatología (precipitación y caudal)

```ts
export type VariableClimatologia = 'precipitacion_diaria' | 'caudal_diario'

export interface PuntoClimatologiaNormalizado {
  geometryRef: string
  variable: VariableClimatologia
  percentil: 'p90' | 'p95' | 'p99'
  muestra: 'todos_los_dias' | 'dias_humedos'   // dias_humedos sólo aplica a precipitación
  valor: number
  unidad: 'mm' | 'm3/s'   // caudal deja de usar el texto 'm3s'
  periodoDesde: string    // YYYY-MM-DD
  periodoHasta: string
}

export interface PuertoClimatologia {
  obtenerSeries(params: {
    puntos: Array<{ geometryRef: string; lat: number; lon: number }>
    variable: VariableClimatologia
    periodoDesde: string
    periodoHasta: string
  }): Promise<{
    seriesPorClave: Record<string, number[]>  // mm/día o m3/s; días null OMITIDOS, nunca 0
    sinDato: Record<string, { motivo: string; detalle: string }>
  }>
}
```

Los percentiles siguen siendo función pura (`calcularPercentiles*`) sobre las
series que devuelve el puerto; el puerto no los calcula. Ausencia: serie vacía ⇒
clave en `sinDato` y **no se emiten filas** de percentil para esa celda/muestra
(hoy ya es el comportamiento: sin muestra no hay filas).

### 5. Tendencia estacional

```ts
export interface EstadisticaEstacionalNormalizada {
  departamento: string
  variable: 'precipitacion_acumulada'
  emisionEn: string          // ISO UTC
  validoDesde: string        // ISO UTC
  validoHasta: string        // ISO UTC
  horizonteDesdeDias: number
  horizonteHastaDias: number
  miembrosTotal: number
  miembrosValidos: number
  mediaMm: number | null
  medianaMm: number | null
  dispersionMm: number | null
  probabilidadSobreNormal: number | null  // fracción 0..1; null si falta control o no hay perturbados válidos
}

export interface PuertoTendenciaEstacional {
  obtenerTendencia(params: {
    centroides: Array<{ departamento: string; lat: number; lon: number }>
    emisionEn: string          // ISO UTC
    horizonteDesdeDias: number
    horizonteHastaDias: number
  }): Promise<{
    estadisticas: EstadisticaEstacionalNormalizada[]
    sinDato: Record<string, string>   // departamento -> motivo
  }>
}
```

Ausencia: si cualquier día de la ventana es null, los acumulados de ese miembro
son null y `mediaMm`/`medianaMm`/`dispersionMm` pueden quedar `null`;
`probabilidadSobreNormal` es `null` si falta el miembro de control o no hay
perturbados válidos (nunca `0`).

### ¿Sumar a `PuertosMotor` o dejarlos independientes?

**Decisión: puertos independientes, consumidos por los jobs de ingesta.** No se
tocan `PuertosMotor` ni `motor/calculo.ts`.

Justificación:

1. `motor/puertos.ts` documenta explícitamente que ampliar `PuertosMotor` es una
   decisión de contrato que N3 no puede tomar sin ask a N1. Agregar cuatro
   puertos de ingesta cambiaría la forma de inyección del núcleo, que hoy tiene
   siete campos con semántica cerrada.
2. **Preservar el comportamiento observable del motor v0**: `calcular-riesgo.ts`
   y `calculo.ts` no consumen ensemble/climatología/seasonal hoy; los consumen
   `sync-ensemble.ts`, `sync-imerg.ts`, `sync-seasonal.ts` y los jobs de
   climatología, que persisten en `hazard_*` y el motor lee de ahí. Moverlos al
   núcleo cambiaría el flujo DB→motor por red→motor y rompería la garantía
   as-of/backtest y la pureza del núcleo.
3. `PuertoPeligro` y `PuertoLluviaObservada` ya son la frontera del motor y
   siguen siendo suficientes; los nuevos puertos son de **ingesta** y se
   cablean en los jobs (mismo estilo que hoy: los jobs importan providers y
   pasan un seam inyectable para test).

## OpenRouter / E8

- `riesgo/briefing.ts` **no** toca OpenRouter; es el briefing determinista de E4
  (reglas + plantillas, sin LLM, sin red, sin `Date.now()`). El uso de
  OpenRouter/E8 vive en `lib/infraestructura/briefing-ia/`.
- **No** hay un puerto formal de proveedor de IA: el orquestador
  `generar-briefing-asistido.ts` inyecta una **función**
  (`generarConIA?: typeof generarConOpenRouter`), no una interfaz implementada por
  un adapter. No comparte `cliente-http.ts` (timeout propio de 15 s, sin
  reintentos, sin cupo OM).
- Quién arma la URL/llama `fetch`: `proveedor-openrouter.ts:160`. La URL está
  **hardcodeada** (`URL_OPENROUTER = 'https://openrouter.ai/api/v1/chat/completions'`),
  no es configurable por entorno.
- De dónde salen modelo y API key:
  - API key: `opciones.apiKey ?? process.env.OPENROUTER_API_KEY`.
  - Modelo: `proveedor-openrouter.ts` usa `opciones.modelo ??
    process.env.OPENROUTER_MODEL ?? 'deepseek/deepseek-v4.1-flash'`. **Pero** el
    orquestador siempre pasa un modelo explícito (`opciones.modelo ??
    MODELO_POR_DEFECTO`, con su propia constante `'deepseek/deepseek-v4.1-flash'`
    en `generar-briefing-asistido.ts`), así que por la vía normal
    `OPENROUTER_MODEL` queda **efectivamente ignorado**; sólo se leería llamando a
    `generarConOpenRouter` directo sin `modelo`.
  - Presupuesto: `E8_PRESUPUESTO_USD_MES` (default 5) y
    `E8_COSTO_MAXIMO_USD_LLAMADA` (default 0.01, usado como `montoReservaUsd`),
    leídos en `generar-briefing-asistido.ts`.
- `OPENROUTER_API_KEY`/`OPENROUTER_MODEL`/`E8_*` no figuran en `.env.example`
  (verificado): la config se resuelve sólo por entorno del proceso.

## Decisiones

- **Inventario sin red**: no se ejecutó ninguna llamada real a Open-Meteo, NASA ni
  OpenRouter; todo el análisis es estático (lectura + `rg`).
- **Contrato de adaptador vs contrato de motor**: `HazardProvider`
  (`tipos-hazard.ts`) queda como contrato de los adapters de pronóstico
  determinístico (ECMWF/Flood). Los puertos propuestos son la frontera
  normalizada hacia los jobs; no reemplazan a `HazardProvider` en esta propuesta.
- **Puertos nuevos independientes**, no dentro de `PuertosMotor` (ver
  justificación arriba). Objetivo explícito: **cero cambio de comportamiento del
  motor de riesgo v0**.
- **Normalización de unidades**: sufijo explícito (`Mm`, `Mm3s`→`m3/s`) y UTC
  ISO con `Z` en todo instante. Se corrige el `unidad: 'm3s'` de climatología de
  caudal a `'m3/s'` en la capa normalizada (sin tocar el valor persistido).
- **Ausencia = `null`/omisión/`sinDato`, nunca `0`**: se corrige a nivel de puerto
  el caso de ensemble donde `miembrosValidos === 0` hoy produce
  `probabilidad 0`; el puerto debe devolver `null`.
- **Diagnóstico por clave**: cada método devuelve, junto a los datos, un mapa de
  motivos por celda/departamento, para no perder la trazabilidad que hoy vive en
  `erroresPorCelda`/`erroresPorDepartamento`.
- **`PuertoLluviaObservada` no se reemplaza**: la observación de motor sigue
  leyendo la DB; `PuertoObservacionSatelital` es sólo ingesta.

## Pendientes

- Validar con N1 si el refactor debe además unificar `HazardProvider` y
  `PuertoPeligro` bajo un mismo contrato de proveedor, o mantenerlos separados
  (adaptador vs motor).
- Decidir si `PuertoObservacionSatelital` cubre el backfill de 72 h
  (`listarGranulos` con ventana) o si se parte en `listarGranulos` +
  `obtenerObservacion` con presupuesto explícito en el puerto.
- Definir si los umbrales de climatología (`umbralesP95Mm`/`umbralesP99Mm`) viajan
  como parámetro del puerto ensemble (como hoy) o se resuelven dentro del adapter.
- Resolver la discrepancia `OPENROUTER_MODEL` ignorado por el orquestador: decidir
  una única fuente de verdad para el modelo (env vs constante).
- Unificar el acceso HTTP de OpenRouter con `cliente-http.ts` (o documentar por
  qué mantiene su cliente propio: timeout 15 s, sin reintentos, sin cupo).
- Migrar tests de providers a los puertos normalizados sin golpear red
  (mantener inyección de `fetchImpl`).
- Documentar en `.env.example` las variables hoy sólo resueltas por entorno
  (`OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `E8_PRESUPUESTO_USD_MES`,
  `E8_COSTO_MAXIMO_USD_LLAMADA`, `EARTHDATA_TOKEN`, `OPEN_METEO_API_KEY`).

## Estado final e implementación

Resumen honesto del batch de implementación posterior al inventario (la
propuesta de arriba ya no es sólo papel). `git diff --stat HEAD` (sólo archivos
rastreados) da **13 archivos, 268 inserciones, 62 deleciones**:

```
 components/.../reporte-inicial-form.test.tsx        |  4 +-
 lib/.../briefing-ia/generar-briefing-asistido.ts     |  4 +-
 lib/.../briefing-ia/proveedor-openrouter.ts          | 12 ++--
 lib/.../replay/consulta.test.ts                      | 59 +++++++++
 lib/.../replay/consulta.ts                           | 41 ++++---
 lib/.../riesgo/jobs/sync-imerg.ts                    | 15 ++--
 lib/.../riesgo/providers/climatologia-caudal.ts      |  5 +-
 lib/.../riesgo/providers/climatologia.ts             |  7 +-
 lib/.../riesgo/providers/ensemble.ts                 |  9 +--
 lib/.../riesgo/providers/imerg.ts                    |  5 +-
 lib/.../riesgo/providers/seasonal.ts                 | 11 +--
 scripts/importar-geo-static.mjs                      | 83 ++++++++++++++----
 scripts/importar-geo-static.test.ts                  | 75 +++++++++++++++++
 13 files changed, 268 insertions(+), 62 deletions(-)
```

Además hay **tres rutas nuevas sin trackear** que `git diff --stat HEAD` no
lista: `lib/infraestructura/riesgo/providers/config-fuentes.ts`,
`lib/infraestructura/riesgo/adaptadores-ingesta/` y
`docs/ejecucion-enos/ABS1/` (este registro + el runbook).

### Hecho y verificado

- **`providers/config-fuentes.ts`**: módulo único de config por fuente.
  `ecmwf`/`flood` NO se tocaron (siguen con sus constantes propias, documentado
  como decisión); `ensemble`, `seasonal`, `climatologia`,
  `climatologia-caudal`, `imerg`/CMR y `openrouter` quedaron cableados a este
  módulo **sin cambiar ningún valor** (sólo se movió la constante). El diff de
  `proveedor-openrouter.ts` y `jobs/sync-imerg.ts` muestra ese recableado.
- **Fix de discrepancia real**: `briefing-ia/generar-briefing-asistido.ts` ahora
  respeta `OPENROUTER_MODEL` del entorno. Antes quedaba muerto porque el
  orquestador siempre pasaba un modelo explícito con su propia constante
  duplicada; esa duplicación se eliminó.
- **`adaptadores-ingesta/`**: `puertos.ts` (`PuertoPronosticoEnsemble`,
  `PuertoObservacionSatelital`, `PuertoTendenciaEstacional`, con tipos
  normalizados, unidades explícitas, ausencia = `null`/`sinDato`) más
  `ensemble.ts`, `seasonal.ts`, `imerg.ts`. Los adaptadores envuelven a los
  providers reales **sin alterar ningún valor**, sólo forma.
- **Suite de contrato reutilizable**: `contrato-puerto.test.ts` +
  `__fixtures__/contrato.ts` (13 tests) corre los 3 adaptadores nuevos contra
  fixtures normal / vacío / error / degradación parcial, **sin red real**.
- **Runbook** `docs/ejecucion-enos/ABS1/como-cambiar-una-fuente.md`, con
  ejemplos hipotéticos.
- **Seguimiento 1**: el test inestable de `reporte-inicial-form.test.tsx` se
  investigó (no reprodujo en 2 corridas completas antes del fix ni en las de
  después). Fix aplicado: timeout explícito de 5000 ms en los 2 `findByText`
  que siguen a un `dispatchEvent('online')`, sin tocar lógica.
- **Seguimiento 2**: `scripts/importar-geo-static.mjs` migrado a validación Zod
  real (`schemaFilaAislamiento`/`schemaFilaSusceptibilidad`), con tests nuevos.
  Un revisor independiente encontró una regresión real
  (`periodoRetornoAnios` aceptaba `null` cuando el código viejo lo rechazaba) que
  se corrigió (`z.number()` sin `.nullable()`) con test de regresión agregado.
- **Seguimiento 3**: `lib/infraestructura/replay/consulta.ts` (selector de
  departamento de E7c) corregido para usar `normalizarNombreDepartamento` en vez
  de `UPPER(TRIM())` crudo, con test de regresión (tildes).
- **Aceptación**: corrida y verde **por el propio N2, no por el implementador**.
  `pnpm exec vitest run --maxWorkers=2` corrido 4 veces completas en total con
  todos los cambios (1928-1929 tests, 218 archivos, todos pasando); `pnpm lint`
  verde, `pnpm exec tsc --noEmit` verde, `pnpm build` verde. Revisión
  independiente por un segundo N3 (no el implementador) sin hallazgos críticos,
  salvo la regresión de Zod ya corregida.

### Pendiente (no se hizo)

- **Los jobs NO consumen los puertos por inyección.** `sync-ensemble.ts`,
  `sync-imerg.ts` y `sync-seasonal.ts` siguen importando directamente las
  funciones de `providers/`. Los adaptadores existen y están
  contract-testeados, pero el cableado final del job (reemplazar el import
  directo por el puerto) quedó pendiente por riesgo/tiempo. Queda además
  documentado dentro de los propios adaptadores: comentarios `PENDIENTE` en
  `ensemble.ts`/`seasonal.ts` sobre `llamadasRealizadas` no expuesto por el
  puerto, e `imerg.ts` sobre el armado de URL de CMR duplicado del job.
- **Discrepancia semántica de ensemble**: la probabilidad debería ser `null` con
  `miembrosValidos === 0`, hoy es `0` literal. Está documentada pero
  **deliberadamente no corregida** (habría cambiado valores persistidos,
  prohibido por el alcance "sin cambios de comportamiento").
- **Flake de `components/infraestructura/ficha-parte-modal.test.tsx`**: una
  corrida aislada mostró 2 `Uncaught Exception: window is not defined`. El
  archivo NO fue tocado por este batch y no reprodujo en la corrida siguiente;
  se documenta como **flake preexistente NO resuelto en este batch**, fuera de
  alcance.

## Segunda parte: jobs por inyección

Cierre del pendiente principal de la primera parte: los 3 jobs con puerto
normalizado ya no importan su provider directo, consumen el puerto por
inyección (adaptador real como valor por defecto).

### Alcance revisado y jobs fuera de alcance

`rg "from ['\"]\.\./providers/" lib/infraestructura/riesgo/jobs/` (excluyendo
tests) muestra 6 jobs con import directo de `providers/` antes de este batch:
`sync-ensemble.ts`, `sync-seasonal.ts`, `sync-imerg.ts`,
`calcular-climatologia.ts`, `calcular-climatologia-caudal.ts`,
`sync-pronostico-caudal.ts`. Sólo los primeros 3 tienen puerto normalizado en
`adaptadores-ingesta/` (`PuertoPronosticoEnsemble`, `PuertoTendenciaEstacional`,
`PuertoObservacionSatelital`); climatología y el pronóstico determinístico
(ECMWF/Flood, ya contrato de adaptador vía `HazardProvider`) no tienen puerto
de ingesta propuesto en este documento, así que quedan **fuera de alcance**
de este cableado (no es una omisión: no hay puerto que cablear). Documentado
también en `como-cambiar-una-fuente.md`.

### Cableado por job

- **`sync-ensemble.ts`**: reemplaza el import directo de
  `obtenerProbabilidadesEnsemble` por `crearAdaptadorEnsemble(...)` (puerto
  `PuertoPronosticoEnsemble`), construido una vez por corrida con el mismo
  `apiKey`/`controladorCupoFactory` (`host: 'ensemble-api'`) que antes se
  pasaba por tanda — semántica idéntica, el provider real se sigue invocando
  por lote. `persistirPuntos` traduce nombres del puerto a las columnas de
  `hazard_ensemble_prob` (`validoHasta`→`validoEn`,
  `probabilidadSuperaP95/P99`→`probabilidadP95/P99`, `dispersionMm`→
  `dispersion`) sin tocar valores. El puerto ahora expone
  `llamadasRealizadas` real (antes PENDIENTE del adaptador; el job la
  necesitaba para `contadores.llamadas` de `infra_job_run` y ya no usa el
  fallback `?? 1`). Como `hazard_ensemble_prob.probabilidad_p95/p99/dispersion`
  son NOT NULL y el tipo del puerto admite `number | null` (aspiracional,
  para cuando se corrija la discrepancia semántica de `miembrosValidos === 0`
  documentada en la primera parte), se agregó un guard `valorPresente()` que
  hace explícita esa tensión de tipos en vez de esconder un futuro `null`
  real detrás de un `?? 0`.
- **`sync-seasonal.ts`**: reemplaza el import directo de
  `obtenerTendenciaEstacional` por `crearAdaptadorSeasonal(...)`. El puerto no
  tiene defaults propios para `horizonteDesdeDias`/`horizonteHastaDias`, así
  que el job los pasa explícitos (`30`/`90`, los mismos defaults que ya tenía
  el provider). El guard de cupo (`asegurarPesoAlcanzable`/`pesoLlamada`)
  sigue viviendo en el job, antes de invocar al puerto — no se movió al
  adaptador. `llamadasRealizadas` del job sigue siendo su propio contador por
  tanda (nunca usó el del provider), así que el puerto de seasonal NO
  necesitó exponerlo (asimetría documentada en el adaptador).
- **`sync-imerg.ts`**: el más grande de los tres. Reemplaza el fetch inline de
  CMR + OPeNDAP por `crearAdaptadorImerg({ fetchImpl, token })` (puerto
  `PuertoObservacionSatelital`): `listarGranulos` sustituye al fetch+parseo de
  CMR (mismo host/short_name/page_size, ahora armados en el adaptador) y
  `obtenerObservacion` sustituye a `procesarGranulo` (mismo armado de índices
  de grilla y de URL de subset). El resuelve PENDIENTE que dejó el adaptador
  en la primera parte ("el job queda SIN TOCAR"). La columna
  `hazard_observation.unidad` sigue siendo el literal `'mm/30min'`: el puerto
  no lo expone (siempre mm), así que el job lo reconstituye con una constante
  local en vez de perder el valor.

### Test por job con puerto fake (sin red)

Se agregó un test por job (`sync-ensemble.test.ts`, `sync-seasonal.test.ts`,
`sync-imerg.test.ts`) que inyecta el **puerto completo** directamente
(`puerto: PuertoXxx`), sin pasar por `crearAdaptadorXxx` ni por ningún
provider — demuestra la inyección real, no sólo la del provider crudo (que ya
existía). Los tests preexistentes que inyectaban la función cruda del
provider (`obtenerProbabilidades`/`obtenerTendenciaEstacional`) NO se
tocaron en su lógica de negocio; sólo se corrigió un fixture de ensemble
(`ensembleFake`) que no declaraba `llamadasRealizadas` (el provider real
siempre lo hace) — un gap preexistente del fake que quedó expuesto al dejar
de usar el fallback `?? 1`.

### Grep final (item 3 del alcance)

`rg "fetch\(" lib/infraestructura/riesgo/jobs/ --glob '!*.test.ts'` → vacío.
`rg "open-meteo\.com|gesdisc|earthdata\.nasa|openrouter\.ai" lib/ app/ scripts/ --glob '!*.test.ts' --glob '!*.test.tsx' | rg -v "providers/|adaptadores-ingesta/|briefing-ia/"` → sólo un fixture JSON de test (`__fixtures__/hazard/imerg-cmr-granulos-2026-09-26.json`), ningún código. Ningún `fetch(` ni URL de proveedor vive fuera de `providers/`, `adaptadores-ingesta/` o `briefing-ia/`.

### Flake de `ficha-parte-modal.test.tsx` — diagnosticado y corregido

Causa raíz confirmada: el `afterEach` hacía
`document.body.innerHTML = ''` en vez de `cleanup()` de
`@testing-library/react`. Eso deja el root de React de cada `render()` sin
desmontar: su fiber sigue con trabajo pendiente (efectos del fetch
asíncrono) referenciando nodos DOM arrancados a mano; ese trabajo se
reprograma vía el scheduler y puede ejecutarse cuando el entorno jsdom de
OTRO archivo de test ya fue destruido, produciendo
`Uncaught Exception: window is not defined`. Sólo reproduce corriendo la
suite COMPLETA (no el archivo aislado), consistente con lo que ya había
observado la primera parte. Fix: importar `cleanup` de
`@testing-library/react` y llamarlo en el `afterEach` en vez de manipular
`innerHTML` a mano. Cambio de 2 líneas, sólo en el archivo de test; ninguna
aserción de negocio se tocó. Confirmado: 2 corridas completas de la suite
después del fix, cero `Unhandled Errors`.

### Verificación

- `pnpm exec vitest run --maxWorkers=2` corrido **2 veces completas** después
  del fix del flake (además de corridas parciales durante el desarrollo):
  218 archivos, 1932 tests, todos pasando, **0 Unhandled Errors** en ambas
  corridas (antes del fix había 2, ver arriba).
- `pnpm exec tsc --noEmit` verde.
- `pnpm lint` verde (0 errores, 0 warnings; se corrigieron 3 warnings propios
  del cableado — imports type-only y una constante que quedó sin uso).
- `pnpm build` verde (compila y genera las 70 rutas).
- Revisión independiente por un N3 distinto del implementador (sólo lectura,
  sin ejecutar tests): **sin hallazgos críticos**. Hallazgos menores: (1) el
  fallback de `llamadasRealizadas` pasó de `?? 1` (job) a `?? 0` (adaptador)
  — indistinto con el provider real, que siempre declara el campo, sólo
  afecta a un fake de test que lo omita; (2) `celdasSinDato` de IMERG queda
  siempre `[]` (mismo comportamiento que antes, documentado como PENDIENTE,
  no regresión); (3) el armado de la URL de CMR sigue duplicado entre el
  adaptador y `CONFIG_FUENTES` (ya documentado en la primera parte, no
  afecta valores).

### Pendiente (no se hizo, fuera de alcance de esta tarea)

- `calcular-climatologia.ts`, `calcular-climatologia-caudal.ts` y
  `sync-pronostico-caudal.ts` siguen importando su provider directo: no
  existe puerto de ingesta normalizado para climatología ni para el
  pronóstico determinístico ECMWF/Flood en este documento.
- La discrepancia semántica de ensemble (`probabilidadSuperaP95/P99` debería
  ser `null` con `miembrosValidos === 0`, hoy preserva el `0` literal del
  provider) sigue **deliberadamente sin corregir** (mismo motivo que la
  primera parte: cambiaría valores persistidos).
- `adaptadores-ingesta/imerg.ts` sigue teniendo su propia copia de
  `urlCmrVentana` (ya no duplicada con el job, sólo con la constante
  `CONFIG_FUENTES.imergCmr`): consolidar ese builder en `providers/imerg.ts`
  queda fuera de alcance.

## Gate

<!-- reservado para N1 -->

## Gate (N1)

- ABS1 se hizo en dos N2 sobre el mismo worktree.
  - Primera parte: configuración única de las 8 fuentes, puertos y adaptadores con suite de contrato, y los 3 seguimientos.
  - Segunda parte: sync-ensemble, sync-imerg y sync-seasonal reciben el puerto por inyección, con un test de puerto fake por job, y se corrigió el flake de ficha-parte-modal (cleanup de RTL).
- Revisión independiente por N3 en ambas partes, sin bloqueantes abiertos.
- Verificación de N1: vitest 218/218 archivos y 1932/1932 tests sin unhandled errors, lint 0, tsc 0 y build 0.
- Grep de N1: los únicos `fetch(` fuera de providers, adaptadores-ingesta y briefing-ia son hooks de cliente contra la API interna. Ninguna URL de proveedor queda fuera de los adaptadores.
- Seguimiento aceptado: calcular-climatologia*.ts y sync-pronostico-caudal.ts todavía importan su provider, que ya implementa HazardProvider. Queda pasarlos también por inyección.
