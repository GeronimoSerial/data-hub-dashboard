import { describe, expect, it, vi } from 'vitest'
import { ejecutarConReintentos } from './cliente-http'
import type { ControladorCupoOM, ResultadoReservaCupo } from './cupo-om'

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

// OM-cupo: integración con la guarda de cupo vía un `ControladorCupoOM` fake
// (sin DB real — el contrato de la guarda en sí se prueba en
// cupo-om.test.ts). Acá sólo se verifica que cliente-http la consulte en el
// momento correcto y nunca toque la red cuando la guarda bloquea.
function controladorCupoFake(resultadoReserva: ResultadoReservaCupo) {
  const registrar429 = vi.fn(async () => {})
  const reservar = vi.fn(async () => resultadoReserva)
  const cupo: ControladorCupoOM = { reservar, registrar429 }
  return { cupo, reservar, registrar429 }
}

describe('ejecutarConReintentos — integración con OM-cupo', () => {
  it('sin `cupo`, no cambia nada respecto del comportamiento previo (no reserva ni registra)', async () => {
    const fetchImpl = vi.fn(async () => respuestaOk({ valor: 1 }))
    const r = await ejecutarConReintentos({
      url: 'https://example.test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      parsearPayload: (json) => (json as { valor: number }).valor,
    })
    expect(r).toEqual({ ok: true, datos: 1 })
  })

  it('cupo agotado (hora/dia/mes) corta ANTES de tocar la red: fetch nunca se llama', async () => {
    const { cupo, reservar } = controladorCupoFake({
      ok: false,
      motivo: 'cupo_agotado',
      ventana: 'dia',
      detalle: 'cupo agotado en ventana "dia" para host "api"',
    })
    const fetchImpl = vi.fn(async () => respuestaOk({ valor: 1 }))
    const r = await ejecutarConReintentos({
      url: 'https://example.test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      cupo,
      parsearPayload: (json) => (json as { valor: number }).valor,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toBe('cupo_agotado')
    expect(reservar).toHaveBeenCalledTimes(1)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('host en cooldown corta ANTES de tocar la red', async () => {
    const { cupo } = controladorCupoFake({
      ok: false,
      motivo: 'host_en_cooldown',
      hastaEn: '2026-01-01T00:01:00.000Z',
      detalle: 'host en cooldown',
    })
    const fetchImpl = vi.fn(async () => respuestaOk({ valor: 1 }))
    const r = await ejecutarConReintentos({
      url: 'https://example.test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      cupo,
      parsearPayload: (json) => (json as { valor: number }).valor,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toBe('host_en_cooldown')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('reserva ok deja pasar la request normalmente', async () => {
    const { cupo } = controladorCupoFake({ ok: true, esperoMs: 0 })
    const fetchImpl = vi.fn(async () => respuestaOk({ valor: 7 }))
    const r = await ejecutarConReintentos({
      url: 'https://example.test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      cupo,
      parsearPayload: (json) => (json as { valor: number }).valor,
    })
    expect(r).toEqual({ ok: true, datos: 7 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('429 con Retry-After registra el cooldown del host vía el controlador', async () => {
    const { cupo, registrar429 } = controladorCupoFake({ ok: true, esperoMs: 0 })
    const fetchImpl = vi.fn(
      async () => new Response('rate limited', { status: 429, headers: { 'retry-after': '30' } }),
    )
    const r = await ejecutarConReintentos({
      url: 'https://example.test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      cupo,
      maxIntentos: 1,
      parsearPayload: (json) => json,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toBe('rate_limited')
    expect(registrar429).toHaveBeenCalledTimes(1)
    expect(registrar429).toHaveBeenCalledWith(30_000)
  })

  it('429 SIN Retry-After no registra cooldown (no sabemos cuánto durar)', async () => {
    const { cupo, registrar429 } = controladorCupoFake({ ok: true, esperoMs: 0 })
    const fetchImpl = vi.fn(async () => new Response('rate limited', { status: 429 }))
    await ejecutarConReintentos({
      url: 'https://example.test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      cupo,
      maxIntentos: 1,
      backoffBaseMs: 1,
      backoffMaxMs: 1,
      parsearPayload: (json) => json,
    })
    expect(registrar429).not.toHaveBeenCalled()
  })
})
