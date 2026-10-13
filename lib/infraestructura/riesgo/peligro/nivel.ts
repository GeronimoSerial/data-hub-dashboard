// Contrato fijo de la Capa 1 "Peligro meteorológico estimado" (batch E3a,
// plan base §5.3). E3b (motor de riesgo v0) consume este puerto por su nombre
// exacto de tipos y funciones — no renombrar sin decisión de N1.

import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import {
  hazardClimatology,
  hazardEnsembleProb,
  hazardForecast,
  infraGeoProfile,
} from '@/lib/db/schema'
import { nivelDesdeUmbralProvisorio } from './umbrales-provisorios'

export type NivelPeligro = 'verde' | 'amarillo' | 'naranja' | 'rojo' | 'sin_dato'

export type HorizontePeligro = 24 | 72 | 240

export interface NivelPeligroCelda {
  geometryRef: string
  horizonteHoras: HorizontePeligro
  nivel: NivelPeligro
  base: 'ensemble' | 'deterministico' | 'sin_dato'
  // Método que produjo el nivel: percentiles de climatología, umbral provisorio
  // (puente mientras no hay climatología) o sin_dato. Aditivo y opcional para
  // no romper a los consumidores que construyen el tipo; nivel.ts SIEMPRE lo
  // emite.
  metodo?: 'percentiles' | 'umbral_provisorio' | 'sin_dato'
  probabilidadP95: number | null
  probabilidadP99: number | null
  precipitacionMm: number | null
  percentilReferencia: 'P90' | 'P95' | 'P99' | null
  emitidoEn: string
  validoHasta: string
  versionRegla: string
}

export interface NivelCaudalPunto {
  puntoId: string
  percentilActual: number | null
  nivel: NivelPeligro
  emitidoEn: string
  validoHasta: string
}

// ---------------------------------------------------------------------------
// Capa 1: funciones de nivel y consultas (batch E3a). Los tipos de arriba son
// el contrato fijo que ejecutará E3b; estas son las funciones que consume.
// ---------------------------------------------------------------------------

export const VERSION_REGLA_PELIGRO = 'peligro-v0.2'

// Nombres de `variable`/`muestra` tal como los escriben los jobs de ingesta
// (providers/ensemble.ts, ecmwf.ts, flood.ts, climatologia*.ts). La consulta
// es por igualdad exacta: no inventar variantes de mayúsculas ni de número.
// Exportadas (cambio aditivo, sin tocar valores) para que cualquier lectura
// as-of reutilice estos literales de `variable`/`muestra` sin duplicarlos a mano.
export const VARIABLE_ENSEMBLE = 'precipitacion_24h'
export const VARIABLE_PRONOSTICO_PRECIPITACION = 'precipitacion'
export const VARIABLE_CLIMATOLOGIA_PRECIPITACION = 'precipitacion_diaria'
const VARIABLE_PRONOSTICO_CAUDAL = 'caudal'
const VARIABLE_CLIMATOLOGIA_CAUDAL = 'caudal_diario'
export const MUESTRA_CLIMATOLOGIA = 'todos_los_dias'
export const PERCENTILES_CLIMATOLOGIA = ['p90', 'p95', 'p99'] as const

// Tolerancia para aceptar el pronóstico determinístico que representa el
// horizonte de 240 h (tendencia 7-10 días). El determinístico de ECMWF se pide
// a 10 días con paso horario, así que una fila de ese tramo cae dentro de un
// día de 240. Si la corrida no llegó hasta la semana, no se reutiliza el
// último horizonte disponible (p. ej. 72 h) como si fuera de 240: sin_dato.
const TOLERANCIA_HORIZONTE_240_HORAS = 24

/**
 * Traduce las probabilidades del ensemble a nivel de peligro.
 * `probabilidadP95`/`probabilidadP99` son la proporción de miembros del
 * ensemble (51 en ECMWF IFS) que superan el P95/P99 de la climatología de la
 * celda (ver providers/ensemble.ts).
 *
 * Decisión de umbral razonable, NO una ley física:
 * - P99 >= 0.5 (la mayoría de los miembros supera P99) → rojo.
 * - P95 >= 0.5 (la mayoría supera P95) → naranja.
 * - P95 > 0.1 (probabilidad no trivial de superar P95) → amarillo.
 * - si no → verde.
 * Los bordes son deliberados: 0.5 exacto ya cruza (>=) y 0.1 exacto todavía no
 * (>), porque una probabilidad mínima no debe pintar amarillo todo el mapa.
 */
