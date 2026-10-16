// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { IDBObjectStore } from 'fake-indexeddb'
import { Blob as NodeBlob } from 'node:buffer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { abrirAlmacenParte } from '../parte/almacen-indexeddb'
import { procesarFotoPersistida } from './pipeline'

const nombreDb = () => `t-fotos-${crypto.randomUUID()}`

describe('procesamiento local recuperable de fotos', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('reanuda desde el original guardado y sólo lo sustituye tras guardar ambas variantes', async () => {
    const nombre = nombreDb()
    const almacen = await abrirAlmacenParte(nombre)
    const ordenEscrituras: string[] = []
    const putOriginal = IDBObjectStore.prototype.put
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value, key) {
      if (this.name === 'archivos') ordenEscrituras.push(String(key))
      return putOriginal.call(this, value, key)
    })
    const original = new NodeBlob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' })
    let intentos = 0
    const salida = {
      optimized: new NodeBlob(['optimized'], { type: 'image/jpeg' }),
      thumbnail: new NodeBlob(['thumbnail'], { type: 'image/jpeg' }),
      width: 120,
      height: 80,
      mime: 'image/jpeg' as const,
    }
    class MockWorker {
      onmessage: ((event: MessageEvent) => void) | null = null
      onerror: ((event: ErrorEvent) => void) | null = null
      postMessage = vi.fn((message: { source: Blob }) => {
        intentos += 1
        queueMicrotask(() => {
          if (intentos === 1) {
            this.onmessage?.({ data: { ok: false, error: { code: 'processing_failed' } } } as MessageEvent)
          } else {
            expect(message.source.size).toBe(original.size)
            this.onmessage?.({ data: { ok: true, result: salida } } as MessageEvent)
          }
        })
      })
      terminate = vi.fn()
    }
    vi.stubGlobal('Worker', MockWorker)
    vi.stubGlobal('OffscreenCanvas', class {})
    vi.stubGlobal('createImageBitmap', vi.fn())

    await expect(procesarFotoPersistida('adjunto-1', original as unknown as Blob, { databaseName: nombre }))
      .rejects.toMatchObject({ code: 'processing_failed' })
    const originalGuardado = await almacen.obtenerArchivo('adjunto-1')
    expect(originalGuardado?.size).toBe(original.size)

    const resultado = await procesarFotoPersistida('adjunto-1', undefined, { databaseName: nombre })

    expect(resultado.optimized.size).toBe(salida.optimized.size)
    expect((await almacen.obtenerArchivo('adjunto-1'))?.size).toBe(salida.optimized.size)
    expect((await almacen.obtenerArchivo('adjunto-1:thumbnail'))?.size).toBe(salida.thumbnail.size)
    expect(await almacen.obtenerArchivo('adjunto-1:optimized')).toBeNull()
    const reemplazoOriginal = ordenEscrituras.lastIndexOf('adjunto-1')
    expect(ordenEscrituras.indexOf('adjunto-1:optimized')).toBeLessThan(reemplazoOriginal)
    expect(ordenEscrituras.indexOf('adjunto-1:thumbnail')).toBeLessThan(reemplazoOriginal)
    almacen.cerrar()
  })
})
