// Escenarios de subida posible del río por estación (reglas v0.4, F3). Módulo
// puro: sin DB ni reloj. Ver docs/motor-v0.4/auditoria-v03.md (F3).
//
// El nivel actual y la tendencia salen SIEMPRE de las lecturas oficiales de
// Prefectura (`hidro_lectura`, máximo por día local ≤ asOf). La serie diaria
// INA A5 sólo alimenta la historia de los análogos (p90), que llega calculada.
import type { HorizontePeligro } from './puertos'
import {
  DIAS_POR_HORIZONTE_V04,
  EDAD_MAX_LECTURA_TENDENCIA_DIAS,
  ONDA_MAX_V04_M,
  SALTO_MAX_DIARIO_M,
  VENTANA_TENDENCIA_CORTA_DIAS,
  VENTANA_TENDENCIA_MEDIA_DIAS,
} from './config'

const HORIZONTES: readonly HorizontePeligro[] = [24, 72, 240]
const DIA_MS = 86_400_000
// Huso fijo UTC−3, igual que la serie diaria A5.
const DESFASE_LOCAL_MS = 3 * 3_600_000

export type LecturaPrefectura = { medidaEn: string; lecturaM: number | null; inconsistente?: boolean | null }
export type DiaNivel = { fecha: string; valorM: number }

const fechaLocal = (instanteMs: number) => new Date(instanteMs - DESFASE_LOCAL_MS).toISOString().slice(0, 10)
const indiceDia = (fecha: string) => Math.round(Date.parse(`${fecha}T00:00:00Z`) / DIA_MS)
const redondear3 = (x: number) => Math.round(x * 1000) / 1000

/** Máximo de las lecturas consistentes por día local, sólo medidas ≤ asOf. */
export function maximosDiariosPrefectura(lecturas: readonly LecturaPrefectura[], asOf: string): DiaNivel[] {
  const asOfMs = Date.parse(asOf)
  const porDia = new Map<string, number>()
  for (const l of lecturas) {
    if (l.inconsistente === true || l.lecturaM === null || !Number.isFinite(l.lecturaM)) continue
    const ms = Date.parse(l.medidaEn)
    if (!Number.isFinite(ms) || ms > asOfMs) continue
    const fecha = fechaLocal(ms)
    porDia.set(fecha, Math.max(porDia.get(fecha) ?? Number.NEGATIVE_INFINITY, l.lecturaM))
  }
  return [...porDia].map(([fecha, valorM]) => ({ fecha, valorM })).sort((a, b) => a.fecha.localeCompare(b.fecha))
}

export type Tendencia = {
  /** Subida media por día en la ventana (puede ser negativa). */
  tasaDiariaM: number
  /** Suma de las variaciones válidas de la ventana. */
  subidaAcumuladaM: number
  /** Nivel actual: último día cuya variación de entrada no fue descartada. */
  h0M: number
  fechaH0: string
  diasCubiertos: number
  saltosDescartados: number
}

/**
 * Tendencia de los últimos `ventanaDias` días que terminan en el último día
 * con lectura (edad ≤ EDAD_MAX_LECTURA_TENDENCIA_DIAS). Las variaciones entre
 * días con lectura se prorratean por el hueco; una variación diaria de más de
 * SALTO_MAX_DIARIO_M se descarta como lectura espuria (y el día del salto no
 * cuenta como nivel actual). Exige cubrir al menos la mitad de la ventana.
 */
export function tendenciaReciente(diarios: readonly DiaNivel[], asOf: string, ventanaDias: number): Tendencia | null {
  const asOfDia = indiceDia(fechaLocal(Date.parse(asOf)))
  const previos = diarios.filter((d) => indiceDia(d.fecha) <= asOfDia)
  const ultimo = previos.at(-1)
  if (!ultimo || asOfDia - indiceDia(ultimo.fecha) > EDAD_MAX_LECTURA_TENDENCIA_DIAS) return null
  const desde = indiceDia(ultimo.fecha) - ventanaDias
  const ventana = previos.filter((d) => indiceDia(d.fecha) >= desde)
  let suma = 0
  let dias = 0
  let saltos = 0
  let h0 = ventana[0]
  for (let i = 1; i < ventana.length; i++) {
    const hueco = indiceDia(ventana[i].fecha) - indiceDia(ventana[i - 1].fecha)
    const delta = ventana[i].valorM - ventana[i - 1].valorM
    if (Math.abs(delta) / hueco > SALTO_MAX_DIARIO_M) {
      saltos += 1
      continue
    }
    suma += delta
    dias += hueco
    h0 = ventana[i]
  }
  if (dias < Math.ceil(ventanaDias / 2)) return null
  return {
    tasaDiariaM: redondear3(suma / dias),
    subidaAcumuladaM: redondear3(suma),
    h0M: h0.valorM,
    fechaH0: h0.fecha,
    diasCubiertos: dias,
    saltosDescartados: saltos,
  }
}

