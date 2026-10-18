// Evaluación retrospectiva sin fuga del modelo `analogos-v1`. Módulo puro.
//
// Para cada fecha de evaluación t el modelo y la climatología sólo ven la
// serie recortada hasta t (vista sin copia: lo posterior no existe para ellos);
// la serie completa se usa únicamente para leer el resultado observado, el
// máximo de las lecturas diarias de t+1..t+n. Es una ventana creciente: cada t
// usa toda la historia anterior y nada más.
import {
  DIAS_HORIZONTE,
  type HorizonteHoras,
  type ParametrosAnalogos,
  type SerieDiaria,
  estimarAnalogos,
  probabilidadExcedencia,
  recortarSerie,
} from './analogos'

const DIA_MS = 86_400_000
const HORIZONTES = [24, 72, 240] as const satisfies readonly HorizonteHoras[]
const indiceDia = (fecha: string) => Math.floor(Date.parse(`${fecha}T00:00:00Z`) / DIA_MS)

export type Umbrales = { alerta: number | null; evacuacion: number | null }
export type NombreUmbral = keyof Umbrales

export type RegistroEvaluacion = {
  fecha: string
  p: number
  /** Frecuencia de la misma época del año en la historia anterior a t. */
  pClimatologia: number
  /** 1 si el nivel actual ya alcanza el umbral, 0 si no. */
  pPersistencia: number
  observado: 0 | 1
}

export type EvaluacionEstacion = {
  registros: Record<NombreUmbral, Record<HorizonteHoras, RegistroEvaluacion[]>>
  /** Fechas con ventana observada completa de 240 h (base de la abstención). */
  fechasConObservacion: number
  abstenciones: number
  /** Abstenciones cuyo máximo observado en 240 h alcanzó el umbral: eventos sin pronóstico. */
  abstencionesConExcedencia: Record<NombreUmbral, number>
  motivosAbstencion: Record<string, number>
}

function maximoObservado(serie: SerieDiaria, i: number, dias: number): number | null {
  let max = Number.NEGATIVE_INFINITY
  for (let j = 1; j <= dias; j++) {
    const k = i + j
    const h = k >= 0 && k < serie.valores.length ? serie.valores[k] : Number.NaN
    if (Number.isNaN(h)) return null
    max = Math.max(max, h)
  }
  return max
}

/** Climatología estacional: fracción de días pasados cuya ventana alcanzó el umbral. */
function climatologia(pasado: SerieDiaria, iAsOf: number, dias: number, umbralM: number, p: ParametrosAnalogos): number | null {
  const doy = pasado.diaDelAnio[Math.min(iAsOf, pasado.diaDelAnio.length - 1)]
  let total = 0
  let positivos = 0
  for (let d = iAsOf - dias - 1; d >= 0; d--) {
    const dist = Math.abs(pasado.diaDelAnio[d] - doy)
    if (Math.min(dist, 365 - dist) > p.ventanaEstacionalDias) continue
    const m = maximoObservado(pasado, d, dias)
    if (m === null) continue
    total++
    if (m >= umbralM) positivos++
  }
  return total === 0 ? null : positivos / total
}

export function evaluarEstacion(
  serie: SerieDiaria,
  fechas: readonly string[],
  umbrales: Umbrales,
  p: ParametrosAnalogos,
): EvaluacionEstacion {
  const vacio = () => ({ 24: [], 72: [], 240: [] }) as Record<HorizonteHoras, RegistroEvaluacion[]>
  const registros = { alerta: vacio(), evacuacion: vacio() }
  const motivosAbstencion: Record<string, number> = {}
  let fechasConObservacion = 0
  let abstenciones = 0
  const abstencionesConExcedencia = { alerta: 0, evacuacion: 0 }
  for (const fecha of fechas) {
    const iAsOf = indiceDia(fecha) - serie.inicio
    const max240 = maximoObservado(serie, iAsOf, DIAS_HORIZONTE[240])
    if (max240 === null) continue
    fechasConObservacion++
    const pasado = recortarSerie(serie, fecha)
    const r = estimarAnalogos(pasado, fecha, p)
    if (r.estado !== 'estimado') {
      abstenciones++
      motivosAbstencion[r.motivo] = (motivosAbstencion[r.motivo] ?? 0) + 1
      for (const nombre of ['alerta', 'evacuacion'] as const) {
        const u = umbrales[nombre]
        if (u !== null && max240 >= u) abstencionesConExcedencia[nombre]++
      }
      continue
    }
    const h0 = r.h0M
    for (const nombre of ['alerta', 'evacuacion'] as const) {
      const u = umbrales[nombre]
      if (u === null) continue
      for (const h of HORIZONTES) {
        const dias = DIAS_HORIZONTE[h]
        const pClimatologia = climatologia(pasado, iAsOf, dias, u, p)
        if (pClimatologia === null) continue
        const obs = maximoObservado(serie, iAsOf, dias) as number
        registros[nombre][h].push({
          fecha,
          p: probabilidadExcedencia(r, h, u),
          pClimatologia,
          pPersistencia: h0 >= u ? 1 : 0,
          observado: obs >= u ? 1 : 0,
        })
      }
    }
  }
  return { registros, fechasConObservacion, abstenciones, abstencionesConExcedencia, motivosAbstencion }
}

