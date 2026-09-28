import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildPgPoolConfig, resolvePoolConfig, resolveSslConfig } from './config-postgres'

const URL_LOCAL = 'postgres://usuario:password@localhost:5432/enos_hub'
const URL_RDS = 'postgres://usuario:password@db.abc123.us-east-1.rds.amazonaws.com:5432/enos_hub'

const ENV_KEYS = [
  'PGSSLMODE',
  'DATABASE_SSL',
  'DATABASE_SSL_CA_PATH',
  'DATABASE_POOL_MAX',
  'DATABASE_POOL_IDLE_TIMEOUT_MS',
  'DATABASE_POOL_CONNECT_TIMEOUT_MS',
  'DATABASE_STATEMENT_TIMEOUT_MS',
] as const

let tempDir: string | undefined

beforeEach(() => {
  for (const key of ENV_KEYS) vi.stubEnv(key, undefined)
})

afterEach(() => {
  vi.unstubAllEnvs()
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true })
    tempDir = undefined
  }
})

describe('resolveSslConfig', () => {
  it('devuelve false sin configuración de SSL', () => {
    expect(resolveSslConfig(URL_LOCAL)).toBe(false)
  })

  it('devuelve TLS sin validar con PGSSLMODE=require', () => {
    vi.stubEnv('PGSSLMODE', 'require')
    expect(resolveSslConfig(URL_LOCAL)).toEqual({ rejectUnauthorized: false })
  })

  it('devuelve TLS sin validar con DATABASE_SSL=require', () => {
    vi.stubEnv('DATABASE_SSL', 'require')
    expect(resolveSslConfig(URL_LOCAL)).toEqual({ rejectUnauthorized: false })
  })

  it('devuelve TLS sin validar para un host RDS aunque no haya env', () => {
    expect(resolveSslConfig(URL_RDS)).toEqual({ rejectUnauthorized: false })
  })

  it('devuelve TLS validando con DATABASE_SSL=true', () => {
    vi.stubEnv('DATABASE_SSL', 'true')
    expect(resolveSslConfig(URL_LOCAL)).toEqual({ rejectUnauthorized: true })
  })

  it('devuelve TLS validando con DATABASE_SSL=1', () => {
    vi.stubEnv('DATABASE_SSL', '1')
    expect(resolveSslConfig(URL_LOCAL)).toEqual({ rejectUnauthorized: true })
  })

  it('lee el CA de DATABASE_SSL_CA_PATH y valida contra él', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'config-postgres-'))
    const caPath = join(tempDir, 'ca.pem')
    const contenido = '-----BEGIN CERTIFICATE-----\nfake\n-----END CERTIFICATE-----\n'
    writeFileSync(caPath, contenido)
    vi.stubEnv('DATABASE_SSL_CA_PATH', caPath)
    expect(resolveSslConfig(URL_LOCAL)).toEqual({ rejectUnauthorized: true, ca: contenido })
  })

  it('revienta ruidosamente si DATABASE_SSL_CA_PATH no existe', () => {
    vi.stubEnv('DATABASE_SSL_CA_PATH', join(tmpdir(), 'ca-que-no-existe.config-postgres.pem'))
    expect(() => resolveSslConfig(URL_LOCAL)).toThrow()
  })
})

describe('resolvePoolConfig', () => {
  it('usa los defaults cuando no hay env', () => {
    expect(resolvePoolConfig()).toEqual({
      max: undefined,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 5000,
      statement_timeout: 30000,
    })
  })

  it('usa los valores de env coercionados a number', () => {
    vi.stubEnv('DATABASE_POOL_MAX', '25')
    vi.stubEnv('DATABASE_POOL_IDLE_TIMEOUT_MS', '15000')
    vi.stubEnv('DATABASE_POOL_CONNECT_TIMEOUT_MS', '2500')
    vi.stubEnv('DATABASE_STATEMENT_TIMEOUT_MS', '45000')
    expect(resolvePoolConfig()).toEqual({
      max: 25,
      idleTimeoutMillis: 15000,
      connectionTimeoutMillis: 2500,
      statement_timeout: 45000,
    })
  })

  it('ignora valores no numéricos y cae al default', () => {
    vi.stubEnv('DATABASE_POOL_MAX', 'abc')
    vi.stubEnv('DATABASE_POOL_IDLE_TIMEOUT_MS', 'abc')
    vi.stubEnv('DATABASE_POOL_CONNECT_TIMEOUT_MS', 'abc')
    vi.stubEnv('DATABASE_STATEMENT_TIMEOUT_MS', 'abc')
    expect(resolvePoolConfig()).toEqual({
      max: undefined,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 5000,
      statement_timeout: 30000,
    })
  })
})

describe('buildPgPoolConfig', () => {
  it('combina connectionString, SSL y pool', () => {
    expect(buildPgPoolConfig(URL_LOCAL)).toEqual({
      connectionString: URL_LOCAL,
      ssl: false,
      max: undefined,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 5000,
      statement_timeout: 30000,
    })
  })
})
