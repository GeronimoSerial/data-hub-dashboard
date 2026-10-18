// Probabilidad de superación del terreno escolar por el nivel del Paraná
// (U5 de "Motor v0.4/PLAN_IMPLEMENTACION.md"). Ver docs/motor-v0.4/superacion-terreno.md.
//
// Módulo puro: sin DB ni reloj. Con el ensamble conjunto `analogos-v2` (la
// referencia es la estación del tramo de la escuela; la compañera, el otro
// hidrómetro que la encierra; mismas fechas análogas), cada miembro da una
// trayectoria de cota absoluta en el sitio por interpolación por km, y
//   P(h) = fracción de miembros cuyo máximo en la ventana h alcanza la cota.
// Las ventanas comparten miembros, así que P(24) ≤ P(72) ≤ P(240), y una cota
// menor nunca baja P. No es agua dentro del edificio: es el agua del cauce
// principal alcanzando el terreno, suponiendo conexión hidráulica y sin
// modelar defensas.
import { DIAS_HORIZONTE, type EnsambleConjunto } from './hidrologia/analogos'
import { MODELO_TEMPORAL_VERSION_V2 } from './hidrologia/analogos-v2'
import type { ResultadoAltimetria } from './altimetria'
import type { EstimacionV04 } from './contratos'
import { HORIZONTES_V04, MOTIVOS_V04, type HorizonteV04 } from './config'
import { nivelEnSitio, type UbicacionRio } from './transferencia-nivel'

export const METODO_SUPERACION_TERRENO = `${MODELO_TEMPORAL_VERSION_V2}+transferencia-km`
export const SUPERACION_TERRENO_VERSION = 'superacion-terreno-v1'

type Ubicada = Extract<UbicacionRio, { estado: 'ubicada' }>
/** Abstención previa a la transferencia (p. ej. escuela sin coordenadas). */
export type UbicacionNoEstimable = { estado: 'no_estimable'; motivo: string }
export type EventoTerreno = { principal: EstimacionV04; conservador: EstimacionV04 }

/** Estaciones del ensamble: referencia = tramo de la escuela, compañera = la otra. */
export function estacionesDelEnsamble(u: Ubicada): { referencia: string; companera: string } {
  const companera = u.aguasArriba.estacionId === u.estacionTramoId ? u.aguasAbajo.estacionId : u.aguasArriba.estacionId
  return { referencia: u.estacionTramoId, companera }
}

export type TrayectoriasSitio =
  | { fechas: string[]; niveles: number[][]; fueraDeRangoHistorico: boolean | null }
  | { motivo: string }

/**
 * Cota absoluta en el sitio para los días asOf+1 … asOf+10, miembro a miembro.
 * Un miembro existe sólo si ambas estaciones tienen la ventana en esa fecha.
 */
export function trayectoriasSitio(u: Ubicada, ensamble: EnsambleConjunto): TrayectoriasSitio {
  const { companera } = estacionesDelEnsamble(u)
  const ref = ensamble.referencia
  if (ref.estado !== 'estimado') return { motivo: ref.motivo }
  const otra = ensamble.estaciones[companera]
  if (!otra) return { motivo: MOTIVOS_V04.nivelLocalSinDistribucion }
  if (otra.estado !== 'estimado') return { motivo: otra.motivo }
  const refEsArriba = u.aguasArriba.estacionId === u.estacionTramoId
  const porFecha = new Map(otra.fechasAnalogas.map((f, k) => [f, otra.trayectorias[k]]))
  const fechas: string[] = []
  const niveles: number[][] = []
  ref.fechasAnalogas.forEach((fecha, k) => {
    const tOtra = porFecha.get(fecha)
    if (!tOtra) return
    const tRef = ref.trayectorias[k]
    const dias: number[] = []
    // Índice desfase + d − 1 = día asOf + d en cada estación (ver analogos.ts).
    for (let d = 1; d <= DIAS_HORIZONTE[240]; d++) {
      const hRef = tRef[ref.desfaseDias + d - 1]
      const hOtra = tOtra[otra.desfaseDias + d - 1]
      dias.push(nivelEnSitio(u, refEsArriba ? { aguasArribaM: hRef, aguasAbajoM: hOtra } : { aguasArribaM: hOtra, aguasAbajoM: hRef }))
    }
    fechas.push(fecha)
    niveles.push(dias)
  })
  if (fechas.length === 0) return { motivo: 'sin_miembros_completos' }
  return { fechas, niveles, fueraDeRangoHistorico: ref.diagnostico?.fueraDeRangoHistorico ?? null }
}

type Cotas = { principal: number | string; conservador: number | string }

function cotasDe(altimetria: ResultadoAltimetria | null): Cotas {
  if (altimetria === null) {
    return { principal: MOTIVOS_V04.cotaTerrenoPendiente, conservador: MOTIVOS_V04.cotaConservadoraPendiente }
  }
  if (altimetria.estado === 'pendiente') return { principal: altimetria.motivo, conservador: altimetria.motivo }
  return {
    principal: altimetria.cotaPrincipalM ?? 'principal_sin_copernicus',
    conservador: altimetria.cotaConservadoraM,
  }
}

