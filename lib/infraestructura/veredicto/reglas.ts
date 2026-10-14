// Reglas deterministas de nivel del veredicto diario (spec §7).
// Funciones puras: sin base de datos ni red. Las entradas llegan ya agregadas.

import type { AmbitoLluvia, LluviaObservadaAmbito, PercentilLluvia } from './lluvia-observada'
import type { AvisoSmnDia, CaudalDia, EnsambleDia, NivelAvisoSmn } from './pronostico'
import type { EstadoAltura, RioDia } from './rios'

export const VERSION_REGLAS = 'reglas-veredicto-v0.1'

export type NivelVeredicto = 'sin_dato' | 'sin_senal' | 'vigilancia' | 'alerta' | 'severo'
export type TipoDia = 'observado' | 'hoy' | 'pronostico'
export type FuenteVeredicto = 'imerg' | 'prefectura' | 'glofas' | 'ensamble' | 'smn'

export type EntradaEvaluacion = {
  tipoDia: TipoDia
  lluvia24: (LluviaObservadaAmbito & { percentilMax: PercentilLluvia | null })[]
  lluvia72: LluviaObservadaAmbito[]
  rios: RioDia[]
  caudal: CaudalDia[]
  ensamble: EnsambleDia[]
  smn: AvisoSmnDia[]
  departamentos: string[]
  /** Falso solo si la consulta al SMN falló; no emitir avisos no es un fallo. */
  smnDisponible?: boolean
}

export type TrazaRegla = {
  regla: string
  ref: string
  valor: number | null
  umbral: number | string | null
  nivel: NivelVeredicto
}

/** Estación de aguas arriba con dato: contexto informativo, nunca eleva el nivel. */
export type AguaArribaVeredicto = {
  estacionId: string
  nombre: string
  rio: 'parana' | 'uruguay'
  estadoMax: EstadoAltura
  alturaMaxM: number | null
  /** Cota de evacuación si el estado es evacuación; si no, la de alerta. Null sin margen. */
  umbralM: number | null
}

export type ResultadoAmbito = {
  ambito: AmbitoLluvia
  nivel: NivelVeredicto
  traza: TrazaRegla[]
  fuentesAusentes: FuenteVeredicto[]
  conSenal: boolean
  /** Sólo el ámbito provincial informa aguas arriba; los departamentos reciben `[]`. */
  aguasArriba: AguaArribaVeredicto[]
}

/** Umbrales de las reglas. Borrador, en calibración (D11). */
export const UMBRALES = {
  /** borrador, en calibración: cobertura mínima de gránulos IMERG para usar una ventana de lluvia. */
  coberturaMinimaImerg: 0.8,
  /** borrador, en calibración: alineado a `umbrales-provisorios-v0.1`. */
  lluvia72Mm: { vigilancia: 80, alerta: 120, severo: 180 },
  /** borrador, en calibración: subida en 24 h de un río en alerta que pasa a severo. */
  rioSubidaSeveroM: 0.3,
  /** borrador, en calibración: margen a alerta bajo el cual un río normal en subida da vigilancia. */
  rioMargenAlertaM: 0.5,
  /** borrador, en calibración: probabilidades de excedencia del ensamble (fracción 0..1). */
  ensamble: {
    p95Vigilancia: 0.3,
    p95Alerta: 0.5,
    p99Alerta: 0.2,
    p99Severo: 0.5,
  },
} as const

const NIVEL_PERCENTIL: Partial<Record<PercentilLluvia, NivelVeredicto>> = {
  p90: 'vigilancia',
  p95: 'alerta',
  p99: 'severo',
}

const NIVEL_SMN: Record<NivelAvisoSmn, NivelVeredicto> = {
  amarillo: 'vigilancia',
  naranja: 'alerta',
  rojo: 'severo',
}

// Fuentes que aplican a cada tipo de día. Pronóstico pasado no entra (se guarda aparte).
const FUENTES_POR_TIPO: Record<TipoDia, readonly FuenteVeredicto[]> = {
  observado: ['imerg', 'prefectura'],
  pronostico: ['glofas', 'ensamble', 'smn'],
  hoy: ['imerg', 'prefectura', 'glofas', 'ensamble', 'smn'],
}

const ORDEN_FUENTES: readonly FuenteVeredicto[] = ['imerg', 'prefectura', 'glofas', 'ensamble', 'smn']

