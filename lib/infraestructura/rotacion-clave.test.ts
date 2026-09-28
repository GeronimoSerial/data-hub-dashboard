import { randomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getRawClient } from '../db'
import { crearEjecutorSql, ensureGeSchema } from './ge-db'
import { importarIdentidad, listarIdentidadesPorPersonas, rotarClaveIdentidad } from './identidad'

// Ejercita el procedimiento documentado en docs/rotacion-clave-nominal.md.
//
// DB1/F2: GE dejó de ser un archivo ge.sqlite copiable; ahora es el schema `ge`
// de la base Postgres/PGlite única y compartida. Por eso el test rota sobre esa
// base directamente y verifica que las filas queden recifradas con la clave
// nueva. La salvaguarda "probar sobre una COPIA, nunca sobre el original" del
// flujo SQLite ya no tiene equivalente: no hay archivo que copiar.
let prevKey: string | undefined

beforeEach(() => {
  prevKey = process.env.NOMINAL_ENCRYPTION_KEY
})

afterEach(() => {
  if (prevKey === undefined) delete process.env.NOMINAL_ENCRYPTION_KEY
  else process.env.NOMINAL_ENCRYPTION_KEY = prevKey
})

describe('rotarClaveIdentidad', () => {
  it('recifra todas las filas con la clave nueva y preserva los nombres', async () => {
    const claveVieja = randomBytes(32).toString('base64')
    const claveNueva = randomBytes(32).toString('base64')

    process.env.NOMINAL_ENCRYPTION_KEY = claveVieja
    const client = crearEjecutorSql(getRawClient())
    await ensureGeSchema(client)
    await importarIdentidad(client, 1, 'Facundo', 'Quiroga')
    await importarIdentidad(client, 2, 'Manuela', 'Rosas')

    const { filasRotadas } = await rotarClaveIdentidad(client, claveVieja, claveNueva)
    expect(filasRotadas).toBe(2)

    process.env.NOMINAL_ENCRYPTION_KEY = claveNueva
    const identidades = await listarIdentidadesPorPersonas(client, [1, 2])
    expect(identidades).toEqual(
      expect.arrayContaining([
        { gePersonId: 1, nombre: 'Facundo', apellido: 'Quiroga' },
        { gePersonId: 2, nombre: 'Manuela', apellido: 'Rosas' },
      ]),
    )
  })

  it('no rota nada si alguna clave no decodifica a 32 bytes', async () => {
    const client = crearEjecutorSql(getRawClient())
    await ensureGeSchema(client)
    await expect(
      rotarClaveIdentidad(client, 'demasiado-corta', randomBytes(32).toString('base64')),
    ).rejects.toThrow(/32 bytes/)
  })
})
