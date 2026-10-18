// Construcción pura del resultado v0.4 por CUE/anexo × horizonte y de su
// cobertura (sin DB ni reloj: `asOf` llega por parámetro).
//
// En T1 (U0+U1, odd/tasks/motor-v0-4.md) todavía no hay altimetría, ingesta INA
// ni modelo temporal: TODA estimación es `no_estimable` con sus motivos. Se
// emite igual una fila por escuela y horizonte para que el universo y la
// cobertura sean auditables desde la primera corrida candidata.
import {
  ESCENARIOS_V04,
  EVENTOS_V04,
  esquemaResultadoEscuelaV04,
  type CoberturaV04,
  type EstimacionV04,
  type ModoRun,
  type ResultadoEscuelaV04,
  type UbicacionV04,
} from './contratos'
import { HORIZONTES_V04, MOTIVOS_V04, MOTOR_V04_VERSION, type HorizonteV04 } from './config'
import type { EscuelaPadronV04 } from './padron'

function noEstimable(ventanaHoras: HorizonteV04, motivos: string[]): EstimacionV04 {
  return { probabilidad: null, estado: 'no_estimable', motivos, ventanaHoras }
}

function ubicacionDe(escuela: EscuelaPadronV04): UbicacionV04 {
  if (escuela.motivoUbicacion === null) return { estado: 'con_coordenadas', motivos: [] }
  return { estado: escuela.motivoUbicacion, motivos: [escuela.motivoUbicacion] }
}

export function construirResultadoPendienteV04(params: {
  escuela: EscuelaPadronV04
  horizonteHoras: HorizonteV04
  asOf: string
  modo: ModoRun
  /** Superación del terreno ya estimada (T6); si falta, queda pendiente como en T1. */
  superacionTerreno?: ResultadoEscuelaV04['superacionTerreno']
}): ResultadoEscuelaV04 {
  const { escuela, horizonteHoras: h } = params
  const ubicacion = ubicacionDe(escuela)
  // La falta de ubicación precede a cualquier otro motivo: sin coordenadas no
  // hay cota ni tramo, aunque existieran los modelos.
  const previos = ubicacion.motivos
  const resultado: ResultadoEscuelaV04 = {
    modeloVersion: MOTOR_V04_VERSION,
    modo: params.modo,
    cueAnexo: escuela.cueAnexo,
    horizonteHoras: h,
    asOf: params.asOf,
    ubicacion,
    superacionTerreno: params.superacionTerreno ?? {
      principal: noEstimable(h, [
        ...previos,
        MOTIVOS_V04.cotaTerrenoPendiente,
        MOTIVOS_V04.nivelLocalSinDistribucion,
        MOTIVOS_V04.transferenciaHidraulicaPendiente,
      ]),
      conservador: noEstimable(h, [
        ...previos,
        MOTIVOS_V04.cotaConservadoraPendiente,
        MOTIVOS_V04.nivelLocalSinDistribucion,
        MOTIVOS_V04.transferenciaHidraulicaPendiente,
      ]),
    },
    interrupcionEducativa: {
      principal: noEstimable(h, [...previos, MOTIVOS_V04.accesosSinModeloOperativo]),
      conservador: noEstimable(h, [...previos, MOTIVOS_V04.accesosSinModeloOperativo]),
    },
    cotaIngresoEdificio: { valorM: null, motivo: MOTIVOS_V04.umbralIngresoNoDisponible },
    calibracionEscolar: 'pendiente',
  }
  // Se valida contra el contrato antes de devolver: un resultado inválido es
  // un error de programación y debe cortar la corrida, no persistirse.
  return esquemaResultadoEscuelaV04.parse(resultado)
}

export function resumirCoberturaV04(params: {
  padron: readonly EscuelaPadronV04[]
  resultados: readonly ResultadoEscuelaV04[]
}): CoberturaV04 {
  const porEventoHorizonte: CoberturaV04['porEventoHorizonte'] = []
  const abstencionesPorMotivo: Record<string, number> = {}

  for (const evento of EVENTOS_V04) {
    for (const escenario of ESCENARIOS_V04) {
      for (const horizonteHoras of HORIZONTES_V04) {
        const conteo = { modeladas: 0, calibradas: 0, noEstimables: 0 }
        for (const r of params.resultados) {
          if (r.horizonteHoras !== horizonteHoras) continue
          const e = r[evento][escenario]
          if (e.estado === 'modelada') conteo.modeladas += 1
          else if (e.estado === 'calibrada') conteo.calibradas += 1
          else {
            conteo.noEstimables += 1
            for (const m of e.motivos) abstencionesPorMotivo[m] = (abstencionesPorMotivo[m] ?? 0) + 1
          }
        }
        porEventoHorizonte.push({ evento, escenario, horizonteHoras, ...conteo })
      }
    }
  }

  const conCoordenadas = params.padron.filter((e) => e.motivoUbicacion === null).length
  return {
    totalPadron: params.padron.length,
    conCoordenadas,
    sinUbicacionUtilizable: params.padron.length - conCoordenadas,
    resultadosEsperados: params.padron.length * HORIZONTES_V04.length,
    resultadosEmitidos: params.resultados.length,
    porEventoHorizonte,
    abstencionesPorMotivo,
  }
}
