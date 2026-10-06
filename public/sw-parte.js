// Service worker del parte: reenvía la cola de IndexedDB cuando vuelve la
// conectividad, aunque la pestaña esté cerrada. El formulario conserva su
// reintento en primer plano en navegadores sin Background Sync.
const DB = 'parte-offline'
const STORE = 'kv'
const PREFIJO = 'parte:'
const REINTENTABLES = ['pendiente-envio', 'error-servidor']

function abrirDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function op(db, modo, fn) {
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, modo).objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
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

    try {
      const res = await fetchImpl(entrada.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entrada.cuerpo),
        credentials: 'same-origin',
      })
      const json = res.ok ? await res.json().catch(() => null) : null
      if (res.ok && json && json.ok === true && typeof json.movimientoId === 'string') {
        await op(db, 'readwrite', (s) => s.delete(clave))
        enviados.push(clave)
      } else if (res.status >= 400 && res.status < 500 && ![401, 403, 410].includes(res.status)) {
        await op(db, 'readwrite', (s) => s.put(JSON.stringify({ ...entrada, estado: 'error' }), clave))
      } else {
        pendientes.push(clave)
      }
    } catch {
      pendientes.push(clave)
    }
  }

  return { enviados, pendientes }
}

self.addEventListener('sync', (evento) => {
  if (evento.tag !== 'parte-envio') return
  evento.waitUntil(
    procesarColaSync(abrirDb, fetch).then(async ({ enviados, pendientes }) => {
      const clientes = await self.clients.matchAll({ includeUncontrolled: true })
      for (const cliente of clientes) {
        for (const clave of enviados) cliente.postMessage({ tipo: 'parte-enviado', clave })
      }
      if (pendientes.length > 0) throw new Error('Quedan envíos pendientes.')
    }),
  )
})

globalThis.__swParte = { procesarColaSync }
