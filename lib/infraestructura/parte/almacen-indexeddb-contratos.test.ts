// @vitest-environment jsdom
import 'fake-indexeddb/auto'
// fake-indexeddb clona Blob de Node; el Blob de jsdom se guardaría como objeto vacío.
import { Blob as NodeBlob } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import {
  ErrorAlmacenParte,
  abrirAlmacenParte,
  clasificarErrorIdb,
  crearAlmacenIndexedDb,
  type RegistroBorradorLocal,
} from './almacen-indexeddb'

const nombreNuevo = () => `t-contrato-${crypto.randomUUID()}`

function abrirRaw(nombre: string, version?: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = version === undefined ? indexedDB.open(nombre) : indexedDB.open(nombre, version)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function registro(draftId: string, generacion: number, datos: Record<string, unknown> = {}): RegistroBorradorLocal {
  return { draftId, generacion, version: 1, datos, actualizadoEn: '2026-10-15T10:00:00.000Z' }
}

describe('almacenes del contrato compartido', () => {
  it('crea los almacenes separados en la versión 2', async () => {
    const nombre = nombreNuevo()
    const almacen = await abrirAlmacenParte(nombre)
    await almacen.obtenerBorrador('x')
    almacen.cerrar()
    const db = await abrirRaw(nombre)
    expect(Array.from(db.objectStoreNames).sort()).toEqual([
      'archivos', 'borradores', 'confirmaciones', 'contextos', 'descartes', 'kv', 'trabajos_envio',
    ])
    expect(db.version).toBe(2)
    db.close()
  })

  it('conserva las claves de la versión 1 al migrar', async () => {
    const nombre = nombreNuevo()
    const v1 = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(nombre, 1)
      req.onupgradeneeded = () => req.result.createObjectStore('kv')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    await new Promise<void>((resolve, reject) => {
      const tx = v1.transaction('kv', 'readwrite')
      tx.objectStore('kv').put('{"estado":"error"}', 'parte:nuevo:1')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    v1.close()

    const almacen = crearAlmacenIndexedDb(nombre)
    expect(await almacen.obtener('parte:nuevo:1')).toBe('{"estado":"error"}')
  })
})

describe('escrituras confirmadas', () => {
  it('un borrador guardado es visible desde otra conexión al resolver', async () => {
    const nombre = nombreNuevo()
    const almacen = await abrirAlmacenParte(nombre)
    await almacen.guardarBorrador(registro('d1', 1, { paso: 3 }))
    const db = await abrirRaw(nombre)
    const leido = await new Promise<unknown>((resolve) => {
      const req = db.transaction('borradores').objectStore('borradores').get('d1')
      req.onsuccess = () => resolve(req.result)
    })
    db.close()
    almacen.cerrar()
    expect(leido).toMatchObject({ draftId: 'd1', generacion: 1, datos: { paso: 3 } })
  })

  it('rechaza con error tipado si la transacción aborta (valor no clonable)', async () => {
    const almacen = await abrirAlmacenParte(nombreNuevo())
    await expect(almacen.guardarBorrador(registro('d2', 1, { f: () => 1 })))
      .rejects.toBeInstanceOf(ErrorAlmacenParte)
    almacen.cerrar()
  })

  it('guarda el Blob como archivo, sin base64', async () => {
    const almacen = await abrirAlmacenParte(nombreNuevo())
    await almacen.guardarArchivo('att-1', new NodeBlob(['abc'], { type: 'image/webp' }) as unknown as Blob)
    const leido = await almacen.obtenerArchivo('att-1')
    expect(leido?.size).toBe(3)
    expect(leido?.type).toBe('image/webp')
    almacen.cerrar()
  })
})

describe('identidad y generación del borrador', () => {
  it('limpiar una generación vieja no borra una generación nueva', async () => {
    const almacen = await abrirAlmacenParte(nombreNuevo())
    await almacen.guardarBorrador(registro('d3', 1))
    await almacen.guardarBorrador(registro('d3', 2, { nuevo: true }))
    expect(await almacen.eliminarBorradorSiGeneracion('d3', 1)).toBe(false)
    expect(await almacen.obtenerBorrador('d3')).toMatchObject({ generacion: 2 })
    expect(await almacen.eliminarBorradorSiGeneracion('d3', 2)).toBe(true)
    expect(await almacen.obtenerBorrador('d3')).toBeNull()
    almacen.cerrar()
  })
})

describe('errores tipados y coordinación entre pestañas', () => {
  it('clasifica cuota llena y bloqueo como códigos distintos', () => {
    expect(clasificarErrorIdb(new DOMException('llena', 'QuotaExceededError')).codigo).toBe('cuota_llena')
    expect(clasificarErrorIdb(new DOMException('abortada', 'AbortError')).codigo).toBe('transaccion_abortada')
    expect(clasificarErrorIdb(new Error('otro')).codigo).toBe('error')
  })

  it('reporta bloqueo cuando otra conexión antigua impide la migración', async () => {
    const nombre = nombreNuevo()
    const v1 = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(nombre, 1)
      req.onupgradeneeded = () => req.result.createObjectStore('kv')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const almacen = crearAlmacenIndexedDb(nombre)
    await expect(almacen.obtener('x')).rejects.toMatchObject({ codigo: 'bloqueado' })
    v1.close()
  })

  it('cierra la conexión ante versionchange de otra pestaña sin bloquearla', async () => {
    const nombre = nombreNuevo()
    const almacen = await abrirAlmacenParte(nombre)
    await almacen.guardarBorrador(registro('d4', 1))
    let bloqueado = false
    const otra = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(nombre, 3)
      req.onblocked = () => { bloqueado = true }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    otra.close()
    expect(bloqueado).toBe(false)
    await expect(almacen.obtenerBorrador('d4')).rejects.toMatchObject({ codigo: 'version_incompatible' })
    almacen.cerrar()
  })
})
