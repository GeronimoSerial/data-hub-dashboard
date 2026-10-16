import { ErrorPipelineFoto } from './errors'

export interface OpcionesPipelineFoto {
  maxInputBytes: number
  maxInputPixels: number
  maxDimension: number
  maxOptimizedBytes: number
  maxThumbnailBytes: number
  thumbnailDimension: number
}

export interface ResultadoPipelineFoto {
  optimized: Blob
  thumbnail: Blob
  width: number
  height: number
  mime: 'image/jpeg'
}

type CanvasContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
type CanvasLike = HTMLCanvasElement | OffscreenCanvas

export async function procesarEnCanvas(source: Blob, options: OpcionesPipelineFoto): Promise<ResultadoPipelineFoto> {
  const bitmap = await decodeSource(source)
  try {
    if (bitmap.width * bitmap.height > options.maxInputPixels) {
      throw new ErrorPipelineFoto('too_large', 'The decoded image exceeds the pixel limit.')
    }

    const scale = Math.min(1, options.maxDimension / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const optimized = await encodeAtMost(bitmap, width, height, options.maxOptimizedBytes)

    const thumbnailScale = Math.min(1, options.thumbnailDimension / Math.max(width, height))
    const thumbnailWidth = Math.max(1, Math.round(width * thumbnailScale))
    const thumbnailHeight = Math.max(1, Math.round(height * thumbnailScale))
    const thumbnail = await encodeAtMost(bitmap, thumbnailWidth, thumbnailHeight, options.maxThumbnailBytes)

    return { optimized, thumbnail, width, height, mime: 'image/jpeg' }
  } finally {
    bitmap.close?.()
  }
}

interface DecodedImage {
  width: number
  height: number
  close?: () => void
  source: CanvasImageSource
}

async function decodeSource(source: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' })
      return { width: bitmap.width, height: bitmap.height, source: bitmap, close: () => bitmap.close() }
    } catch (error) {
      if (isMemoryError(error)) throw error
    }
  }

  if (typeof document === 'undefined' || typeof URL === 'undefined') {
    throw new ErrorPipelineFoto('processing_failed', 'This browser cannot decode the selected image.')
  }
  const objectUrl = URL.createObjectURL(source)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('Image decoding failed.'))
      element.src = objectUrl
    })
    return { width: image.naturalWidth, height: image.naturalHeight, source: image }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

async function encodeAtMost(
  bitmap: DecodedImage,
  width: number,
  height: number,
  maxBytes: number,
): Promise<Blob> {
  for (const quality of [0.86, 0.78, 0.7, 0.62, 0.54]) {
    const canvas = createCanvas(width, height)
    const context = canvas.getContext('2d') as CanvasContext | null
    if (!context) throw new ErrorPipelineFoto('out_of_memory', 'A canvas could not be allocated for this image.')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
    context.drawImage(bitmap.source, 0, 0, width, height)
    const output = await canvasToBlob(canvas, quality)
    if (output.size <= maxBytes) return output
  }
  throw new ErrorPipelineFoto('too_large', 'The processed image exceeds the output size limit.')
}

function createCanvas(width: number, height: number): CanvasLike {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height)
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    return canvas
  }
  throw new ErrorPipelineFoto('processing_failed', 'Canvas image processing is unavailable.')
}

function canvasToBlob(canvas: CanvasLike, quality: number): Promise<Blob> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type: 'image/jpeg', quality })
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Canvas image encoding failed.')), 'image/jpeg', quality)
  })
}

function isMemoryError(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('name' in error)) return false
  const name = String(error.name)
  return name === 'QuotaExceededError' || name === 'OutOfMemoryError' || name === 'AbortError'
}
