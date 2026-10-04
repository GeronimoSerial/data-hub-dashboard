// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { crearAlmacenIndexedDb, crearAlmacenParte } from './almacen-indexeddb'
import { crearAlmacenMemoria, intentarEnviar, leerBorrador } from './envio-offline'

beforeEach(() => localStorage.clear())

describe('crearAlmacenIndexedDb', () => {
  it('guarda, lee y elimina', async () => {
    const a = crearAlmacenIndexedDb(`t-${crypto.randomUUID()}`)
    await a.guardar('k', 'v')
    expect(await a.obtener('k')).toBe('v')
    await a.eliminar('k')
    expect(await a.obtener('k')).toBeNull()
  })
})

describe('crearAlmacenParte', () => {
  it('migra la cola de localStorage a IndexedDB una sola vez', async () => {
    localStorage.setItem('parte:nuevo:123', '{"x":1}')
    localStorage.setItem('otra-cosa', 'no se migra')
    const a = await crearAlmacenParte()
    expect(await a.obtener('parte:nuevo:123')).toBe('{"x":1}')
    expect(localStorage.getItem('parte:nuevo:123')).toBeNull()
    expect(localStorage.getItem('otra-cosa')).toBe('no se migra')
  })
})

describe('la cola guarda url y cuerpo listos para reenviar', () => {
  it('un envío fallido deja url y cuerpo en el borrador', async () => {
    const almacen = crearAlmacenMemoria()
    await intentarEnviar({ a: 1 }, {
      almacen, tipo: 'nuevo', cue: 'c', url: '/api/x',
      fetchImpl: async () => { throw new TypeError('offline') },
      construirCuerpo: (d, k) => ({ ...d, idempotencyKey: k }),
    })
    const b = await leerBorrador(almacen, 'nuevo', 'c')
    expect(b?.url).toBe('/api/x')
    expect(b?.cuerpo).toEqual({ a: 1, idempotencyKey: b?.idempotencyKey })
  })
})
