import { ErrorPipelineFoto } from './errors'
import { procesarEnCanvas, type OpcionesPipelineFoto } from './procesador-imagen'

interface WorkerRequest {
  source: Blob
  options: OpcionesPipelineFoto
}

const workerScope = self as unknown as {
  addEventListener(type: 'message', listener: (event: MessageEvent<WorkerRequest>) => void): void
  postMessage(message: unknown): void
}

workerScope.addEventListener('message', (event) => {
  void procesarEnCanvas(event.data.source, event.data.options).then(
    (result) => workerScope.postMessage({ ok: true, result }),
    (error: unknown) => {
      const code = error instanceof ErrorPipelineFoto ? error.code : isMemoryError(error) ? 'out_of_memory' : 'processing_failed'
      const message = error instanceof Error ? error.message : 'Image processing failed.'
      workerScope.postMessage({ ok: false, error: { code, message } })
    },
  )
})

function isMemoryError(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('name' in error)) return false
  const name = String(error.name)
  return name === 'QuotaExceededError' || name === 'OutOfMemoryError' || name === 'AbortError'
}
