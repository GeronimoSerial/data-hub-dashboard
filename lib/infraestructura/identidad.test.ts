import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { createClient } from '@libsql/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ensureGeSchema, openGeDb, attachGe } from './ge-db'
import {
  cifrarIdentidad,
  importarIdentidad,
  listarIdentidadesPorPersonas,
} from './identidad'

let dir: string
let prevDataDir: string | undefined
let prevKey: string | undefined

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'identidad-'))
  prevDataDir = process.env.DATA_DIR
  prevKey = process.env.NOMINAL_ENCRYPTION_KEY
  process.env.DATA_DIR = dir
  process.env.NOMINAL_ENCRYPTION_KEY = randomBytes(32).toString('base64')
})

afterEach(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  if (prevKey === undefined) delete process.env.NOMINAL_ENCRYPTION_KEY
  else process.env.NOMINAL_ENCRYPTION_KEY = prevKey
  rmSync(dir, { recursive: true, force: true })
})

describe('cifrarIdentidad', () => {
  it('requiere la clave de entorno', () => {
    delete process.env.NOMINAL_ENCRYPTION_KEY
    expect(() => cifrarIdentidad('Ana', 'Pérez')).toThrow(/NOMINAL_ENCRYPTION_KEY/)
  })

  it('rechaza una clave que no decodifica a 32 bytes', () => {
    process.env.NOMINAL_ENCRYPTION_KEY = Buffer.from('demasiado-corta').toString('base64')
    expect(() => cifrarIdentidad('Ana', 'Pérez')).toThrow(/32 bytes/)
  })

  it('el mismo texto cifra distinto cada vez (iv aleatorio)', () => {
    const a = cifrarIdentidad('Ana', 'Pérez')
    const b = cifrarIdentidad('Ana', 'Pérez')
    expect(a).not.toBe(b)
  })
})

describe('importarIdentidad / listarIdentidadesPorPersonas', () => {
  it('cifra al importar, descifra al listar, y el .sqlite no revela texto plano', async () => {
    const ge = openGeDb()
    try {
      await ensureGeSchema(ge)
      await importarIdentidad(ge, 42, 'Facundo', 'Quiroga')
      await importarIdentidad(ge, 43, 'Manuela', 'Rosas')
    } finally {
      ge.close()
    }

    // Inspección directa del archivo .sqlite, como si fuera un lector externo:
    // ningún nombre en claro puede aparecer en los bytes del archivo.
    const raw = readFileSync(path.join(dir, 'ge.sqlite'))
    const texto = raw.toString('latin1')
    expect(texto).not.toContain('Facundo')
    expect(texto).not.toContain('Quiroga')
    expect(texto).not.toContain('Manuela')
    expect(texto).not.toContain('Rosas')

    const hub = createClient({ url: `file:${path.join(dir, 'hub.sqlite')}` })
    try {
      await attachGe(hub)
      const identidades = await listarIdentidadesPorPersonas(hub, [42, 43])
      expect(identidades).toEqual(
        expect.arrayContaining([
          { gePersonId: 42, nombre: 'Facundo', apellido: 'Quiroga' },
          { gePersonId: 43, nombre: 'Manuela', apellido: 'Rosas' },
        ]),
      )
    } finally {
      hub.close()
    }
  })

  it('reimportar la misma persona actualiza el payload en vez de duplicar la fila', async () => {
    const ge = openGeDb()
    try {
      await ensureGeSchema(ge)
      await importarIdentidad(ge, 1, 'Nombre Viejo', 'Apellido Viejo')
      await importarIdentidad(ge, 1, 'Nombre Nuevo', 'Apellido Nuevo')

      const count = await ge.execute(
        'SELECT COUNT(*) AS n FROM ge_alumno_identidad WHERE ge_person_id = 1',
      )
      expect(Number(count.rows[0].n)).toBe(1)
    } finally {
      ge.close()
    }

    const hub = createClient({ url: `file:${path.join(dir, 'hub.sqlite')}` })
    try {
      await attachGe(hub)
      const [identidad] = await listarIdentidadesPorPersonas(hub, [1])
      expect(identidad).toEqual({ gePersonId: 1, nombre: 'Nombre Nuevo', apellido: 'Apellido Nuevo' })
    } finally {
      hub.close()
    }
  })

  it('descifrar con la clave equivocada falla en vez de devolver basura', async () => {
    const ge = openGeDb()
    try {
      await ensureGeSchema(ge)
      await importarIdentidad(ge, 1, 'Ana', 'Pérez')
    } finally {
      ge.close()
    }

    process.env.NOMINAL_ENCRYPTION_KEY = randomBytes(32).toString('base64')

    const hub = createClient({ url: `file:${path.join(dir, 'hub.sqlite')}` })
    try {
      await attachGe(hub)
      await expect(listarIdentidadesPorPersonas(hub, [1])).rejects.toThrow()
    } finally {
      hub.close()
    }
  })
})
