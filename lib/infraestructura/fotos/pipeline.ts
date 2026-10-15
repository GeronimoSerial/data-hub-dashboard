import { procesarEnCanvas, type OpcionesPipelineFoto, type ResultadoPipelineFoto } from './procesador-imagen'
import { ErrorPipelineFoto, type CodigoErrorPipelineFoto } from './errors'
export { ErrorPipelineFoto } from './errors'
export type { CodigoErrorPipelineFoto } from './errors'

export interface OpcionesProcesarFoto {
  /** Maximum source file size. Defaults to 20 MiB. */
  maxInputBytes?: number
  /** Maximum decoded source pixel count. Defaults to 40 megapixels. */
  maxInputPixels?: number
  /** Maximum output dimension. Defaults to 1600 pixels. */
  maxDimension?: number
  /** Maximum optimized image size. Defaults to 600 KiB. */
  maxOptimizedBytes?: number
  /** Maximum thumbnail size. Defaults to 40 KiB. */
  maxThumbnailBytes?: number
  /** Maximum thumbnail dimension. Defaults to 320 pixels. */
  thumbnailDimension?: number
}

export interface ResultadoFoto {
  optimized: Blob
  thumbnail: Blob
  width: number
  height: number
  mime: 'image/jpeg'
}

const DEFAULTS: Required<OpcionesProcesarFoto> = {
  maxInputBytes: 20 * 1024 * 1024,
  maxInputPixels: 40_000_000,
  maxDimension: 1600,
  maxOptimizedBytes: 600 * 1024,
  maxThumbnailBytes: 40 * 1024,
  thumbnailDimension: 320,
}

let processingQueue: Promise<void> = Promise.resolve()

/** Processes one image at a time; returned blobs are re-encoded and contain no source metadata. */
export function procesarFoto(source: Blob, options: OpcionesProcesarFoto = {}): Promise<ResultadoFoto> {
  const run = processingQueue.then(() => procesarFotoAhora(source, { ...DEFAULTS, ...options }))
  processingQueue = run.then(() => undefined, () => undefined)
  return run
}

async function procesarFotoAhora(source: Blob, options: Required<OpcionesProcesarFoto>): Promise<ResultadoFoto> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(source.type.toLowerCase())) {
    throw new ErrorPipelineFoto('unsupported_format', 'Choose a JPEG, PNG, or WebP image.')
  }
  if (source.size === 0 || source.size > options.maxInputBytes) {
    throw new ErrorPipelineFoto('too_large', 'The selected image is empty or exceeds the input size limit.')
  }

  const workerCapable = typeof Worker !== 'undefined'
    && typeof OffscreenCanvas !== 'undefined'
    && typeof createImageBitmap === 'function'

  if (workerCapable) {
    try {
      const workerResult = await processInWorker(source, options)
      return validateResult(workerResult)
    } catch (error) {
      if (!(error instanceof WorkerStartupError)) throw convertirError(error)
    }
  }

  try {
    return validateResult(await procesarEnCanvas(source, options))
  } catch (error) {
    throw convertirError(error)
  }
}

function processInWorker(source: Blob, options: Required<OpcionesProcesarFoto>): Promise<ResultadoPipelineFoto> {
  return new Promise((resolve, reject) => {
    let worker: Worker
    try {
      worker = new Worker(new URL('./photo-worker.ts', import.meta.url), { type: 'module' })
    } catch (error) {
      reject(new WorkerStartupError('The image worker could not start.', { cause: error }))
      return
    }

    let settled = false
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      worker.terminate()
      callback()
    }

    worker.onmessage = (event: MessageEvent<{ ok: true; result: ResultadoPipelineFoto } | { ok: false; error: { code?: string; message?: string } }>) => {
      const response = event.data
      if (response.ok) finish(() => resolve(response.result))
      else finish(() => reject(new ErrorPipelineFoto(
        isErrorCode(response.error.code) ? response.error.code : 'processing_failed',
        response.error.message ?? 'Image processing failed.',
      )))
    }
    worker.onerror = (event) => finish(() => reject(new ErrorPipelineFoto(
      isMemoryError(event.error) ? 'out_of_memory' : 'processing_failed',
      event.message || 'Image processing failed.',
      { cause: event.error },
    )))
    try {
      worker.postMessage({ source, options })
    } catch (error) {
      finish(() => reject(new WorkerStartupError('The image worker could not receive the image.', { cause: error })))
    }
  })
}

class WorkerStartupError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
  }
}

function validateResult(result: ResultadoPipelineFoto): ResultadoFoto {
  if (!(result.optimized instanceof Blob) || !(result.thumbnail instanceof Blob)
    || result.optimized.type !== 'image/jpeg' || result.thumbnail.type !== 'image/jpeg'
    || !Number.isFinite(result.width) || !Number.isFinite(result.height)
    || result.width < 1 || result.height < 1) {
    throw new ErrorPipelineFoto('processing_failed', 'The image processor returned an invalid result.')
  }
  return { ...result, mime: 'image/jpeg' }
}

function convertirError(error: unknown): ErrorPipelineFoto {
  if (error instanceof ErrorPipelineFoto) return error
  if (isMemoryError(error)) return new ErrorPipelineFoto('out_of_memory', 'There is not enough memory to process this image.', { cause: error })
  return new ErrorPipelineFoto('processing_failed', 'The image could not be processed.', { cause: error })
}

function isMemoryError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const name = 'name' in error ? String(error.name) : ''
  return name === 'QuotaExceededError' || name === 'OutOfMemoryError' || name === 'AbortError'
}

function isErrorCode(code: unknown): code is CodigoErrorPipelineFoto {
  return code === 'unsupported_format' || code === 'too_large' || code === 'out_of_memory' || code === 'processing_failed'
}
