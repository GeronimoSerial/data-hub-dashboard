import { crearAlmacenNavegador, type AlmacenClaveValor } from './envio-offline'
import type { CONTRATO_VERSION } from '../reportes-offline-contratos'

export const NOMBRE_DB_PARTE = 'parte-offline'
/** Versión 1: sólo `kv` (cola de envío). Versión 2: contrato compartido de reportes offline. */
export const VERSION_DB_PARTE = 2
export const STORE_PARTE = 'kv'
export const STORES_PARTE = {
  kv: 'kv',
  contextos: 'contextos',
  borradores: 'borradores',
  trabajosEnvio: 'trabajos_envio',
  confirmaciones: 'confirmaciones',
  archivos: 'archivos',
  descartes: 'descartes',
} as const
type NombreStore = (typeof STORES_PARTE)[keyof typeof STORES_PARTE]

const PREFIJO_COLA = 'parte:'
const MARCA_MIGRACION = 'parte-offline:migrado'
const CLAVE_BLOQUEO_COLA = 'parte:lock:submission-final'

export type CodigoErrorAlmacen =
  | 'no_disponible'
  | 'cuota_llena'
  | 'bloqueado'
  | 'transaccion_abortada'
  | 'version_incompatible'
  | 'error'

/** Error tipado de persistencia. Nunca se usa para confirmar un guardado exitoso. */
export class ErrorAlmacenParte extends Error {
  readonly codigo: CodigoErrorAlmacen
  constructor(codigo: CodigoErrorAlmacen, mensaje: string, causa?: unknown) {
    super(mensaje, { cause: causa })
    this.name = 'ErrorAlmacenParte'
    this.codigo = codigo
  }
}

export function clasificarErrorIdb(error: unknown): ErrorAlmacenParte {
  const nombre = (error as { name?: string } | null)?.name
  if (nombre === 'QuotaExceededError') {
    return new ErrorAlmacenParte('cuota_llena', 'Almacenamiento local lleno', error)
  }
  if (nombre === 'AbortError') {
    return new ErrorAlmacenParte('transaccion_abortada', 'La transacción de IndexedDB fue abortada', error)
  }
  if (nombre === 'VersionError') {
    return new ErrorAlmacenParte('version_incompatible', 'Versión de IndexedDB incompatible', error)
  }
  if (nombre === 'InvalidStateError' && error instanceof DOMException) {
    return new ErrorAlmacenParte('no_disponible', 'IndexedDB no disponible', error)
  }
  return new ErrorAlmacenParte('error', 'Error de IndexedDB', error)
}

/** Registro local de un borrador. `generacion` identifica la carga; limpiar sólo borra la generación confirmada. */
export interface RegistroBorradorLocal {
  draftId: string
  generacion: number
  version: typeof CONTRATO_VERSION
  datos: unknown
  actualizadoEn: string
}

export interface TrabajoEnvioLocal {
  idempotencyKey: string
  draftId?: string
  cuerpo: unknown
  cuerpoHash: string
  estado: 'pendiente' | 'enviando' | 'error' | 'sesion-vencida'
  version: typeof CONTRATO_VERSION
  /** Queue category; missing on records written by earlier clients. */
  tipo?: 'reporte_final' | 'sincronizacion_borrador' | 'foto'
  creadoEn?: string
  intentos?: number
  reintentarDespues?: number
}

export interface ConfirmacionLocal {
  idempotencyKey: string
  movimientoId: string
  rigeDesde: string
  cierreDraft: 'enviado'
  version: typeof CONTRATO_VERSION
}

export interface DescarteLocal {
  draftId: string
  generacion: number
  cue: string
  marcadoEn: string
  version: typeof CONTRATO_VERSION
}

/**
 * Conexiones compartidas por nombre de base (formularios y worker usan la misma apertura).
 * Se indexan por fábrica `indexedDB`: una conexión de otra fábrica (p. ej. tests) nunca se reutiliza.
 */
const conexionesPorFabrica = new WeakMap<object, Map<string, Promise<IDBDatabase>>>()

function conexionesDe(): Map<string, Promise<IDBDatabase>> {
  const fabrica: object = indexedDB
  let mapa = conexionesPorFabrica.get(fabrica)
  if (!mapa) {
    mapa = new Map()
    conexionesPorFabrica.set(fabrica, mapa)
  }
  return mapa
}

