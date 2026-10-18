// Modelo temporal por estación `analogos-v1`: trayectorias análogas empíricas
// sobre las alturas diarias de Prefectura (serie INA A5, escala local en m).
// Ver docs/motor-v0.4/modelo-temporal.md.
//
// Módulo puro: sin DB, red ni reloj. Sólo se leen valores con fecha ≤ asOf:
// el nivel actual (≤ asOf) y ventanas análogas que terminan antes de asOf.
// Los valores son lecturas diarias, no picos intradiarios: el "máximo en 24 h"
// es la lectura del día siguiente, no la cresta horaria.
//
// Método: se buscan días históricos d en la misma época del año, con nivel y
// tendencia parecidos al estado actual, y se suman sus incrementos futuros
// Δj = h(d+j) − h(d) al nivel actual h0. Cada análogo con ventana completa es un
// miembro; no se imputan días faltantes ni se inventan pesos. Las ventanas de
// 24/72/240 h comparten miembros, por eso P(24) ≤ P(72) ≤ P(240).

export const MODELO_TEMPORAL_VERSION = 'analogos-v1'

export type ParametrosAnalogos = {
  /** Edad máxima, en días, de la última lectura para usarla como nivel actual. */
  edadMaxDias: number
  /** Semiancho de la ventana estacional por día del año. */
  ventanaEstacionalDias: number
  /** |h(d) − h0| máximo para aceptar un análogo. */
  toleranciaNivelM: number
  /** Días de la tendencia h(t) − h(t − n). */
  diasTendencia: number
  /** |tendencia| por debajo de este valor se clasifica como estable. */
  umbralTendenciaM: number
  minAnalogos: number
}

// Elegidos a priori (no ajustados sobre el período de evaluación); la
// sensibilidad a tolerancia y ventana está en el documento del modelo.
export const PARAMETROS_ANALOGOS_V1: ParametrosAnalogos = {
  edadMaxDias: 2,
  ventanaEstacionalDias: 30,
  toleranciaNivelM: 0.3,
  diasTendencia: 3,
  umbralTendenciaM: 0.05,
  minAnalogos: 30,
}

export const DIAS_HORIZONTE = { 24: 1, 72: 3, 240: 10 } as const
export type HorizonteHoras = keyof typeof DIAS_HORIZONTE
const DIAS_MAX = 10
const DIA_MS = 86_400_000

export type FilaDiaria = { fecha: string; valorM: number }

/** Serie densa por día; NaN marca un día sin lectura. */
export type SerieDiaria = {
  readonly inicio: number
  readonly valores: Float64Array
  readonly diaDelAnio: Int16Array
}

const indiceDia = (fecha: string) => Math.floor(Date.parse(`${fecha}T00:00:00Z`) / DIA_MS)
const fechaDeIndice = (i: number) => new Date(i * DIA_MS).toISOString().slice(0, 10)

