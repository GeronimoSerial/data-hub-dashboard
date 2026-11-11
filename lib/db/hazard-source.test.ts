import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDb } from './index'
import { configuracionHazardSource, getHazardDb } from './hazard-source'
import { buildPgPoolConfig } from './config-postgres'

const URL_HAZARD = 'postgres://lector:password@prod.internal:5432/hub_prod'
const URL_PRINCIPAL = 'postgres://usuario:password@localhost:5432/enos_hub'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('getHazardDb', () => {
  it('devuelve la base principal cuando HAZARD_SOURCE_DATABASE_URL no está definida', () => {
    vi.stubEnv('HAZARD_SOURCE_DATABASE_URL', '')
    expect(getHazardDb()).toBe(getDb())
  })

  it('rechaza una fuente igual a DATABASE_URL', () => {
    vi.stubEnv('DATABASE_URL', URL_PRINCIPAL)
    vi.stubEnv('HAZARD_SOURCE_DATABASE_URL', URL_PRINCIPAL)
    expect(() => getHazardDb()).toThrow(/no puede ser igual a DATABASE_URL/)
  })
})

describe('configuracionHazardSource', () => {
  it('usa un pool propio de sólo lectura con límites cortos', () => {
    const config = configuracionHazardSource(URL_HAZARD)
    expect(config.connectionString).toBe(URL_HAZARD)
    expect(config.max).toBe(3)
    expect(config.statement_timeout).toBe(15_000)
    expect(config.options).toBe('-c default_transaction_read_only=on')
  })

  it('conserva la configuración SSL del pool principal', () => {
    const principal = buildPgPoolConfig(URL_HAZARD)
    expect(configuracionHazardSource(URL_HAZARD).ssl).toEqual(principal.ssl)
  })
})
