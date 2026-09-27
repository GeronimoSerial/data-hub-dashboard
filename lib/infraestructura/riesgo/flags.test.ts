import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { aiBriefingEnabled, hazardContextEnabled, riskEngineEnabled, riskMode, riskRadarEnabled } from './flags'

const CLAVES = [
  'RISK_ENGINE_ENABLED',
  'RISK_RADAR_ENABLED',
  'AI_BRIEFING_ENABLED',
  'RISK_MODE',
  'HAZARD_CONTEXT_ENABLED',
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

describe('riskEngineEnabled', () => {
  it('devuelve false sin la variable seteada', () => {
    delete process.env.RISK_ENGINE_ENABLED
    expect(riskEngineEnabled()).toBe(false)
  })

  it('devuelve true con el valor exacto "true"', () => {
    process.env.RISK_ENGINE_ENABLED = 'true'
    expect(riskEngineEnabled()).toBe(true)
  })

  it('devuelve false con un valor arbitrario tipo "1" o "yes"', () => {
    process.env.RISK_ENGINE_ENABLED = '1'
    expect(riskEngineEnabled()).toBe(false)
    process.env.RISK_ENGINE_ENABLED = 'yes'
    expect(riskEngineEnabled()).toBe(false)
  })
})

describe('riskRadarEnabled', () => {
  it('devuelve false sin la variable seteada', () => {
    delete process.env.RISK_RADAR_ENABLED
    expect(riskRadarEnabled()).toBe(false)
  })

  it('devuelve true con el valor exacto "true"', () => {
    process.env.RISK_RADAR_ENABLED = 'true'
    expect(riskRadarEnabled()).toBe(true)
  })

  it('devuelve false con un valor arbitrario tipo "1" o "yes"', () => {
    process.env.RISK_RADAR_ENABLED = '1'
    expect(riskRadarEnabled()).toBe(false)
    process.env.RISK_RADAR_ENABLED = 'yes'
    expect(riskRadarEnabled()).toBe(false)
  })
})

describe('aiBriefingEnabled', () => {
  it('devuelve false sin la variable seteada', () => {
    delete process.env.AI_BRIEFING_ENABLED
    expect(aiBriefingEnabled()).toBe(false)
  })

  it('devuelve true con el valor exacto "true"', () => {
    process.env.AI_BRIEFING_ENABLED = 'true'
    expect(aiBriefingEnabled()).toBe(true)
  })

  it('devuelve false con un valor arbitrario tipo "1" o "yes"', () => {
    process.env.AI_BRIEFING_ENABLED = '1'
    expect(aiBriefingEnabled()).toBe(false)
    process.env.AI_BRIEFING_ENABLED = 'yes'
    expect(aiBriefingEnabled()).toBe(false)
  })
})

describe('hazardContextEnabled', () => {
  it('devuelve false sin la variable seteada', () => {
    delete process.env.HAZARD_CONTEXT_ENABLED
    expect(hazardContextEnabled()).toBe(false)
  })

  it('devuelve true con el valor exacto "true"', () => {
    process.env.HAZARD_CONTEXT_ENABLED = 'true'
    expect(hazardContextEnabled()).toBe(true)
  })

  it('devuelve false con un valor arbitrario tipo "1" o "yes"', () => {
    process.env.HAZARD_CONTEXT_ENABLED = '1'
    expect(hazardContextEnabled()).toBe(false)
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