export type BinConfiabilidad = { desde: number; hasta: number; n: number; pMedia: number | null; frecuenciaObservada: number | null }

export type MetricasBrier = {
  n: number
  positivos: number
  brier: number | null
  /** 1 − BS/BS_ref; null si la referencia es perfecta o no hay muestra. */
  bssClimatologia: number | null
  bssPersistencia: number | null
  confiabilidad: BinConfiabilidad[]
}

const media = (xs: number[]) => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length)

function skill(bs: number | null, ref: number | null): number | null {
  return bs === null || ref === null || ref === 0 ? null : 1 - bs / ref
}

export function metricasBrier(registros: readonly RegistroEvaluacion[], bins = 10): MetricasBrier {
  const bs = media(registros.map((r) => (r.p - r.observado) ** 2))
  const bsClim = media(registros.map((r) => (r.pClimatologia - r.observado) ** 2))
  const bsPers = media(registros.map((r) => (r.pPersistencia - r.observado) ** 2))
  const confiabilidad: BinConfiabilidad[] = Array.from({ length: bins }, (_, k) => {
    const desde = k / bins
    const hasta = (k + 1) / bins
    const en = registros.filter((r) => r.p >= desde && (k === bins - 1 ? r.p <= hasta : r.p < hasta))
    return { desde, hasta, n: en.length, pMedia: media(en.map((r) => r.p)), frecuenciaObservada: media(en.map((r) => r.observado)) }
  })
  return {
    n: registros.length,
    positivos: registros.filter((r) => r.observado === 1).length,
    brier: bs,
    bssClimatologia: skill(bs, bsClim),
    bssPersistencia: skill(bs, bsPers),
    confiabilidad,
  }
}

/** Episodios: positivos separados por ≤ `separacionDias` cuentan como uno. */
export function agruparEpisodios(fechasPositivas: readonly string[], separacionDias: number): number {
  const dias = [...fechasPositivas].map(indiceDia).sort((a, b) => a - b)
  return dias.filter((d, k) => k === 0 || d - dias[k - 1] > separacionDias).length
}

export type Intervalo = { p2_5: number; p97_5: number } | null

export type ResumenEvaluacion = MetricasBrier & {
  episodios: number
  ic95: { brier: Intervalo; bssClimatologia: Intervalo; bssPersistencia: Intervalo }
}

/** Generador determinístico (mulberry32) para que el bootstrap sea reproducible. */
function aleatorio(semilla: number): () => number {
  let a = semilla >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

function intervalo(valores: number[]): Intervalo {
  if (valores.length < 20) return null
  const o = [...valores].sort((a, b) => a - b)
  return { p2_5: o[Math.floor(0.025 * (o.length - 1))], p97_5: o[Math.ceil(0.975 * (o.length - 1))] }
}

/**
 * Métricas con IC 95 % por bootstrap de bloques anuales: se remuestrean años
 * completos para no tratar como independientes fechas de un mismo episodio.
 */
export function resumirEvaluacion(
  registros: readonly RegistroEvaluacion[],
  opciones: { separacionEpisodioDias: number; remuestreos: number; semilla: number },
): ResumenEvaluacion {
  const base = metricasBrier(registros)
  const episodios = agruparEpisodios(registros.filter((r) => r.observado === 1).map((r) => r.fecha), opciones.separacionEpisodioDias)
  const porAnio = new Map<string, RegistroEvaluacion[]>()
  for (const r of registros) porAnio.set(r.fecha.slice(0, 4), [...(porAnio.get(r.fecha.slice(0, 4)) ?? []), r])
  const bloques = [...porAnio.values()]
  const azar = aleatorio(opciones.semilla)
  const muestras = { brier: [] as number[], bssClimatologia: [] as number[], bssPersistencia: [] as number[] }
  for (let b = 0; bloques.length > 1 && b < opciones.remuestreos; b++) {
    const muestra = Array.from({ length: bloques.length }, () => bloques[Math.floor(azar() * bloques.length)]).flat()
    const m = metricasBrier(muestra, 1)
    for (const clave of ['brier', 'bssClimatologia', 'bssPersistencia'] as const) {
      const v = m[clave]
      if (v !== null) muestras[clave].push(v)
    }
  }
  return {
    ...base,
    episodios,
    ic95: {
      brier: intervalo(muestras.brier),
      bssClimatologia: intervalo(muestras.bssClimatologia),
      bssPersistencia: intervalo(muestras.bssPersistencia),
    },
  }
}