const RANGO: Record<NivelVeredicto, number> = {
  sin_dato: 0,
  sin_senal: 1,
  vigilancia: 2,
  alerta: 3,
  severo: 4,
}

type Presencia = Record<FuenteVeredicto, boolean>

type Evaluacion = {
  disparos: TrazaRegla[]
  presencia: Presencia
  senalRio: boolean
}

function presenciaVacia(): Presencia {
  return { imerg: false, prefectura: false, glofas: false, ensamble: false, smn: false }
}

function nivelMayor(a: NivelVeredicto, b: NivelVeredicto): NivelVeredicto {
  return RANGO[b] > RANGO[a] ? b : a
}

function traza24(l: LluviaObservadaAmbito & { percentilMax: PercentilLluvia | null }): TrazaRegla | null {
  const nivel = l.percentilMax ? NIVEL_PERCENTIL[l.percentilMax] : undefined
  if (!nivel || !l.percentilMax) return null
  return { regla: 'lluvia.obs_24h', ref: 'lluvia.obs_24h.max_mm', valor: l.maxMm, umbral: l.percentilMax, nivel }
}

function traza72(l: LluviaObservadaAmbito): TrazaRegla | null {
  const { vigilancia, alerta, severo } = UMBRALES.lluvia72Mm
  let umbral: number
  let nivel: NivelVeredicto
  if (l.maxMm >= severo) [umbral, nivel] = [severo, 'severo']
  else if (l.maxMm >= alerta) [umbral, nivel] = [alerta, 'alerta']
  else if (l.maxMm >= vigilancia) [umbral, nivel] = [vigilancia, 'vigilancia']
  else return null
  return { regla: 'lluvia.obs_72h', ref: 'lluvia.obs_72h.max_mm', valor: l.maxMm, umbral, nivel }
}

/**
 * Lluvia observada de un ámbito. Cada ventana sólo cuenta si su cobertura
 * alcanza el mínimo; si ninguna alcanza, la fuente `imerg` queda ausente.
 */
function evaluarLluvia(e: EntradaEvaluacion, ambito: AmbitoLluvia): { disparos: TrazaRegla[]; dato: boolean } {
  const disparos: TrazaRegla[] = []
  let dato = false

  const l24 = e.lluvia24.find((l) => l.ambito === ambito)
  if (l24 && l24.cobertura >= UMBRALES.coberturaMinimaImerg) {
    dato = true
    const t = traza24(l24)
    if (t) disparos.push(t)
  }

  const l72 = e.lluvia72.find((l) => l.ambito === ambito)
  if (l72 && l72.cobertura >= UMBRALES.coberturaMinimaImerg) {
    dato = true
    const t = traza72(l72)
    if (t) disparos.push(t)
  }

  return { disparos, dato }
}

function trazaRio(r: RioDia): TrazaRegla | null {
  const ref = `rio.${r.estacionId}.estado_max`
  switch (r.estadoMax) {
    case 'evacuacion':
      return { regla: 'rio.estado', ref, valor: r.alturaMaxM, umbral: 'evacuacion', nivel: 'severo' }
    case 'alerta':
      if (r.tendenciaM24h !== null && r.tendenciaM24h > UMBRALES.rioSubidaSeveroM) {
        return { regla: 'rio.estado', ref, valor: r.tendenciaM24h, umbral: UMBRALES.rioSubidaSeveroM, nivel: 'severo' }
      }
      return { regla: 'rio.estado', ref, valor: r.alturaMaxM, umbral: 'alerta', nivel: 'alerta' }
    case 'normal':
      if (
        r.margenAlertaM !== null &&
        r.margenAlertaM < UMBRALES.rioMargenAlertaM &&
        r.tendenciaM24h !== null &&
        r.tendenciaM24h > 0
      ) {
        return { regla: 'rio.tendencia', ref, valor: r.margenAlertaM, umbral: UMBRALES.rioMargenAlertaM, nivel: 'vigilancia' }
      }
      return null
    default:
      return null
  }
}

function evaluarRios(rios: RioDia[]): { disparos: TrazaRegla[]; dato: boolean; senal: boolean } {
  const disparos: TrazaRegla[] = []
  let dato = false
  let senal = false
  for (const r of rios) {
    if (r.estadoMax !== 'sin_dato') dato = true
    if (r.estadoMax === 'alerta' || r.estadoMax === 'evacuacion') senal = true
    const t = trazaRio(r)
    if (t) disparos.push(t)
  }
  return { disparos, dato, senal }
}

