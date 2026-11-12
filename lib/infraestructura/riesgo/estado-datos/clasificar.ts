// Clasificación pura del estado de jobs y fuentes de datos para el panel
// "Estado de los datos" del Centro de Situación. Regla central: un dato que
// falta nunca se informa como `ok`; un último intento fallido se informa como
// `fallido` aunque exista un éxito anterior.
import { EDAD_MAXIMA_LECTURA_HORAS } from '@/lib/infraestructura/hidrometria/estado-altura'
import type { CoberturaClimatologia, EstadoJobRun } from '../salud'
import { EDAD_MAXIMA_DATO_IMERG_MINUTOS, evaluarFrescuraFuente } from '../salud'
import { filasRecibidas, TOLERANCIA_ATRASO_JOB, type JobEsperado } from '../jobs-esperados'

// `pausado`: job programado que no corre por ENOS_JOBS_ENABLED=false (problema).
// `deshabilitado`: job que no se programa por diseño (neutral, no cuenta).
export type EstadoDato = 'ok' | 'atrasado' | 'fallido' | 'sin_datos' | 'pausado' | 'deshabilitado'
export type GrupoDato = 'riesgo' | 'hidrometria' | 'lluvia' | 'climatologias' | 'geo'

export type ItemEstadoDato = {
  id: string
  grupo: GrupoDato
  nombre: string
  estado: EstadoDato
  // Frase corta en castellano que explica el estado.
  motivo: string
  ultimoExitoEn: string | null
  ultimoIntentoEn: string | null
  ultimoError: string | null
  // Minutos desde el último éxito (o desde el dato más reciente); null sin dato.
  edadMinutos: number | null
  intervaloMinutos: number | null
}

export type EstadoDatos = {
  items: ItemEstadoDato[]
  problemas: number
  generadoEn: string
}

// Cadencia del run de riesgo (calcular-riesgo cada 6 h, ver jobs-esperados.ts).
export const INTERVALO_RUN_RIESGO_MINUTOS = 360
const LARGO_MAXIMO_ERROR = 160

const PRIORIDAD: Record<EstadoDato, number> = {
  fallido: 0,
  sin_datos: 1,
  pausado: 2,
  atrasado: 3,
  ok: 4,
  deshabilitado: 5,
}

export function esProblema(estado: EstadoDato): boolean {
  return estado === 'fallido' || estado === 'sin_datos' || estado === 'pausado' || estado === 'atrasado'
}

const NOMBRE_JOB: Record<string, { nombre: string; grupo: GrupoDato }> = {
  'calcular-riesgo': { nombre: 'Cálculo de riesgo escolar', grupo: 'riesgo' },
  'situacion-corte': { nombre: 'Corte del Centro de Situación', grupo: 'riesgo' },
  'episodios-derivados': { nombre: 'Episodios derivados', grupo: 'riesgo' },
  'veredicto-diario': { nombre: 'Veredicto diario', grupo: 'riesgo' },
  'veredicto-cierre': { nombre: 'Cierre del veredicto', grupo: 'riesgo' },
  'sync-prefectura-alturas': { nombre: 'Alturas de Prefectura', grupo: 'hidrometria' },
  'sync-prefectura-historico': { nombre: 'Histórico de Prefectura', grupo: 'hidrometria' },
  'sync-pronostico-caudal': { nombre: 'Pronóstico de caudal', grupo: 'hidrometria' },
  'sync-imerg': { nombre: 'Lluvia observada IMERG', grupo: 'lluvia' },
  'sync-synop-lluvia': { nombre: 'Lluvia SYNOP', grupo: 'lluvia' },
  'sync-radar-meteo': { nombre: 'Pronóstico meteorológico', grupo: 'lluvia' },
  'sync-radar-ensemble': { nombre: 'Ensamble meteorológico (radar)', grupo: 'lluvia' },
  'sync-ensemble': { nombre: 'Ensamble de lluvia', grupo: 'lluvia' },
  'sync-seasonal': { nombre: 'Pronóstico estacional', grupo: 'lluvia' },
  'sync-smn-alertas': { nombre: 'Avisos meteorológicos', grupo: 'lluvia' },
  'climatologia-caudal': { nombre: 'Climatología de caudal', grupo: 'climatologias' },
  'climatologia-precipitacion': { nombre: 'Climatología de precipitación', grupo: 'climatologias' },
  'climatologia-imerg': { nombre: 'Climatología IMERG', grupo: 'climatologias' },
  'importar-exposicion-rio-dem': { nombre: 'Exposición al río (DEM)', grupo: 'geo' },
}

