import { CUE_ANEXO_OPERADOR, NIVEL_CON_ESCUELAS } from '../cuentas-qa'
import { ESPERADOS_HIDRO } from './hidro'
import { ESPERADOS_PARTES } from './partes'
import { ESPERADOS_RADAR } from './radar'
import { ESPERADOS_RIESGO } from './riesgo'
import { DEPARTAMENTOS_ESCUELAS, ESCUELAS, type DepartamentoEscuela } from './escuelas'

// Manifest of expected values for the map e2e seed. Contract and UI specs read from here.
//
// Headline counts (escuelas, alcance, porDepartamento, porNivel) are literals on purpose:
// they are an independent statement of what the seed must produce. verificarCoherencia()
// checks them against the roster (ESCUELAS) and the other constants, so a literal that
// drifts from the seed fails there. Counts derived from lists are computed here.
//
// Change a value here in the same commit that changes the seed.

export { CUE_ANEXO_OPERADOR, DEPARTAMENTOS_ESCUELAS, ESCUELAS, ESPERADOS_HIDRO, ESPERADOS_PARTES, ESPERADOS_RADAR, ESPERADOS_RIESGO, NIVEL_CON_ESCUELAS }

type ConteoPorDepartamento = Record<DepartamentoEscuela, number>

export const ESPERADOS = {
  escuelas: {
    total: 32,
    conCoordenadas: 30,
    sinCoordenadas: 2,
    porDepartamento: { Capital: 11, Goya: 9, 'Paso de los Libres': 6, 'Santo Tomé': 6 } satisfies ConteoPorDepartamento,
    porDepartamentoConCoordenadas: { Capital: 10, Goya: 8, 'Paso de los Libres': 6, 'Santo Tomé': 6 } satisfies ConteoPorDepartamento,
    porNivel: { 1: 12, 2: 8, 4: 6, 5: 6 } as Record<number, number>,
    porNivelConCoordenadas: { 1: 12, 2: 7, 4: 6, 5: 5 } as Record<number, number>,
  },
  // qa-director-nivel: sees only the schools of NIVEL_CON_ESCUELAS.
  alcanceDirectorNivel: {
    nivel: NIVEL_CON_ESCUELAS,
    escuelas: 12,
    conCoordenadas: 12,
  },
  // Schools with a visible parte (at least one active affectation) and the subsets the map filters by.
  partes: {
    visibles: {
      total: ESPERADOS_PARTES.conParteVisible.length,
      cues: ESPERADOS_PARTES.conParteVisible,
      porDepartamento: ESPERADOS_PARTES.porDepartamento,
      porGravedad: ESPERADOS_PARTES.porGravedad,
      porClase: ESPERADOS_PARTES.porClase,
      porApoyo: ESPERADOS_PARTES.porApoyo,
    },
    vigentes: { total: ESPERADOS_PARTES.vigentes.length, cues: ESPERADOS_PARTES.vigentes },
    sinActualizar: { total: ESPERADOS_PARTES.sinActualizar.length, cues: ESPERADOS_PARTES.sinActualizar },
    solucionadasRecientes: { total: ESPERADOS_PARTES.solucionadasRecientes.length, cues: ESPERADOS_PARTES.solucionadasRecientes },
    solucionadaFueraDeVentana: { total: ESPERADOS_PARTES.solucionadaFueraDeVentana.length, cues: ESPERADOS_PARTES.solucionadaFueraDeVentana },
  },
  comedor: {
    total: ESPERADOS_PARTES.conComedor.length,
    cues: ESPERADOS_PARTES.conComedor,
  },
  historial: ESPERADOS_PARTES.historial,
  riesgo: {
    horizonteHoras: ESPERADOS_RIESGO.horizonteHoras,
    escuelas: ESPERADOS_RIESGO.escuelas,
    porNivel: ESPERADOS_RIESGO.porNivel,
    porDepartamento: ESPERADOS_RIESGO.porDepartamento,
  },
  hidrometria: {
    estaciones: {
      total: ESPERADOS_HIDRO.estaciones.length,
      ids: ESPERADOS_HIDRO.estaciones.map((estacion) => estacion.estacionId),
      porEstado: {
        alerta: ESPERADOS_HIDRO.estaciones.filter((estacion) => estacion.estado === 'alerta').length,
        normal: ESPERADOS_HIDRO.estaciones.filter((estacion) => estacion.estado === 'normal').length,
      },
    },
    enAlerta: ESPERADOS_HIDRO.estacionEnAlerta,
  },
  radar: {
    corrida: ESPERADOS_RADAR.corrida,
    escuelasConRadar: { total: ESPERADOS_RADAR.escuelasConRadar.length, cues: ESPERADOS_RADAR.escuelasConRadar },
    alerta: ESPERADOS_RADAR.alerta,
    lluviaObservada: {
      celdas: ESPERADOS_RADAR.lluviaObservada.celdas.length,
      acumuladoMm: ESPERADOS_RADAR.lluviaObservada.celdas.map((celda) => celda.acumuladoMm),
    },
    escuelasAisladas: {
      total: ESPERADOS_RADAR.aisladas.length,
      cues: ESPERADOS_RADAR.aisladas.map((aislada) => aislada.cueAnexo),
    },
    // Aislamiento OSM por escuela aislada, tal como lo sembro seed/radar.ts (indice 0..3, cruces de agua, alternativa sin cruce).
    aislamiento: ESPERADOS_RADAR.aisladas.map((aislada) => ({
      cueAnexo: aislada.cueAnexo,
      nivel: aislada.indiceAislamiento,
      cruces: aislada.crucesAguaCount,
      alternativaSinCruce: aislada.alternativaSinCruce,
    })),
    peligroPorDepartamento: ESPERADOS_RADAR.peligroPorDepartamento,
  },
  // Ranking de evolucion (lib/infraestructura/evolucion.ts construirRanking): escuelas afectadas por departamento
  // sobre las 17 escuelas con parte visible. Orden: escuelas desc, luego alumnos desc, luego nombre.
  // Los alumnos son 0 porque el seed no carga secciones ni alumnos.
  evolucion: {
    rankingDepartamentos: [
      { departamento: 'Capital', escuelasAfectadas: 7, alumnosAlcanzados: 0 },
      { departamento: 'Goya', escuelasAfectadas: 4, alumnosAlcanzados: 0 },
      { departamento: 'Paso de los Libres', escuelasAfectadas: 3, alumnosAlcanzados: 0 },
      { departamento: 'Santo Tomé', escuelasAfectadas: 3, alumnosAlcanzados: 0 },
    ],
    // Una afectacion vigente por parte visible (seed/partes.ts): la suma de la distribucion por motivo es 17.
    afectacionesVigentes: ESPERADOS_PARTES.conParteVisible.length,
  },
} as const

