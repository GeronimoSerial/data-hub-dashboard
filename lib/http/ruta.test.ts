import { afterEach, describe, expect, it, vi } from 'vitest'
import { _reiniciarLimitadoresParaTests, crearLimitador } from './limitador'
import { contextoActual } from './log'
import { HEADER_REQUEST_ID, ruta } from './ruta'

function pedido(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/x', { headers })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ruta', () => {
  it('passes the handler response through and adds a generated request id', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const handler = ruta('x', async () => Response.json({ ok: true }, { status: 201 }))
    const res = await handler(pedido())
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ ok: true })
    expect(res.headers.get(HEADER_REQUEST_ID)).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('reuses a safe incoming request id and rejects an unsafe one', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const handler = ruta('x', async () => new Response(null, { status: 204 }))
    expect((await handler(pedido({ [HEADER_REQUEST_ID]: 'abc-123' }))).headers.get(HEADER_REQUEST_ID)).toBe('abc-123')
    expect((await handler(pedido({ [HEADER_REQUEST_ID]: 'x'.repeat(65) }))).headers.get(HEADER_REQUEST_ID)).not.toBe('x'.repeat(65))
  })

  it('exposes the request context to code inside the handler', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    let visto: unknown
    const handler = ruta('parte.get', async () => {
      visto = contextoActual()
      return new Response(null, { status: 204 })
    })
    await handler(pedido({ [HEADER_REQUEST_ID]: 'r1' }))
    expect(visto).toEqual({ requestId: 'r1', ruta: 'parte.get' })
  })

  it('turns an uncaught error into a 500 with the request id and logs the stack', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    const handler = ruta('x', async () => {
      throw new Error('boom')
    })
    const res = await handler(pedido({ [HEADER_REQUEST_ID]: 'r2' }))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Error interno', requestId: 'r2' })
    const linea = JSON.parse(errores.mock.calls[0][0] as string)
    expect(linea).toMatchObject({ level: 'error', msg: 'unhandled_error', requestId: 'r2', ruta: 'x', error: { message: 'boom' } })
    expect(linea.error.stack).toContain('boom')
  })

  it('writes one structured access log line per request', async () => {
    const logs = vi.spyOn(console, 'log').mockImplementation(() => {})
    const handler = ruta('x', async () => new Response(null, { status: 204 }))
    await handler(pedido({ [HEADER_REQUEST_ID]: 'r3' }))
    const linea = JSON.parse(logs.mock.calls.at(-1)![0] as string)
    expect(linea).toMatchObject({ level: 'info', msg: 'request', requestId: 'r3', ruta: 'x', method: 'GET', status: 204 })
    expect(typeof linea.durationMs).toBe('number')
  })

  it('rejects with 429 and Retry-After once the key exceeds its limit, without calling the handler', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const limitador = crearLimitador({ ventanaMs: 60_000, max: 2 })
    const fn = vi.fn(async () => new Response(null, { status: 204 }))
    const handler = ruta('x', fn, { limite: { limitador } })
    const ip = { 'x-forwarded-for': '10.0.0.1' }
    expect((await handler(pedido(ip))).status).toBe(204)
    expect((await handler(pedido(ip))).status).toBe(204)
    const bloqueada = await handler(pedido(ip))
    expect(bloqueada.status).toBe(429)
    expect(Number(bloqueada.headers.get('Retry-After'))).toBeGreaterThan(0)
    expect(fn).toHaveBeenCalledTimes(2)
    expect((await handler(pedido({ 'x-forwarded-for': '10.0.0.2' }))).status).toBe(204)
  })

  it('sets x-request-id on immutable responses such as redirects', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const handler = ruta('x', async () => Response.redirect('http://localhost/destino', 307))
    const res = await handler(pedido({ [HEADER_REQUEST_ID]: 'r4' }))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://localhost/destino')
    expect(res.headers.get(HEADER_REQUEST_ID)).toBe('r4')
  })

  it('does not log the query string, so PII in URLs stays out of the logs', async () => {
    const logs = vi.spyOn(console, 'log').mockImplementation(() => {})
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    const advertencias = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const handler = ruta('x', async () => new Response(null, { status: 204 }))
    await handler(new Request('http://localhost/api/x?dni=30123456'))
    const lineas = [...logs.mock.calls, ...errores.mock.calls, ...advertencias.mock.calls].map((args) => String(args[0]))
    expect(lineas.length).toBeGreaterThan(0)
    for (const linea of lineas) expect(linea).not.toContain('30123456')
  })
})

describe('crearLimitador', () => {
  it('opens a new window after the previous one expires', () => {
    const limitador = crearLimitador({ ventanaMs: 1000, max: 1 })
    expect(limitador.consumir('k', 0)).toBeNull()
    expect(limitador.consumir('k', 500)).toBe(1)
    expect(limitador.consumir('k', 1000)).toBeNull()
  })

  it('evicts the oldest key once the map is full, keeping memory bounded', () => {
    const limitador = crearLimitador({ ventanaMs: 60_000, max: 1 })
    for (let i = 0; i < 10_050; i++) limitador.consumir(`k${i}`, 0)
    // k0 was evicted, so it starts a fresh window instead of exceeding max=1.
    expect(limitador.consumir('k0', 0)).toBeNull()
    // A recent key is still tracked and blocked.
    expect(limitador.consumir('k10049', 0)).not.toBeNull()
  })

  it('forgets all keys after _reiniciarLimitadoresParaTests', () => {
    const limitador = crearLimitador({ ventanaMs: 60_000, max: 1 })
    expect(limitador.consumir('r', 0)).toBeNull()
    expect(limitador.consumir('r', 0)).not.toBeNull()
    _reiniciarLimitadoresParaTests()
    expect(limitador.consumir('r', 0)).toBeNull()
  })
})