const GRUPO_FUENTE: Record<string, GrupoDato> = {
  'nasa-imerg': 'lluvia',
  'exposicion-rio-dem': 'geo',
}

function minutosDesde(iso: string | null, ahora: Date): number | null {
  if (iso === null) return null
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? null : Math.max(0, Math.round((ahora.getTime() - ms) / 60_000))
}

export function sanearError(error: string | null | undefined): string | null {
  if (!error) return null
  const limpio = error.replace(/\s+/g, ' ').trim()
  if (limpio === '') return null
  return limpio.length > LARGO_MAXIMO_ERROR ? `${limpio.slice(0, LARGO_MAXIMO_ERROR - 1)}…` : limpio
}

const FORMATO_DIA = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

function formatearDia(iso: string): string {
  const p = Object.fromEntries(FORMATO_DIA.formatToParts(new Date(iso)).map((x) => [x.type, x.value]))
  return `${p.day}/${p.month}/${p.year}`
}

function formatearDuracion(minutos: number): string {
  if (minutos < 120) return `${minutos} min`
  if (minutos < 48 * 60) return `${Math.round(minutos / 60)} h`
  return `${Math.round(minutos / 1440)} días`
}

export function clasificarJob(params: {
  job: JobEsperado
  ultima: EstadoJobRun | undefined
  enosJobsEnabled: boolean
  ahora: Date
}): ItemEstadoDato {
  const { job, ultima, ahora } = params
  const meta = NOMBRE_JOB[job.nombre] ?? { nombre: job.nombre, grupo: 'riesgo' as const }
  const ultimoExitoEn = ultima?.ultimaCompletadaEn ?? null
  const base = {
    id: `job:${job.nombre}`,
    grupo: meta.grupo,
    nombre: meta.nombre,
    ultimoExitoEn,
    ultimoIntentoEn: ultima?.actualizadaEn ?? null,
    ultimoError: null,
    edadMinutos: minutosDesde(ultimoExitoEn, ahora),
    intervaloMinutos: job.intervaloMinutos,
  }
  // Un job no programado es neutral con o sin pausa; sólo un job programado
  // que no corre por la pausa operativa cuenta como problema.
  if (!job.habilitado) {
    return { ...base, estado: 'deshabilitado', motivo: 'No programado en producción.' }
  }
  if (!params.enosJobsEnabled) {
    return {
      ...base,
      estado: 'pausado',
      motivo: 'Jobs batch detenidos por pausa operativa (ENOS_JOBS_ENABLED=false).',
    }
  }
  if (ultima === undefined) {
    return { ...base, estado: 'sin_datos', motivo: 'Nunca corrió.' }
  }
  if (ultima.estado === 'fallido') {
    return {
      ...base,
      estado: 'fallido',
      motivo: `Falló la última corrida (intento ${ultima.intento}).`,
      ultimoError: sanearError(ultima.errorSaneado),
    }
  }
  if (ultima.leaseVencido) {
    return { ...base, estado: 'fallido', motivo: 'La última corrida quedó interrumpida.' }
  }
  if (ultimoExitoEn === null) {
    return { ...base, estado: 'sin_datos', motivo: 'Nunca completó una corrida.' }
  }
  // I2: una corrida completada que recibió menos filas que el mínimo del job no
  // es `ok`. Sin contador o sin mínimo (IMERG) no se evalúa: un dato desconocido
  // nunca degrada a sin_datos.
  const recibidas = filasRecibidas(job, ultima.contadoresUltimaCompletada)
  if (job.minimoFilas !== undefined && recibidas !== null && recibidas < job.minimoFilas) {
    return {
      ...base,
      estado: 'sin_datos',
      motivo: `Última corrida completada con ${recibidas} filas; se esperan al menos ${job.minimoFilas}.`,
    }
  }
  const limite = job.intervaloMinutos * TOLERANCIA_ATRASO_JOB
  if (base.edadMinutos !== null && base.edadMinutos > limite) {
    return {
      ...base,
      estado: 'atrasado',
      motivo: `Sin corrida completa hace ${formatearDuracion(base.edadMinutos)}; se espera cada ${formatearDuracion(job.intervaloMinutos)}.`,
    }
  }
  return { ...base, estado: 'ok', motivo: `Se espera cada ${formatearDuracion(job.intervaloMinutos)}.` }
}