export type CriterioSubida = 'analogos' | 'tendencia' | 'tendencia+onda' | 'ninguno'

export type EscenarioHorizonte = {
  /** p90 de la subida máxima en la ventana según análogos (≥ 0); null sin análogos. */
  analogosP90M: number | null
  tendenciaCortaM: number | null
  tendenciaMediaM: number | null
  ondaM: number
  /** max(análogos, tendencia media + onda), nunca negativa. */
  posibleM: number
  decide: CriterioSubida
}

export type EscenarioSubidaEstacion = {
  estacionId: string
  /** Nivel actual de Prefectura (máximo diario, sin saltos espurios). */
  h0M: number | null
  fechaH0: string | null
  tasaCortaM: number | null
  tasaMediaM: number | null
  /** Exceso de subida de la estación aguas arriba en la ventana media (acotado). */
  ondaM: number | null
  estacionAguasArriba: string | null
  porHorizonte: Record<HorizontePeligro, EscenarioHorizonte>
}

/** Escenario determinístico (tendencia media + onda) de un horizonte. */
export function subidaDeterminista(e: EscenarioSubidaEstacion, h: HorizontePeligro): number {
  const p = e.porHorizonte[h]
  return (p.tendenciaMediaM ?? 0) + p.ondaM
}

export function combinarEscenarios(params: {
  estacionId: string
  asOf: string
  /** Lecturas de Prefectura de la estación (crudas). */
  lecturas: readonly LecturaPrefectura[]
  /** p90 de la subida máxima por horizonte según análogos; null = no disponible. */
  analogosP90: Partial<Record<HorizontePeligro, number | null>> | null
  /** Sólo para el Paraná aguas abajo de Corrientes: la estación inmediata aguas arriba. */
  aguasArriba?: { estacionId: string; lecturas: readonly LecturaPrefectura[] } | null
}): EscenarioSubidaEstacion {
  const diarios = maximosDiariosPrefectura(params.lecturas, params.asOf)
  const corta = tendenciaReciente(diarios, params.asOf, VENTANA_TENDENCIA_CORTA_DIAS)
  const media = tendenciaReciente(diarios, params.asOf, VENTANA_TENDENCIA_MEDIA_DIAS)
  let ondaM: number | null = null
  if (params.aguasArriba && media) {
    const arriba = tendenciaReciente(maximosDiariosPrefectura(params.aguasArriba.lecturas, params.asOf), params.asOf, VENTANA_TENDENCIA_MEDIA_DIAS)
    if (arriba) ondaM = redondear3(Math.min(ONDA_MAX_V04_M, Math.max(0, arriba.subidaAcumuladaM - media.subidaAcumuladaM)))
  }
  const porHorizonte = {} as Record<HorizontePeligro, EscenarioHorizonte>
  for (const h of HORIZONTES) {
    const dias = DIAS_POR_HORIZONTE_V04[h]
    const analogo = params.analogosP90?.[h]
    const analogosP90M = analogo === null || analogo === undefined ? null : redondear3(Math.max(0, analogo))
    const tendenciaCortaM = corta ? redondear3(Math.max(0, corta.tasaDiariaM) * dias) : null
    const tendenciaMediaM = media ? redondear3(Math.max(0, media.tasaDiariaM) * dias) : null
    const onda = h >= 72 ? (ondaM ?? 0) : 0
    const determinista = redondear3((tendenciaMediaM ?? 0) + onda)
    const posibleM = Math.max(analogosP90M ?? 0, determinista)
    const decide: CriterioSubida =
      posibleM <= 0 ? 'ninguno'
      : analogosP90M !== null && analogosP90M >= determinista ? 'analogos'
      : onda > 0 ? 'tendencia+onda'
      : 'tendencia'
    porHorizonte[h] = { analogosP90M, tendenciaCortaM, tendenciaMediaM, ondaM: onda, posibleM, decide }
  }
  return {
    estacionId: params.estacionId,
    h0M: media?.h0M ?? corta?.h0M ?? null,
    fechaH0: media?.fechaH0 ?? corta?.fechaH0 ?? null,
    tasaCortaM: corta?.tasaDiariaM ?? null,
    tasaMediaM: media?.tasaDiariaM ?? null,
    ondaM,
    estacionAguasArriba: params.aguasArriba?.estacionId ?? null,
    porHorizonte,
  }
}