export function nivelDesdeEnsemble(probabilidadP95: number, probabilidadP99: number): NivelPeligro {
  if (probabilidadP99 >= 0.5) return 'rojo'
  if (probabilidadP95 >= 0.5) return 'naranja'
  if (probabilidadP95 > 0.1) return 'amarillo'
  return 'verde'
}

/**
 * Fallback determinístico: compara un valor pronosticado contra los
 * percentiles de climatología. Es genérico en la magnitud que recibe (sirve
 * igual para precipitación en mm que para caudal en m3/s: sólo compara
 * números).
 *
 * Umbrales estrictos: igualar un percentil NO lo supera.
 */
export function nivelDesdeDeterministico(
  precipitacionMm: number,
  p90: number,
  p95: number,
  p99: number,
): { nivel: NivelPeligro; percentilReferencia: 'P90' | 'P95' | 'P99' | null } {
  if (precipitacionMm > p99) return { nivel: 'rojo', percentilReferencia: 'P99' }
  if (precipitacionMm > p95) return { nivel: 'naranja', percentilReferencia: 'P95' }
  if (precipitacionMm > p90) return { nivel: 'amarillo', percentilReferencia: 'P90' }
  return { nivel: 'verde', percentilReferencia: null }
}

/** Mismo mapeo de percentil que nivelDesdeDeterministico, aplicado al nivel. */
function percentilDeNivel(nivel: NivelPeligro): 'P90' | 'P95' | 'P99' | null {
  if (nivel === 'rojo') return 'P99'
  if (nivel === 'naranja') return 'P95'
  if (nivel === 'amarillo') return 'P90'
  return null
}

/**
 * Percentil aproximado del valor actual contra la climatología: 99 si supera
 * P99, 95 si supera P95, 90 si supera P90 y 0 como aproximación de "por
 * debajo de P90". Es deliberadamente grueso (no interpola entre percentiles):
 * alcanza para la ficha y mantiene el mismo criterio de umbral que
 * nivelDesdeDeterministico.
 */
function percentilAproximado(
  valor: number,
  umbrales: { p90: number; p95: number; p99: number },
): number {
  if (valor > umbrales.p99) return 99
  if (valor > umbrales.p95) return 95
  if (valor > umbrales.p90) return 90
  return 0
}

type Db = ReturnType<typeof getDb>

type FilaConHorizonte = { corridaEn: string; horizonteHoras: number }

/**
 * De las filas candidatas de una misma celda/variable elige la corrida más
 * reciente y, dentro de ella, la fila más cercana al horizonte pedido. El
 * `horizonteHoras` real de la ingesta no calza necesariamente con 24/72 (el
 * provider lo deriva de la rejilla horaria), por eso se busca el más cercano.
 * `objetivo: 'menor'` pide directamente el horizonte más chico disponible (el
 * caudal "actual"). Empate de distancia: gana el horizonte más chico, el más
 * próximo en el tiempo.
 */
function elegirMasRecienteYHorizonte<T extends FilaConHorizonte>(
  filas: T[],
  objetivo: number | 'menor',
): T | null {
  if (filas.length === 0) return null
  let corridaMasReciente = filas[0]
  for (const fila of filas) {
    if (Date.parse(fila.corridaEn) > Date.parse(corridaMasReciente.corridaEn)) {
      corridaMasReciente = fila
    }
  }
  const candidatas = filas.filter((fila) => fila.corridaEn === corridaMasReciente.corridaEn)
  if (objetivo === 'menor') {
    return candidatas.reduce((menor, fila) =>
      fila.horizonteHoras < menor.horizonteHoras ? fila : menor,
    )
  }
  return candidatas.reduce((mejor, fila) => {
    const distancia = Math.abs(fila.horizonteHoras - objetivo)
    const distanciaMejor = Math.abs(mejor.horizonteHoras - objetivo)
    if (distancia < distanciaMejor) return fila
    if (distancia === distanciaMejor && fila.horizonteHoras < mejor.horizonteHoras) return fila
    return mejor
  })
}

/**
 * Consulta as-of: sólo cuentan las filas emitidas o calculadas en `ahora` o
 * antes (`corridaEn` de pronósticos, `calculadoEn` de climatología). Sin `ahora`
 * (lectura del momento actual) toda fila es vigente.
 */