export function clasificarPrefectura(params: {
  estaciones: ReadonlyArray<{ estacionId: string; nombre: string }>
  ultimaPorEstacion: ReadonlyMap<string, string>
  ahora: Date
}): ItemEstadoDato {
  const limite = EDAD_MAXIMA_LECTURA_HORAS * 60
  let masReciente: string | null = null
  const vencidas: string[] = []
  for (const estacion of params.estaciones) {
    const medidaEn = params.ultimaPorEstacion.get(estacion.estacionId) ?? null
    const edad = minutosDesde(medidaEn, params.ahora)
    if (edad === null || edad > limite) vencidas.push(estacion.nombre)
    if (medidaEn !== null && (masReciente === null || medidaEn > masReciente)) masReciente = medidaEn
  }
  const base = {
    id: 'dato:prefectura',
    grupo: 'hidrometria' as const,
    nombre: 'Lecturas de Prefectura',
    ultimoExitoEn: masReciente,
    ultimoIntentoEn: null,
    ultimoError: null,
    edadMinutos: minutosDesde(masReciente, params.ahora),
    intervaloMinutos: null,
  }
  const total = params.estaciones.length
  if (masReciente === null) return { ...base, estado: 'sin_datos', motivo: 'Ninguna estación tiene lecturas.' }
  if (vencidas.length > 0) {
    return {
      ...base,
      estado: 'atrasado',
      motivo: `${vencidas.length} de ${total} estaciones sin lectura de las últimas ${EDAD_MAXIMA_LECTURA_HORAS} h: ${vencidas.join(', ')}.`,
    }
  }
  return { ...base, estado: 'ok', motivo: `Las ${total} estaciones tienen lectura de las últimas ${EDAD_MAXIMA_LECTURA_HORAS} h.` }
}

export function clasificarRunVigente(params: { publicadoEn: string | null; ahora: Date }): ItemEstadoDato {
  const edad = minutosDesde(params.publicadoEn, params.ahora)
  const base = {
    id: 'dato:run-riesgo',
    grupo: 'riesgo' as const,
    nombre: 'Run de riesgo vigente',
    ultimoExitoEn: params.publicadoEn,
    ultimoIntentoEn: null,
    ultimoError: null,
    edadMinutos: edad,
    intervaloMinutos: INTERVALO_RUN_RIESGO_MINUTOS,
  }
  if (edad === null) return { ...base, estado: 'sin_datos', motivo: 'No hay un run de riesgo publicado.' }
  if (edad > INTERVALO_RUN_RIESGO_MINUTOS * TOLERANCIA_ATRASO_JOB) {
    return { ...base, estado: 'atrasado', motivo: `Publicado hace ${formatearDuracion(edad)}; se espera cada 6 h.` }
  }
  return { ...base, estado: 'ok', motivo: `Publicado hace ${formatearDuracion(edad)}; se espera cada 6 h.` }
}

export function clasificarImerg(params: { desde: string | null; hasta: string | null; ahora: Date }): ItemEstadoDato {
  const edad = minutosDesde(params.hasta, params.ahora)
  const base = {
    id: 'dato:imerg',
    grupo: 'lluvia' as const,
    nombre: 'Observaciones IMERG',
    ultimoExitoEn: params.hasta,
    ultimoIntentoEn: null,
    ultimoError: null,
    edadMinutos: edad,
    intervaloMinutos: 30,
  }
  if (edad === null || params.desde === null) {
    return { ...base, estado: 'sin_datos', motivo: 'No hay observaciones IMERG guardadas.' }
  }
  const cobertura = `Cobertura desde el ${formatearDia(params.desde)}.`
  if (edad > EDAD_MAXIMA_DATO_IMERG_MINUTOS) {
    return { ...base, estado: 'atrasado', motivo: `El dato más nuevo tiene ${formatearDuracion(edad)}. ${cobertura}` }
  }
  return { ...base, estado: 'ok', motivo: cobertura }
}