// Mirrors the risk thresholds of lib/infraestructura/riesgo/motor (clasificarNivel, motor/config.ts).
// Kept as a local copy so this manifest does not import app code. If the app thresholds change, update this table.
function nivelDeScore(score: number): string {
  if (score >= 75) return 'muy_alto'
  if (score >= 50) return 'alto'
  if (score >= 25) return 'moderado'
  return 'bajo'
}

function conteoPorNivel(cues: readonly string[]): Record<number, number> {
  const conteo: Record<number, number> = {}
  for (const cue of cues) {
    const escuela = ESCUELAS.find((e) => e.cueAnexo === cue)
    if (!escuela) continue
    conteo[escuela.nivelJurisdiccionalId] = (conteo[escuela.nivelJurisdiccionalId] ?? 0) + 1
  }
  return conteo
}

function sumar(valores: Iterable<number>): number {
  let suma = 0
  for (const valor of valores) suma += valor
  return suma
}

/**
 * Checks that the manifest agrees with itself and with the seed roster.
 * Pure: no database, no network, no app code. Throws one Error listing every inconsistency.
 */
export function verificarCoherencia(): void {
  const problemas: string[] = []
  const afirmar = (condicion: boolean, mensaje: string) => {
    if (!condicion) problemas.push(mensaje)
  }
  const cuesDelRoster = new Set<string>(ESCUELAS.map((e) => e.cueAnexo))
  const conCoordenadas = ESCUELAS.filter((e) => e.lat !== null && e.lon !== null)
  const sinCoordenadas = ESCUELAS.filter((e) => e.lat === null || e.lon === null)

  // Roster
  afirmar(cuesDelRoster.size === ESCUELAS.length, 'roster: duplicate CUE in ESCUELAS')
  afirmar(ESPERADOS.escuelas.total === ESCUELAS.length, `escuelas.total ${ESPERADOS.escuelas.total} != roster ${ESCUELAS.length}`)
  afirmar(ESPERADOS.escuelas.conCoordenadas === conCoordenadas.length, `escuelas.conCoordenadas ${ESPERADOS.escuelas.conCoordenadas} != roster ${conCoordenadas.length}`)
  afirmar(ESPERADOS.escuelas.sinCoordenadas === sinCoordenadas.length, `escuelas.sinCoordenadas ${ESPERADOS.escuelas.sinCoordenadas} != roster ${sinCoordenadas.length}`)
  afirmar(ESPERADOS.escuelas.total === ESPERADOS.escuelas.conCoordenadas + ESPERADOS.escuelas.sinCoordenadas, 'escuelas: total != conCoordenadas + sinCoordenadas')

  for (const departamento of DEPARTAMENTOS_ESCUELAS) {
    const total = ESCUELAS.filter((e) => e.departamento === departamento).length
    const conCoords = conCoordenadas.filter((e) => e.departamento === departamento).length
    afirmar(ESPERADOS.escuelas.porDepartamento[departamento] === total, `porDepartamento ${departamento}: ${ESPERADOS.escuelas.porDepartamento[departamento]} != roster ${total}`)
    afirmar(ESPERADOS.escuelas.porDepartamentoConCoordenadas[departamento] === conCoords, `porDepartamentoConCoordenadas ${departamento}: ${ESPERADOS.escuelas.porDepartamentoConCoordenadas[departamento]} != roster ${conCoords}`)
  }
  afirmar(sumar(Object.values(ESPERADOS.escuelas.porDepartamento)) === ESPERADOS.escuelas.total, 'porDepartamento does not sum to total')
  afirmar(sumar(Object.values(ESPERADOS.escuelas.porDepartamentoConCoordenadas)) === ESPERADOS.escuelas.conCoordenadas, 'porDepartamentoConCoordenadas does not sum to conCoordenadas')

  for (const [nivel, cantidad] of Object.entries(conteoPorNivel(ESCUELAS.map((e) => e.cueAnexo)))) {
    afirmar(ESPERADOS.escuelas.porNivel[Number(nivel)] === cantidad, `porNivel ${nivel}: ${ESPERADOS.escuelas.porNivel[Number(nivel)]} != roster ${cantidad}`)
  }
  const nivelesConCoords = conteoPorNivel(conCoordenadas.map((e) => e.cueAnexo))
  for (const [nivel, cantidad] of Object.entries(nivelesConCoords)) {
    afirmar(ESPERADOS.escuelas.porNivelConCoordenadas[Number(nivel)] === cantidad, `porNivelConCoordenadas ${nivel}: ${ESPERADOS.escuelas.porNivelConCoordenadas[Number(nivel)]} != roster ${cantidad}`)
  }
  afirmar(sumar(Object.values(ESPERADOS.escuelas.porNivel)) === ESPERADOS.escuelas.total, 'porNivel does not sum to total')
  afirmar(sumar(Object.values(ESPERADOS.escuelas.porNivelConCoordenadas)) === ESPERADOS.escuelas.conCoordenadas, 'porNivelConCoordenadas does not sum to conCoordenadas')

  const alcance = ESCUELAS.filter((e) => e.nivelJurisdiccionalId === ESPERADOS.alcanceDirectorNivel.nivel)
  afirmar(ESPERADOS.alcanceDirectorNivel.escuelas === alcance.length, `alcanceDirectorNivel.escuelas ${ESPERADOS.alcanceDirectorNivel.escuelas} != roster ${alcance.length}`)
  afirmar(ESPERADOS.alcanceDirectorNivel.conCoordenadas === alcance.filter((e) => e.lat !== null).length, 'alcanceDirectorNivel.conCoordenadas differs from roster')

  // Every CUE the manifest references must exist in the roster.
  const referencias: Array<[string, readonly string[]]> = [
    ['partes.visibles', ESPERADOS.partes.visibles.cues],
    ['partes.vigentes', ESPERADOS.partes.vigentes.cues],
    ['partes.sinActualizar', ESPERADOS.partes.sinActualizar.cues],
    ['partes.solucionadasRecientes', ESPERADOS.partes.solucionadasRecientes.cues],
    ['partes.solucionadaFueraDeVentana', ESPERADOS.partes.solucionadaFueraDeVentana.cues],
    ['comedor', ESPERADOS.comedor.cues],
    ['riesgo.escuelas', ESPERADOS.riesgo.escuelas.map((e) => e.cueAnexo)],
    ['radar.escuelasConRadar', ESPERADOS.radar.escuelasConRadar.cues],
    ['radar.escuelasAisladas', ESPERADOS.radar.escuelasAisladas.cues],
    ['historial', [ESPERADOS.historial.cue]],
    ['operador', [CUE_ANEXO_OPERADOR]],
  ]
  for (const [origen, cues] of referencias) {
    for (const cue of cues) afirmar(cuesDelRoster.has(cue), `${origen}: CUE ${cue} is not in ESCUELAS`)
  }
  for (const cue of ESPERADOS.radar.escuelasConRadar.cues) {
    const escuela = ESCUELAS.find((e) => e.cueAnexo === cue)
    afirmar(escuela?.lat != null, `radar.escuelasConRadar: ${cue} has no coordinates`)
  }

  // Partes: subsets must agree with each other and with the roster.
  const visibles = new Set<string>(ESPERADOS.partes.visibles.cues)
  const vigentes = new Set<string>(ESPERADOS.partes.vigentes.cues)
  const sinActualizar = new Set<string>(ESPERADOS.partes.sinActualizar.cues)
  afirmar(vigentes.size + sinActualizar.size === visibles.size, 'partes: vigentes + sinActualizar != visibles')
  for (const cue of vigentes) afirmar(visibles.has(cue) && !sinActualizar.has(cue), `partes: ${cue} must be visible and vigente only`)
  for (const cue of sinActualizar) afirmar(visibles.has(cue), `partes: sinActualizar ${cue} is not visible`)
  for (const cue of [...ESPERADOS.partes.solucionadasRecientes.cues, ...ESPERADOS.partes.solucionadaFueraDeVentana.cues]) {
    afirmar(!visibles.has(cue), `partes: solucionada ${cue} must not have a visible parte`)
  }
  for (const departamento of DEPARTAMENTOS_ESCUELAS) {
    const cuantos = ESPERADOS.partes.visibles.cues.filter((cue) => ESCUELAS.find((e) => e.cueAnexo === cue)?.departamento === departamento).length
    afirmar(ESPERADOS.partes.visibles.porDepartamento[departamento] === cuantos, `partes.porDepartamento ${departamento}: ${ESPERADOS.partes.visibles.porDepartamento[departamento]} != ${cuantos}`)
  }
  afirmar(sumar(Object.values(ESPERADOS.partes.visibles.porDepartamento)) === ESPERADOS.partes.visibles.total, 'partes.porDepartamento does not sum to visibles')
  afirmar(sumar(Object.values(ESPERADOS.partes.visibles.porGravedad)) === ESPERADOS.partes.visibles.total, 'partes.porGravedad does not sum to visibles')
  afirmar(sumar(Object.values(ESPERADOS.partes.visibles.porClase)) === ESPERADOS.partes.visibles.total, 'partes.porClase does not sum to visibles')
  afirmar(sumar(Object.values(ESPERADOS.partes.visibles.porApoyo)) <= ESPERADOS.partes.visibles.total, 'partes.porApoyo exceeds visibles')
  afirmar(ESPERADOS.historial.tipos.length === 5, 'historial: expected five movements')

  // Riesgo: levels follow the score thresholds; per-level and per-department counts match the list.
  for (const escuela of ESPERADOS.riesgo.escuelas) {
    const rosterEscuela = ESCUELAS.find((e) => e.cueAnexo === escuela.cueAnexo)
    afirmar(rosterEscuela?.departamento === escuela.departamento, `riesgo ${escuela.cueAnexo}: departamento differs from roster`)
    afirmar(nivelDeScore(escuela.scoreRiesgo) === escuela.nivelRiesgo, `riesgo ${escuela.cueAnexo}: nivel ${escuela.nivelRiesgo} does not match score ${escuela.scoreRiesgo}`)
  }
  const nivelesRiesgo = ['bajo', 'moderado', 'alto', 'muy_alto'] as const
  for (const nivel of nivelesRiesgo) {
    const cuantos = ESPERADOS.riesgo.escuelas.filter((e) => e.nivelRiesgo === nivel).length
    afirmar(ESPERADOS.riesgo.porNivel[nivel] === cuantos, `riesgo.porNivel ${nivel}: ${ESPERADOS.riesgo.porNivel[nivel]} != ${cuantos}`)
  }
  afirmar(sumar(Object.values(ESPERADOS.riesgo.porNivel)) === ESPERADOS.riesgo.escuelas.length, 'riesgo.porNivel does not sum to escuelas')
  for (const departamento of DEPARTAMENTOS_ESCUELAS) {
    for (const nivel of nivelesRiesgo) {
      const cuantos = ESPERADOS.riesgo.escuelas.filter((e) => e.departamento === departamento && e.nivelRiesgo === nivel).length
      const esperado = ESPERADOS.riesgo.porDepartamento[departamento][nivel] ?? 0
      afirmar(esperado === cuantos, `riesgo.porDepartamento ${departamento}/${nivel}: ${esperado} != ${cuantos}`)
    }
  }

  // Hidrometria: the station in alert is the only one with estado 'alerta'.
  const alerta = ESPERADOS_HIDRO.estaciones.filter((e) => e.estado === 'alerta').map((e) => e.estacionId)
  afirmar(alerta.length === 1 && alerta[0] === ESPERADOS.hidrometria.enAlerta, 'hidrometria: estacionEnAlerta is not the only station in alerta')

  // Radar: the alert covers departments of the roster.
  for (const departamento of ESPERADOS.radar.alerta.departamentos) {
    afirmar((DEPARTAMENTOS_ESCUELAS as readonly string[]).includes(departamento), `radar.alerta: unknown departamento ${departamento}`)
  }

  if (problemas.length > 0) {
    throw new Error(`Incoherent map e2e manifest (${problemas.length}):\n- ${problemas.join('\n- ')}`)
  }
}