function trazaCaudal(c: CaudalDia): TrazaRegla | null {
  const nivel = c.percentil ? NIVEL_PERCENTIL[c.percentil] : undefined
  if (!nivel || !c.percentil) return null
  return { regla: 'caudal.percentil', ref: `caudal.${c.puntoId}.pico_m3s`, valor: c.picoM3s, umbral: c.percentil, nivel }
}

/**
 * Probabilidades de excedencia del ensamble. En pronóstico futuro el nivel se
 * limita a `alerta`: `severo` futuro sólo sale de caudal p99 o SMN rojo.
 */
function trazaEnsamble(en: EnsambleDia, tipoDia: TipoDia): TrazaRegla | null {
  const u = UMBRALES.ensamble
  let t: TrazaRegla | null = null
  if (en.probP99Max >= u.p99Severo) {
    t = { regla: 'ensamble.prob', ref: 'lluvia.ens.prob_p99', valor: en.probP99Max, umbral: u.p99Severo, nivel: 'severo' }
  } else if (en.probP95Max >= u.p95Alerta) {
    t = { regla: 'ensamble.prob', ref: 'lluvia.ens.prob_p95', valor: en.probP95Max, umbral: u.p95Alerta, nivel: 'alerta' }
  } else if (en.probP99Max >= u.p99Alerta) {
    t = { regla: 'ensamble.prob', ref: 'lluvia.ens.prob_p99', valor: en.probP99Max, umbral: u.p99Alerta, nivel: 'alerta' }
  } else if (en.probP95Max >= u.p95Vigilancia) {
    t = { regla: 'ensamble.prob', ref: 'lluvia.ens.prob_p95', valor: en.probP95Max, umbral: u.p95Vigilancia, nivel: 'vigilancia' }
  }
  if (t && tipoDia === 'pronostico' && t.nivel === 'severo') return { ...t, nivel: 'alerta' }
  return t
}

function trazaSmn(a: AvisoSmnDia): TrazaRegla {
  return { regla: 'smn.aviso', ref: `smn.${a.avisoId}.nivel`, valor: null, umbral: a.nivel, nivel: NIVEL_SMN[a.nivel] }
}

function evaluarDepartamento(id: string, e: EntradaEvaluacion): Evaluacion {
  const fuentes = FUENTES_POR_TIPO[e.tipoDia]
  const ambito = `departamento:${id}` as AmbitoLluvia
  const disparos: TrazaRegla[] = []
  const presencia = presenciaVacia()
  let senalRio = false

  if (fuentes.includes('imerg')) {
    const r = evaluarLluvia(e, ambito)
    disparos.push(...r.disparos)
    presencia.imerg = r.dato
  }

  if (fuentes.includes('prefectura')) {
    const r = evaluarRios(e.rios.filter((x) => x.rol === 'corrientes' && x.departamento === id))
    disparos.push(...r.disparos)
    presencia.prefectura = r.dato
    senalRio = r.senal
  }

  if (fuentes.includes('glofas')) {
    const caudales = e.caudal.filter((c) => c.departamento === id)
    presencia.glofas = caudales.length > 0
    for (const c of caudales) {
      const t = trazaCaudal(c)
      if (t) disparos.push(t)
    }
  }

  if (fuentes.includes('ensamble')) {
    const en = e.ensamble.find((x) => x.departamento === id)
    presencia.ensamble = en !== undefined
    const t = en ? trazaEnsamble(en, e.tipoDia) : null
    if (t) disparos.push(t)
  }

  if (fuentes.includes('smn')) {
    // Sin avisos es dato válido: sólo cuenta como ausente si la consulta falló.
    presencia.smn = e.smnDisponible !== false
    for (const a of e.smn.filter((x) => x.departamento === id)) disparos.push(trazaSmn(a))
  }

  return { disparos, presencia, senalRio }
}