export function clasificarClimatologia(cobertura: CoberturaClimatologia): ItemEstadoDato {
  const base = {
    id: 'dato:climatologia-precipitacion',
    grupo: 'climatologias' as const,
    nombre: 'Cobertura de la climatología de precipitación',
    ultimoExitoEn: null,
    ultimoIntentoEn: null,
    ultimoError: null,
    edadMinutos: null,
    intervaloMinutos: null,
  }
  const detalle = `${cobertura.celdasUsables} de ${cobertura.celdasTotal} celdas con al menos ${cobertura.minimoUsable} años.`
  if (cobertura.celdasTotal === 0 || cobertura.celdasUsables === 0) {
    return { ...base, estado: 'sin_datos', motivo: cobertura.celdasTotal === 0 ? 'No hay celdas para calcular.' : detalle }
  }
  if (cobertura.celdasUsables < cobertura.celdasTotal) return { ...base, estado: 'atrasado', motivo: detalle }
  return { ...base, estado: 'ok', motivo: detalle }
}

export function clasificarFuente(params: {
  provider: string
  estado: string
  ultimoExitoEn: string | null
  ultimoIntentoEn: string | null
  ultimoErrorSaneado: string | null
  ttlMinutos: number
  datoMasRecienteImerg: string | null
  ahora: Date
}): ItemEstadoDato {
  const frescura = evaluarFrescuraFuente({
    provider: params.provider,
    ultimoExitoEn: params.ultimoExitoEn,
    ttlMinutos: params.ttlMinutos,
    datoMasRecienteEn: params.datoMasRecienteImerg,
    ahora: params.ahora,
  })
  const base = {
    id: `fuente:${params.provider}`,
    grupo: GRUPO_FUENTE[params.provider] ?? ('lluvia' as const),
    nombre: `Fuente ${params.provider}`,
    ultimoExitoEn: params.ultimoExitoEn,
    ultimoIntentoEn: params.ultimoIntentoEn,
    ultimoError: null,
    edadMinutos: frescura.frescuraMinutos,
    intervaloMinutos: frescura.limiteMinutos,
  }
  if (params.estado !== 'ok') {
    return {
      ...base,
      estado: 'fallido',
      motivo: params.estado === 'degradado' ? 'La última consulta tuvo errores.' : 'La fuente no respondió.',
      ultimoError: sanearError(params.ultimoErrorSaneado),
    }
  }
  if (params.ultimoExitoEn === null || frescura.frescuraMinutos === null) {
    return { ...base, estado: 'sin_datos', motivo: 'Nunca respondió con datos.' }
  }
  if (frescura.vencida) {
    return { ...base, estado: 'atrasado', motivo: `Dato de hace ${formatearDuracion(frescura.frescuraMinutos)}; vence a las ${formatearDuracion(frescura.limiteMinutos)}.` }
  }
  return { ...base, estado: 'ok', motivo: `Vence a las ${formatearDuracion(frescura.limiteMinutos)}.` }
}

export function clasificarDatasets(
  publicaciones: ReadonlyArray<{ datasetId: string; nombre: string; publicadaEn: string }>,
): ItemEstadoDato[] {
  const base = { grupo: 'geo' as const, ultimoIntentoEn: null, ultimoError: null, edadMinutos: null, intervaloMinutos: null }
  if (publicaciones.length === 0) {
    return [{ ...base, id: 'dataset:ninguno', nombre: 'Datos geográficos y estáticos', estado: 'sin_datos', motivo: 'No hay datasets publicados.', ultimoExitoEn: null }]
  }
  return publicaciones.map((p) => ({
    ...base,
    id: `dataset:${p.datasetId}`,
    nombre: p.nombre,
    estado: 'ok' as const,
    motivo: 'Dato estático publicado; se actualiza por importación.',
    ultimoExitoEn: p.publicadaEn,
  }))
}

export function armarEstadoDatos(params: { items: ItemEstadoDato[]; ahora: Date }): EstadoDatos {
  const items = [...params.items].sort((a, b) => PRIORIDAD[a.estado] - PRIORIDAD[b.estado])
  return {
    items,
    problemas: items.filter((i) => esProblema(i.estado)).length,
    generadoEn: params.ahora.toISOString(),
  }
}
