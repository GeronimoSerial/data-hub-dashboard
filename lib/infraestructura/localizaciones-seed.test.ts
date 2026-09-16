import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openGeDb } from './ge-db'
import { ensureLocalizacionesSeeded } from './localizaciones-seed'

let dir: string
let prev: string | undefined

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'loc-seed-'))
  prev = process.env.DATA_DIR
  process.env.DATA_DIR = dir
})

afterEach(() => {
  if (prev === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prev
  rmSync(dir, { recursive: true, force: true })
})

describe('ensureLocalizacionesSeeded', () => {
  it('siembra ge_localizacion desde el JSON versionado cuando la tabla esta vacia', async () => {
    await ensureLocalizacionesSeeded()
    const client = openGeDb()
    try {
      const res = await client.execute('SELECT COUNT(*) AS n FROM ge_localizacion')
      expect(Number(res.rows[0].n)).toBeGreaterThan(2000)
    } finally {
      client.close()
    }
  })

  it('es idempotente: correrla dos veces no duplica registros', async () => {
    await ensureLocalizacionesSeeded()
    const client = openGeDb()
    try {
      const primera = Number(
        (await client.execute('SELECT COUNT(*) AS n FROM ge_localizacion')).rows[0].n,
      )
      await ensureLocalizacionesSeeded()
      const segunda = Number(
        (await client.execute('SELECT COUNT(*) AS n FROM ge_localizacion')).rows[0].n,
      )
      expect(segunda).toBe(primera)
    } finally {
      client.close()
    }
  })

  it('no siembra secciones ni identidades: el padron no viaja en la imagen', async () => {
    await ensureLocalizacionesSeeded()
    const client = openGeDb()
    try {
      const secciones = await client.execute('SELECT COUNT(*) AS n FROM ge_seccion')
      const identidades = await client.execute('SELECT COUNT(*) AS n FROM ge_alumno_identidad')
      expect(Number(secciones.rows[0].n)).toBe(0)
      expect(Number(identidades.rows[0].n)).toBe(0)
    } finally {
      client.close()
    }
  })
})
