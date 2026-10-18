import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  aiVeredictoEnabled,
  hazardContextEnabled,
  listarFlagsOperativas,
  riskEngineEnabled,
  riskMode,
  riskRadarEnabled,
  riesgoReglasMotor,
  seasonalEnabled,
  situacionEnabled,
} from './flags'

const CLAVES = [
  'RISK_ENGINE_ENABLED',
  'RISK_RADAR_ENABLED',
  'AI_VEREDICTO_ENABLED',
  'RISK_MODE',
  'HAZARD_CONTEXT_ENABLED',
  'SEASONAL_ENABLED',
  'SITUACION_ENABLED',
  'RIESGO_REGLAS_MOTOR',
] as const

const originales = new Map<string, string | undefined>()

beforeEach(() => {
  for (const clave of CLAVES) originales.set(clave, process.env[clave])
})

afterEach(() => {
  for (const clave of CLAVES) {
    const valor = originales.get(clave)
    if (valor === undefined) delete process.env[clave]
    else process.env[clave] = valor
  }
})

type BooleanFlag = readonly [string, string, () => boolean, string]

const BOOLEAN_FLAGS: readonly BooleanFlag[] = [
  ['riskEngineEnabled', 'RISK_ENGINE_ENABLED', riskEngineEnabled, 'devuelve false sin la variable seteada'],
  ['riskRadarEnabled', 'RISK_RADAR_ENABLED', riskRadarEnabled, 'devuelve false sin la variable seteada'],
  ['aiVeredictoEnabled', 'AI_VEREDICTO_ENABLED', aiVeredictoEnabled, 'devuelve false sin la variable seteada'],
  ['hazardContextEnabled', 'HAZARD_CONTEXT_ENABLED', hazardContextEnabled, 'devuelve false sin la variable seteada'],
  ['seasonalEnabled', 'SEASONAL_ENABLED', seasonalEnabled, 'devuelve false por defecto (sin la variable seteada)'],
  ['situacionEnabled', 'SITUACION_ENABLED', situacionEnabled, 'devuelve false sin la variable seteada'],
]

describe.each(BOOLEAN_FLAGS)('%s', (_nombre, clave, flag, tituloSinVariable) => {
  it(tituloSinVariable, () => {
    delete process.env[clave]
    expect(flag()).toBe(false)
  })

  it('devuelve true con el valor exacto "true"', () => {
    process.env[clave] = 'true'
    expect(flag()).toBe(true)
  })

  it('devuelve false con un valor arbitrario tipo "1" o "yes"', () => {
    process.env[clave] = '1'
    expect(flag()).toBe(false)
    process.env[clave] = 'yes'
    expect(flag()).toBe(false)
  })
})

describe('riskMode', () => {
  it('devuelve "shadow" sin la variable seteada', () => {
    delete process.env.RISK_MODE
    expect(riskMode()).toBe('shadow')
  })

  it('devuelve "advisory" con el valor exacto "advisory"', () => {
    process.env.RISK_MODE = 'advisory'
    expect(riskMode()).toBe('advisory')
  })

  it('devuelve "shadow" con un valor arbitrario tipo "1" o "yes"', () => {
    process.env.RISK_MODE = '1'
    expect(riskMode()).toBe('shadow')
    process.env.RISK_MODE = 'yes'
    expect(riskMode()).toBe('shadow')
  })
})

describe('listarFlagsOperativas', () => {
  it('enumera todos los flags y refleja process.env al momento de la llamada', () => {
    const lista = listarFlagsOperativas()
    expect(lista.map(({ nombre }) => nombre)).toEqual([
      'RISK_ENGINE_ENABLED', 'RISK_RADAR_ENABLED', 'AI_VEREDICTO_ENABLED',
      'HAZARD_CONTEXT_ENABLED', 'SEASONAL_ENABLED',
      'RISK_MODE', 'SITUACION_ENABLED', 'EPISODIOS_DERIVADOS_ENABLED', 'ENOS_JOBS_ENABLED',
      'RIESGO_REGLAS_MOTOR',
    ])
    process.env.SITUACION_ENABLED = 'true'
    process.env.RISK_MODE = 'advisory'
    expect(listarFlagsOperativas().find(({ nombre }) => nombre === 'SITUACION_ENABLED')?.valor).toBe('true')
    expect(listarFlagsOperativas().find(({ nombre }) => nombre === 'RISK_MODE')?.valor).toBe('advisory')
  })
})

// Las variables históricas no pueden cambiar la única versión operativa.
describe('riesgoReglasMotor', () => {
  it('devuelve "v0.4" sin la variable seteada', () => {
    delete process.env.RIESGO_REGLAS_MOTOR
    expect(riesgoReglasMotor()).toBe('v0.4')
  })

  it('ignora la antigua selección de v0.3', () => {
    process.env.RIESGO_REGLAS_MOTOR = 'v0.3'
    expect(riesgoReglasMotor()).toBe('v0.4')
    process.env.RIESGO_REGLAS_MOTOR = ' v0.3 '
    expect(riesgoReglasMotor()).toBe('v0.4')
  })

  it('devuelve "v0.4" con un valor inválido o "v0.4"', () => {
    for (const valor of ['v0.4', '0.3', 'v03', '']) {
      process.env.RIESGO_REGLAS_MOTOR = valor
      expect(riesgoReglasMotor()).toBe('v0.4')
    }
  })

  it('figura en listarFlagsOperativas con su valor efectivo', () => {
    process.env.RIESGO_REGLAS_MOTOR = 'v0.3'
    expect(listarFlagsOperativas().find(({ nombre }) => nombre === 'RIESGO_REGLAS_MOTOR')?.valor).toBe('v0.4')
  })
})