function migrar(db: IDBDatabase): void {
  // Nunca se borra ningún almacén existente: los datos de la versión 1 se conservan.
  const crear = (nombre: NombreStore, keyPath?: string) => {
    if (!db.objectStoreNames.contains(nombre)) {
      db.createObjectStore(nombre, keyPath ? { keyPath } : undefined)
    }
  }
  crear(STORES_PARTE.kv)
  crear(STORES_PARTE.contextos, 'draftId')
  crear(STORES_PARTE.borradores, 'draftId')
  crear(STORES_PARTE.trabajosEnvio, 'idempotencyKey')
  crear(STORES_PARTE.confirmaciones, 'idempotencyKey')
  crear(STORES_PARTE.archivos)
  crear(STORES_PARTE.descartes, 'draftId')
}

function abrirDb(nombre: string, conexiones: Map<string, Promise<IDBDatabase>>): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new ErrorAlmacenParte('no_disponible', 'IndexedDB no disponible'))
      return
    }
    let rechazada = false
    let req: IDBOpenDBRequest
    try {
      req = indexedDB.open(nombre, VERSION_DB_PARTE)
    } catch (error) {
      reject(clasificarErrorIdb(error))
      return
    }
    req.onupgradeneeded = () => migrar(req.result)
    req.onblocked = () => {
      // Otra pestaña mantiene una conexión antigua abierta. La apertura sigue
      // pendiente; si llega a completarse después, se cierra sin usarla.
      rechazada = true
      reject(new ErrorAlmacenParte('bloqueado', 'Otra pestaña impide actualizar el almacenamiento local'))
    }
    req.onsuccess = () => {
      const db = req.result
      if (rechazada) {
        db.close()
        return
      }
      // Ante un cambio de versión en otra pestaña se cierra para no bloqueárla;
      // el próximo uso vuelve a abrir (y reportará versión incompatible si corresponde).
      const soltar = () => {
        db.close()
        void conexiones.get(nombre)?.then((actual) => {
          if (actual === db) conexiones.delete(nombre)
        })
      }
      db.onversionchange = soltar
      db.onclose = soltar
      resolve(db)
    }
    req.onerror = () => {
      rechazada = true
      reject(clasificarErrorIdb(req.error))
    }
  })
}

function conexion(nombre: string): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return abrirDb(nombre, new Map())
  const conexiones = conexionesDe()
  let promesa = conexiones.get(nombre)
  if (!promesa) {
    const nueva: Promise<IDBDatabase> = abrirDb(nombre, conexiones).catch((error: unknown) => {
      if (conexiones.get(nombre) === nueva) conexiones.delete(nombre)
      throw error
    })
    promesa = nueva
    conexiones.set(nombre, promesa)
  }
  return promesa
}

/**
 * Ejecuta operaciones en una transacción. Resuelve sólo en `oncomplete`;
 * abortos y errores de petición rechazan con error tipado.
 * `op` devuelve un getter que se evalúa al completar la transacción.
 */
function ejecutar<T>(
  db: IDBDatabase,
  stores: readonly NombreStore[],
  modo: IDBTransactionMode,
  op: (tx: IDBTransaction) => () => T,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let tx: IDBTransaction | undefined
    let resultado: () => T
    try {
      tx = db.transaction(stores as string[], modo)
      resultado = op(tx)
    } catch (error) {
      try {
        tx?.abort()
      } catch {
        // La transacción ya pudo terminar; el error original es el que importa.
      }
      reject(clasificarErrorIdb(error))
      return
    }
    tx.oncomplete = () => resolve(resultado())
    tx.onabort = () => reject(clasificarErrorIdb(tx.error ?? new DOMException('Transacción abortada', 'AbortError')))
    tx.onerror = (evento) => {
      const error = (evento.target as IDBRequest | null)?.error ?? tx.error
      reject(clasificarErrorIdb(error))
    }
  })
}

async function operar<T>(
  nombre: string,
  stores: readonly NombreStore[],
  modo: IDBTransactionMode,
  op: (tx: IDBTransaction) => () => T,
): Promise<T> {
  const db = await conexion(nombre)
  return ejecutar(db, stores, modo, op)
}

