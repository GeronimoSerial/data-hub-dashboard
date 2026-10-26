import { getClientIp } from '@/lib/infraestructura/limites'
import type { Limitador } from './limitador'
import { conContexto, log } from './log'

export const HEADER_REQUEST_ID = 'x-request-id'

const REQUEST_ID_VALIDO = /^[A-Za-z0-9._-]{1,64}$/

// Reuses the caller's request id (reverse proxy, client retry) when it is
// safe to log; otherwise generates one.
export function resolverRequestId(request: Request): string {
  const entrante = request.headers.get(HEADER_REQUEST_ID)
  return entrante && REQUEST_ID_VALIDO.test(entrante) ? entrante : crypto.randomUUID()
}

export interface OpcionesRuta {
  // Rate limit applied before the handler; the key defaults to the client IP.
  limite?: { limitador: Limitador; clave?: (request: Request) => string }
}

type Handler<A extends unknown[]> = (request: Request, ...resto: A) => Promise<Response> | Response

// Standard wrapper for API route handlers: request id (header + logs),
// structured access log, optional rate limit and a traceable 500 for
// uncaught errors. Successful and handled responses pass through untouched
// apart from the added x-request-id header.
export function ruta<A extends unknown[]>(nombre: string, handler: Handler<A>, opciones: OpcionesRuta = {}) {
  return async (request: Request, ...resto: A): Promise<Response> => {
    const requestId = resolverRequestId(request)
    const inicio = performance.now()
    return conContexto({ requestId, ruta: nombre }, async () => {
      let respuesta: Response
      try {
        const espera = opciones.limite
          ? opciones.limite.limitador.consumir((opciones.limite.clave ?? getClientIp)(request))
          : null
        if (espera !== null) {
          log.warn('rate_limited', { method: request.method })
          respuesta = Response.json(
            { error: 'Demasiados pedidos. Intente nuevamente en unos segundos.' },
            { status: 429, headers: { 'Retry-After': String(espera) } },
          )
        } else {
          respuesta = await handler(request, ...resto)
        }
      } catch (error) {
        log.error('unhandled_error', { method: request.method, error })
        respuesta = Response.json({ error: 'Error interno', requestId }, { status: 500 })
      }
      const conId = conHeader(respuesta, requestId)
      log.info('request', {
        method: request.method,
        status: conId.status,
        durationMs: Math.round(performance.now() - inicio),
      })
      return conId
    })
  }
}

function conHeader(respuesta: Response, requestId: string): Response {
  try {
    respuesta.headers.set(HEADER_REQUEST_ID, requestId)
    return respuesta
  } catch {
    // Immutable headers (e.g. a Response.redirect): copy into a new response.
    const headers = new Headers(respuesta.headers)
    headers.set(HEADER_REQUEST_ID, requestId)
    return new Response(respuesta.body, { status: respuesta.status, statusText: respuesta.statusText, headers })
  }
}
