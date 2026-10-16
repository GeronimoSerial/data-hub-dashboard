import { procesarEnCanvas, type ResultadoPipelineFoto } from './procesador-imagen'
import { ErrorPipelineFoto, type CodigoErrorPipelineFoto } from './errors'
import { abrirAlmacenParte } from '../parte/almacen-indexeddb'
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

export interface OpcionesProcesarFotoPersistida extends OpcionesProcesarFoto {
  /** IndexedDB name override for isolated callers and tests. */
  databaseName?: string
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

/**
 * Saves the source locally before processing, then replaces it only after both
 * derived variants have been durably written. Calling without `source` resumes
 * an interrupted conversion from the saved local original.
 */
export async function procesarFotoPersistida(
  attachmentId: string,
  source?: Blob,
  options: OpcionesProcesarFotoPersistida = {},
): Promise<ResultadoFoto> {
  if (!attachmentId.trim()) throw new ErrorPipelineFoto('invalid_input', 'A photo attachment ID is required.')

  const { databaseName, ...processingOptions } = options
  let almacen: Awaited<ReturnType<typeof abrirAlmacenParte>>
  try {
    almacen = await abrirAlmacenParte(databaseName)
    const original = source ?? await almacen.obtenerArchivo(attachmentId)
    if (!original) {
      throw new ErrorPipelineFoto('missing_original', 'The saved original image is unavailable for processing.')
    }
    const normalizedOptions = { ...DEFAULTS, ...processingOptions }
    await validarEntradaFoto(original, normalizedOptions)
    if (source) await almacen.guardarArchivo(attachmentId, source)

    const result = await procesarFoto(original, normalizedOptions)
    const optimizedKey = `${attachmentId}:optimized`
    const thumbnailKey = `${attachmentId}:thumbnail`

    await almacen.guardarArchivo(optimizedKey, result.optimized)
    await almacen.guardarArchivo(thumbnailKey, result.thumbnail)
    await almacen.guardarArchivo(attachmentId, result.optimized)
    await almacen.eliminarArchivo(optimizedKey)
    return result
  } catch (error) {
    if (error instanceof ErrorPipelineFoto) throw error
    throw new ErrorPipelineFoto('storage_failed', 'The photo could not be saved for local recovery.', { cause: error })
  }
}

async function procesarFotoAhora(source: Blob, options: Required<OpcionesProcesarFoto>): Promise<ResultadoFoto> {
  await validarEntradaFoto(source, options)

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

async function validarEntradaFoto(source: Blob, options: Required<OpcionesProcesarFoto>): Promise<void> {
  validarOpciones(options)
  if (!source || typeof source.size !== 'number' || typeof source.type !== 'string' || typeof source.slice !== 'function') {
    throw new ErrorPipelineFoto('invalid_input', 'Choose a valid image file.')
  }
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(source.type.toLowerCase())) {
    throw new ErrorPipelineFoto('unsupported_format', 'Choose a JPEG, PNG, or WebP image.')
  }
  if (source.size === 0 || source.size > options.maxInputBytes) {
    throw new ErrorPipelineFoto('too_large', 'The selected image is empty or exceeds the input size limit.')
  }
  let imageInfo: ImageInfo
  try {
    const header = new Uint8Array(await source.slice(0, Math.min(source.size, 64 * 1024)).arrayBuffer())
    imageInfo = inspectImageHeader(header, source.type.toLowerCase())
  } catch (error) {
    if (error instanceof ErrorPipelineFoto) throw error
    throw convertirError(error)
  }
  if (imageInfo.width && imageInfo.height && imageInfo.width * imageInfo.height > options.maxInputPixels) {
    throw new ErrorPipelineFoto('too_large', 'The decoded image exceeds the pixel limit.')
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

function validarOpciones(options: Required<OpcionesProcesarFoto>): void {
  const positive = [
    options.maxInputBytes,
    options.maxInputPixels,
    options.maxDimension,
    options.maxOptimizedBytes,
    options.maxThumbnailBytes,
    options.thumbnailDimension,
  ]
  if (positive.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new ErrorPipelineFoto('invalid_limit', 'Image processing limits must be positive finite numbers.')
  }
}

interface ImageInfo {
  width?: number
  height?: number
}

function inspectImageHeader(bytes: Uint8Array, mime: string): ImageInfo {
  const isPng = startsWith(bytes, [137, 80, 78, 71, 13, 10, 26, 10])
  const isJpeg = startsWith(bytes, [0xff, 0xd8, 0xff])
  const isWebp = startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && ascii(bytes, 8, 12) === 'WEBP'
  if ((mime === 'image/png' && !isPng) || (mime === 'image/jpeg' && !isJpeg) || (mime === 'image/webp' && !isWebp)) {
    throw new ErrorPipelineFoto('unsupported_format', 'The image bytes do not match the selected file format.')
  }
  if (isPng) {
    if (bytes.length < 24 || ascii(bytes, 12, 16) !== 'IHDR') return {}
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    return { width: view.getUint32(16), height: view.getUint32(20) }
  }
  if (isJpeg) return inspectJpegDimensions(bytes)
  if (isWebp) return inspectWebpDimensions(bytes)
  throw new ErrorPipelineFoto('unsupported_format', 'Choose a JPEG, PNG, or WebP image.')
}

function inspectJpegDimensions(bytes: Uint8Array): ImageInfo {
  let offset = 2
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) break
    const marker = bytes[offset + 1]
    offset += 2
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue
    const length = (bytes[offset] << 8) | bytes[offset + 1]
    if (length < 2 || offset + length > bytes.length) break
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      if (length < 7) break
      return { height: (bytes[offset + 3] << 8) | bytes[offset + 4], width: (bytes[offset + 5] << 8) | bytes[offset + 6] }
    }
    offset += length
  }
  return {}
}

function inspectWebpDimensions(bytes: Uint8Array): ImageInfo {
  if (bytes.length < 30) return {}
  const kind = ascii(bytes, 12, 16)
  if (kind === 'VP8X') {
    return {
      width: 1 + readUint24(bytes, 24),
      height: 1 + readUint24(bytes, 27),
    }
  }
  if (kind === 'VP8L' && bytes[20] === 0x2f) {
    return {
      width: 1 + bytes[21] + ((bytes[22] & 0x3f) << 8),
      height: 1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 0x0f) << 10),
    }
  }
  if (kind === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return { width: (bytes[26] | (bytes[27] << 8)) & 0x3fff, height: (bytes[28] | (bytes[29] << 8)) & 0x3fff }
  }
  return {}
}

function startsWith(bytes: Uint8Array, prefix: number[]): boolean {
  return prefix.every((value, index) => bytes[index] === value)
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end))
}

function readUint24(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16)
}