function leerRegistro<T>(nombre: string, store: NombreStore, clave: string): Promise<T | null> {
  return operar(nombre, [store], 'readonly', (tx) => {
    const req = tx.objectStore(store).get(clave)
    return () => (req.result ?? null) as T | null
  })
}

function escribirRegistro(nombre: string, store: NombreStore, valor: object): Promise<void> {
  return operar(nombre, [store], 'readwrite', (tx) => {
    tx.objectStore(store).put(valor)
    return () => undefined
  })
}

function leerTodos<T>(nombre: string, store: NombreStore): Promise<T[]> {
  return operar(nombre, [store], 'readonly', (tx) => {
    const req = tx.objectStore(store).getAll()
    return () => req.result as T[]
  })
}

function borrarRegistro(nombre: string, store: NombreStore, clave: string): Promise<void> {
  return operar(nombre, [store], 'readwrite', (tx) => {
    tx.objectStore(store).delete(clave)
    return () => undefined
  })
}

export interface AlmacenParte {
  guardarContexto(contexto: { draftId: string } & object): Promise<void>
  obtenerContexto<T = unknown>(draftId: string): Promise<T | null>
  guardarBorrador(registro: RegistroBorradorLocal): Promise<void>
  obtenerBorrador(draftId: string): Promise<RegistroBorradorLocal | null>
  /** Borra el borrador sólo si su generación sigue siendo la confirmada. Devuelve si borró. */
  eliminarBorradorSiGeneracion(draftId: string, generacion: number): Promise<boolean>
  guardarTrabajoEnvio(trabajo: TrabajoEnvioLocal): Promise<void>
  /** Inserts a job only if its idempotency key does not already exist. */
  guardarTrabajoEnvioSiAusente(trabajo: TrabajoEnvioLocal): Promise<boolean>
  adquirirBloqueoCola(token: string, ahora: number, vence: number): Promise<boolean>
  liberarBloqueoCola(token: string): Promise<void>
  obtenerTrabajosEnvio(): Promise<TrabajoEnvioLocal[]>
  eliminarTrabajoEnvio(idempotencyKey: string): Promise<void>
  guardarConfirmacion(confirmacion: ConfirmacionLocal): Promise<void>
  obtenerConfirmacion(idempotencyKey: string): Promise<ConfirmacionLocal | null>
  guardarArchivo(attachmentId: string, archivo: Blob): Promise<void>
  obtenerArchivo(attachmentId: string): Promise<Blob | null>
  eliminarArchivo(attachmentId: string): Promise<void>
  marcarDescarte(descarte: DescarteLocal): Promise<void>
  obtenerDescarte(draftId: string): Promise<DescarteLocal | null>
  cerrar(): void
}

