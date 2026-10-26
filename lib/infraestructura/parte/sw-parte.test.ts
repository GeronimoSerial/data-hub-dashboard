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
  ) => Promise<{ enviados: string[]; pendientes: string[]; sesionesVencidas: string[] }>
  prepararOffline: (
    cacheStorage?: CacheStorage,
    fetchImpl?: typeof fetch,
    origin?: string,
  ) => Promise<{ cacheName: string; resources: string[] }>
  servirRecursoEstatico: (
    request: Request,
    cacheStorage: CacheStorage,
    fetchImpl: typeof fetch,
  ) => Promise<Response>
}

async function cargarSw(): Promise<{ listeners: Record<string, Escucha>; sw: SwParte }> {
  vi.resetModules()
  const listeners: Record<string, Escucha> = {}
  ;(globalThis as Record<string, unknown>).self = {
    addEventListener: (t: string, f: Escucha) => { listeners[t] = f },
    clients: { matchAll: async () => [] },
    skipWaiting: vi.fn(async () => {}),
    location: { origin: 'https://example.test' },
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

describe('sw-parte offline shell assets', () => {
  it('serves cached static resources when the browser is offline', async () => {
    const { sw } = await cargarSw()
    const request = new Request('https://example.test/_next/static/chunks/offline.js')
    const cached = new Response('cached bundle', { status: 200 })
    const match = vi.fn(async () => cached)
    const open = vi.fn(async () => ({ match } as unknown as Cache))
    const cacheStorage = { open } as unknown as CacheStorage
    const fetchImpl = vi.fn(async () => { throw new Error('The network should not be used.') })

    await expect(sw.servirRecursoEstatico(request, cacheStorage, fetchImpl)).resolves.toBe(cached)
    expect(open).toHaveBeenCalledWith('parte-offline-shell-v3')
    expect(match).toHaveBeenCalledWith(request)
    expect(fetchImpl).not.toHaveBeenCalled()
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
      enviados: ['final'], pendientes: [], sesionesVencidas: [],
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(JSON.parse(fetchImpl.mock.calls[0]![1]!.body as string)).toMatchObject({ idempotencyKey: 'final' })
    expect(await almacen.obtenerConfirmacion('final')).toMatchObject({ movimientoId: 'movement-1' })
    expect(await almacen.obtenerTrabajosEnvio()).toMatchObject([
      { idempotencyKey: 'draft', tipo: 'sincronizacion_borrador' },
      { idempotencyKey: 'photo', tipo: 'foto' },
    ])
    almacen.cerrar()
  })

  it('stores server retry limits and pauses expired sessions without retrying validation errors', async () => {
    const nombre = `sw-retry-${crypto.randomUUID()}`
    const almacen = await abrirAlmacenParte(nombre)
    for (const idempotencyKey of ['limit-429', 'invalid-422', 'expired-401']) {
      await almacen.guardarTrabajoEnvio({
        idempotencyKey, cuerpo: { idempotencyKey }, cuerpoHash: '', estado: 'pendiente', version: 1, tipo: 'reporte_final',
      })
    }
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string) as { idempotencyKey: string }
      if (body.idempotencyKey === 'limit-429') return new Response('{}', { status: 429, headers: { 'Retry-After': '120' } })
      if (body.idempotencyKey === 'expired-401') return new Response('{}', { status: 401 })
      return new Response('{}', { status: 422 })
    })
    const { sw } = await cargarSw()
    const abrir = () => new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(nombre, VERSION_DB_PARTE)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })

    const result = await sw.procesarColaEnvio(abrir, fetchImpl)
    expect(result).toMatchObject({ enviados: [], pendientes: ['limit-429'], sesionesVencidas: ['expired-401'] })
    expect(await almacen.obtenerTrabajosEnvio()).toEqual(expect.arrayContaining([
      expect.objectContaining({ idempotencyKey: 'limit-429', estado: 'pendiente', reintentarDespues: expect.any(Number) }),
      expect.objectContaining({ idempotencyKey: 'invalid-422', estado: 'error', cuerpo: { idempotencyKey: 'invalid-422' } }),
      expect.objectContaining({ idempotencyKey: 'expired-401', estado: 'sesion-vencida' }),
    ]))
    const limit = (await almacen.obtenerTrabajosEnvio()).find((job) => job.idempotencyKey === 'limit-429')
    expect(limit?.reintentarDespues).toBeGreaterThan(Date.now() + 100_000)
    almacen.cerrar()
  })

  it('notifies open clients when a submission session expires', async () => {
    await borrarDb()
    const almacen = await abrirAlmacenParte()
    await almacen.guardarTrabajoEnvio({
      idempotencyKey: 'session-key', cuerpo: { idempotencyKey: 'session-key' }, cuerpoHash: '',
      estado: 'pendiente', version: 1, tipo: 'reporte_final',
    })
    const messages: unknown[] = []
    const { listeners } = await cargarSw()
    const selfMock = (globalThis as unknown as { self: { clients: { matchAll: () => Promise<unknown[]> } } }).self
    selfMock.clients.matchAll = async () => [{ postMessage: (message: unknown) => messages.push(message) }]
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })))

    await dispararSync(listeners)

    expect(messages).toContainEqual({ tipo: 'parte-sesion-vencida', clave: 'session-key' })
    vi.unstubAllGlobals()
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

