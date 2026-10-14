import { describe, expect, it, vi } from 'vitest'
import { ErrorOgimet, descargarSynopOgimet, URL_OGIMET_SYNOP } from './ogimet-cliente'

const DESDE = new Date('2026-10-12T06:00:00.000Z')
const HASTA = new Date('2026-10-13T12:00:00.000Z')

const textoOk = '87166,2026,10,13,00,00,AAXX 13003 87166 11360 81408 10147 20136 30028 40102 53003 69911 72052 886// 333 10166 20147 56399 88708=\n'

function respuesta(cuerpo: string, status = 200): Response {
  return new Response(cuerpo, { status, headers: { 'content-type': 'text/plain' } })
}

describe('descargarSynopOgimet', () => {
  it('pide el bloque con begin/end en UTC y devuelve el texto', async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => respuesta(textoOk))

    const texto = await descargarSynopOgimet({ wmo: '87166', desde: DESDE, hasta: HASTA, fetchImpl })

    expect(texto).toBe(textoOk)
    const url = String(fetchImpl.mock.calls[0]?.[0])
    expect(url.startsWith(URL_OGIMET_SYNOP)).toBe(true)
    const params = new URL(url).searchParams
    expect(params.get('block')).toBe('87166')
    expect(params.get('begin')).toBe('202610120600')
    expect(params.get('end')).toBe('202610131200')
  })

  it('envía User-Agent identificado y un signal de abort', async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => respuesta(textoOk))

    await descargarSynopOgimet({ wmo: '87166', desde: DESDE, hasta: HASTA, fetchImpl })

    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit
    expect((init.headers as Record<string, string>)['User-Agent']).toBe(
      'data-hub-dashboard/1.0 (+riesgo escuelas Corrientes)',
    )
    expect(init.signal).toBeDefined()
  })

  it('HTTP 429 lanza ErrorOgimet distinguible por status', async () => {
    const fetchImpl = vi.fn(async () => respuesta('demasiadas consultas', 429))

    const error = await descargarSynopOgimet({ wmo: '87166', desde: DESDE, hasta: HASTA, fetchImpl }).catch(
      (e: unknown) => e,
    )

    expect(error).toBeInstanceOf(ErrorOgimet)
    expect((error as ErrorOgimet).status).toBe(429)
    expect((error as ErrorOgimet).message).not.toContain('demasiadas')
  })

  it('otro HTTP no 2xx lanza ErrorOgimet con su status', async () => {
    const fetchImpl = vi.fn(async () => respuesta('error', 503))

    await expect(
      descargarSynopOgimet({ wmo: '87166', desde: DESDE, hasta: HASTA, fetchImpl }),
    ).rejects.toMatchObject({ name: 'ErrorOgimet', status: 503 })
  })

  it('un 200 con cuerpo "#Sorry" (cupo) se trata como error', async () => {
    const fetchImpl = vi.fn(async () => respuesta('#Sorry, quota exceeded'))

    await expect(
      descargarSynopOgimet({ wmo: '87166', desde: DESDE, hasta: HASTA, fetchImpl }),
    ).rejects.toBeInstanceOf(ErrorOgimet)
  })

  it('un 200 con "Status: 500" y sin AAXX se trata como error', async () => {
    const fetchImpl = vi.fn(async () => respuesta('Status: 500 Internal error'))

    await expect(
      descargarSynopOgimet({ wmo: '87166', desde: DESDE, hasta: HASTA, fetchImpl }),
    ).rejects.toBeInstanceOf(ErrorOgimet)
  })

  it('un cuerpo vacío sin AAXX se devuelve tal cual (estación sin datos en el período)', async () => {
    const fetchImpl = vi.fn(async () => respuesta(''))

    await expect(
      descargarSynopOgimet({ wmo: '87166', desde: DESDE, hasta: HASTA, fetchImpl }),
    ).resolves.toBe('')
  })

  it('un timeout aborta la petición y lanza ErrorOgimet', async () => {
    const fetchImpl = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
        }),
    )

    await expect(
      descargarSynopOgimet({ wmo: '87166', desde: DESDE, hasta: HASTA, fetchImpl, timeoutMs: 20 }),
    ).rejects.toBeInstanceOf(ErrorOgimet)
  })
})
