import { afterEach, describe, expect, it, vi } from 'vitest'
import { ErrorPipelineFoto, procesarFoto } from './pipeline'

function foto(bytes: number, type: string): Blob {
  const blob = new Blob([new Uint8Array(bytes)], { type })
  return blob
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
