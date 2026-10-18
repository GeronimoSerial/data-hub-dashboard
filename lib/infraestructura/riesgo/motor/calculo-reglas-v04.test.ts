// Reglas v0.4 del cálculo compartido (T10, docs/motor-v0.4/auditoria-v03.md):
// F1 susceptibilidad sólo fluvial, F2 historial ausente sin partes y
// combinación que no anula la amenaza, F7 confianza con faltantes reales.
import { describe, expect, it } from 'vitest'
import { crearPuertosFake, type EscenarioFake } from './__fixtures__/puertos-fake'
import { calcularRiesgoEscuela } from './calculo'
import type { IndicadoresSusceptibilidad, NivelPeligroCelda, PuertosMotor, ResumenHistorial } from './puertos'

const CUE = 'CUE-V04'
const GEOM = 'geom-v04'
const AS_OF = '2026-10-18T02:15:04.000Z'

function celda(nivel: NivelPeligroCelda['nivel']): NivelPeligroCelda {
  return {
    geometryRef: GEOM,
    horizonteHoras: 24,
    nivel,
    base: 'ensemble',
    metodo: 'percentiles',
    probabilidadP95: null,
    probabilidadP99: null,
    precipitacionMm: null,
    percentilReferencia: null,
    emitidoEn: '2026-10-18T00:00:00.000Z',
    validoHasta: '2026-10-19T00:00:00.000Z',
    versionRegla: 'peligro-v0.2',
  }
}

// Magnitudes reales de prod (auditoría 2026-10-18): profundidad WRI en metros
// y calor en grados-día, que v0.3 promediaba y saturaba en 100.
function susceptibilidadReal(profundidadJrcM: number | null): IndicadoresSusceptibilidad {
  return {
    cueAnexo: CUE,
    indicadores: { peligro_inundacion_fluvial: 0.8, peligro_calor: 300 },
    version: '1',
    profundidadFluvialRp100M: profundidadJrcM,
  }
}

const SIN_PARTES: ResumenHistorial = {
  cueAnexo: CUE,
  cantidadConfirmadas: 0,
  duracionTotalHoras: 0,
  accesoInterrumpidoCantidad: 0,
  antecedentes: [],
  fuenteDisponible: false,
}

function escenario(over: Partial<EscenarioFake> = {}): EscenarioFake {
  return {
    territorio: { [CUE]: { cueAnexo: CUE, geometryRef: GEOM, departamento: 'X', puntoRioId: 'rio-1', motivoExclusion: null } },
    peligro: { [GEOM]: [celda('naranja')] },
    // Caudal y celda en naranja (66) → amenaza 66; sin lluvia observada (1 faltante).
    caudal: { 'rio-1': { puntoId: 'rio-1', percentilActual: 95, nivel: 'naranja', emitidoEn: '2026-10-18T00:00:00.000Z', validoHasta: '2026-10-19T00:00:00.000Z' } },
    aislamiento: {
      [CUE]: {
        cueAnexo: CUE,
        nivel: 1,
        crucesAguaCount: 0,
        crucesAguaConPuenteCount: 0,
        crucesAguaConVadoCount: 0,
        tieneAlternativaSinCruce: true,
        versionJob: '4',
        fechaExtractoOsm: '2026-10-01',
        licencia: 'ODbL',
      },
    },
    susceptibilidad: { [CUE]: susceptibilidadReal(0.4) },
    ...over,
  }
}

function puertosCon(e: EscenarioFake, historial: ResumenHistorial = SIN_PARTES): PuertosMotor {
  return { ...crearPuertosFake(e), historial: { obtenerResumen: async () => historial } }
}

const calcular = (puertos: PuertosMotor, reglas?: 'v0.3' | 'v0.4') =>
  calcularRiesgoEscuela({ cueAnexo: CUE, horizonte: 24, asOf: AS_OF, puertos, reglas })

