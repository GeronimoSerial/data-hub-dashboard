// Insumos del río para las reglas v0.4 (job candidato y harness de
// evaluación). Módulo puro: sin DB ni reloj (asOf por parámetro).
// - T10d: depura cada serie diaria A5 (picos aislados, valores no físicos,
//   inicio de historia por estación) ANTES de análogos, récords y referencias.
// - Escenarios de subida (T10), referencia estable y récord (T10c).
// - Máximos por miembro de los análogos de cada escala (P(máx ≥ h_crit), T10d).
// - Zona modelada: superación del terreno (T6), tendencia (T10), P con margen
//   (T10b) y altura crítica en la escala de referencia (T10d).
import { BANDA_EXPOSICION_V04_M, MARGEN_ERROR_DEM_V04_M } from '../motor/config'
import type { EvidenciaRioProbabilistica } from '../motor/tipos'
import type { HorizontePeligro } from '../motor/puertos'
import type { EscenarioSubidaEstacion } from '../motor/escenarios-subida'
import { referenciaNivelEstacion, type ReferenciaNivelEstacion } from '../motor/referencia-nivel'
import {
  aplicarEvidenciaSeco,
  alturaCriticaCalibrada,
  alturaCriticaModelada,
  defensaDeLocalidad,
  diagnosticoAlturaCritica,
  evaluarAlcanceAlturaCritica,
  maximosEscala,
  offsetUtilizable,
  type FuenteAlturaCritica,
  type InfoAlturaCritica,
  type MaximosEscala,
} from '../motor/altura-critica'
import { evidenciaSecoS2 } from '../motor/evidencia-seco-s2'
import type { AltimetriaPorCue } from './altimetria-adaptador'
import type { EscuelaPadronV04 } from './padron'
import type { InsumosTerrenoV04 } from './terreno-adaptador'
import { estacionesDelEnsamble, estimarSuperacionTerreno, fechaLocal, probabilidadesSobreCotas, type EventoTerreno, type UbicacionNoEstimable } from './superacion-terreno'
import { nivelEnSitio, tramoDeLocalidad, ubicarEscuelaEnRio, type UbicacionRio } from './transferencia-nivel'
import { crearSerieDiaria, type EnsambleConjunto } from './hidrologia/analogos'
import { ensambleConjuntoV2, estimarAnalogosV2 } from './hidrologia/analogos-v2'
import { depurarSerieDiaria } from './hidrologia/depuracion'
import { construirEscenariosSubida, tendenciaEnSitio, type AlcanceTendencia } from './escenarios-estacion'

export type AlcanceMargen = NonNullable<EvidenciaRioProbabilistica['alcanceMargen']>
const HORIZONTES: readonly HorizontePeligro[] = [24, 72, 240]
const redondear2 = (x: number) => Math.round(x * 100) / 100

export type InsumosRioV04 = {
  /** Terreno con las series ya depuradas (null si no pudo cargarse). */
  terreno: InsumosTerrenoV04 | null
  descartadasPorEstacion: Map<string, number>
  escenarios: Map<string, EscenarioSubidaEstacion>
  referencias: Map<string, ReferenciaNivelEstacion>
  maximosEscala: Map<string, MaximosEscala>
  superacion: Map<string, Record<number, EventoTerreno>>
  tendencias: Map<string, Record<number, AlcanceTendencia> | null>
  alcancesMargen: Map<string, Record<number, AlcanceMargen>>
}

export function prepararRioV04(params: {
  padron: readonly EscuelaPadronV04[]
  terreno: InsumosTerrenoV04 | null
  altimetria: AltimetriaPorCue | null
  asOf: string
}): InsumosRioV04 {
  const asOfFecha = fechaLocal(params.asOf)
  const descartadasPorEstacion = new Map<string, number>()
  let terreno = params.terreno
  if (terreno) {
    const series = new Map([...terreno.series].map(([id, filas]) => {
      const r = depurarSerieDiaria(filas, id)
      descartadasPorEstacion.set(id, r.descartadas.length)
      return [id, r.filas] as const
    }))
    terreno = { ...terreno, series }
  }
  const escenarios = terreno
    ? construirEscenariosSubida({ asOf: params.asOf, series: terreno.series, lecturas: terreno.lecturasPrefectura })
    : new Map<string, EscenarioSubidaEstacion>()
  const referencias = new Map<string, ReferenciaNivelEstacion>(
    [...(terreno?.series ?? [])].map(([id, filas]) => [id, referenciaNivelEstacion(filas, asOfFecha)]),
  )
  const series = new Map([...(terreno?.series ?? [])].map(([id, filas]) => [id, crearSerieDiaria(filas)]))
  const maximos = new Map<string, MaximosEscala>()
  for (const [id, serie] of series) {
    const m = maximosEscala(estimarAnalogosV2(serie, asOfFecha))
    if (m) maximos.set(id, m)
  }
  const zona = estimarZonaModelada({ ...params, terreno, series, escenarios, referencias, asOfFecha })
  return { terreno, descartadasPorEstacion, escenarios, referencias, maximosEscala: maximos, ...zona }
}

