// Fixtures en memoria del replay temporal (batch E7b).
//
// NO es un archivo .test.ts: no registra casos, sólo arma datos deterministas
// para que otro test (lib/infraestructura/replay/consulta.test.ts) los inserte
// en una base libsql temporal y ejercite las dos vistas. Las fechas son ISO
// fijas: jamás Date.now(), para que el test sea reproducible.
//
// Escenario (una sola escuela de un solo departamento) que modela una
// "corrección tardía registrada después del corte":
//
//   rigeDesde ── T0 ── T1 ── creadaEn ── T2 ── T3
//
// - T0: se publica un snapshot de riesgo "alto" para la escuela.
// - La afectación RIGE desde antes de T0 pero se CARGA al sistema después de
//   T1 (creadaEn > T1). Vista "conocido" as-of T1: AUSENTE (creadaEn > T1).
//   Vista "reconstruido" as-of T1: PRESENTE (rigeDesde < T1). Ambas vistas
//   as-of T2 (posterior a creadaEn): PRESENTE.
// - T3: la afectación se recupera (retiradaEn).
// - [caidaDesde, caidaHasta] cae la fuente de lluvia observada: en ese rango
//   el dato es "sin dato", NUNCA un valor inventado.
//
// La función NO toca la base: devuelve objetos planos.

import type { InstanteReplay } from './tipos'

// Identificadores del escenario. String a propósito (mismo criterio que
// identidadCueAnexoSchema: los CUE llevan ceros a la izquierda).
const CUE_ANEXO = '007123'
const DEPARTAMENTO = 'Paraná'
// Celda de grilla 0.1° ("lat_lon") donde cae la escuela.
const GEOMETRY_REF = '-31.73_-60.52'
const PERIODO_ID = 'periodo-2026'
const PARTE_ID = 'parte-fixture-001'
const AFECTACION_ID = 'afectacion-fixture-001'
const RUN_ID = 'run-fixture-001'
const SNAPSHOT_ID = 'snapshot-fixture-001'
const FUENTE_LLUVIA = 'nasa-imerg'

// T0 = publicación del snapshot de riesgo "alto". Base del replay.
const T0: InstanteReplay = '2026-03-10T06:00:00.000Z'
// rigeDesde de la afectación: ANTERIOR a T0 (ya regía cuando se publicó el
// snapshot), aunque se haya cargado recién después de T1.
const RIGE_DESDE: InstanteReplay = '2026-03-09T18:00:00.000Z'
// T1 = corte usado en el test. T0 < T1 < creadaEn: es el instante donde las
// dos vistas DIVERGEN para esta afectación.
const T1: InstanteReplay = '2026-03-10T12:00:00.000Z'
// creadaEn = fecha de REGISTRO/INGESTA, posterior al corte T1. Es la
// "corrección tardía" que la vista "conocido" todavía no podía ver en T1.
const CREADA_EN: InstanteReplay = '2026-03-10T18:00:00.000Z'
// T2 = instante posterior a creadaEn. Ambas vistas coinciden: la afectación
// está presente.
const T2: InstanteReplay = '2026-03-11T00:00:00.000Z'
// T3 = recuperación de la afectación (retiradaEn), posterior a T2.
const T3: InstanteReplay = '2026-03-11T12:00:00.000Z'
// Ventana de caída de la fuente de lluvia: solapa T0..T2 (parte del escenario)
// y queda cerrada antes de T3.
const CAIDA_DESDE: InstanteReplay = T0
const CAIDA_HASTA: InstanteReplay = T2

// --- Datos crudos, con la forma de las tablas de lib/db/schema.ts ---

// infra_risk_run: el puntero de la corrida del motor. `publicadoEn` = T0.
export interface FixtureRunRiesgo {
  id: string
  periodoId: string
  modeloVersion: string
  iniciadoEn: string
  publicadoEn: string
  estado: string
  cobertura: Record<string, number>
  creadaEn: string
}

// infra_risk_snapshot: un score por (run, escuela, horizonte). nivel 'alto'.
export interface FixtureSnapshotRiesgoEscuela {
  id: string
  runId: string
  cueAnexo: string
  horizonteHoras: number
  evidenciaValida: boolean
  scoreRiesgo: number
  nivelRiesgo: string
  scoreAmenaza: number
  scoreVulnerabilidad: number
  confianza: string
  exposicionMatricula: number
  exposicionSecciones: number
  calculadoEn: string
  validoHasta: string
}

export interface FixtureSnapshotRiesgo {
  run: FixtureRunRiesgo
  porEscuela: FixtureSnapshotRiesgoEscuela[]
}

// infra_afectacion + el cueAnexo denormalizado (la tabla real lo obtiene por
// join con infra_parte; acá se incluye para que el test no tenga que
// reconstruirlo). `retiradaEn` = T3: el fixture representa el estado final
// cargado, y la ventana [rigeDesde, retiradaEn) es lo que resuelven las vistas.
export interface FixtureAfectacion {
  id: string
  parteId: string
  cueAnexo: string
  motivo: string
  categoria: string
  severidad: string
  descripcion: string | null
  rigeDesde: string
  creadaEn: string
  retiradaEn: string | null
}

// hazard_source_health: la fuente de lluvia observada marcada 'caida' durante
// [caidaDesde, caidaHasta]. En ese rango el replay debe reportar "sin dato".
export interface FixtureSaludFuente {
  provider: string
  ultimoExitoEn: string
  ultimoIntentoEn: string
  estado: string
  ultimoErrorSaneado: string | null
  ttlMinutos: number
  licencia: string
  actualizadaEn: string
}

