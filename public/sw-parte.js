// Service worker del parte: reenvía la cola de IndexedDB cuando vuelve la
// conectividad, aunque la pestaña esté cerrada. El formulario conserva su
// reintento en primer plano en navegadores sin Background Sync.
// Contrato compartido con lib/infraestructura/parte/almacen-indexeddb.ts.
// Cambiar aquí la versión o los stores exige cambiarlo también allí.
const DB = 'parte-offline'
const VERSION_DB = 2
const STORE = 'kv'
const STORES_CONTRATO = [
  { nombre: 'kv' },
  { nombre: 'contextos', keyPath: 'draftId' },
  { nombre: 'borradores', keyPath: 'draftId' },
  { nombre: 'trabajos_envio', keyPath: 'idempotencyKey' },
  { nombre: 'confirmaciones', keyPath: 'idempotencyKey' },
  { nombre: 'archivos' },
  { nombre: 'descartes', keyPath: 'draftId' },
]
const PREFIJO = 'parte:'
const REINTENTABLES = ['pendiente-envio', 'error-servidor']
const BLOQUEO_COLA = 'parte:submission-final'
const CLAVE_BLOQUEO_COLA = 'parte:lock:submission-final'
const DURACION_BLOQUEO_MS = 15000
const ESPERA_MAXIMA_MS = 30000
const CACHE_PREPARACION_PREFIX = 'parte-offline-shell-'
// Increment when the offline shell or its static resource graph changes.
const CACHE_PREPARACION_VERSION = 'v2'
const CACHE_PREPARACION = `${CACHE_PREPARACION_PREFIX}${CACHE_PREPARACION_VERSION}`
const RUTA_OFFLINE = '/problematicas/parte/offline'
const RUTAS_PARTE = ['/problematicas/parte/nuevo', '/problematicas/parte/actualizar']

function esRecursoEstatico(url, origin) {
  if (url.origin !== origin) return false
  return (url.pathname.startsWith('/_next/static/')
    && /\.(?:js|css|woff2?|ttf|otf|svg|png|jpe?g|webp|ico)$/i.test(url.pathname))
    || /\.(?:css|woff2?|ttf|otf|svg|png|jpe?g|webp|ico)$/i.test(url.pathname)
}

