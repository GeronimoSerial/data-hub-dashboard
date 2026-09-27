import { afterEach, describe, expect, it, vi } from 'vitest'
import { generarConOpenRouter } from './proveedor-openrouter'
import type { MensajeChat } from './proveedor-openrouter'

const MENSAJES: MensajeChat[] = [{ role: 'user', content: 'Resumí el corte.' }]

function respuestaJson(cuerpo: unknown, estado = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('generarConOpenRouter', () => {
  it('sin apiKey devuelve sin_api_key y no llama a fetch', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '')
    const fetchEspia = vi.fn<typeof fetch>()

    const resultado = await generarConOpenRouter(MENSAJES, { fetchImpl: fetchEspia })

    expect(resultado.motivoFallo).toBe('sin_api_key')
    expect(resultado.ok).toBe(false)
    expect(resultado.contenido).toBeNull()
    expect(resultado.costoUsd).toBeNull()
    expect(resultado.latenciaMs).toBe(0)
    expect(fetchEspia).not.toHaveBeenCalled()
  })

  it('respuesta 2xx con usage.cost usa el costo expuesto por OpenRouter', async () => {
    const fetchEspia = vi.fn<typeof fetch>().mockResolvedValue(
      respuestaJson({
        choices: [{ message: { content: '{"frases":[]}' } }],
        usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0.00042 },
      }),
    )

    const resultado = await generarConOpenRouter(MENSAJES, {
      apiKey: 'clave',
      fetchImpl: fetchEspia,
    })

    expect(resultado.ok).toBe(true)
    expect(resultado.contenido).toBe('{"frases":[]}')
    expect(resultado.tokensEntrada).toBe(100)
    expect(resultado.tokensSalida).toBe(20)
    expect(resultado.costoUsd).toBe(0.00042)
    expect(resultado.motivoFallo).toBeNull()

    const [url, init] = fetchEspia.mock.calls[0] ?? []
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions')
    expect(init?.method).toBe('POST')
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer clave')
    const cuerpo = JSON.parse(String(init?.body)) as Record<string, unknown>
    expect(cuerpo).toMatchObject({
      model: 'deepseek/deepseek-v4.1-flash',
      messages: MENSAJES,
      usage: { include: true },
    })
  })

  it('respuesta 2xx sin usage.cost calcula el costo con la tarifa fija', async () => {
    const fetchEspia = vi.fn<typeof fetch>().mockResolvedValue(
      respuestaJson({
        choices: [{ message: { content: 'texto' } }],
        usage: { prompt_tokens: 1_000_000, completion_tokens: 1_000_000 },
      }),
    )

    const resultado = await generarConOpenRouter(MENSAJES, {
      apiKey: 'clave',
      fetchImpl: fetchEspia,
    })

    expect(resultado.ok).toBe(true)
    expect(resultado.costoUsd).toBeCloseTo(0.035 + 0.29, 10)
  })

  it('respuesta 2xx sin campo usage estima tokens del texto y no deja el costo en null', async () => {
    const fetchEspia = vi.fn<typeof fetch>().mockResolvedValue(
      respuestaJson({
        choices: [{ message: { content: '{"frases":[]}' } }],
      }),
    )

    const resultado = await generarConOpenRouter(MENSAJES, {
      apiKey: 'clave',
      fetchImpl: fetchEspia,
    })

    expect(resultado.ok).toBe(true)
    expect(resultado.costoUsd).not.toBeNull()
    expect(resultado.costoUsd).toBeGreaterThan(0)
    expect(resultado.tokensEntrada).not.toBeNull()
    expect(resultado.tokensSalida).not.toBeNull()
  })

  it('respuesta 2xx con usage vacío estima tokens del texto y no deja el costo en null', async () => {
    const fetchEspia = vi.fn<typeof fetch>().mockResolvedValue(
      respuestaJson({
        choices: [{ message: { content: '{"frases":[]}' } }],
        usage: {},
      }),
    )

    const resultado = await generarConOpenRouter(MENSAJES, {
      apiKey: 'clave',
      fetchImpl: fetchEspia,
    })

    expect(resultado.ok).toBe(true)
    expect(resultado.costoUsd).not.toBeNull()
    expect(resultado.costoUsd).toBeGreaterThan(0)
    expect(resultado.tokensEntrada).not.toBeNull()
    expect(resultado.tokensSalida).not.toBeNull()
  })

  it('respuesta 429 devuelve http_error', async () => {
    const fetchEspia = vi
      .fn<typeof fetch>()
      .mockResolvedValue(respuestaJson({ error: { message: 'rate limited' } }, 429))

    const resultado = await generarConOpenRouter(MENSAJES, {
      apiKey: 'clave',
      fetchImpl: fetchEspia,
    })

    expect(resultado.ok).toBe(false)
    expect(resultado.motivoFallo).toBe('http_error')
    expect(resultado.contenido).toBeNull()
  })

  it('respuesta 500 devuelve http_error', async () => {
    const fetchEspia = vi
      .fn<typeof fetch>()
      .mockResolvedValue(respuestaJson({ error: 'boom' }, 500))

    const resultado = await generarConOpenRouter(MENSAJES, {
      apiKey: 'clave',
      fetchImpl: fetchEspia,
    })

    expect(resultado.ok).toBe(false)
    expect(resultado.motivoFallo).toBe('http_error')
  })

  it('timeout aborta el fetch y devuelve motivoFallo timeout', async () => {
    const fetchLento: typeof fetch = (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Abortado por timeout', 'AbortError'))
        })
      })

    const resultado = await generarConOpenRouter(MENSAJES, {
      apiKey: 'clave',
      timeoutMs: 20,
      fetchImpl: fetchLento,
    })

    expect(resultado.ok).toBe(false)
    expect(resultado.motivoFallo).toBe('timeout')
    expect(resultado.contenido).toBeNull()
    expect(resultado.latenciaMs).toBeGreaterThanOrEqual(0)
  })

  it('respuesta 2xx sin choices devuelve http_error', async () => {
    const fetchEspia = vi
      .fn<typeof fetch>()
      .mockResolvedValue(respuestaJson({ usage: { prompt_tokens: 1 } }))

    const resultado = await generarConOpenRouter(MENSAJES, {
      apiKey: 'clave',
      fetchImpl: fetchEspia,
    })

    expect(resultado.ok).toBe(false)
    expect(resultado.motivoFallo).toBe('http_error')
    expect(resultado.contenido).toBeNull()
  })

  it('una excepción de red no abortada devuelve http_error', async () => {
    const fetchEspia = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('sin red'))

    const resultado = await generarConOpenRouter(MENSAJES, {
      apiKey: 'clave',
      fetchImpl: fetchEspia,
    })

    expect(resultado.ok).toBe(false)
    expect(resultado.motivoFallo).toBe('http_error')
  })
})
