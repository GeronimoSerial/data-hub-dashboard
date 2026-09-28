import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import type * as PgliteMigrator from 'drizzle-orm/pglite/migrator'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Cuenta las invocaciones del migrator real (no lo reemplaza): se envuelve la
// implementación verdadera para poder verificar la memoización sin dejar de
// ejecutar la migración de verdad.
const migraciones = vi.hoisted(() => ({ pglite: 0 }))

vi.mock('drizzle-orm/pglite/migrator', async (importOriginal) => {
  const real = await importOriginal<typeof PgliteMigrator>()
  return {
    migrate: (...args: Parameters<typeof real.migrate>) => {
      migraciones.pglite += 1
      return real.migrate(...args)
    },
  }
})

let dir: string
let prevDataDir: string | undefined
let prevPgliteDir: string | undefined

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'db-index-'))
  prevDataDir = process.env.DATA_DIR
  prevPgliteDir = process.env.PGLITE_DATA_DIR
  process.env.DATA_DIR = dir
  // Igual que recurso-seed.test.ts: fuerza una PGlite persistida en disco (bajo
  // Vitest, sin PGLITE_DATA_DIR, getDb() usa una PGlite en memoria sin cache).
  process.env.PGLITE_DATA_DIR = path.join(dir, 'pg')
  migraciones.pglite = 0
})

afterEach(async () => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  if (prevPgliteDir === undefined) delete process.env.PGLITE_DATA_DIR
  else process.env.PGLITE_DATA_DIR = prevPgliteDir
  // Cierra la PGlite cacheada antes de borrar el directorio: si no, queda un
  // handle abierto y PGlite emite un unhandled rejection al desaparecer.
  const { __eliminarInstanciaCacheadaParaTests } = await import('./index')
  await __eliminarInstanciaCacheadaParaTests({ directorio: path.join(dir, 'pg') })
  rmSync(dir, { recursive: true, force: true })
  vi.resetModules()
})

describe('singleton de conexión por directorio en globalThis', () => {
  it('dos bundles (vi.resetModules() entre medio) comparten la misma instancia PGlite', async () => {
    const bundleA = await import('./index')
    const rawA = bundleA.getRawClient()

    vi.resetModules()
    const bundleB = await import('./index')
    const rawB = bundleB.getRawClient()

    expect(rawA).toBeInstanceOf(PGlite)
    // Referencia, no sólo que ambas funcionen: es el punto del bug real.
    expect(rawB).toBe(rawA)
    expect(bundleB.getDb()).toBe(bundleA.getDb())
  })

  it('migrarDb() desde dos bundles corre la migración una sola vez', async () => {
    const bundleA = await import('./index')

    vi.resetModules()
    const bundleB = await import('./index')

    await Promise.all([bundleA.migrarDb(), bundleB.migrarDb()])
    expect(migraciones.pglite).toBe(1)

    // Un tercer bundle sobre el mismo directorio tampoco debe re-migrar.
    vi.resetModules()
    const bundleC = await import('./index')
    await bundleC.migrarDb()
    expect(migraciones.pglite).toBe(1)
  })
})
