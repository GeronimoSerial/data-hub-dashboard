import { describe, expect, it, vi } from 'vitest'
import { ejecutarConReintentos } from './cliente-http'

function respuestaOk(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200 })
}

describe('ejecutarConReintentos', () => {
  it('devuelve ok:true cuando la respuesta es 200 y el payload es válido', async () => {
    const fetchImpl = vi.fn(async () => respuestaOk({ valor: 42 }))
    const r = await ejecutarConReintentos({
      url: 'https://example.test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      parsearPayload: (json) => (json as { valor: number }).valor,
    })
    expect(r).toEqual({ ok: true, datos: 42 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('cuarentena: payload que no cumple el contrato no reintenta y devuelve payload_invalido', async () => {
    const fetchImpl = vi.fn(async () => respuestaOk({ inesperado: true }))
    const r = await ejecutarConReintentos({
      url: 'https://example.test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      parsearPayload: () => {
        throw new Error('falta el campo esperado')
      },
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toBe('payload_invalido')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('JSON no parseable es payload_invalido sin reintentar', async () => {
    const fetchImpl = vi.fn(async () => new Response('esto no es json', { status: 200 }))
    const r = await ejecutarConReintentos({
      url: 'https://example.test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      parsearPayload: (json) => json,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toBe('payload_invalido')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('429 reintenta con backoff acotado y eventualmente tiene éxito', async () => {
    let llamada = 0
    const fetchImpl = vi.fn(async () => {
      llamada++
      if (llamada < 2) return new Response('rate limited', { status: 429 })
      return respuestaOk({ valor: 1 })
    })
    const r = await ejecutarConReintentos({
      url: 'https://example.test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      backoffBaseMs: 1,
      backoffMaxMs: 5,
      parsearPayload: (json) => (json as { valor: number }).valor,
    })
    expect(r).toEqual({ ok: true, datos: 1 })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('429 persistente agota los intentos y devuelve rate_limited', async () => {
    const fetchImpl = vi.fn(async () => new Response('rate limited', { status: 429 }))
    const r = await ejecutarConReintentos({
      url: 'https://example.test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      maxIntentos: 2,
      backoffBaseMs: 1,
      backoffMaxMs: 5,
      parsearPayload: (json) => json,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toBe('rate_limited')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('timeout: fetchImpl que nunca resuelve produce motivo timeout', async () => {
    const fetchImpl = vi.fn(
      () =>
        new Promise<Response>(() => {
          /* nunca resuelve */
        }),
    )
    const r = await ejecutarConReintentos({
      url: 'https://example.test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      timeoutMs: 5,
      maxIntentos: 1,
      parsearPayload: (json) => json,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toBe('timeout')
  })

  it('error http 500 reintenta hasta agotar intentos y devuelve http_error', async () => {
    const fetchImpl = vi.fn(async () => new Response('error', { status: 500 }))
    const r = await ejecutarConReintentos({
      url: 'https://example.test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      maxIntentos: 2,
      backoffBaseMs: 1,
      backoffMaxMs: 5,
      parsearPayload: (json) => json,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toBe('http_error')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})