function emitidoHastaAhora(emitidoEn: string, ahora: Date | undefined): boolean {
  if (ahora === undefined) return true
  return Date.parse(emitidoEn) <= ahora.getTime()
}

async function cargarPronostico(
  db: Db,
  geometryRef: string,
  variable: 'precipitacion' | 'caudal',
  objetivo: number | 'menor',
  toleranciaHoras?: number,
  ahora?: Date,
): Promise<{ valor: number; corridaEn: string; validoEn: string; horizonteHoras: number } | null> {
  const filas = await db
    .select({
      corridaEn: hazardForecast.corridaEn,
      validoEn: hazardForecast.validoEn,
      horizonteHoras: hazardForecast.horizonteHoras,
      valor: hazardForecast.valor,
    })
    .from(hazardForecast)
    .where(and(eq(hazardForecast.geometryRef, geometryRef), eq(hazardForecast.variable, variable)))
  const fila = elegirMasRecienteYHorizonte(
    filas.filter((f) => emitidoHastaAhora(f.corridaEn, ahora)),
    objetivo,
  )
  if (fila === null) return null
  // La tolerancia sólo aplica a un horizonte numérico puntual (ej. 240h); con
  // objetivo 'menor' (el caudal "actual") no hay una distancia que tolerar.
  if (
    typeof objetivo === 'number' &&
    toleranciaHoras !== undefined &&
    Math.abs(fila.horizonteHoras - objetivo) > toleranciaHoras
  ) {
    return null
  }
  return fila
}

/**
 * Los tres percentiles de la climatología más reciente de una celda/punto.
 * "Más reciente" se resuelve por periodoHasta, version y calculadoEn descendentes
 * (el desempate por calculadoEn elige la climatología progresiva más nueva),
 * quedándose con la primera fila de cada percentil (mismo criterio que
 * sync-ensemble.ts). Con `ahora` sólo cuentan las filas con `calculadoEn <=
 * ahora`, así la climatología vigente es la que existía en ese momento. Si
 * falta cualquier percentil devuelve null: una climatología parcial no alcanza
 * para decidir un nivel.
 */
async function cargarUmbralesClimatologia(
  db: Db,
  geometryRef: string,
  variable: 'precipitacion_diaria' | 'caudal_diario',
  ahora?: Date,
): Promise<{ p90: number; p95: number; p99: number } | null> {
  const filas = await db
    .select({
      percentil: hazardClimatology.percentil,
      valor: hazardClimatology.valor,
      calculadoEn: hazardClimatology.calculadoEn,
    })
    .from(hazardClimatology)
    .where(
      and(
        eq(hazardClimatology.geometryRef, geometryRef),
        eq(hazardClimatology.variable, variable),
        eq(hazardClimatology.muestra, MUESTRA_CLIMATOLOGIA),
        inArray(hazardClimatology.percentil, [...PERCENTILES_CLIMATOLOGIA]),
      ),
    )
    .orderBy(
      desc(hazardClimatology.periodoHasta),
      desc(hazardClimatology.version),
      desc(hazardClimatology.calculadoEn),
    )

  const porPercentil = new Map<string, number>()
  for (const fila of filas) {
    if (!emitidoHastaAhora(fila.calculadoEn, ahora)) continue
    if (!porPercentil.has(fila.percentil)) porPercentil.set(fila.percentil, fila.valor)
  }
  const p90 = porPercentil.get('p90')
  const p95 = porPercentil.get('p95')
  const p99 = porPercentil.get('p99')
  if (p90 === undefined || p95 === undefined || p99 === undefined) return null
  return { p90, p95, p99 }
}

// ---------------------------------------------------------------------------
// Lecturas por lote: una sola consulta para TODOS los geometryRefs en vez de
// una consulta por celda (evita el N+1 de obtenerNivelesPeligro). El
// agrupamiento por celda se hace en memoria; el conjunto de filas y el orden
// de `elegirMasRecienteYHorizonte`/`cargarUmbralesClimatologia` no cambian, así
// que el resultado es idéntico al de la versión celda por celda.
// ---------------------------------------------------------------------------

type FilaEnsemble = {
  corridaEn: string
  validoEn: string
  horizonteHoras: number
  probabilidadP95: number
  probabilidadP99: number
  miembrosValidos: number
}

