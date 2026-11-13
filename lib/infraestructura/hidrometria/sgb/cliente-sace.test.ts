import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

import {
  descargarCotasSace,
  ErrorRedSace,
  HttpSaceError,
  parsearCsvSace,
  RespuestaSaceInvalidaError,
  SACE_ESTACION_ID,
  SACE_URL_MANAUS,
} from './cliente-sace'

const fixture = readFileSync(
  new URL('../__fixtures__/sgb/sace-manaos-cota-2026-11-12_13.csv', import.meta.url),
  'utf8',
)

const CABECERA = 'data_hora_medicao;indice'

function respuestaCsv(cuerpo: string, status = 200): Response {
  return new Response(cuerpo, {
    status,
    headers: { 'content-type': 'text/csv; charset=utf-8' },
  })
}

function fetchFijo(respuesta: Response | Error) {
  const llamadas: Array<{ url: string; init?: RequestInit }> = []
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    llamadas.push({ url: String(url), init })
    if (respuesta instanceof Error) throw respuesta
    return respuesta.clone()
  }) as typeof fetch
  return { fetchImpl, llamadas }
}

describe('parsearCsvSace', () => {
  it('parsea el fixture real: 60 filas, UTC con offset -2 y cm a m', () => {
    const { lecturas, descartadas } = parsearCsvSace(fixture)

    expect(lecturas).toHaveLength(60)
    expect(descartadas).toBe(0)
    expect(lecturas[0]).toEqual({
      estacionId: SACE_ESTACION_ID,
      medidaEn: '2026-11-12T12:00:00.000Z',
      lecturaM: 16.29,
    })
    expect(lecturas[59]).toEqual({
      estacionId: SACE_ESTACION_ID,
      medidaEn: '2026-11-13T03:45:00.000Z',
      lecturaM: 16.28,
    })
  })

  it('cuenta como descartadas las líneas malas y conserva las válidas', () => {
    const csv = [
      CABECERA,
      '2026-11-12 10:00:00;1629.00',
      '2026-11-12 10:15:00;1629',
      'linea sin separador',
      '2026-11-12 10:30:00;NaN',
      '2026-13-12 10:45:00;1629.00',
      '2026-11-12 10:45:00;1629.00;extra',
      '2026-11-12 11:00:00;',
      '   ',
      '2026-11-12 11:15:00;1630.00',
    ].join('\n')

    const { lecturas, descartadas } = parsearCsvSace(csv)

    expect(descartadas).toBe(5)
    expect(lecturas.map((l) => l.medidaEn)).toEqual([
      '2026-11-12T12:00:00.000Z',
      '2026-11-12T12:15:00.000Z',
      '2026-11-12T13:15:00.000Z',
    ])
    expect(lecturas.map((l) => l.lecturaM)).toEqual([16.29, 16.29, 16.3])
  })

  it('acepta CRLF con el mismo resultado que LF', () => {
    const crlf = fixture.replace(/\n/g, '\r\n')

    const resultado = parsearCsvSace(crlf)

    expect(resultado).toEqual(parsearCsvSace(fixture))
    expect(resultado.lecturas).toHaveLength(60)
    expect(resultado.descartadas).toBe(0)
  })

  it('ordena ascendente aunque el CSV llegue descendente', () => {
    const csv = [CABECERA, '2026-11-12 11:00:00;1630.00', '2026-11-12 10:00:00;1629.00'].join('\n')

    const { lecturas } = parsearCsvSace(csv)

    expect(lecturas.map((l) => l.medidaEn)).toEqual([
      '2026-11-12T12:00:00.000Z',
      '2026-11-12T13:00:00.000Z',
    ])
  })

  it('ignora las líneas en blanco finales sin contarlas como descartadas', () => {
    const { lecturas, descartadas } = parsearCsvSace(`${CABECERA}\n2026-11-12 10:00:00;1629.00\n\n\n`)

    expect(lecturas).toHaveLength(1)
    expect(descartadas).toBe(0)
  })

  it('lanza RespuestaSaceInvalidaError si falta la cabecera', () => {
    expect(() => parsearCsvSace('2026-11-12 10:00:00;1629.00\n')).toThrow(RespuestaSaceInvalidaError)
  })

  it('lanza RespuestaSaceInvalidaError con cuerpo vacío', () => {
    expect(() => parsearCsvSace('')).toThrow(RespuestaSaceInvalidaError)
  })
})

describe('descargarCotasSace', () => {
  it('pide la URL exacta de Manaus', async () => {
    expect(SACE_URL_MANAUS).toBe('https://sace.sgb.gov.br/niveis/api/dados/amazonas_8_cota.csv')
    const { fetchImpl, llamadas } = fetchFijo(respuestaCsv(fixture))

    await descargarCotasSace({ fetchImpl })

    expect(llamadas).toHaveLength(1)
    expect(llamadas[0]?.url).toBe('https://sace.sgb.gov.br/niveis/api/dados/amazonas_8_cota.csv')
  })

  it('devuelve las lecturas del CSV descargado', async () => {
    const { fetchImpl } = fetchFijo(respuestaCsv(fixture))

    const { lecturas, descartadas } = await descargarCotasSace({ fetchImpl })

    expect(lecturas).toHaveLength(60)
    expect(lecturas[0]?.lecturaM).toBe(16.29)
    expect(descartadas).toBe(0)
  })

  it('HTTP 503 lanza HttpSaceError con status', async () => {
    const { fetchImpl } = fetchFijo(respuestaCsv('servicio no disponible', 503))

    const error = await descargarCotasSace({ fetchImpl }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(HttpSaceError)
    expect((error as HttpSaceError).status).toBe(503)
  })

  it('un rechazo de fetch lanza ErrorRedSace', async () => {
    const { fetchImpl } = fetchFijo(new TypeError('fetch failed'))

    await expect(descargarCotasSace({ fetchImpl })).rejects.toBeInstanceOf(ErrorRedSace)
  })

  it('timeout por defecto de 20000 ms lanza ErrorRedSace', async () => {
    vi.useFakeTimers()
    try {
      const fetchImpl = (() => new Promise<Response>(() => {})) as typeof fetch
      let asentada = false
      const pendiente = descargarCotasSace({ fetchImpl })
      pendiente.then(
        () => {
          asentada = true
        },
        () => {
          asentada = true
        },
      )

      await vi.advanceTimersByTimeAsync(19_999)
      expect(asentada).toBe(false)

      const assertion = expect(pendiente).rejects.toBeInstanceOf(ErrorRedSace)
      await vi.advanceTimersByTimeAsync(1)
      await assertion
    } finally {
      vi.useRealTimers()
    }
  })

  it('un cuerpo HTML lanza RespuestaSaceInvalidaError', async () => {
    const html = '<!DOCTYPE html><html><body>Página de error</body></html>'
    const { fetchImpl } = fetchFijo(respuestaCsv(html))

    await expect(descargarCotasSace({ fetchImpl })).rejects.toBeInstanceOf(RespuestaSaceInvalidaError)
  })

  it('un cuerpo de más de 5_000_000 caracteres lanza RespuestaSaceInvalidaError', async () => {
    const cuerpo = `${CABECERA}\n${'2026-11-12 10:00:00;1629.00\n'.repeat(200_000)}`
    expect(cuerpo.length).toBeGreaterThan(5_000_000)
    const { fetchImpl } = fetchFijo(respuestaCsv(cuerpo))

    await expect(descargarCotasSace({ fetchImpl })).rejects.toBeInstanceOf(RespuestaSaceInvalidaError)
  })
})