describe('sw-parte offline shell cache', () => {
  function crearCacheStorage() {
    const datos = new Map<string, Response>()
    const cache = {
      put: vi.fn(async (request: RequestInfo | URL, response: Response) => {
        datos.set(String(request), response.clone())
      }),
      match: vi.fn(async (request: RequestInfo | URL) => datos.get(String(request))?.clone()),
    }
    const storage = {
      open: vi.fn(async () => cache),
      delete: vi.fn(async () => { datos.clear(); return true }),
      keys: vi.fn(async () => []),
    }
    return { storage: storage as unknown as CacheStorage, cache, datos }
  }

  it('caches and verifies the public offline shell and every referenced static resource without credentials', async () => {
    const { storage, cache, datos } = crearCacheStorage()
    const shellUrl = 'https://example.test/problematicas/parte/offline'
    const jsUrl = 'https://example.test/_next/static/chunks/offline.js'
    const cssUrl = 'https://example.test/_next/static/css/offline.css'
    const fontUrl = 'https://example.test/_next/static/media/offline.woff2'
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input)
      if (url === shellUrl) return new Response(`<html><script src="${jsUrl}"></script><link href="${cssUrl}" rel="stylesheet"></html>`, { status: 200, headers: { 'Content-Type': 'text/html' } })
      if (url === cssUrl) return new Response(`@font-face { src: url("${fontUrl}") }`, { status: 200, headers: { 'Content-Type': 'text/css' } })
      return new Response('static asset', { status: 200 })
    })
    const { sw } = await cargarSw()

    const result = await sw.prepararOffline(storage, fetchImpl, 'https://example.test')

    expect(result.resources).toEqual(expect.arrayContaining([shellUrl, jsUrl, cssUrl, fontUrl]))
    expect(datos.size).toBe(4)
    expect(cache.match).toHaveBeenCalledWith(shellUrl)
    expect(fetchImpl).toHaveBeenCalledTimes(4)
    expect(fetchImpl.mock.calls.every(([, init]) => init?.credentials === 'omit')).toBe(true)
    expect(result.resources).toHaveLength(fetchImpl.mock.calls.length)
  })

  it('does not mistake JavaScript URL constructors for CSS url() resource references', async () => {
    const { storage } = crearCacheStorage()
    const shellUrl = 'https://example.test/problematicas/parte/offline'
    const jsUrl = 'https://example.test/_next/static/chunks/offline.js'
    const nestedUrl = '/_next/static/chunks/nested.js'
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === shellUrl) return new Response(`<script src="${jsUrl}"></script>`, { status: 200, headers: { 'Content-Type': 'text/html' } })
      if (url === jsUrl) return new Response(`const offline = new URL('/problematicas/parte/offline', location.href); const chunk = '${nestedUrl}';`, { status: 200, headers: { 'Content-Type': 'text/javascript' } })
      return new Response('nested static asset', { status: 200, headers: { 'Content-Type': 'text/javascript' } })
    })
    const { sw } = await cargarSw()

    const result = await sw.prepararOffline(storage, fetchImpl, 'https://example.test')

    expect(result.resources).toEqual(expect.arrayContaining([shellUrl, jsUrl, new URL(nestedUrl, jsUrl).href]))
    expect(result.resources).toHaveLength(3)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('discards only the incomplete new version when a static resource is missing', async () => {
    const { storage } = crearCacheStorage()
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === 'https://example.test/problematicas/parte/offline') {
        return new Response('<script src="https://example.test/_next/static/chunks/missing.js"></script>', {
          status: 200, headers: { 'Content-Type': 'text/html' },
        })
      }
      return new Response('missing', { status: 404 })
    })
    const { sw } = await cargarSw()

    await expect(sw.prepararOffline(storage, fetchImpl, 'https://example.test')).rejects.toThrow()

    const deleteCache = (storage as unknown as { delete: ReturnType<typeof vi.fn> }).delete
    expect(deleteCache).toHaveBeenCalledTimes(1)
    expect(deleteCache).toHaveBeenCalledWith('parte-offline-shell-v3')
  })

  it('rejects a resource response that varies by authentication state', async () => {
    const { storage } = crearCacheStorage()
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === 'https://example.test/problematicas/parte/offline') {
        return new Response('<script src="https://example.test/_next/static/chunks/private.js"></script>', {
          status: 200, headers: { 'Content-Type': 'text/html' },
        })
      }
      return new Response('private', { status: 200, headers: { 'Vary': 'Cookie' } })
    })
    const { sw } = await cargarSw()

    await expect(sw.prepararOffline(storage, fetchImpl, 'https://example.test')).rejects.toThrow()

    const cache = await storage.open('parte-offline-shell-v3')
    expect(await cache.match('https://example.test/_next/static/chunks/private.js')).toBeUndefined()
  })

  it('announces preparation only after verified cache completion', async () => {
    const { storage } = crearCacheStorage()
    const messages: unknown[] = []
    const { listeners } = await cargarSw()
    const selfMock = (globalThis as unknown as { self: { clients: { matchAll: () => Promise<unknown[]> } } }).self
    selfMock.clients.matchAll = async () => [{ postMessage: (message: unknown) => messages.push(message) }]
    vi.stubGlobal('caches', storage)
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html></html>', {
      status: 200, headers: { 'Content-Type': 'text/html' },
    })))

    await dispararEvento(listeners, 'install')

    expect(messages).toContainEqual({ tipo: 'parte-offline-disponible', version: 'v3' })
    expect((globalThis as unknown as { self: { skipWaiting: ReturnType<typeof vi.fn> } }).self.skipWaiting).toHaveBeenCalledOnce()
    vi.unstubAllGlobals()
  })

  it('removes the previous version only during activation after the new worker installed', async () => {
    const { listeners } = await cargarSw()
    const cacheNames = ['parte-offline-shell-old', 'parte-offline-shell-v3', 'unrelated-cache']
    const deleted: string[] = []
    const selfMock = (globalThis as unknown as { self: { clients: { claim: () => Promise<void> } } }).self
    selfMock.clients.claim = async () => {}
    vi.stubGlobal('caches', {
      keys: async () => cacheNames,
      delete: async (name: string) => { deleted.push(name); return true },
    })

    await dispararEvento(listeners, 'activate')

    expect(deleted).toEqual(['parte-offline-shell-old'])
    vi.unstubAllGlobals()
  })

  it.each(['nuevo', 'actualizar'])('conserva la redirección de navegación desde %s', async (ruta) => {
    const { listeners } = await cargarSw()
    // Navigation fetches expose server redirects as opaque responses (status 0).
    const redireccion = new Response(null)
    Object.defineProperties(redireccion, {
      status: { value: 0 },
      ok: { value: false },
      type: { value: 'opaqueredirect' },
    })
    vi.stubGlobal('fetch', vi.fn(async () => redireccion))
    let response: Promise<Response> | undefined
    listeners.fetch({
      request: { url: `https://example.test/problematicas/parte/${ruta}?cue=1801605-04`, method: 'GET', mode: 'navigate', redirect: 'manual' },
      respondWith: (promise: Promise<Response>) => { response = promise },
    })
    expect(await response!).toBe(redireccion)
    vi.unstubAllGlobals()
  })

  it.each([401, 403, 404, 500, 503])('conserva el error HTTP %s sin mostrar reportes guardados', async (status) => {
    const { listeners } = await cargarSw()
    const original = new Response('Error del servidor', { status })
    vi.stubGlobal('fetch', vi.fn(async () => original))
    let response: Promise<Response> | undefined
    listeners.fetch({
      request: { url: 'https://example.test/problematicas/parte/nuevo?cue=1801605-04', method: 'GET', mode: 'navigate' },
      respondWith: (promise: Promise<Response>) => { response = promise },
    })
    expect(await response!).toBe(original)
    vi.unstubAllGlobals()
  })

  it('redirects a failed update navigation to the offline shell with original query, flow and CUE', async () => {
    const { listeners } = await cargarSw()
    let response: Promise<Response> | undefined
    listeners.fetch({
      request: {
        url: 'https://example.test/problematicas/parte/actualizar?cue=1801605-04&paso=afectaciones',
        method: 'GET',
        mode: 'navigate',
      },
      respondWith: (promise: Promise<Response>) => { response = promise },
    })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))

    const result = await response!

    expect(result.status).toBe(302)
    const location = new URL(result.headers.get('Location')!)
    expect(location.pathname).toBe('/problematicas/parte/offline')
    expect(location.searchParams.get('cue')).toBe('1801605-04')
    expect(location.searchParams.get('paso')).toBe('afectaciones')
    expect(location.searchParams.get('flujo')).toBe('actualizacion')
    vi.unstubAllGlobals()
  })
})

