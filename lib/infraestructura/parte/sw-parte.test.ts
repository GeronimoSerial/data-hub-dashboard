// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NOMBRE_DB_PARTE, STORES_PARTE, VERSION_DB_PARTE, abrirAlmacenParte, crearAlmacenIndexedDb } from './almacen-indexeddb'

type Escucha = (e: unknown) => void

interface SwParte {
  procesarColaSync: (
    abrirDb: () => Promise<IDBDatabase>,
    fetchImpl: typeof fetch,
  ) => Promise<{ enviados: string[]; pendientes: string[] }>
  procesarColaEnvio: (
    abrirDb: () => Promise<IDBDatabase>,
    fetchImpl: typeof fetch,
  ) => Promise<{ enviados: string[]; pendientes: string[] }>
}

async function cargarSw(): Promise<{ listeners: Record<string, Escucha>; sw: SwParte }> {
  vi.resetModules()
  const listeners: Record<string, Escucha> = {}
  ;(globalThis as Record<string, unknown>).self = {
    addEventListener: (t: string, f: Escucha) => { listeners[t] = f },
    clients: { matchAll: async () => [] },
  }
  // @ts-expect-error El worker es un script clásico sin exportaciones.
  await import('../../../public/sw-parte.js')
  return {
    listeners,
    sw: (globalThis as unknown as { __swParte: SwParte }).__swParte,
  }
}

function borrarDb(): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(NOMBRE_DB_PARTE)
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
    req.onblocked = () => resolve()
  })
}

function nombresStores(): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(NOMBRE_DB_PARTE)
    req.onsuccess = () => {
      const db = req.result
      const nombres = [...db.objectStoreNames]
      db.close()
      resolve(nombres)
    }
    req.onerror = () => reject(req.error)
  })
}

/** Dispara el evento `sync` real del worker y espera al `waitUntil` registrado. */
async function dispararSync(listeners: Record<string, Escucha>): Promise<void> {
  let trabajo: Promise<unknown> | undefined
  listeners.sync({
    tag: 'parte-envio',
    waitUntil: (p: Promise<unknown>) => { trabajo = p },
  })
  await trabajo
}

const URL_PARTE = '/api/problematicas/parte'

describe('sw-parte procesarColaSync', () => {
  it('reenvía sólo los pendientes, borra confirmados y marca 4xx como error', async () => {
    const nombre = `sw-${crypto.randomUUID()}`
    const almacen = crearAlmacenIndexedDb(nombre)
    await almacen.guardar('parte:nuevo:1', JSON.stringify({ estado: 'pendiente-envio', url: URL_PARTE, cuerpo: { a: 1 } }))
    await almacen.guardar('parte:nuevo:2', JSON.stringify({ estado: 'error', url: URL_PARTE, cuerpo: { a: 2 } }))
    await almacen.guardar('parte:nuevo:3', JSON.stringify({ estado: 'error-servidor', url: URL_PARTE, cuerpo: { a: 3 } }))
    await almacen.guardar('parte:nuevo:4', JSON.stringify({ estado: 'pendiente-envio', url: URL_PARTE, cuerpo: { a: 4 } }))
    const fetchImpl = vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) => {
      const cuerpo = JSON.parse(init?.body as string)
      if (cuerpo.a === 1) return new Response(JSON.stringify({ ok: true, movimientoId: 'm' }), { status: 201 })
      if (cuerpo.a === 4) return new Response(JSON.stringify({ error: 'inválido' }), { status: 422 })
      return new Response(JSON.stringify({ error: 'x' }), { status: 503 })
    })
    const { sw } = await cargarSw()
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

describe('sw-parte submission queue', () => {
  it('shares the queue contract, recovers interrupted reports, and never waits on lower priorities', async () => {
    const nombre = `sw-jobs-${crypto.randomUUID()}`
    const almacen = await abrirAlmacenParte(nombre)
    await almacen.guardarTrabajoEnvio({
      idempotencyKey: 'photo', cuerpo: { photo: 1 }, cuerpoHash: '', estado: 'pendiente', version: 1, tipo: 'foto',
    })
    await almacen.guardarTrabajoEnvio({
      idempotencyKey: 'draft', cuerpo: { revision: 1 }, cuerpoHash: '', estado: 'pendiente', version: 1, tipo: 'sincronizacion_borrador',
    })
    await almacen.guardarTrabajoEnvio({
      idempotencyKey: 'final', draftId: 'draft-1', cuerpo: { idempotencyKey: 'final', respuesta: 'ok' },
      cuerpoHash: 'hash', estado: 'enviando', version: 1, tipo: 'reporte_final',
    })
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ movimientoId: 'movement-1' }), { status: 201 }))
    const { sw } = await cargarSw()
    const abrir = () => new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(nombre, VERSION_DB_PARTE)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })

    await expect(sw.procesarColaEnvio(abrir, fetchImpl)).resolves.toEqual({
      enviados: ['final'], pendientes: [],
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(JSON.parse(fetchImpl.mock.calls[0]![1]!.body as string)).toMatchObject({ idempotencyKey: 'final' })
    expect(await almacen.obtenerConfirmacion('final')).toMatchObject({ movimientoId: 'movement-1' })
    expect(await almacen.obtenerTrabajosEnvio()).toMatchObject([
      { idempotencyKey: 'photo', tipo: 'foto' },
      { idempotencyKey: 'draft', tipo: 'sincronizacion_borrador' },
    ])
    almacen.cerrar()
  })
})

describe('sw-parte contrato compartido de IndexedDB', () => {
  beforeEach(async () => {
    await borrarDb()
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    await borrarDb()
  })

  it('abre una base ya en versión 2 creada por el almacén compartido sin VersionError', async () => {
    await crearAlmacenIndexedDb().guardar('parte:nuevo:1', JSON.stringify({ estado: 'pendiente-envio', url: URL_PARTE, cuerpo: { a: 1 } }))
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true, movimientoId: 'm' }), { status: 201 }))
    vi.stubGlobal('fetch', fetchImpl)
    const { listeners } = await cargarSw()

    await expect(dispararSync(listeners)).resolves.toBeUndefined()

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(await crearAlmacenIndexedDb().obtener('parte:nuevo:1')).toBeNull()
  })

  it('migra una base v1 creando los stores nuevos y conservando kv', async () => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(NOMBRE_DB_PARTE, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORES_PARTE.kv)
      req.onsuccess = () => {
        const db = req.result
        const tx = db.transaction(STORES_PARTE.kv, 'readwrite')
        tx.objectStore(STORES_PARTE.kv).put(
          JSON.stringify({ estado: 'pendiente-envio', url: URL_PARTE, cuerpo: { a: 1 } }),
          'parte:nuevo:1',
        )
        tx.oncomplete = () => { db.close(); resolve() }
        tx.onerror = () => reject(tx.error)
      }
      req.onerror = () => reject(req.error)
    })
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true, movimientoId: 'm' }), { status: 201 }))
    vi.stubGlobal('fetch', fetchImpl)
    const { listeners } = await cargarSw()

    await dispararSync(listeners)

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect((await nombresStores()).sort()).toEqual(Object.values(STORES_PARTE).sort())
  })
})