export function estimarSuperacionTerreno(params: {
  ubicacion: UbicacionRio | UbicacionNoEstimable
  /** null cuando la ubicación no es estimable (no se calcula ensamble). */
  ensamble: EnsambleConjunto | null
  /** null = sin altimetría importada para la escuela. */
  altimetria: ResultadoAltimetria | null
}): Record<HorizonteV04, EventoTerreno> {
  const { ubicacion: u } = params
  const cotas = cotasDe(params.altimetria)
  const motivoRio =
    u.estado !== 'ubicada' ? u.motivo
    : params.ensamble === null ? MOTIVOS_V04.nivelLocalSinDistribucion
    : null
  const tray = u.estado === 'ubicada' && params.ensamble !== null ? trayectoriasSitio(u, params.ensamble) : null
  const motivoHidro = motivoRio ?? (tray !== null && 'motivo' in tray ? tray.motivo : null)

  const salida = {} as Record<HorizonteV04, EventoTerreno>
  for (const h of HORIZONTES_V04) {
    const estimar = (cota: number | string): EstimacionV04 => {
      const motivos = [...new Set([...(motivoHidro ? [motivoHidro] : []), ...(typeof cota === 'string' ? [cota] : [])])]
      if (motivos.length > 0 || u.estado !== 'ubicada' || tray === null || !('niveles' in tray)) {
        return { probabilidad: null, estado: 'no_estimable', motivos, ventanaHoras: h }
      }
      const cotaM = cota as number
      const dias = DIAS_HORIZONTE[h]
      const superan = tray.niveles.filter((n) => Math.max(...n.slice(0, dias)) >= cotaM).length
      const { referencia, companera } = estacionesDelEnsamble(u)
      return {
        probabilidad: superan / tray.niveles.length,
        estado: 'modelada',
        motivos: [],
        metodo: METODO_SUPERACION_TERRENO,
        version: SUPERACION_TERRENO_VERSION,
        ventanaHoras: h,
        diagnostico: {
          cotaM,
          kmRio: u.kmRio,
          t: u.t,
          distanciaEjeKm: u.distanciaEjeKm,
          estacionReferencia: referencia,
          estacionCompanera: companera,
          miembros: tray.niveles.length,
          fueraDeRangoHistorico: tray.fueraDeRangoHistorico,
          // Ceros INA supuestos en datum IGN histórico; terreno en SRVN16
          // (Copernicus convertido aprox.): diferencia no corregida.
          datumCeroSupuesto: true,
          conexionHidraulicaSupuesta: true,
          defensasNoModeladas: true,
        },
      }
    }
    salida[h] = { principal: estimar(cotas.principal), conservador: estimar(cotas.conservador) }
  }
  return salida
}

/**
 * P(máximo del nivel en el sitio dentro de la ventana ≥ cota) para varias cotas
 * arbitrarias (p. ej. cota conservadora − margen de error vertical), con el
 * mismo ensamble y la misma transferencia km que `estimarSuperacionTerreno`.
 * null si la ubicación o el ensamble no permiten trayectorias.
 */
export function probabilidadesSobreCotas(params: {
  ubicacion: UbicacionRio | UbicacionNoEstimable
  ensamble: EnsambleConjunto | null
  cotasM: readonly number[]
}): Record<HorizonteV04, number[]> | null {
  const { ubicacion: u } = params
  if (u.estado !== 'ubicada' || params.ensamble === null) return null
  const tray = trayectoriasSitio(u, params.ensamble)
  if (!('niveles' in tray)) return null
  const salida = {} as Record<HorizonteV04, number[]>
  for (const h of HORIZONTES_V04) {
    const maximos = tray.niveles.map((n) => Math.max(...n.slice(0, DIAS_HORIZONTE[h])))
    salida[h] = params.cotasM.map((c) => maximos.filter((m) => m >= c).length / maximos.length)
  }
  return salida
}

// Huso fijo UTC-3, igual que la serie diaria A5 (T3).
const DESFASE_LOCAL_MS = 3 * 3600 * 1000

/** Fecha local `YYYY-MM-DD` de un instante ISO. */
export function fechaLocal(instante: string): string {
  return new Date(Date.parse(instante) - DESFASE_LOCAL_MS).toISOString().slice(0, 10)
}

/**
 * Nivel actual: la serie diaria A5 y la lectura de Prefectura comparten escala
 * (mismo hidrómetro). La lectura, más fresca, sólo agrega su fecha si es
 * posterior al último diario y no posterior a asOf; un día ya presente en A5
 * conserva el valor A5. La vigencia (≤ 2 días) la aplica el modelo temporal.
 */
export function fusionarLecturaActual<T extends { fecha: string; valorM: number }>(
  filas: readonly T[],
  lectura: { fecha: string; valorM: number } | null,
  asOfFecha: string,
): Array<T | { fecha: string; valorM: number }> {
  const ultima = filas.length > 0 ? filas[filas.length - 1].fecha : ''
  if (lectura === null || !Number.isFinite(lectura.valorM) || lectura.fecha > asOfFecha || lectura.fecha <= ultima) return [...filas]
  return [...filas, { fecha: lectura.fecha, valorM: lectura.valorM }]
}