function cerrarAmbito(
  ambito: AmbitoLluvia,
  tipoDia: TipoDia,
  disparos: TrazaRegla[],
  presencia: Presencia,
  senalRio: boolean,
): ResultadoAmbito {
  const fuentes = FUENTES_POR_TIPO[tipoDia]
  const maxDisparo = disparos.reduce<NivelVeredicto | null>((acc, d) => (acc ? nivelMayor(acc, d.nivel) : d.nivel), null)
  const nivel: NivelVeredicto =
    // El SMN sin avisos no prueba que se haya medido algo: `sin_senal` exige al
    // menos una fuente cuantitativa (IMERG, Prefectura, GloFAS o ensamble).
    maxDisparo ?? (fuentes.some((f) => f !== 'smn' && presencia[f]) ? 'sin_senal' : 'sin_dato')
  return {
    ambito,
    nivel,
    traza: disparos,
    fuentesAusentes: ORDEN_FUENTES.filter((f) => fuentes.includes(f) && !presencia[f]),
    conSenal: RANGO[nivel] >= RANGO.vigilancia || senalRio,
    aguasArriba: [],
  }
}

function aguasArribaDe(rios: RioDia[]): AguaArribaVeredicto[] {
  return rios
    .filter((r) => r.rol === 'contexto-aguas-arriba' && r.estadoMax !== 'sin_dato')
    .map((r) => {
      const margen = r.estadoMax === 'evacuacion' ? r.margenEvacM : r.margenAlertaM
      const umbralM = margen === null || r.alturaMaxM === null ? null : Math.round((r.alturaMaxM + margen) * 100) / 100
      return {
        estacionId: r.estacionId,
        nombre: r.nombre,
        rio: r.rio,
        estadoMax: r.estadoMax,
        alturaMaxM: r.alturaMaxM,
        umbralM,
      }
    })
}

/**
 * Evalúa un día: primero el ámbito provincial y luego un resultado por departamento.
 * El nivel provincial es el máximo entre los departamentos y las estaciones de
 * corrientes sin departamento. Sólo las estaciones de corrientes cuentan; las de
 * aguas arriba se listan aparte en `aguasArriba` y nunca elevan el nivel ni entran en la traza.
 * La lluvia provincial se usa sólo para saber si la fuente IMERG tiene dato.
 */
export function evaluarDia(entrada: EntradaEvaluacion): ResultadoAmbito[] {
  const fuentes = FUENTES_POR_TIPO[entrada.tipoDia]

  const departamentos = entrada.departamentos.map((id) => ({
    id,
    ev: evaluarDepartamento(id, entrada),
  }))
  const resultadosDepto = departamentos.map(({ id, ev }) =>
    cerrarAmbito(`departamento:${id}` as AmbitoLluvia, entrada.tipoDia, ev.disparos, ev.presencia, ev.senalRio),
  )

  const presencia = presenciaVacia()
  for (const { ev } of departamentos) {
    for (const f of ORDEN_FUENTES) presencia[f] = presencia[f] || ev.presencia[f]
  }
  const lluviaProvincia = fuentes.includes('imerg') ? evaluarLluvia(entrada, 'provincia') : null
  if (lluviaProvincia?.dato) presencia.imerg = true
  if (fuentes.includes('smn')) presencia.smn = entrada.smnDisponible !== false

  const riosSinDepto = fuentes.includes('prefectura')
    ? evaluarRios(entrada.rios.filter((r) => r.rol === 'corrientes' && r.departamento === null))
    : { disparos: [], dato: false, senal: false }
  if (riosSinDepto.dato) presencia.prefectura = true

  const disparosProvincia = [
    ...departamentos.flatMap(({ ev }) => ev.disparos),
    ...riosSinDepto.disparos,
  ]
  const senalProvincia = departamentos.some(({ ev }) => ev.senalRio) || riosSinDepto.senal

  // Las corrientes sin departamento están dentro de la provincia: sí elevan su nivel.
  const nivelRiosSinDepto = riosSinDepto.disparos.reduce<NivelVeredicto>((acc, d) => nivelMayor(acc, d.nivel), 'sin_dato')
  const nivelProvincia: NivelVeredicto = [...resultadosDepto.map((r) => r.nivel), nivelRiosSinDepto].reduce<NivelVeredicto>(
    (acc, nivel) => nivelMayor(acc, nivel),
    'sin_dato',
  )
  const provincia: ResultadoAmbito = {
    ambito: 'provincia',
    nivel: nivelProvincia,
    traza: disparosProvincia,
    fuentesAusentes: ORDEN_FUENTES.filter((f) => fuentes.includes(f) && !presencia[f]),
    conSenal: RANGO[nivelProvincia] >= RANGO.vigilancia || senalProvincia,
    aguasArriba: aguasArribaDe(entrada.rios),
  }

  return [provincia, ...resultadosDepto]
}
