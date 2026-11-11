// Insumos v0.4 del job operativo (T11, docs/motor-v0.4/promocion.md). Carga
// padrón, altimetría y terreno (serie diaria INA + Prefectura) y prepara el río
// v0.4. Nunca lanza: cada insumo que falta o está desactualizado degrada según
// diseño (sin evidencia probabilística, el cálculo usa el río de v0.3 y el
// resultado v0.4 queda `no_estimable` con motivo) y deja el motivo en
// `degradacion` para los metadatos del run.
import { EDAD_MAX_SERIE_INA_V04_DIAS } from '../motor/config'
import type { EvidenciaRioProbabilistica } from '../motor/tipos'
import type { PuertoAltimetriaV04, AltimetriaPorCue } from '../motor-v04/altimetria-adaptador'
import type { ResultadoEscuelaV04 } from '../motor-v04/contratos'
import type { AlcanceTendencia } from '../motor-v04/escenarios-estacion'
import type { EscuelaPadronV04, PuertoPadronV04 } from '../motor-v04/padron'
import { prepararRioV04, type AlcanceMargen, type InsumosRioV04 } from '../motor-v04/preparacion-rio-v04'
import { fechaLocal } from '../motor-v04/superacion-terreno'
import type { InsumosTerrenoV04, PuertoTerrenoV04 } from '../motor-v04/terreno-adaptador'

// Una estación cuya última fila (serie INA con la lectura de Prefectura ya
// fusionada) es más vieja que esto no alimenta el río v0.4 en esta corrida.
export { EDAD_MAX_SERIE_INA_V04_DIAS } from '../motor/config'

export type MotivoDegradacionV04 =
  | 'padron_no_disponible'
  | 'altimetria_no_disponible'
  | 'terreno_no_disponible'
  | 'serie_ina_desactualizada'
  // Se agregan al terminar el bucle de escuelas (ver calcular-riesgo.ts): al
  // menos una celda usó la ingesta previa de respaldo, o al menos una escuela
  // quedó sin dato de peligro a 240 h.
  | 'peligro_240h_respaldo'
  | 'peligro_240h_sin_dato'

export type InsumosOperativoV04 = {
  rio: InsumosRioV04
  escuelas: Map<string, EscuelaPadronV04>
  altimetria: AltimetriaPorCue | null
  degradacion: MotivoDegradacionV04[]
  estacionesDesactualizadas: string[]
}

async function intentar<T>(producir: () => Promise<T | null>): Promise<T | null> {
  try {
    return await producir()
  } catch {
    return null
  }
}

const DIA_MS = 24 * 3600 * 1000

function descartarSeriesViejas(terreno: InsumosTerrenoV04, asOf: string): { terreno: InsumosTerrenoV04; viejas: string[] } {
  const limite = Date.parse(`${fechaLocal(asOf)}T00:00:00Z`) - EDAD_MAX_SERIE_INA_V04_DIAS * DIA_MS
  const viejas: string[] = []
  const series = new Map(terreno.series)
  for (const [id, filas] of terreno.series) {
    const ultima = filas.at(-1)?.fecha
    if (ultima === undefined || Date.parse(`${ultima}T00:00:00Z`) < limite) {
      viejas.push(id)
      series.delete(id)
    }
  }
  return { terreno: { ...terreno, series }, viejas: viejas.sort() }
}

export async function prepararInsumosOperativoV04(params: {
  cueAnexos: readonly string[]
  asOf: string
  padron: PuertoPadronV04
  altimetria: PuertoAltimetriaV04
  terreno: PuertoTerrenoV04
}): Promise<InsumosOperativoV04> {
  const { cueAnexos, asOf } = params
  const degradacion: MotivoDegradacionV04[] = []

  // Universo = escuelas con perfil (el mismo de v0.3); el padrón sólo aporta
  // el estado de ubicación. Sin padrón, todas cuentan como con coordenadas
  // (tienen perfil geográfico).
  const universo = new Set(cueAnexos)
  const padron = await intentar(() => params.padron.listarPadron())
  if (padron === null || padron.length === 0) degradacion.push('padron_no_disponible')
  const escuelas = new Map<string, EscuelaPadronV04>(cueAnexos.map((c) => [c, { cueAnexo: c, motivoUbicacion: null }]))
  for (const e of padron ?? []) if (universo.has(e.cueAnexo)) escuelas.set(e.cueAnexo, e)
  const lista = [...escuelas.values()]

  const altimetria = await intentar(() => params.altimetria.obtener([...cueAnexos]))
  if (altimetria === null) degradacion.push('altimetria_no_disponible')

  let terreno = await intentar(() => params.terreno.cargar([...cueAnexos], asOf))
  let estacionesDesactualizadas: string[] = []
  if (terreno === null) degradacion.push('terreno_no_disponible')
  else {
    const depurado = descartarSeriesViejas(terreno, asOf)
    terreno = depurado.terreno
    estacionesDesactualizadas = depurado.viejas
    if (estacionesDesactualizadas.length > 0) degradacion.push('serie_ina_desactualizada')
  }

  // prepararRioV04 es puro; si aun así fallara, el run sigue sin río v0.4.
  let rio: InsumosRioV04
  try {
    rio = prepararRioV04({ padron: lista, terreno, altimetria, asOf })
  } catch {
    if (!degradacion.includes('terreno_no_disponible')) degradacion.push('terreno_no_disponible')
    rio = prepararRioV04({ padron: lista, terreno: null, altimetria: null, asOf })
  }
  return { rio, escuelas, altimetria, degradacion, estacionesDesactualizadas }
}

// Evidencia probabilística para el motor único: sólo si la superación con cota
// principal es `modelada`; si no, null y el cálculo usa el río de v0.3.
export function rioProbabilisticoDe(
  r: ResultadoEscuelaV04,
  tendencia: AlcanceTendencia | null,
  alcanceMargen: AlcanceMargen | null,
): EvidenciaRioProbabilistica | null {
  const { principal, conservador } = r.superacionTerreno
  if (principal.estado !== 'modelada' || principal.probabilidad === null) return null
  return {
    principal: principal.probabilidad,
    conservador: conservador.estado === 'modelada' ? conservador.probabilidad : null,
    ventanaHoras: r.horizonteHoras,
    metodo: principal.metodo ?? 'desconocido',
    version: principal.version ?? 'desconocida',
    diagnostico: principal.diagnostico,
    tendencia,
    alcanceMargen,
  }
}
