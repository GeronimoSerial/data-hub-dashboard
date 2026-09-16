import { copyFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { createClient } from '@libsql/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ensureGeSchema, openGeDb, getGeSqlitePath } from './ge-db'
import { importarIdentidad, listarIdentidadesPorPersonas, rotarClaveIdentidad } from './identidad'

// Ejercita el procedimiento documentado en docs/rotacion-clave-nominal.md:
// se prueba sobre una COPIA de ge.sqlite, en un directorio de datos aparte,
// nunca sobre el original que sigue cifrado con la clave vieja.
let dirOriginal: string
let dirCopia: string
let prevDataDir: string | undefined

beforeEach(() => {
  dirOriginal = mkdtempSync(path.join(tmpdir(), 'rotacion-original-'))
  dirCopia = mkdtempSync(path.join(tmpdir(), 'rotacion-copia-'))
  prevDataDir = process.env.DATA_DIR
})

afterEach(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  rmSync(dirOriginal, { recursive: true, force: true })
  rmSync(dirCopia, { recursive: true, force: true })
})

function abrirComoGe(dir: string) {
  return createClient({ url: `file:${path.join(dir, 'hub-de-prueba.sqlite')}` })
}

describe('rotarClaveIdentidad', () => {
  it('recifra todas las filas con la clave nueva y preserva los nombres, probado sobre una copia', async () => {
    const claveVieja = randomBytes(32).toString('base64')
    const claveNueva = randomBytes(32).toString('base64')

    process.env.DATA_DIR = dirOriginal
    process.env.NOMINAL_ENCRYPTION_KEY = claveVieja
    const ge = openGeDb()
    try {
      await ensureGeSchema(ge)
      await importarIdentidad(ge, 1, 'Facundo', 'Quiroga')
      await importarIdentidad(ge, 2, 'Manuela', 'Rosas')
    } finally {
      ge.close()
    }

    copyFileSync(getGeSqlitePath(), path.join(dirCopia, 'ge.sqlite'))

    // De acá en adelante, trabajamos exclusivamente sobre la copia.
    process.env.DATA_DIR = dirCopia
    const copia = openGeDb()
    try {
      const { filasRotadas } = await rotarClaveIdentidad(copia, claveVieja, claveNueva)
      expect(filasRotadas).toBe(2)
    } finally {
      copia.close()
    }

    process.env.NOMINAL_ENCRYPTION_KEY = claveNueva
    const hostCopia = abrirComoGe(dirCopia)
    try {
      const identidades = await listarIdentidadesPorPersonas(hostCopia, [1, 2])
      expect(identidades).toEqual(
        expect.arrayContaining([
          { gePersonId: 1, nombre: 'Facundo', apellido: 'Quiroga' },
          { gePersonId: 2, nombre: 'Manuela', apellido: 'Rosas' },
        ]),
      )
    } finally {
      hostCopia.close()
    }

    // El original nunca se tocó: sigue cifrado con la clave vieja.
    process.env.DATA_DIR = dirOriginal
    process.env.NOMINAL_ENCRYPTION_KEY = claveVieja
    const hostOriginal = abrirComoGe(dirOriginal)
    try {
      const identidadOriginal = await listarIdentidadesPorPersonas(hostOriginal, [1])
      expect(identidadOriginal[0]).toEqual({
        gePersonId: 1,
        nombre: 'Facundo',
        apellido: 'Quiroga',
      })
    } finally {
      hostOriginal.close()
    }
  })

  it('no rota nada si alguna clave no decodifica a 32 bytes', async () => {
    process.env.DATA_DIR = dirOriginal
    const ge = openGeDb()
    try {
      await ensureGeSchema(ge)
    } finally {
      ge.close()
    }
    const client = openGeDb()
    try {
      await expect(
        rotarClaveIdentidad(client, 'demasiado-corta', randomBytes(32).toString('base64')),
      ).rejects.toThrow(/32 bytes/)
    } finally {
      client.close()
    }
  })
})
