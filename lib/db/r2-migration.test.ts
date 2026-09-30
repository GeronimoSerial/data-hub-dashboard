import { mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getDb, __eliminarInstanciaCacheadaParaTests, migrarDb } from './index'
import { infraMotivo, infraParte } from './schema'

const dataDir = process.env.DATA_DIR ?? '/tmp/r2-pglite'
const pgliteDir = path.join(dataDir, 'pg')

describe('R2 migración en PGlite', () => {
  const oldDataDir = process.env.DATA_DIR
  const oldPgliteDir = process.env.PGLITE_DATA_DIR

  beforeAll(async () => {
    rmSync(dataDir, { recursive: true, force: true })
    mkdirSync(dataDir, { recursive: true })
    process.env.DATA_DIR = dataDir
    process.env.PGLITE_DATA_DIR = pgliteDir
    await migrarDb()
  })

  afterAll(async () => {
    await __eliminarInstanciaCacheadaParaTests({ directorio: pgliteDir })
    if (oldDataDir === undefined) delete process.env.DATA_DIR
    else process.env.DATA_DIR = oldDataDir
    if (oldPgliteDir === undefined) delete process.env.PGLITE_DATA_DIR
    else process.env.PGLITE_DATA_DIR = oldPgliteDir
  })

  it('migra la columna de asistencia pedagógica y siembra el motivo docente', async () => {
    const db = getDb()
    expect(await db.select({ asistencia: infraParte.asistenciaPedagogica }).from(infraParte).limit(1)).toEqual([])
    expect(await db.select().from(infraMotivo).where(eq(infraMotivo.id, 'inaccesibilidad-docentes'))).toMatchObject([
      { nombre: 'Inaccesibilidad de docentes', categoria: 'establecimiento' },
    ])
  })
})