type FilaPronostico = {
  corridaEn: string
  validoEn: string
  horizonteHoras: number
  valor: number
}

async function cargarFilasEnsemblePorLote(
  db: Db,
  geometryRefs: string[],
): Promise<Map<string, FilaEnsemble[]>> {
  const porCelda = new Map<string, FilaEnsemble[]>()
  if (geometryRefs.length === 0) return porCelda
  const filas = await db
    .select({
      geometryRef: hazardEnsembleProb.geometryRef,
      corridaEn: hazardEnsembleProb.corridaEn,
      validoEn: hazardEnsembleProb.validoEn,
      horizonteHoras: hazardEnsembleProb.horizonteHoras,
      probabilidadP95: hazardEnsembleProb.probabilidadP95,
      probabilidadP99: hazardEnsembleProb.probabilidadP99,
      miembrosValidos: hazardEnsembleProb.miembrosValidos,
    })
    .from(hazardEnsembleProb)
    .where(
      and(
        inArray(hazardEnsembleProb.geometryRef, geometryRefs),
        eq(hazardEnsembleProb.variable, VARIABLE_ENSEMBLE),
      ),
    )
  for (const fila of filas) {
    const lista = porCelda.get(fila.geometryRef)
    if (lista === undefined) porCelda.set(fila.geometryRef, [fila])
    else lista.push(fila)
  }
  return porCelda
}

async function cargarPronosticosPorLote(
  db: Db,
  geometryRefs: string[],
  variable: 'precipitacion' | 'caudal',
  ahora?: Date,
): Promise<Map<string, FilaPronostico[]>> {
  const porCelda = new Map<string, FilaPronostico[]>()
  if (geometryRefs.length === 0) return porCelda
  const filas = await db
    .select({
      geometryRef: hazardForecast.geometryRef,
      corridaEn: hazardForecast.corridaEn,
      validoEn: hazardForecast.validoEn,
      horizonteHoras: hazardForecast.horizonteHoras,
      valor: hazardForecast.valor,
    })
    .from(hazardForecast)
    .where(
      and(inArray(hazardForecast.geometryRef, geometryRefs), eq(hazardForecast.variable, variable)),
    )
  for (const fila of filas) {
    if (!emitidoHastaAhora(fila.corridaEn, ahora)) continue
    const lista = porCelda.get(fila.geometryRef)
    if (lista === undefined) porCelda.set(fila.geometryRef, [fila])
    else lista.push(fila)
  }
  return porCelda
}

async function cargarUmbralesPorLote(
  db: Db,
  geometryRefs: string[],
  variable: 'precipitacion_diaria' | 'caudal_diario',
  ahora?: Date,
): Promise<Map<string, { p90: number; p95: number; p99: number } | null>> {
  const porCelda = new Map<string, { p90: number; p95: number; p99: number } | null>()
  if (geometryRefs.length === 0) return porCelda
  const filas = await db
    .select({
      geometryRef: hazardClimatology.geometryRef,
      percentil: hazardClimatology.percentil,
      valor: hazardClimatology.valor,
      calculadoEn: hazardClimatology.calculadoEn,
    })
    .from(hazardClimatology)
    .where(
      and(
        inArray(hazardClimatology.geometryRef, geometryRefs),
        eq(hazardClimatology.variable, variable),
        eq(hazardClimatology.muestra, MUESTRA_CLIMATOLOGIA),
        inArray(hazardClimatology.percentil, [...PERCENTILES_CLIMATOLOGIA]),
      ),
    )
    .orderBy(
      desc(hazardClimatology.periodoHasta),
      desc(hazardClimatology.version),
      desc(hazardClimatology.calculadoEn),
    )

  // El orderBy global ordena TODAS las filas del lote; dentro de cada celda la
  // primera aparición por percentil es la más reciente, igual que la consulta
  // celda por celda.
  const porPercentilPorCelda = new Map<string, Map<string, number>>()
  for (const fila of filas) {
    if (!emitidoHastaAhora(fila.calculadoEn, ahora)) continue
    let porPercentil = porPercentilPorCelda.get(fila.geometryRef)
    if (porPercentil === undefined) {
      porPercentil = new Map<string, number>()
      porPercentilPorCelda.set(fila.geometryRef, porPercentil)
    }
    if (!porPercentil.has(fila.percentil)) porPercentil.set(fila.percentil, fila.valor)
  }

  for (const geometryRef of geometryRefs) {
    const porPercentil = porPercentilPorCelda.get(geometryRef)
    if (porPercentil === undefined) {
      porCelda.set(geometryRef, null)
      continue
    }
    const p90 = porPercentil.get('p90')
    const p95 = porPercentil.get('p95')
    const p99 = porPercentil.get('p99')
    porCelda.set(
      geometryRef,
      p90 === undefined || p95 === undefined || p99 === undefined ? null : { p90, p95, p99 },
    )
  }
  return porCelda
}