describe('reglas v0.4 — F1 susceptibilidad sólo fluvial', () => {
  it('v0.3 satura con magnitudes reales; v0.4 usa sólo la profundidad JRC escalada por el tope', async () => {
    const v03 = await calcular(puertosCon(escenario()), 'v0.3')
    expect(v03.factores.find((f) => f.fuente === 'susceptibilidad-physrisk')?.valor).toBe(100)

    const v04 = await calcular(puertosCon(escenario()), 'v0.4')
    const f = v04.factores.find((x) => x.tipo === 'vulnerabilidad' && x.variable === 'profundidad_fluvial_rp100')
    expect(f).toMatchObject({ valor: 0.4, unidad: 'm', fuente: 'susceptibilidad-jrc' })
    // Sin historial (sistema sin partes) la vulnerabilidad es la susceptibilidad sola.
    expect(v04.scoreVulnerabilidad).toBe(40)
  })

  it('profundidad nula es sin dato (nunca 0): no hay factor de susceptibilidad', async () => {
    const r = await calcular(puertosCon(escenario({ susceptibilidad: { [CUE]: susceptibilidadReal(null) } })), 'v0.4')
    expect(r.factores.some((f) => f.tipo === 'vulnerabilidad')).toBe(false)
    expect(r.scoreVulnerabilidad).toBeNull()
  })

  it('profundidad sobre el tope satura en 100 y 0 m es un 0 real', async () => {
    const hondo = await calcular(puertosCon(escenario({ susceptibilidad: { [CUE]: susceptibilidadReal(2.5) } })), 'v0.4')
    expect(hondo.scoreVulnerabilidad).toBe(100)
    const seco = await calcular(puertosCon(escenario({ susceptibilidad: { [CUE]: susceptibilidadReal(0) } })), 'v0.4')
    expect(seco.scoreVulnerabilidad).toBe(0)
  })
})

describe('reglas v0.4 — F2 historial y combinación', () => {
  it('sin partes en el sistema el historial no entra (peso redistribuido) y la amenaza no se borra', async () => {
    const r = await calcular(puertosCon(escenario({ susceptibilidad: { [CUE]: susceptibilidadReal(0) } })), 'v0.4')
    expect(r.factores.some((f) => f.fuente === 'historial')).toBe(false)
    // V = 0 → riesgo = amenaza × 0.5 (v0.3 daba 0).
    expect(r.scoreAmenaza).toBe(66)
    expect(r.scoreRiesgo).toBe(33)
    expect(r.nivelRiesgo).toBe('moderado')
  })

  it('v0.3 con el mismo historial vacío anula casi toda la amenaza', async () => {
    const r = await calcular(puertosCon(escenario({ susceptibilidad: { [CUE]: susceptibilidadReal(0) } })), 'v0.3')
    expect(r.scoreRiesgo).toBeLessThan(25)
  })

  it('con partes en el sistema el historial (aunque sea 0) sí cuenta como dato', async () => {
    const r = await calcular(
      puertosCon(escenario({ susceptibilidad: { [CUE]: susceptibilidadReal(1) } }), { ...SIN_PARTES, fuenteDisponible: true }),
      'v0.4',
    )
    expect(r.factores.find((f) => f.fuente === 'historial')?.valor).toBe(0)
    expect(r.scoreVulnerabilidad).toBe(30)
    expect(r.scoreRiesgo).toBe(Math.round(66 * (0.5 + 0.5 * 0.3)))
  })

  it('vulnerabilidad desconocida no baja el riesgo (factor 1)', async () => {
    const r = await calcular(puertosCon(escenario({ susceptibilidad: {} })), 'v0.4')
    expect(r.scoreVulnerabilidad).toBeNull()
    expect(r.scoreRiesgo).toBe(66)
  })
})

describe('reglas v0.4 — F7 confianza', () => {
  it('historial ausente cuenta como faltante', async () => {
    // Faltan lluvia observada e historial: dos faltantes → baja.
    const r = await calcular(puertosCon(escenario()), 'v0.4')
    expect(r.confianza).toBe('baja')
    const conPartes = await calcular(puertosCon(escenario(), { ...SIN_PARTES, fuenteDisponible: true }), 'v0.4')
    expect(conPartes.confianza).toBe('media')
  })
})

describe('reglas por defecto', () => {
  it('sin selector el resultado es el de v0.3', async () => {
    const p = puertosCon(escenario())
    expect(await calcular(p)).toEqual(await calcular(p, 'v0.3'))
  })
})