/** Abre el contrato compartido (formularios y service worker). */
export async function abrirAlmacenParte(nombre: string = NOMBRE_DB_PARTE): Promise<AlmacenParte> {
  // Fuerza la apertura y la migración para que los errores lleguen aquí, no en la primera escritura.
  await conexion(nombre)
  return {
    guardarContexto: (contexto) => escribirRegistro(nombre, STORES_PARTE.contextos, contexto),
    obtenerContexto: (draftId) => leerRegistro(nombre, STORES_PARTE.contextos, draftId),
    guardarBorrador: (registro) => escribirRegistro(nombre, STORES_PARTE.borradores, registro),
    obtenerBorrador: (draftId) => leerRegistro<RegistroBorradorLocal>(nombre, STORES_PARTE.borradores, draftId),
    eliminarBorradorSiGeneracion: (draftId, generacion) =>
      operar(nombre, [STORES_PARTE.borradores], 'readwrite', (tx) => {
        const store = tx.objectStore(STORES_PARTE.borradores)
        let borrado = false
        const req = store.get(draftId)
        req.onsuccess = () => {
          const actual = req.result as RegistroBorradorLocal | undefined
          if (actual && actual.generacion === generacion) {
            store.delete(draftId)
            borrado = true
          }
        }
        return () => borrado
      }),
    guardarTrabajoEnvio: (trabajo) => escribirRegistro(nombre, STORES_PARTE.trabajosEnvio, trabajo),
    guardarTrabajoEnvioSiAusente: (trabajo) =>
      operar(nombre, [STORES_PARTE.trabajosEnvio], 'readwrite', (tx) => {
        const store = tx.objectStore(STORES_PARTE.trabajosEnvio)
        let insertado = false
        const req = store.get(trabajo.idempotencyKey)
        req.onsuccess = () => {
          if (req.result === undefined) {
            store.add(trabajo)
            insertado = true
          }
        }
        return () => insertado
      }),
    adquirirBloqueoCola: (token, ahora, vence) =>
      operar(nombre, [STORES_PARTE.kv], 'readwrite', (tx) => {
        const store = tx.objectStore(STORES_PARTE.kv)
        let adquirido = false
        const req = store.get(CLAVE_BLOQUEO_COLA)
        req.onsuccess = () => {
          const actual = req.result as { token?: string; vence?: number } | undefined
          if (!actual || actual.vence === undefined || actual.vence <= ahora || actual.token === token) {
            store.put({ token, vence }, CLAVE_BLOQUEO_COLA)
            adquirido = true
          }
        }
        return () => adquirido
      }),
    liberarBloqueoCola: (token) =>
      operar(nombre, [STORES_PARTE.kv], 'readwrite', (tx) => {
        const store = tx.objectStore(STORES_PARTE.kv)
        const req = store.get(CLAVE_BLOQUEO_COLA)
        req.onsuccess = () => {
          const actual = req.result as { token?: string } | undefined
          if (actual?.token === token) store.delete(CLAVE_BLOQUEO_COLA)
        }
        return () => undefined
      }),
    obtenerTrabajosEnvio: () => leerTodos<TrabajoEnvioLocal>(nombre, STORES_PARTE.trabajosEnvio),
    eliminarTrabajoEnvio: (key) => borrarRegistro(nombre, STORES_PARTE.trabajosEnvio, key),
    guardarConfirmacion: (confirmacion) => escribirRegistro(nombre, STORES_PARTE.confirmaciones, confirmacion),
    obtenerConfirmacion: (key) => leerRegistro<ConfirmacionLocal>(nombre, STORES_PARTE.confirmaciones, key),
    guardarArchivo: (attachmentId, archivo) => {
      if (typeof archivo?.size !== 'number' || typeof archivo.type !== 'string') {
        return Promise.reject(new ErrorAlmacenParte('error', 'Sólo se guardan Blob como archivos'))
      }
      return operar(nombre, [STORES_PARTE.archivos], 'readwrite', (tx) => {
        tx.objectStore(STORES_PARTE.archivos).put(archivo, attachmentId)
        return () => undefined
      })
    },
    obtenerArchivo: async (attachmentId) => {
      return leerRegistro<Blob>(nombre, STORES_PARTE.archivos, attachmentId)
    },
    eliminarArchivo: (attachmentId) => borrarRegistro(nombre, STORES_PARTE.archivos, attachmentId),
    marcarDescarte: (descarte) => escribirRegistro(nombre, STORES_PARTE.descartes, descarte),
    obtenerDescarte: (draftId) => leerRegistro<DescarteLocal>(nombre, STORES_PARTE.descartes, draftId),
    cerrar: () => {
      const conexiones = conexionesDe()
      const abierta = conexiones.get(nombre)
      conexiones.delete(nombre)
      void abierta?.then((db) => db.close(), () => undefined)
    },
  }
}

/** API existente: almacén clave-valor sobre el store `kv` (lo usa también el service worker). */
export function crearAlmacenIndexedDb(nombre: string = NOMBRE_DB_PARTE): AlmacenClaveValor {
  return {
    async obtener(clave) {
      const v = await leerRegistro<unknown>(nombre, STORE_PARTE, clave)
      return typeof v === 'string' ? v : null
    },
    async guardar(clave, valor) {
      await operar(nombre, [STORE_PARTE], 'readwrite', (tx) => {
        tx.objectStore(STORE_PARTE).put(valor, clave)
        return () => undefined
      })
    },
    async eliminar(clave) {
      await borrarRegistro(nombre, STORE_PARTE, clave)
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