function estimarZonaModelada(params: {
  padron: readonly EscuelaPadronV04[]
  terreno: InsumosTerrenoV04 | null
  altimetria: AltimetriaPorCue | null
  series: Map<string, ReturnType<typeof crearSerieDiaria>>
  escenarios: ReadonlyMap<string, EscenarioSubidaEstacion>
  referencias: ReadonlyMap<string, ReferenciaNivelEstacion>
  asOfFecha: string
}): Pick<InsumosRioV04, 'superacion' | 'tendencias' | 'alcancesMargen'> {
  const { terreno, series } = params
  const ensambles = new Map<string, EnsambleConjunto | null>()
  const ensambleDe = (u: Extract<UbicacionRio, { estado: 'ubicada' }>) => {
    const { referencia, companera } = estacionesDelEnsamble(u)
    const clave = `${referencia}|${companera}`
    if (!ensambles.has(clave)) {
      const ref = series.get(referencia)
      const otra = series.get(companera)
      ensambles.set(clave, ref && otra ? ensambleConjuntoV2(ref, { [companera]: otra }, params.asOfFecha) : null)
    }
    return ensambles.get(clave) ?? null
  }
  const superacion = new Map<string, Record<number, EventoTerreno>>()
  const tendencias = new Map<string, Record<number, AlcanceTendencia> | null>()
  const alcancesMargen = new Map<string, Record<number, AlcanceMargen>>()
  for (const escuela of params.padron) {
    const altimetria = params.altimetria?.porCue.get(escuela.cueAnexo) ?? null
    const geo = terreno?.escuelas.get(escuela.cueAnexo)
    // La falta de ubicación precede a cualquier otro motivo.
    const ubicacion: UbicacionNoEstimable | UbicacionRio =
      escuela.motivoUbicacion !== null ? { estado: 'no_estimable', motivo: escuela.motivoUbicacion }
      : !terreno ? { estado: 'no_estimable', motivo: 'insumos_terreno_no_disponibles' }
      : !geo ? { estado: 'no_estimable', motivo: 'ubicacion_escuela_no_disponible' }
      : ubicarEscuelaEnRio({
          punto: { lat: geo.lat, lon: geo.lon },
          estacionTramoId: tramoDeLocalidad(geo.localidad, terreno.tramos),
          estaciones: terreno.estaciones,
        })
    const ensamble = ubicacion.estado === 'ubicada' ? ensambleDe(ubicacion) : null
    const evento = estimarSuperacionTerreno({ ubicacion, ensamble, altimetria })
    superacion.set(escuela.cueAnexo, evento)
    // Escenario "si se mantiene esta tendencia" contra la cota conservadora.
    const cotaConservadora = altimetria?.estado === 'candidata' ? altimetria.cotaConservadoraM : null
    const tendencia = ubicacion.estado === 'ubicada' && cotaConservadora !== null ? tendenciaEnSitio(ubicacion, params.escenarios, cotaConservadora) : null
    tendencias.set(escuela.cueAnexo, tendencia)
    if (cotaConservadora === null) continue
    // Mismo margen de error vertical y banda que la zona DEM (T10b).
    const umbral = cotaConservadora - MARGEN_ERROR_DEM_V04_M
    const ps = probabilidadesSobreCotas({ ubicacion, ensamble, cotasM: [umbral, umbral - BANDA_EXPOSICION_V04_M] })
    if (ps === null || ubicacion.estado !== 'ubicada' || ensamble === null) continue
    const alturas = alturaCriticaModeladaEscuela({
      u: ubicacion, ensamble, cotaConservadora, tendencia, localidad: geo?.localidad ?? null, cueAnexo: escuela.cueAnexo, referencias: params.referencias,
    })
    const porH = {} as Record<number, AlcanceMargen>
    for (const [h, [pUmbral, pBanda]] of Object.entries(ps)) {
      porH[Number(h)] = { cotaConservadoraM: cotaConservadora, pUmbral, pBanda, alturaCritica: alturas?.[Number(h) as HorizontePeligro] ?? null }
    }
    alcancesMargen.set(escuela.cueAnexo, porH)
    // Diagnóstico persistido en resultado_v04 (principal y conservador).
    if (alturas) {
      for (const h of HORIZONTES) {
        const diag = diagnosticoAlturaCritica(alturas[h])
        for (const e of [evento[h].principal, evento[h].conservador]) if (e.estado === 'modelada') e.diagnostico = { ...e.diagnostico, ...diag }
      }
    }
  }
  return { superacion, tendencias, alcancesMargen }
}

