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

function op(db, modo, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, modo)
    const req = fn(tx.objectStore(STORE))
    tx.oncomplete = () => resolve(req.result)
    tx.onabort = () => reject(tx.error ?? new Error('Transacción abortada'))
    tx.onerror = () => reject(req.error ?? tx.error)
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
