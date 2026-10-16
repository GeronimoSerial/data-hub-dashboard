import { afterEach, describe, expect, it, vi } from 'vitest'
import { ErrorPipelineFoto, procesarFoto } from './pipeline'

function foto(bytes: number, type: string): Blob {
  const data = new Uint8Array(bytes)
  if (type === 'image/jpeg' && bytes >= 3) data.set([0xff, 0xd8, 0xff])
  if (type === 'image/png' && bytes >= 24) {
    data.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82])
    new DataView(data.buffer).setUint32(16, 1)
    new DataView(data.buffer).setUint32(20, 1)
  }
  if (type === 'image/webp' && bytes >= 12) {
    data.set([0x52, 0x49, 0x46, 0x46], 0)
    data.set([0x57, 0x45, 0x42, 0x50], 8)
  }
  return new Blob([data], { type })
}

describe('procesarFoto', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('rejects unsupported formats with a typed error before decoding', async () => {
    await expect(procesarFoto(foto(16, 'image/heic'))).rejects.toMatchObject({
      code: 'unsupported_format',
    })
  })

  it('rejects oversized inputs with a typed error before decoding', async () => {
    await expect(procesarFoto(foto(21 * 1024 * 1024, 'image/jpeg'))).rejects.toMatchObject({
      code: 'too_large',
    })
  })

  it('rejects an image whose bytes do not match its declared format', async () => {
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
    await expect(procesarFoto(new Blob([png], { type: 'image/jpeg' }))).rejects.toMatchObject({
      code: 'unsupported_format',
    })
  })

  it('rejects over-limit PNG dimensions before invoking the decoder', async () => {
    const pngHeader = new Uint8Array(24)
    pngHeader.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82])
    new DataView(pngHeader.buffer).setUint32(16, 10000)
    new DataView(pngHeader.buffer).setUint32(20, 5000)
    const decoder = vi.fn()
    vi.stubGlobal('createImageBitmap', decoder)

    await expect(procesarFoto(new Blob([pngHeader], { type: 'image/png' }))).rejects.toMatchObject({
      code: 'too_large',
    })
    expect(decoder).not.toHaveBeenCalled()
  })

  it('rejects invalid processing limits with a typed error', async () => {
    await expect(procesarFoto(foto(32, 'image/jpeg'), { maxInputBytes: 0 })).rejects.toMatchObject({
      code: 'invalid_limit',
    })
  })

  it('uses a worker when all required worker image APIs are available', async () => {
    const outputs = {
      optimized: new Blob(['optimized'], { type: 'image/jpeg' }),
      thumbnail: new Blob(['thumbnail'], { type: 'image/jpeg' }),
      width: 1200,
      height: 800,
      mime: 'image/jpeg',
    }
    const postMessage = vi.fn(function (this: Worker, _input: unknown) {
      queueMicrotask(() => this.onmessage?.({ data: { ok: true, result: outputs } } as MessageEvent))
    })
    const terminate = vi.fn()
    class MockWorker {
      onmessage: ((event: MessageEvent) => void) | null = null
      onerror: ((event: ErrorEvent) => void) | null = null
      postMessage = postMessage
      terminate = terminate
    }
    vi.stubGlobal('Worker', MockWorker)
    vi.stubGlobal('OffscreenCanvas', class {})
    vi.stubGlobal('createImageBitmap', vi.fn())

    const result = await procesarFoto(foto(32, 'image/jpeg'))

    expect(result.optimized).toBe(outputs.optimized)
    expect(result.thumbnail).toBe(outputs.thumbnail)
    expect(postMessage).toHaveBeenCalledOnce()
    expect(terminate).toHaveBeenCalledOnce()
  })

  it('maps decoder memory failures to a typed out-of-memory error', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new DOMException('allocation failed', 'QuotaExceededError')))
    await expect(procesarFoto(foto(32, 'image/png'))).rejects.toBeInstanceOf(ErrorPipelineFoto)
    await expect(procesarFoto(foto(32, 'image/png'))).rejects.toMatchObject({ code: 'out_of_memory' })
  })
})