export function crearSerieDiaria(filas: readonly FilaDiaria[]): SerieDiaria {
  if (filas.length === 0) return { inicio: 0, valores: new Float64Array(0), diaDelAnio: new Int16Array(0) }
  const indices = filas.map((f) => indiceDia(f.fecha))
  const inicio = indices.reduce((a, b) => Math.min(a, b))
  const largo = indices.reduce((a, b) => Math.max(a, b)) - inicio + 1
  const valores = new Float64Array(largo).fill(Number.NaN)
  filas.forEach((f, k) => {
    if (Number.isFinite(f.valorM)) valores[indices[k] - inicio] = f.valorM
  })
  const diaDelAnio = new Int16Array(largo)
  for (let i = 0; i < largo; i++) {
    const d = new Date((inicio + i) * DIA_MS)
    diaDelAnio[i] = Math.floor((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / DIA_MS)
  }
  return { inicio, valores, diaDelAnio }
}

/** Vista sin copia hasta `fecha` inclusive: lo posterior deja de existir. */
export function recortarSerie(serie: SerieDiaria, fecha: string): SerieDiaria {
  const fin = Math.max(0, Math.min(serie.valores.length, indiceDia(fecha) - serie.inicio + 1))
  return { inicio: serie.inicio, valores: serie.valores.subarray(0, fin), diaDelAnio: serie.diaDelAnio.subarray(0, fin) }
}

function valor(serie: SerieDiaria, i: number): number {
  return i >= 0 && i < serie.valores.length ? serie.valores[i] : Number.NaN
}

type ClaseTendencia = 'sube' | 'baja' | 'estable'

function claseTendencia(serie: SerieDiaria, i: number, p: ParametrosAnalogos): ClaseTendencia | null {
  const t = valor(serie, i) - valor(serie, i - p.diasTendencia)
  if (Number.isNaN(t)) return null
  return t > p.umbralTendenciaM ? 'sube' : t < -p.umbralTendenciaM ? 'baja' : 'estable'
}

function distanciaEstacional(a: number, b: number): number {
  const d = Math.abs(a - b)
  return Math.min(d, 365 - d)
}

export type EstadoActual = { indice: number; h0M: number; desfaseDias: number; tendencia: ClaseTendencia | null }

/** Última lectura con fecha ≤ asOf y edad ≤ edadMaxDias, o null. */
export function estadoActual(serie: SerieDiaria, asOf: string, p: ParametrosAnalogos): EstadoActual | null {
  const iAsOf = indiceDia(asOf) - serie.inicio
  for (let k = 0; k <= p.edadMaxDias; k++) {
    const h = valor(serie, iAsOf - k)
    if (!Number.isNaN(h)) return { indice: iAsOf - k, h0M: h, desfaseDias: k, tendencia: claseTendencia(serie, iAsOf - k, p) }
  }
  return null
}

/** Incrementos Δ1..ΔL desde el índice i; null si falta algún día. */
function incrementos(serie: SerieDiaria, i: number, largo: number): number[] | null {
  const base = valor(serie, i)
  if (Number.isNaN(base)) return null
  const delta: number[] = []
  for (let j = 1; j <= largo; j++) {
    const h = valor(serie, i + j)
    if (Number.isNaN(h)) return null
    delta.push(h - base)
  }
  return delta
}

export type MotivoNoEstimable = 'nivel_actual_no_disponible' | 'analogos_insuficientes'

export type EnsambleEstimado = {
  estado: 'estimado'
  version: typeof MODELO_TEMPORAL_VERSION
  asOf: string
  fechaNivel: string
  h0M: number
  /** Fecha d de cada miembro (alineada con `trayectorias`). */
  fechasAnalogas: string[]
  /**
   * Niveles proyectados h0 + Δj para j = 1..desfase+10 contados desde
   * `fechaNivel`; las ventanas por horizonte empiezan el día siguiente a asOf.
   */
  trayectorias: number[][]
  desfaseDias: number
}

export type EnsambleNoEstimable = {
  estado: 'no_estimable'
  version: typeof MODELO_TEMPORAL_VERSION
  asOf: string
  motivo: MotivoNoEstimable
  analogos: number
}

export type ResultadoAnalogos = EnsambleEstimado | EnsambleNoEstimable

export function estimarAnalogos(serieCompleta: SerieDiaria, asOf: string, p: ParametrosAnalogos = PARAMETROS_ANALOGOS_V1): ResultadoAnalogos {
  const serie = recortarSerie(serieCompleta, asOf)
  const base = { version: MODELO_TEMPORAL_VERSION, asOf } as const
  const estado = estadoActual(serie, asOf, p)
  if (!estado) return { ...base, estado: 'no_estimable', motivo: 'nivel_actual_no_disponible', analogos: 0 }
  const largo = estado.desfaseDias + DIAS_MAX
  const doy = serie.diaDelAnio[estado.indice]
  const fechasAnalogas: string[] = []
  const trayectorias: number[][] = []
  // d + largo < índice de asOf: toda la ventana análoga es pasado estricto.
  for (let d = estado.indice + estado.desfaseDias - largo - 1; d >= 0; d--) {
    if (distanciaEstacional(serie.diaDelAnio[d], doy) > p.ventanaEstacionalDias) continue
    const h = serie.valores[d]
    if (Number.isNaN(h) || Math.abs(h - estado.h0M) > p.toleranciaNivelM) continue
    if (estado.tendencia !== null && claseTendencia(serie, d, p) !== estado.tendencia) continue
    const delta = incrementos(serie, d, largo)
    if (!delta) continue
    fechasAnalogas.push(fechaDeIndice(serie.inicio + d))
    trayectorias.push(delta.map((x) => estado.h0M + x))
  }
  if (trayectorias.length < p.minAnalogos) {
    return { ...base, estado: 'no_estimable', motivo: 'analogos_insuficientes', analogos: trayectorias.length }
  }
  const orden = fechasAnalogas.map((_, k) => k).sort((a, b) => fechasAnalogas[a].localeCompare(fechasAnalogas[b]))
  return {
    ...base,
    estado: 'estimado',
    fechaNivel: fechaDeIndice(serie.inicio + estado.indice),
    h0M: estado.h0M,
    fechasAnalogas: orden.map((k) => fechasAnalogas[k]),
    trayectorias: orden.map((k) => trayectorias[k]),
    desfaseDias: estado.desfaseDias,
  }
}

/** Máximo proyectado de cada miembro en la ventana del horizonte. */
export function maximosVentana(e: Pick<EnsambleEstimado, 'trayectorias' | 'desfaseDias'>, horizonte: HorizonteHoras): number[] {
  const desde = e.desfaseDias
  const hasta = e.desfaseDias + DIAS_HORIZONTE[horizonte]
  return e.trayectorias.map((t) => Math.max(...t.slice(desde, hasta)))
}

/** P(max ≥ umbral) en metros de escala: fracción de miembros. */
export function probabilidadExcedencia(e: Pick<EnsambleEstimado, 'trayectorias' | 'desfaseDias'>, horizonte: HorizonteHoras, umbralM: number): number {
  const m = maximosVentana(e, horizonte)
  return m.filter((x) => x >= umbralM).length / m.length
}

function cuantil(ordenados: number[], q: number): number {
  const h = (ordenados.length - 1) * q
  const lo = Math.floor(h)
  return ordenados[lo] + (h - lo) * ((ordenados[Math.ceil(h)] ?? ordenados[lo]) - ordenados[lo])
}

export function cuantilesMaximo(e: Pick<EnsambleEstimado, 'trayectorias' | 'desfaseDias'>, horizonte: HorizonteHoras) {
  const m = maximosVentana(e, horizonte).sort((a, b) => a - b)
  return { p10: cuantil(m, 0.1), p50: cuantil(m, 0.5), p90: cuantil(m, 0.9) }
}

export type MiembrosEstacion =
  | (Omit<EnsambleEstimado, 'version' | 'asOf'> & { miembrosDescartados: number })
  | { estado: 'no_estimable'; motivo: 'nivel_actual_no_disponible' | 'sin_miembros_completos'; miembrosDescartados: number }

export type EnsambleConjunto = { referencia: ResultadoAnalogos; estaciones: Record<string, MiembrosEstacion> }

/**
 * Ensamble conjunto: las fechas análogas las elige la estación de referencia y
 * cada otra estación aporta su propio Δ en esas MISMAS fechas, conservando la
 * dependencia entre estaciones (T6 interpola miembro a miembro). Una fecha sin
 * ventana completa en una estación elimina ese miembro sólo en esa estación.
 */
export function ensambleConjunto(
  referencia: SerieDiaria,
  otras: Record<string, SerieDiaria>,
  asOf: string,
  p: ParametrosAnalogos = PARAMETROS_ANALOGOS_V1,
): EnsambleConjunto {
  const ref = estimarAnalogos(referencia, asOf, p)
  const estaciones: Record<string, MiembrosEstacion> = {}
  if (ref.estado !== 'estimado') return { referencia: ref, estaciones }
  for (const [id, completa] of Object.entries(otras)) {
    const serie = recortarSerie(completa, asOf)
    const estado = estadoActual(serie, asOf, p)
    if (!estado) {
      estaciones[id] = { estado: 'no_estimable', motivo: 'nivel_actual_no_disponible', miembrosDescartados: ref.fechasAnalogas.length }
      continue
    }
    // El "asOf análogo" es d + desfase de la referencia; la base de esta
    // estación se corre según su propio desfase y la ventana sigue alineada.
    const largo = estado.desfaseDias + DIAS_MAX
    const fechasAnalogas: string[] = []
    const trayectorias: number[][] = []
    for (const fecha of ref.fechasAnalogas) {
      const d = indiceDia(fecha) + (ref.desfaseDias - estado.desfaseDias) - serie.inicio
      const delta = incrementos(serie, d, largo)
      if (!delta) continue
      fechasAnalogas.push(fecha)
      trayectorias.push(delta.map((x) => estado.h0M + x))
    }
    const miembrosDescartados = ref.fechasAnalogas.length - fechasAnalogas.length
    estaciones[id] =
      fechasAnalogas.length === 0
        ? { estado: 'no_estimable', motivo: 'sin_miembros_completos', miembrosDescartados }
        : {
            estado: 'estimado',
            fechaNivel: fechaDeIndice(serie.inicio + estado.indice),
            h0M: estado.h0M,
            fechasAnalogas,
            trayectorias,
            desfaseDias: estado.desfaseDias,
            miembrosDescartados,
          }
  }
  return { referencia: ref, estaciones }
}
