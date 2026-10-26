import { AsyncLocalStorage } from 'node:async_hooks'

// Request-scoped context: every log line emitted while a request is being
// handled carries its requestId and route, without threading them by hand.
export interface ContextoPedido {
  requestId: string
  ruta: string
}

const contexto = new AsyncLocalStorage<ContextoPedido>()

export function conContexto<T>(ctx: ContextoPedido, fn: () => T): T {
  return contexto.run(ctx, fn)
}

export function contextoActual(): ContextoPedido | undefined {
  return contexto.getStore()
}

type Nivel = 'debug' | 'info' | 'warn' | 'error'

function serializarError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack }
  return { value: String(error) }
}

// Structured JSON logs, one line per event, so they can be filtered by
// requestId/route in the log collector.
function emitir(nivel: Nivel, mensaje: string, datos?: Record<string, unknown>): void {
  if (nivel === 'debug' && process.env.LOG_LEVEL !== 'debug') return
  const linea: Record<string, unknown> = { ts: new Date().toISOString(), level: nivel, msg: mensaje, ...contextoActual() }
  if (datos) {
    for (const [clave, valor] of Object.entries(datos)) {
      linea[clave] = clave === 'error' ? serializarError(valor) : valor
    }
  }
  const texto = JSON.stringify(linea)
  if (nivel === 'error') console.error(texto)
  else if (nivel === 'warn') console.warn(texto)
  else console.log(texto)
}

export const log = {
  debug: (mensaje: string, datos?: Record<string, unknown>) => emitir('debug', mensaje, datos),
  info: (mensaje: string, datos?: Record<string, unknown>) => emitir('info', mensaje, datos),
  warn: (mensaje: string, datos?: Record<string, unknown>) => emitir('warn', mensaje, datos),
  error: (mensaje: string, datos?: Record<string, unknown>) => emitir('error', mensaje, datos),
}
