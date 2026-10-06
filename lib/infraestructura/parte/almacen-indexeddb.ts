import { crearAlmacenNavegador, type AlmacenClaveValor } from './envio-offline'

export const NOMBRE_DB_PARTE = 'parte-offline'
export const STORE_PARTE = 'kv'
const PREFIJO_COLA = 'parte:'
const MARCA_MIGRACION = 'parte-offline:migrado'

function abrir(nombre: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB no disponible'))
      return
    }
    const req = indexedDB.open(nombre, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_PARTE)) {
        req.result.createObjectStore(STORE_PARTE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('No se pudo abrir IndexedDB'))
  })
}

function enStore<T>(db: IDBDatabase, modo: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    try {
      const req = op(db.transaction(STORE_PARTE, modo).objectStore(STORE_PARTE))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error ?? new Error('Error de IndexedDB'))
    } catch (error) {
      reject(error)
    }
  })
}

// La cola vive en IndexedDB para que el service worker (public/sw-parte.js)
// pueda leerla con la pestaña cerrada: localStorage no existe en un worker.
export function crearAlmacenIndexedDb(nombre: string = NOMBRE_DB_PARTE): AlmacenClaveValor {
  const db = abrir(nombre)
  return {
    async obtener(clave) {
      const v = await enStore(await db, 'readonly', (s) => s.get(clave))
      return typeof v === 'string' ? v : null
    },
    async guardar(clave, valor) {
      await enStore(await db, 'readwrite', (s) => s.put(valor, clave))
    },
    async eliminar(clave) {
      await enStore(await db, 'readwrite', (s) => s.delete(clave))
    },
  }
}

export async function crearAlmacenParte(): Promise<AlmacenClaveValor> {
  if (typeof indexedDB === 'undefined') return crearAlmacenNavegador()
  try {
    const almacen = crearAlmacenIndexedDb()
    // Espera también el resultado asíncrono de abrir IndexedDB para poder
    // usar el respaldo si el navegador expone la API, pero no puede abrirla.
    await almacen.obtener(MARCA_MIGRACION)
    if (typeof localStorage !== 'undefined' && localStorage.getItem(MARCA_MIGRACION) === null) {
      for (const clave of [...Object.keys(localStorage)]) {
        if (!clave.startsWith(PREFIJO_COLA)) continue
        const valor = localStorage.getItem(clave)
        if (valor !== null) await almacen.guardar(clave, valor)
        localStorage.removeItem(clave)
      }
      localStorage.setItem(MARCA_MIGRACION, '1')
    }
    return almacen
  } catch {
    return crearAlmacenNavegador()
  }
}