async function listarGeometryRefs(db: Db): Promise<string[]> {
  const filas = await db
    .selectDistinct({ geometryRef: infraGeoProfile.geometryRef })
    .from(infraGeoProfile)
    .where(isNotNull(infraGeoProfile.geometryRef))
  return filas
    .map((fila) => fila.geometryRef)
    .filter((ref): ref is string => ref !== null)
    .sort()
}

function calcularNivelCeldaSync(
  geometryRef: string,
  horizonte: HorizontePeligro,
  ahora: Date,
  filasEnsemble: FilaEnsemble[] | undefined,
  filasPronostico: FilaPronostico[] | undefined,
  umbrales: { p90: number; p95: number; p99: number } | null | undefined,
): NivelPeligroCelda {
  // El ensemble sólo alimenta 24 y 72 h: produce ventanas de 24 h hasta 3 días
  // y NUNCA es la fuente de la vigilancia de 7-10 días. Para 240 se salta
  // directo al fallback determinístico (menor resolución temporal).
  if (horizonte !== 240) {
    const fila = elegirMasRecienteYHorizonte(filasEnsemble ?? [], horizonte)
    if (fila !== null && fila.miembrosValidos !== 0) {
      const nivel = nivelDesdeEnsemble(fila.probabilidadP95, fila.probabilidadP99)
      return {
        geometryRef,
        horizonteHoras: horizonte,
        nivel,
        base: 'ensemble',
        // La fila de hazardEnsembleProb sólo existe cuando hubo climatología al
        // momento de la ingesta: el ensemble siempre es percentiles.
        metodo: 'percentiles',
        probabilidadP95: fila.probabilidadP95,
        probabilidadP99: fila.probabilidadP99,
        // El ensemble reporta proporción de miembros, no un acumulado puntual:
        // no hay una precipitación en mm que mostrar.
        precipitacionMm: null,
        // Mismo criterio que el determinístico, para que el campo sea
        // consistente entre ambas bases.
        percentilReferencia: percentilDeNivel(nivel),
        emitidoEn: fila.corridaEn,
        validoHasta: fila.validoEn,
        versionRegla: VERSION_REGLA_PELIGRO,
      }
    }
  }

  // Fallback (y único camino para 240): pronóstico determinístico contra
  // climatología. Para 240 se exige que la fila más cercana esté dentro de la
  // tolerancia documentada arriba; si la corrida no llega a la semana, es
  // sin_dato, no se extrapola el último horizonte disponible.
  const tolerancia = horizonte === 240 ? TOLERANCIA_HORIZONTE_240_HORAS : undefined
  const candidato = elegirMasRecienteYHorizonte(filasPronostico ?? [], horizonte)
  const pronostico =
    candidato !== null &&
    !(tolerancia !== undefined && Math.abs(candidato.horizonteHoras - horizonte) > tolerancia)
      ? candidato
      : null
  const umbralesEfectivos = umbrales ?? null

  if (pronostico !== null && umbralesEfectivos !== null) {
    const { nivel, percentilReferencia } = nivelDesdeDeterministico(
      pronostico.valor,
      umbralesEfectivos.p90,
      umbralesEfectivos.p95,
      umbralesEfectivos.p99,
    )
    return {
      geometryRef,
      horizonteHoras: horizonte,
      nivel,
      base: 'deterministico',
      metodo: 'percentiles',
      probabilidadP95: null,
      probabilidadP99: null,
      precipitacionMm: pronostico.valor,
      percentilReferencia,
      emitidoEn: pronostico.corridaEn,
      validoHasta: pronostico.validoEn,
      versionRegla: VERSION_REGLA_PELIGRO,
    }
  }

  // Hay pronóstico pero NO climatología: puente provisorio mientras se calcula
  // la climatología ERA5. base sigue siendo 'deterministico' (la fuente es el
  // pronóstico determinístico); el nivel sale de umbrales fijos, no de
  // percentiles. Si hubiera climatología, este camino NUNCA se toma.
  if (pronostico !== null) {
    return {
      geometryRef,
      horizonteHoras: horizonte,
      nivel: nivelDesdeUmbralProvisorio(pronostico.valor, horizonte),
      base: 'deterministico',
      metodo: 'umbral_provisorio',
      probabilidadP95: null,
      probabilidadP99: null,
      precipitacionMm: pronostico.valor,
      percentilReferencia: null,
      emitidoEn: pronostico.corridaEn,
      validoHasta: pronostico.validoEn,
      versionRegla: VERSION_REGLA_PELIGRO,
    }
  }

  // Sin dato: NUNCA verde por defecto. No hay ventana de pronóstico que
  // reportar, así que emisión y vencimiento quedan en el instante de consulta
  // (el contrato exige strings no nulos).
  const ahoraIso = ahora.toISOString()
  return {
    geometryRef,
    horizonteHoras: horizonte,
    nivel: 'sin_dato',
    base: 'sin_dato',
    metodo: 'sin_dato',
    probabilidadP95: null,
    probabilidadP99: null,
    precipitacionMm: null,
    percentilReferencia: null,
    emitidoEn: ahoraIso,
    validoHasta: ahoraIso,
    versionRegla: VERSION_REGLA_PELIGRO,
  }
}