function recursosReferenciados(text, baseUrl, origin, contentType = 'text/html') {
  const encontrados = new Set()
  const patrones = [
    ...(contentType.toLowerCase().includes('html') ? [/(?:src|href)=["']([^"']+)["']/gi] : []),
    ...(contentType.toLowerCase().includes('html') || contentType.toLowerCase().includes('css') ? [/url\(["']?([^)'"\s]+)["']?\)/g] : []),
    ...(contentType.toLowerCase().includes('javascript') ? [/['"`]((?:\\\/|\/)\_next\/static\/[^'"`\s]+)['"`]/g] : []),
  ]
  for (const patron of patrones) {
    for (const match of text.matchAll(patron)) {
      try {
        const reference = match[1].replace(/\\\//g, '/').replace(/[),;]+$/, '').replace(/\\+$/, '')
        const url = new URL(reference, baseUrl)
        if (esRecursoEstatico(url, origin)) encontrados.add(url.href)
      } catch { /* Ignore malformed or non-URL references. */ }
    }
  }
  return [...encontrados]
}

async function respuestaPublica(response, expectedUrl, html = false) {
  if (!response || !response.ok || response.type === 'opaque' || response.redirected) return false
  if (response.url && new URL(response.url).href !== expectedUrl) return false
  if (response.headers.has('set-cookie') || /(?:^|,)\s*(?:cookie|authorization)(?:\s|,|$)/i.test(response.headers.get('vary') || '')) return false
  if (html && !(response.headers.get('content-type') || '').toLowerCase().includes('text/html')) return false
  if (!html && (response.headers.get('content-type') || '').toLowerCase().includes('text/html')) return false
  return true
}

async function prepararOffline(cacheStorage = caches, fetchImpl = fetch, origin = self.location.origin) {
  const cache = await cacheStorage.open(CACHE_PREPARACION)
  const htmlUrl = new URL(RUTA_OFFLINE, origin).href
  try {
    const htmlResponse = await fetchImpl(htmlUrl, { credentials: 'omit', cache: 'no-store', redirect: 'error' })
    if (!await respuestaPublica(htmlResponse, htmlUrl, true)) throw new Error('Offline page is not a public static response.')
    const html = await htmlResponse.clone().text()
    const pendientes = recursosReferenciados(html, htmlUrl, origin)
    const preparados = new Set()
    while (pendientes.length) {
      const resourceUrl = pendientes.shift()
      if (preparados.has(resourceUrl)) continue
      const response = await fetchImpl(resourceUrl, { credentials: 'omit', cache: 'no-store', redirect: 'error' })
      if (!await respuestaPublica(response, resourceUrl)) throw new Error(`Offline resource failed: ${resourceUrl}`)
      const contentType = response.headers.get('content-type') || ''
      const body = await response.clone().text().catch(() => '')
      if (contentType.toLowerCase().includes('text/css') || contentType.toLowerCase().includes('javascript')) {
        for (const dependency of recursosReferenciados(body, resourceUrl, origin, contentType)) {
          if (!preparados.has(dependency) && !pendientes.includes(dependency)) pendientes.push(dependency)
        }
      }
      await cache.put(resourceUrl, response)
      preparados.add(resourceUrl)
    }
    await cache.put(htmlUrl, htmlResponse)
    const verificacion = await Promise.all([htmlUrl, ...preparados].map((url) => cache.match(url)))
    const verified = verificacion.every(Boolean)
    if (!verified) throw new Error('Offline cache verification failed.')
    return { cacheName: CACHE_PREPARACION, resources: [htmlUrl, ...preparados] }
  } catch (error) {
    await cacheStorage.delete(CACHE_PREPARACION)
    throw error
  }
}

function esNavegacionParte(request) {
  if (request.method !== 'GET' || request.mode !== 'navigate') return false
  const url = new URL(request.url)
  return url.origin === self.location.origin && (RUTAS_PARTE.includes(url.pathname) || url.pathname === RUTA_OFFLINE)
}

async function fallbackOffline(request) {
  const requested = new URL(request.url)
  const cached = await caches.open(CACHE_PREPARACION)
  return await cached.match(new URL(RUTA_OFFLINE, requested.origin).href, { ignoreSearch: true })
}

async function servirRecursoEstatico(request, cacheStorage = caches, fetchImpl = fetch) {
  const cache = await cacheStorage.open(CACHE_PREPARACION)
  return await cache.match(request) || fetchImpl(request)
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const result = await prepararOffline()
    const clients = await self.clients.matchAll({ includeUncontrolled: true })
    for (const client of clients) client.postMessage({ tipo: 'parte-offline-disponible', version: CACHE_PREPARACION_VERSION })
    return result
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys()
    await Promise.all(names
      .filter((name) => name.startsWith(CACHE_PREPARACION_PREFIX) && name !== CACHE_PREPARACION)
      .map((name) => caches.delete(name)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  if (event.request.method === 'GET' && event.request.mode !== 'navigate') {
    const url = new URL(event.request.url)
    if (esRecursoEstatico(url, self.location.origin)) {
      event.respondWith(servirRecursoEstatico(event.request))
    }
    return
  }
  if (!esNavegacionParte(event.request)) return
  const isOfflineRoute = new URL(event.request.url).pathname === RUTA_OFFLINE
  const redirectToOffline = () => {
    const requested = new URL(event.request.url)
    const fallback = new URL(RUTA_OFFLINE, requested.origin)
    for (const [key, value] of requested.searchParams) fallback.searchParams.append(key, value)
    fallback.searchParams.set('flujo', requested.pathname.endsWith('/actualizar') ? 'actualizacion' : 'inicial')
    return Response.redirect(fallback.href, 302)
  }
  event.respondWith(fetch(event.request).then((response) => {
    if (response.ok) return response
    return isOfflineRoute ? fallbackOffline(event.request) : redirectToOffline()
  }).catch(async () => {
    if (isOfflineRoute) return fallbackOffline(event.request)
    return redirectToOffline()
  }))
})

function esperaReintento(intentos) {
  const base = Math.min(1000 * 2 ** Math.max(0, intentos), ESPERA_MAXIMA_MS)
  return Math.min(ESPERA_MAXIMA_MS, Math.round(base * (0.75 + Math.random() * 0.5)))
}

function leerRetryAfter(response, now = Date.now()) {
  const value = response.headers && response.headers.get('Retry-After')
  if (!value) return undefined
  const seconds = Number(value)
  const date = Number.isFinite(seconds) ? now + Math.max(0, seconds) * 1000 : Date.parse(value)
  return Number.isFinite(date) ? Math.max(now, date) : undefined
}

function clasificarEstado(status) {
  if (status === 401) return 'sesion-vencida'
  if (status === 413 || status === 429 || status === 408 || status >= 500) return 'reintentable'
  if (status >= 400 && status < 500) return 'error'
  return 'reintentable'
}

async function fetchWithTimeout(fetchImpl, input, init = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)
  try {
    return await fetchImpl(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

function migrar(db) {
  // Nunca se borra ningún almacén existente: los datos de versiones anteriores se conservan.
  for (const { nombre, keyPath } of STORES_CONTRATO) {
    if (!db.objectStoreNames.contains(nombre)) {
      db.createObjectStore(nombre, keyPath ? { keyPath } : undefined)
    }
  }
}

function abrirDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION_DB)
    req.onupgradeneeded = () => migrar(req.result)
    req.onblocked = () => reject(new Error('Otra pestaña impide actualizar el almacenamiento local'))
    req.onsuccess = () => {
      const db = req.result
      // Cede la base a otra pestaña que necesite un cambio de versión.
      db.onversionchange = () => db.close()
      resolve(db)
    }
    req.onerror = () => reject(req.error)
  })
}

function operar(db, stores, modo, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, modo)
    const resultado = fn(tx)
    tx.oncomplete = () => resolve(resultado?.result)
    tx.onabort = () => reject(tx.error ?? new Error('Transacción abortada'))
    tx.onerror = () => reject(tx.error ?? new Error('Transacción fallida'))
  })
}

function op(db, modo, fn) {
  return operar(db, STORE, modo, (tx) => fn(tx.objectStore(STORE)))
}

async function adquirirBloqueo(db, token) {
  return operar(db, STORE, 'readwrite', (tx) => {
    const store = tx.objectStore(STORE)
    let adquirido = false
    const req = store.get(CLAVE_BLOQUEO_COLA)
    req.onsuccess = () => {
      const actual = req.result
      if (!actual || actual.vence <= Date.now() || actual.token === token) {
        store.put({ token, vence: Date.now() + DURACION_BLOQUEO_MS }, CLAVE_BLOQUEO_COLA)
        adquirido = true
      }
    }
    return { get result() { return adquirido } }
  })
}

async function liberarBloqueo(db, token) {
  await operar(db, STORE, 'readwrite', (tx) => {
    const store = tx.objectStore(STORE)
    const req = store.get(CLAVE_BLOQUEO_COLA)
    req.onsuccess = () => { if (req.result?.token === token) store.delete(CLAVE_BLOQUEO_COLA) }
    return null
  })
}

async function conBloqueoCola(db, tarea) {
  const locks = self.navigator && self.navigator.locks
  if (locks && typeof locks.request === 'function') return locks.request(BLOQUEO_COLA, tarea)
  const token = self.crypto && self.crypto.randomUUID
    ? self.crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`
  while (!await adquirirBloqueo(db, token)) await new Promise((resolve) => setTimeout(resolve, 25))
  let activo = true
  let renovacion = Promise.resolve()
  const renovar = setInterval(() => {
    renovacion = renovacion.then(() => activo ? adquirirBloqueo(db, token) : undefined)
  }, DURACION_BLOQUEO_MS / 3)
  try {
    return await tarea()
  } finally {
    clearInterval(renovar)
    activo = false
    await renovacion
    await liberarBloqueo(db, token)
  }
}

function prioridad(tipo) {
  return tipo === 'reporte_final' ? 0 : tipo === 'sincronizacion_borrador' ? 1 : 2
}

async function recuperarTrabajosEnvio(db) {
  const store = 'trabajos_envio'
  const confirmations = 'confirmaciones'
  await operar(db, [store, confirmations], 'readwrite', (tx) => {
    const jobs = tx.objectStore(store)
    const confirmed = tx.objectStore(confirmations)
    const req = jobs.getAll()
    req.onsuccess = () => {
      for (const job of req.result) {
        const check = confirmed.get(job.idempotencyKey)
        check.onsuccess = () => {
          if (check.result) jobs.delete(job.idempotencyKey)
          else if (job.estado === 'enviando') jobs.put({ ...job, estado: 'pendiente' })
        }
      }
    }
    return null
  })
}

async function confirmarTrabajoEnvio(db, job, confirmacion) {
  await operar(db, ['trabajos_envio', 'confirmaciones'], 'readwrite', (tx) => {
    tx.objectStore('confirmaciones').put({
      idempotencyKey: job.idempotencyKey,
      movimientoId: confirmacion.movimientoId,
      rigeDesde: confirmacion.rigeDesde || new Date().toISOString().slice(0, 10),
      cierreDraft: 'enviado',
      version: 1,
    })
    tx.objectStore('trabajos_envio').delete(job.idempotencyKey)
    return null
  })
}

async function procesarColaEnvio(abrir, fetchImpl) {
  const db = await abrir()
  return conBloqueoCola(db, async () => {
    await recuperarTrabajosEnvio(db)
    const jobs = await operar(db, 'trabajos_envio', 'readonly', (tx) => tx.objectStore('trabajos_envio').getAll())
    jobs.sort((a, b) => prioridad(a.tipo) - prioridad(b.tipo)
      || (a.creadoEn || '').localeCompare(b.creadoEn || '')
      || a.idempotencyKey.localeCompare(b.idempotencyKey))
    const enviados = []
    const pendientes = []
    const sesionesVencidas = []
    for (const job of jobs) {
      // Draft and photo handlers arrive with their respective API contracts. They
      // stay queued here and can never run ahead of a final report.
      if (job.tipo !== 'reporte_final' && job.tipo !== undefined) continue
      if (job.estado !== 'pendiente') continue
      if (job.reintentarDespues && job.reintentarDespues > Date.now()) {
        pendientes.push(job.idempotencyKey)
        continue
      }
      await operar(db, 'trabajos_envio', 'readwrite', (tx) => {
        tx.objectStore('trabajos_envio').put({ ...job, estado: 'enviando' })
        return null
      })
      try {
        const response = await fetchWithTimeout(fetchImpl, '/api/problematicas/parte', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': job.idempotencyKey },
          body: JSON.stringify(job.cuerpo),
          credentials: 'same-origin',
        })
        const data = response.ok ? await response.json().catch(() => null) : null
        if (data && typeof data.movimientoId === 'string') {
          await confirmarTrabajoEnvio(db, job, data)
          enviados.push(job.idempotencyKey)
        } else {
          const clase = clasificarEstado(response.status)
          const intentos = (job.intentos || 0) + 1
          const retryAfter = (response.status === 413 || response.status === 429) ? leerRetryAfter(response) : undefined
          await operar(db, 'trabajos_envio', 'readwrite', (tx) => {
            tx.objectStore('trabajos_envio').put({
              ...job,
              estado: clase === 'reintentable' ? 'pendiente' : clase,
              intentos,
              ...(clase === 'reintentable' ? { reintentarDespues: retryAfter ?? Date.now() + esperaReintento(job.intentos || 0) } : {}),
            })
            return null
          })
          if (clase === 'reintentable') pendientes.push(job.idempotencyKey)
          if (clase === 'sesion-vencida') sesionesVencidas.push(job.idempotencyKey)
        }
      } catch {
        const intentos = (job.intentos || 0) + 1
        await operar(db, 'trabajos_envio', 'readwrite', (tx) => {
          tx.objectStore('trabajos_envio').put({
            ...job,
            estado: 'pendiente',
            intentos,
            reintentarDespues: Date.now() + esperaReintento(job.intentos || 0),
          })
          return null
        })
        pendientes.push(job.idempotencyKey)
      }
    }
    return { enviados, pendientes, sesionesVencidas }
  })
}

async function procesarColaSync(abrir, fetchImpl) {
  const db = await abrir()
  const claves = (await op(db, 'readonly', (s) => s.getAllKeys()))
    .filter((k) => typeof k === 'string' && k.startsWith(PREFIJO))
  const enviados = []
  const pendientes = []

  for (const clave of claves) {
    let entrada
    try {
      entrada = JSON.parse(await op(db, 'readonly', (s) => s.get(clave)))
    } catch {
      continue
    }
    if (!entrada || !REINTENTABLES.includes(entrada.estado) || !entrada.url || entrada.cuerpo === undefined) continue
    if (entrada.reintentarDespues && entrada.reintentarDespues > Date.now()) {
      pendientes.push(clave)
      continue
    }

    try {
      const res = await fetchWithTimeout(fetchImpl, entrada.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entrada.cuerpo),
        credentials: 'same-origin',
      })
      const json = res.ok ? await res.json().catch(() => null) : null
      if (res.ok && json && json.ok === true && typeof json.movimientoId === 'string') {
        await op(db, 'readwrite', (s) => s.delete(clave))
        enviados.push(clave)
      } else {
        const clase = clasificarEstado(res.status)
        if (clase === 'error') {
          await op(db, 'readwrite', (s) => s.put(JSON.stringify({ ...entrada, estado: 'error' }), clave))
        } else if (clase === 'sesion-vencida') {
          await op(db, 'readwrite', (s) => s.put(JSON.stringify({ ...entrada, estado: 'sesion-vencida' }), clave))
          pendientes.push(`${clave}:sesion-vencida`)
        } else {
          const intentos = (entrada.intentos || 0) + 1
          const retryAfter = (res.status === 413 || res.status === 429) ? leerRetryAfter(res) : undefined
          await op(db, 'readwrite', (s) => s.put(JSON.stringify({
            ...entrada,
            estado: 'error-servidor',
            intentos,
            reintentarDespues: retryAfter ?? Date.now() + esperaReintento(entrada.intentos || 0),
          }), clave))
          pendientes.push(clave)
        }
      }
    } catch {
      const intentos = (entrada.intentos || 0) + 1
      await op(db, 'readwrite', (s) => s.put(JSON.stringify({
        ...entrada,
        estado: 'error-servidor',
        intentos,
        reintentarDespues: Date.now() + esperaReintento(entrada.intentos || 0),
      }), clave))
      pendientes.push(clave)
    }
  }

  return { enviados, pendientes }
}

self.addEventListener('sync', (evento) => {
  if (evento.tag !== 'parte-envio') return
  evento.waitUntil(
    (async () => {
      const clientes = await self.clients.matchAll({ includeUncontrolled: true })
      const trabajos = await procesarColaEnvio(abrirDb, fetch)
      for (const cliente of clientes) {
        for (const clave of trabajos.enviados) cliente.postMessage({ tipo: 'parte-enviado', clave })
        for (const clave of trabajos.sesionesVencidas) cliente.postMessage({ tipo: 'parte-sesion-vencida', clave })
      }
      if (trabajos.pendientes.length > 0) throw new Error('Quedan reportes definitivos pendientes.')
      const antiguos = await procesarColaSync(abrirDb, fetch)
      for (const cliente of clientes) {
        for (const clave of antiguos.enviados) cliente.postMessage({ tipo: 'parte-enviado', clave })
        for (const clave of antiguos.pendientes.filter((item) => item.endsWith(':sesion-vencida'))) {
          cliente.postMessage({ tipo: 'parte-sesion-vencida', clave: clave.slice(0, -':sesion-vencida'.length) })
        }
      }
      if (antiguos.pendientes.some((clave) => !clave.endsWith(':sesion-vencida'))) throw new Error('Quedan envíos pendientes.')
    })(),
  )
})

globalThis.__swParte = { procesarColaSync }
globalThis.__swParte.procesarColaEnvio = procesarColaEnvio
globalThis.__swParte.prepararOffline = prepararOffline
globalThis.__swParte.servirRecursoEstatico = servirRecursoEstatico
