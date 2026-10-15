// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import { VERSION_DB_PARTE, crearAlmacenIndexedDb } from './almacen-indexeddb'

async function cargarSw() {
  const listeners: Record<string, (e: unknown) => void> = {}
  ;(globalThis as Record<string, unknown>).self = {
    addEventListener: (t: string, f: (e: unknown) => void) => { listeners[t] = f },
    clients: { matchAll: async () => [] },
  }
  // @ts-expect-error El worker es un script clásico sin exportaciones.
  await import('../../../public/sw-parte.js')
  return (globalThis as unknown as {
    __swParte: {
      procesarColaSync: (
        abrirDb: () => Promise<IDBDatabase>,
        fetchImpl: typeof fetch,
      ) => Promise<{ enviados: string[]; pendientes: string[] }>
    }
  }).__swParte
}

describe('sw-parte procesarColaSync', () => {
  it('reenvía sólo los pendientes, borra confirmados y marca 4xx como error', async () => {
    const nombre = `sw-${crypto.randomUUID()}`
    const almacen = crearAlmacenIndexedDb(nombre)
    await almacen.guardar('parte:nuevo:1', JSON.stringify({ estado: 'pendiente-envio', url: '/api/problematicas/parte', cuerpo: { a: 1 } }))
    await almacen.guardar('parte:nuevo:2', JSON.stringify({ estado: 'error', url: '/api/problematicas/parte', cuerpo: { a: 2 } }))
    await almacen.guardar('parte:nuevo:3', JSON.stringify({ estado: 'error-servidor', url: '/api/problematicas/parte', cuerpo: { a: 3 } }))
    await almacen.guardar('parte:nuevo:4', JSON.stringify({ estado: 'pendiente-envio', url: '/api/problematicas/parte', cuerpo: { a: 4 } }))
    const fetchImpl = vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) => {
      const cuerpo = JSON.parse(init?.body as string)
      if (cuerpo.a === 1) return new Response(JSON.stringify({ ok: true, movimientoId: 'm' }), { status: 201 })
      if (cuerpo.a === 4) return new Response(JSON.stringify({ error: 'inválido' }), { status: 422 })
      return new Response(JSON.stringify({ error: 'x' }), { status: 503 })
    })
    const sw = await cargarSw()
    const abrir = () => new Promise<IDBDatabase>((res) => {
      const r = indexedDB.open(nombre, VERSION_DB_PARTE)
      r.onsuccess = () => res(r.result)
    })
    const r = await sw.procesarColaSync(abrir, fetchImpl)
    expect(r).toEqual({ enviados: ['parte:nuevo:1'], pendientes: ['parte:nuevo:3'] })
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(await almacen.obtener('parte:nuevo:1')).toBeNull()
    expect(await almacen.obtener('parte:nuevo:2')).not.toBeNull()
    expect(JSON.parse((await almacen.obtener('parte:nuevo:4'))!)).toMatchObject({ estado: 'error' })
  })
})