/**
 * Capa 1 de peligro por precipitación: devuelve una fila por cada
 * (geometryRef, horizonte) solicitado.
 *
 * - Si no se pasan `geometryRefs`, se usan las celdas distintas no nulas de
 *   `infraGeoProfile` (las escuelas con perfil geográfico válido).
 * - Horizontes 24/72: ensemble si hay fila (`hazardEnsembleProb`), con la
 *   corrida más reciente y el horizonte más cercano al pedido; si no,
 *   fallback determinístico (pronóstico `precipitacion` + climatología
 *   `precipitacion_diaria`).
 * - Horizonte 240: siempre fallback determinístico; el ensemble no participa.
 * - Si hay pronóstico pero NO climatología completa, se usa el umbral
 *   provisorio (metodo 'umbral_provisorio'; puente mientras se calcula ERA5).
 * - Si falta el pronóstico, `base`/`nivel` son 'sin_dato' (nunca 'verde'
 *   inventado).
 */
export async function obtenerNivelesPeligro(opts?: {
  geometryRefs?: string[]
  horizontes?: HorizontePeligro[]
  ahora?: Date
}): Promise<NivelPeligroCelda[]> {
  const db = getDb()
  const ahora = opts?.ahora ?? new Date()
  const horizontes: HorizontePeligro[] = opts?.horizontes ?? [24, 72, 240]
  const geometryRefs = opts?.geometryRefs ?? (await listarGeometryRefs(db))

  // Con 0 celdas no se toca la DB: `inArray` con array vacío no es confiable.
  if (geometryRefs.length === 0) return []

  // Lecturas por lote: a lo sumo 3 consultas para TODAS las celdas, en vez de
  // hasta `celdas * horizontes * 3` consultas individuales.
  const usaEnsemble = horizontes.some((horizonte) => horizonte !== 240)
  const filasEnsemblePorCelda = usaEnsemble
    ? await cargarFilasEnsemblePorLote(db, geometryRefs)
    : new Map<string, FilaEnsemble[]>()
  const pronosticosPorCelda = await cargarPronosticosPorLote(
    db,
    geometryRefs,
    VARIABLE_PRONOSTICO_PRECIPITACION,
    opts?.ahora,
  )
  const umbralesPorCelda = await cargarUmbralesPorLote(
    db,
    geometryRefs,
    VARIABLE_CLIMATOLOGIA_PRECIPITACION,
    opts?.ahora,
  )

  const celdas: NivelPeligroCelda[] = []
  for (const geometryRef of geometryRefs) {
    for (const horizonte of horizontes) {
      celdas.push(
        calcularNivelCeldaSync(
          geometryRef,
          horizonte,
          ahora,
          filasEnsemblePorCelda.get(geometryRef),
          pronosticosPorCelda.get(geometryRef),
          umbralesPorCelda.get(geometryRef) ?? null,
        ),
      )
    }
  }
  return celdas
}