describe('sw-parte navegación con redirect del servidor', () => {
  function navegar(listeners: Record<string, Escucha>, url: string): Promise<Response> {
    let response: Promise<Response> | undefined
    listeners.fetch({
      request: { url, method: 'GET', mode: 'navigate' },
      respondWith: (promise: Promise<Response>) => { response = promise },
    })
    return response!
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('devuelve el 307 del servidor al navegador en vez de mandar a offline', async () => {
    const { listeners } = await cargarSw()
    const redirect = new Response(null, {
      status: 307,
      headers: { Location: '/problematicas/parte/actualizar?cue=1801605-04' },
    })
    vi.stubGlobal('fetch', vi.fn(async () => redirect))

    const result = await navegar(listeners, 'https://example.test/problematicas/parte/nuevo?cue=1801605-04')

    expect(result).toBe(redirect)
    expect(result.status).toBe(307)
  })

  it('devuelve un opaqueredirect del navegador sin convertirlo en redirección offline', async () => {
    const { listeners } = await cargarSw()
    const opaque = { type: 'opaqueredirect', status: 0, ok: false } as unknown as Response
    vi.stubGlobal('fetch', vi.fn(async () => opaque))

    const result = await navegar(listeners, 'https://example.test/problematicas/parte/nuevo?cue=1801605-04')

    expect(result).toBe(opaque)
  })

  it('sigue yendo a offline cuando la red falla de verdad', async () => {
    const { listeners } = await cargarSw()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))

    const result = await navegar(listeners, 'https://example.test/problematicas/parte/nuevo?cue=1801605-04')

    expect(result.status).toBe(302)
    expect(new URL(result.headers.get('Location')!).pathname).toBe('/problematicas/parte/offline')
  })
})

async function dispararEvento(listeners: Record<string, Escucha>, tipo: string): Promise<void> {
  let trabajo: Promise<unknown> | undefined
  listeners[tipo]({ waitUntil: (promise: Promise<unknown>) => { trabajo = promise } })
  await trabajo
}
