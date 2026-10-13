import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  clasificarErrorPrefectura,
  descargarAlturasPrefectura,
  URL_ALTURAS_PREFECTURA,
  USER_AGENT_PREFECTURA,
} from './prefectura-cliente'

const fixture = readFileSync(
  new URL('./__fixtures__/prefectura-index.html', import.meta.url),
  'utf8',
)

function respuestaHtml(cuerpo: string, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(cuerpo, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', ...headers },
  })
}

function fetchSecuencia(respuestas: Array<Response | Error>) {
  const llamadas: Array<{ url: string; init?: RequestInit }> = []
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    llamadas.push({ url: String(url), init })
    const siguiente = respuestas[llamadas.length - 1]
    if (siguiente === undefined) throw new Error('fetch inesperado')
    if (siguiente instanceof Error) throw siguiente
    return siguiente
  }) as typeof fetch
  return { fetchImpl, llamadas }
}

const sinEsperar = async () => {}

describe('descargarAlturasPrefectura', () => {
  it('descarga el fixture y devuelve las filas parseadas', async () => {
    const { fetchImpl, llamadas } = fetchSecuencia([respuestaHtml(fixture)])

    const filas = await descargarAlturasPrefectura({ fetchImpl, esperar: sinEsperar })

    expect(filas.length).toBeGreaterThan(0)
    expect(llamadas).toHaveLength(1)
    expect(llamadas[0]?.url).toBe(URL_ALTURAS_PREFECTURA)
  })

  it('envía un User-Agent identificado sin email personal y Accept text/html', async () => {
    const { fetchImpl, llamadas } = fetchSecuencia([respuestaHtml(fixture)])

    await descargarAlturasPrefectura({ fetchImpl, esperar: sinEsperar })

    const headers = new Headers(llamadas[0]?.init?.headers)
    expect(headers.get('user-agent')).toBe(USER_AGENT_PREFECTURA)
    expect(headers.get('accept')).toBe('text/html')
    expect(USER_AGENT_PREFECTURA).not.toMatch(/@/)
  })

  it('reintenta tras un 503 y tiene éxito en el segundo intento', async () => {
    const { fetchImpl, llamadas } = fetchSecuencia([
      new Response('', { status: 503 }),
      respuestaHtml(fixture),
    ])

    const filas = await descargarAlturasPrefectura({ fetchImpl, esperar: sinEsperar })

    expect(filas.length).toBeGreaterThan(0)
    expect(llamadas).toHaveLength(2)
  })

  it('tras 3 respuestas 429 lanza un error clasificado como degradado', async () => {
    const { fetchImpl, llamadas } = fetchSecuencia([
      new Response('', { status: 429 }),
      new Response('', { status: 429 }),
      new Response('', { status: 429 }),
    ])

    const error = await descargarAlturasPrefectura({ fetchImpl, esperar: sinEsperar }).catch(
      (e: unknown) => e,
    )

    expect(llamadas).toHaveLength(3)
    expect(clasificarErrorPrefectura(error)).toBe('degradado')
  })

  it('respeta Retry-After del 429 con espera acotada', async () => {
    const esperas: number[] = []
    const { fetchImpl } = fetchSecuencia([
      new Response('', { status: 429, headers: { 'retry-after': '3600' } }),
      respuestaHtml(fixture),
    ])

    await descargarAlturasPrefectura({
      fetchImpl,
      esperar: async (ms) => {
        esperas.push(ms)
      },
    })

    expect(esperas).toHaveLength(1)
    expect(esperas[0]).toBeLessThanOrEqual(30_000)
  })

  it('HTML sin la tabla fpTable se clasifica como no_disponible', async () => {
    const { fetchImpl } = fetchSecuencia([respuestaHtml('<html><body>Sin tabla</body></html>')])

    const error = await descargarAlturasPrefectura({ fetchImpl, esperar: sinEsperar }).catch(
      (e: unknown) => e,
    )

    expect(clasificarErrorPrefectura(error)).toBe('no_disponible')
  })

  it('respuesta que no es HTML (bloqueo) se clasifica como no_disponible', async () => {
    const { fetchImpl } = fetchSecuencia([
      new Response('{"error":"blocked"}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ])

    const error = await descargarAlturasPrefectura({ fetchImpl, esperar: sinEsperar }).catch(
      (e: unknown) => e,
    )

    expect(clasificarErrorPrefectura(error)).toBe('no_disponible')
  })

  it('los errores no incluyen el cuerpo de la respuesta', async () => {
    const marcadorCuerpo = 'marcador-del-cuerpo-de-respuesta'
    const { fetchImpl } = fetchSecuencia([respuestaHtml(`<html>${marcadorCuerpo}</html>`)])

    const error = await descargarAlturasPrefectura({ fetchImpl, esperar: sinEsperar }).catch(
      (e: unknown) => e,
    )

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).not.toContain(marcadorCuerpo)
  })

  it('timeout en todos los intentos se clasifica como degradado', async () => {
    let llamadas = 0
    const fetchImpl = ((_url: string | URL | Request, init?: RequestInit) => {
      llamadas++
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      })
    }) as typeof fetch

    const error = await descargarAlturasPrefectura({
      fetchImpl,
      esperar: sinEsperar,
      timeoutMs: 5,
    }).catch((e: unknown) => e)

    expect(llamadas).toBe(3)
    expect(clasificarErrorPrefectura(error)).toBe('degradado')
  })
})

describe('clasificarErrorPrefectura', () => {
  it('clasifica un error desconocido como no_disponible', () => {
    expect(clasificarErrorPrefectura(new Error('algo'))).toBe('no_disponible')
  })
})