/**
 * Capa 1 de peligro por caudal para un punto de río: pronóstico `caudal` más
 * reciente contra climatología `caudal_diario` (calculada por
 * jobs/calcular-climatologia-caudal.ts).
 *
 * Si falta el pronóstico o la climatología se devuelve `null`: a diferencia de
 * `NivelPeligroCelda`, `NivelCaudalPunto` no tiene campo `base`, así que la
 * ausencia de dato se modela como el objeto entero ausente y nunca como un
 * nivel 'sin_dato' dentro del objeto.
 *
 * `ahora` (opcional) fija la consulta as-of: sólo cuentan las corridas con
 * `corridaEn <= ahora` y la climatología con `calculadoEn <= ahora`, así una
 * lectura histórica no usa pronósticos ni umbrales emitidos después. Sin `ahora`
 * rige el pronóstico y la climatología más recientes disponibles.
 */
export async function obtenerNivelCaudal(
  puntoId: string,
  opts?: { ahora?: Date },
): Promise<NivelCaudalPunto | null> {
  const db = getDb()

  // El "caudal actual" es el horizonte más chico de la corrida más reciente.
  const pronostico = await cargarPronostico(
    db,
    puntoId,
    VARIABLE_PRONOSTICO_CAUDAL,
    'menor',
    undefined,
    opts?.ahora,
  )
  const umbrales = await cargarUmbralesClimatologia(
    db,
    puntoId,
    VARIABLE_CLIMATOLOGIA_CAUDAL,
    opts?.ahora,
  )
  if (pronostico === null || umbrales === null) return null

  // nivelDesdeDeterministico es genérica: compara magnitudes, así que el
  // caudal en m3/s usa el mismo criterio de umbral que la precipitación.
  const { nivel } = nivelDesdeDeterministico(
    pronostico.valor,
    umbrales.p90,
    umbrales.p95,
    umbrales.p99,
  )
  return {
    puntoId,
    percentilActual: percentilAproximado(pronostico.valor, umbrales),
    nivel,
    emitidoEn: pronostico.corridaEn,
    validoHasta: pronostico.validoEn,
  }
}

// Orden de severidad para "peor nivel". `sin_dato` NO es una severidad: sólo
// gana la agregación cuando NINGUNA celda con escuelas tiene un nivel
// concreto (nunca se completa un departamento en 'verde' por descarte).
const SEVERIDAD_NIVEL: Record<Exclude<NivelPeligro, 'sin_dato'>, number> = {
  verde: 0,
  amarillo: 1,
  naranja: 2,
  rojo: 3,
}

/**
 * Agregación por departamento (plan base §5.3): el nivel del departamento es
 * el PEOR nivel entre las celdas que tienen al menos una escuela, para el
 * mismo horizonte. `celdasPorDepartamento` mapea departamento → lista de
 * `geometryRef` de las celdas con escuelas de ese departamento (ya resuelta
 * por el llamador vía `infraGeoProfile.departamento`/`geometryRef`; esta
 * función no toca la DB, sólo agrega niveles ya calculados).
 *
 * Si TODAS las celdas del departamento están en `sin_dato` (o el
 * departamento no tiene ninguna celda con nivel calculado para ese
 * horizonte), el resultado es `sin_dato` — nunca 'verde' por descarte.
 */
export function agregarNivelPorDepartamento(
  niveles: NivelPeligroCelda[],
  celdasPorDepartamento: Record<string, string[]>,
  horizonte: HorizontePeligro,
): Record<string, NivelPeligro> {
  const nivelPorCelda = new Map<string, NivelPeligro>()
  for (const fila of niveles) {
    if (fila.horizonteHoras === horizonte) nivelPorCelda.set(fila.geometryRef, fila.nivel)
  }

  const resultado: Record<string, NivelPeligro> = {}
  for (const [departamento, geometryRefs] of Object.entries(celdasPorDepartamento)) {
    let peor: NivelPeligro = 'sin_dato'
    for (const geometryRef of geometryRefs) {
      const nivel = nivelPorCelda.get(geometryRef)
      if (nivel === undefined || nivel === 'sin_dato') continue
      if (peor === 'sin_dato' || SEVERIDAD_NIVEL[nivel] > SEVERIDAD_NIVEL[peor]) {
        peor = nivel
      }
    }
    resultado[departamento] = peor
  }
  return resultado
}