// Zona modelada (T10d): altura crítica en la escala de referencia del
// ensamble. Offset calibrado (b = 1) si existe; si no, inversión de la
// transferencia km con desplazamiento paralelo de ambas escalas.
function alturaCriticaModeladaEscuela(p: {
  u: Extract<UbicacionRio, { estado: 'ubicada' }>
  ensamble: EnsambleConjunto
  cotaConservadora: number
  tendencia: Record<number, AlcanceTendencia> | null
  localidad: string | null
  cueAnexo: string
  referencias: ReadonlyMap<string, ReferenciaNivelEstacion>
}): Record<HorizontePeligro, InfoAlturaCritica> | null {
  const { referencia, companera } = estacionesDelEnsamble(p.u)
  const ref = p.ensamble.referencia
  const otra = p.ensamble.estaciones[companera]
  if (ref.estado !== 'estimado' || !otra || otra.estado !== 'estimado') return null
  const refEsArriba = p.u.aguasArriba.estacionId === referencia
  const nivelSitioM = nivelEnSitio(p.u, refEsArriba ? { aguasArribaM: ref.h0M, aguasAbajoM: otra.h0M } : { aguasArribaM: otra.h0M, aguasAbajoM: ref.h0M })
  const umbral = p.cotaConservadora - MARGEN_ERROR_DEM_V04_M
  const offset = offsetUtilizable(referencia)
  const fuente: FuenteAlturaCritica = offset ? 'calibrada' : 'cero+km'
  const crudas = offset
    ? alturaCriticaCalibrada(offset.aM, p.cotaConservadora)
    : (() => {
        const alturaCriticaM = alturaCriticaModelada({ hReferenciaM: ref.h0M, nivelSitioM, umbralM: umbral })
        return { alturaCriticaM, alturaCriticaBandaM: redondear2(alturaCriticaM - BANDA_EXPOSICION_V04_M) }
      })()
  const ev = evidenciaSecoS2(p.cueAnexo)
  const evMisma = ev && ev.estacionId === referencia ? ev : null
  const conSeco = aplicarEvidenciaSeco(crudas, evMisma)
  const det = {} as Record<HorizontePeligro, number | null>
  for (const h of HORIZONTES) det[h] = p.tendencia?.[h] ? redondear2(p.tendencia[h].nivelSitioM - nivelSitioM) : null
  const defensa = defensaDeLocalidad(p.localidad)
  const alcances = evaluarAlcanceAlturaCritica({
    alturaCriticaM: conSeco.alturaCriticaM,
    alturaCriticaBandaM: conSeco.alturaCriticaBandaM,
    h0M: ref.h0M,
    maximos: maximosEscala(ref),
    subidaDeterministaM: det,
    defensa,
    aEstacionM: offset ? offset.aM : redondear2(nivelSitioM - ref.h0M),
  })
  const pAlcanzarPorHorizonte = { 24: alcances[24].pAlcanzar, 72: alcances[72].pAlcanzar, 240: alcances[240].pAlcanzar }
  const salida = {} as Record<HorizontePeligro, InfoAlturaCritica>
  for (const h of HORIZONTES) {
    salida[h] = {
      ...alcances[h],
      estacionId: referencia,
      fuente,
      alturaCriticaM: conSeco.alturaCriticaM,
      alturaCriticaBandaM: conSeco.alturaCriticaBandaM,
      h0M: ref.h0M,
      record: p.referencias.get(referencia)?.record ?? null,
      pAlcanzarPorHorizonte,
      evidenciaSecoS2: evMisma ? { ...evMisma, elevada: conSeco.elevadaPorSeco } : null,
      defensa,
    }
  }
  return salida
}