// hazard_ensemble_prob: probabilidad de superar P95/P99, emitida en T0
// (corridaEn = T0). El as-of por corridaEn debe verla desde T0 en adelante y
// NUNCA antes.
export interface FixtureEnsembleProb {
  id: string
  geometryRef: string
  variable: string
  corridaEn: string
  validoEn: string
  horizonteHoras: number
  miembrosTotal: number
  miembrosValidos: number
  probabilidadP95: number
  probabilidadP99: number
  dispersion: number
  version: string
  ingeridoEn: string
}

// hazard_observation (IMERG): un gránulo con ventana [T0, T1] (validoHasta =
// T1), ingerido en T1. As-of por ingeridoEn Y validoHasta: recién visible en
// T1, nunca antes (ni por adelantar la ingesta ni por adelantar la ventana).
export interface FixtureObservacionLluvia {
  id: string
  provider: string
  variable: string
  geometryRef: string
  valor: number
  unidad: string
  observadoEn: string
  validoDesde: string
  validoHasta: string
  ingeridoEn: string
}

export interface FixtureEscenarioCompleto {
  cueAnexo: string
  departamento: string
  geometryRef: string
  periodoId: string
  // Fechas nombradas del eje temporal (ver cabecera del archivo).
  T0: InstanteReplay
  T1: InstanteReplay
  T2: InstanteReplay
  T3: InstanteReplay
  rigeDesde: InstanteReplay
  creadaEn: InstanteReplay
  retiradaEn: InstanteReplay
  caidaDesde: InstanteReplay
  caidaHasta: InstanteReplay
  // Datos crudos en memoria (no insertados en ninguna base).
  snapshot: FixtureSnapshotRiesgo
  afectacion: FixtureAfectacion
  saludFuente: FixtureSaludFuente
  ensembleProb: FixtureEnsembleProb
  observacionLluvia: FixtureObservacionLluvia
}

// Arma una instancia NUEVA del escenario en cada llamada, para que un test no
// contamine a otro mutando los objetos retornados.
export function crearFixtureEscenarioCompleto(): FixtureEscenarioCompleto {
  const snapshot: FixtureSnapshotRiesgo = {
    run: {
      id: RUN_ID,
      periodoId: PERIODO_ID,
      modeloVersion: 'riesgo-v0.1',
      iniciadoEn: '2026-03-10T05:00:00.000Z',
      publicadoEn: T0,
      estado: 'vigente',
      cobertura: { procesadas: 1, conEvidencia: 1, sinEvidencia: 0 },
      creadaEn: '2026-03-10T05:00:00.000Z',
    },
    porEscuela: [
      {
        id: SNAPSHOT_ID,
        runId: RUN_ID,
        cueAnexo: CUE_ANEXO,
        horizonteHoras: 72,
        evidenciaValida: true,
        scoreRiesgo: 0.82,
        nivelRiesgo: 'alto',
        scoreAmenaza: 0.78,
        scoreVulnerabilidad: 0.64,
        confianza: 'alta',
        exposicionMatricula: 420,
        exposicionSecciones: 14,
        calculadoEn: '2026-03-10T05:30:00.000Z',
        validoHasta: '2026-03-13T06:00:00.000Z',
      },
    ],
  }

  const afectacion: FixtureAfectacion = {
    id: AFECTACION_ID,
    parteId: PARTE_ID,
    cueAnexo: CUE_ANEXO,
    motivo: 'Inundación',
    categoria: 'establecimiento',
    severidad: 'Alta',
    descripcion: null,
    rigeDesde: RIGE_DESDE,
    creadaEn: CREADA_EN,
    retiradaEn: T3,
  }

  const saludFuente: FixtureSaludFuente = {
    provider: FUENTE_LLUVIA,
    ultimoExitoEn: '2026-03-10T04:30:00.000Z',
    ultimoIntentoEn: CAIDA_HASTA,
    estado: 'caida',
    ultimoErrorSaneado: 'sin respuesta del proveedor',
    ttlMinutos: 60,
    licencia: 'NASA GPM IMERG Early Run (dominio público)',
    actualizadaEn: CAIDA_HASTA,
  }

  const ensembleProb: FixtureEnsembleProb = {
    id: 'ensemble-fixture-001',
    geometryRef: GEOMETRY_REF,
    variable: 'precipitacion_24h',
    corridaEn: T0,
    validoEn: T2,
    horizonteHoras: 24,
    miembrosTotal: 51,
    miembrosValidos: 51,
    probabilidadP95: 0.62,
    probabilidadP99: 0.55,
    dispersion: 0.1,
    version: 'ensemble-v0.1',
    ingeridoEn: T0,
  }

  const observacionLluvia: FixtureObservacionLluvia = {
    id: 'imerg-fixture-001',
    provider: FUENTE_LLUVIA,
    variable: 'precipitacion_observada_satelital',
    geometryRef: GEOMETRY_REF,
    valor: 18.4,
    unidad: 'mm',
    observadoEn: T0,
    validoDesde: T0,
    validoHasta: T1,
    ingeridoEn: T1,
  }

  return {
    cueAnexo: CUE_ANEXO,
    departamento: DEPARTAMENTO,
    geometryRef: GEOMETRY_REF,
    periodoId: PERIODO_ID,
    T0,
    T1,
    T2,
    T3,
    rigeDesde: RIGE_DESDE,
    creadaEn: CREADA_EN,
    retiradaEn: T3,
    caidaDesde: CAIDA_DESDE,
    caidaHasta: CAIDA_HASTA,
    snapshot,
    afectacion,
    saludFuente,
    ensembleProb,
    observacionLluvia,
  }
}
