import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

import {
  ANA_BASE_URL,
  descargarDadosAna,
  ErrorRedAna,
  HttpAnaError,
  parsearDadosAna,
  parsearInventarioAna,
  RespuestaAnaInvalidaError,
} from './cliente-ana'

const fixture = (nombre: string) =>
  readFileSync(new URL(`../__fixtures__/ana/${nombre}`, import.meta.url), 'utf8')

const dadosFixture = () => fixture('dados-14990000-2026-11-12_13.xml')

function xmlFila(dataHora: string, nivel: string): string {
  return `<DataTable xmlns="http://MRCS/"><DocumentElement xmlns=""><DadosHidrometereologicos><CodEstacao>14990000</CodEstacao><DataHora>${dataHora}</DataHora><Vazao /><Nivel>${nivel}</Nivel><Chuva>0.00</Chuva></DadosHidrometereologicos></DocumentElement></DataTable>`
}

function fetchQue(resultado: () => Promise<Response>) {
  const spy = vi.fn((_entrada: RequestInfo | URL) => resultado())
  return { spy, fetchImpl: spy as unknown as typeof fetch }
}

const xmlRespuesta = (cuerpo: string, status = 200) =>
  new Response(cuerpo, { status, headers: { 'content-type': 'text/xml; charset=utf-8' } })

describe('parsearDadosAna', () => {
  it('devuelve las 24 filas de la fixture ordenadas de forma ascendente', () => {
    const lecturas = parsearDadosAna(dadosFixture())

    expect(lecturas).toHaveLength(24)
    expect(lecturas[0].medidaEn).toBe('2026-11-12T22:00:00.000Z')
    expect(lecturas.at(-1)?.medidaEn).toBe('2026-11-13T03:45:00.000Z')
    const instantes = lecturas.map((l) => Date.parse(l.medidaEn))
    expect([...instantes].sort((a, b) => a - b)).toEqual(instantes)
  })

  it('convierte Nivel en centímetros a metros y conserva el código de estación', () => {
    const lecturas = parsearDadosAna(dadosFixture())

    expect(lecturas[0]).toEqual({
      codigoEstacao: '14990000',
      medidaEn: '2026-11-12T22:00:00.000Z',
      lecturaM: 16.29,
      chuvaMm: 0,
    })
    expect(lecturas.at(-1)?.lecturaM).toBe(16.28)
  })

  it('interpreta la hora de Brasília (UTC-3) como UTC', () => {
    const [lectura] = parsearDadosAna(xmlFila('2026-11-13 00:45:00 ', '1628.00'))

    expect(lectura.medidaEn).toBe('2026-11-13T03:45:00.000Z')
  })

  it('deja lecturaM en null cuando Nivel viene vacío', () => {
    const [vacioAbierto] = parsearDadosAna(xmlFila('2026-11-13 00:45:00', ''))
    const [vacioCerrado] = parsearDadosAna(
      xmlFila('2026-11-13 00:30:00', '').replace('<Nivel></Nivel>', '<Nivel />'),
    )

    expect(vacioAbierto.lecturaM).toBeNull()
    expect(vacioCerrado.lecturaM).toBeNull()
  })

  it('descarta filas con DataHora inválida', () => {
    const xml = xmlFila('2026-13-01 00:00:00', '1628.00')
    const lecturas = parsearDadosAna(xml)

    expect(lecturas).toEqual([])
    expect(parsearDadosAna(xmlFila('no es fecha', '1628.00'))).toEqual([])
  })

  it('devuelve lista vacía para un resultado sin filas o "Sem dados"', () => {
    expect(parsearDadosAna('<DataTable xmlns="http://MRCS/"></DataTable>')).toEqual([])
    expect(parsearDadosAna('Sem dados')).toEqual([])
  })

  it('rechaza XML mal formado y HTML con RespuestaAnaInvalidaError', () => {
    expect(() => parsearDadosAna('<DataTable><DadosHidrometereologicos></DataTable>')).toThrow(
      RespuestaAnaInvalidaError,
    )
    expect(() => parsearDadosAna('<!DOCTYPE html><html><body>Error</body></html>')).toThrow(
      RespuestaAnaInvalidaError,
    )
  })
})

describe('parsearInventarioAna', () => {
  it('lee la estación 14990000 del inventario', () => {
    const estaciones = parsearInventarioAna(fixture('inventario-14990000.xml'))

    expect(estaciones).toEqual([
      {
        codigo: '14990000',
        nome: 'MANAUS',
        rio: 'RIO NEGRO',
        lat: -3.1383,
        lon: -60.0272,
        telemetrica: true,
        operando: true,
        responsavel: 'ANA',
        escalaInicio: '1902-09-01 00:00:00',
        telemInicio: '2001-06-01 00:00:00',
        ultimaAtualizacao: '2025-03-24 00:00:00',
      },
    ])
  })

  it('devuelve lista vacía para "Sem dados"', () => {
    expect(parsearInventarioAna('Sem dados')).toEqual([])
  })
})

describe('descargarDadosAna', () => {
  const desde = new Date('2026-11-13T02:30:00Z')
  const hasta = new Date('2026-11-13T12:00:00Z')

  it('pide la URL exacta con fechas en hora de Brasília', async () => {
    const { spy, fetchImpl } = fetchQue(async () => xmlRespuesta(dadosFixture()))

    const lecturas = await descargarDadosAna({ codigoEstacao: '14990000', desde, hasta, fetchImpl })

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0]).toBe(
      `${ANA_BASE_URL}/DadosHidrometeorologicos?codEstacao=14990000&dataInicio=12/11/2026&dataFim=13/11/2026`,
    )
    expect(lecturas).toHaveLength(24)
  })

  it('rechaza un código inválido sin llamar a fetch', async () => {
    for (const codigoEstacao of ['1499', '149900001', 'abc12345']) {
      const { spy, fetchImpl } = fetchQue(async () => xmlRespuesta(dadosFixture()))

      await expect(descargarDadosAna({ codigoEstacao, desde, hasta, fetchImpl })).rejects.toThrow()
      expect(spy).not.toHaveBeenCalled()
    }
  })

  it('convierte HTTP 500 en HttpAnaError con status', async () => {
    const { fetchImpl } = fetchQue(async () => xmlRespuesta('error', 500))

    const error = await descargarDadosAna({ codigoEstacao: '14990000', desde, hasta, fetchImpl }).catch(
      (e: unknown) => e,
    )

    expect(error).toBeInstanceOf(HttpAnaError)
    expect((error as HttpAnaError).status).toBe(500)
  })

  it('rechaza un cuerpo HTML con RespuestaAnaInvalidaError', async () => {
    const { fetchImpl } = fetchQue(
      async () =>
        new Response('<html><body>Acceso denegado</body></html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
    )

    await expect(
      descargarDadosAna({ codigoEstacao: '14990000', desde, hasta, fetchImpl }),
    ).rejects.toBeInstanceOf(RespuestaAnaInvalidaError)
  })

  it('rechaza un cuerpo mayor de 5_000_000 caracteres con RespuestaAnaInvalidaError', async () => {
    const { fetchImpl } = fetchQue(async () => xmlRespuesta(`<x>${'a'.repeat(5_000_001)}</x>`))

    await expect(
      descargarDadosAna({ codigoEstacao: '14990000', desde, hasta, fetchImpl }),
    ).rejects.toBeInstanceOf(RespuestaAnaInvalidaError)
  })

  it('convierte un fallo de red en ErrorRedAna', async () => {
    const { fetchImpl } = fetchQue(async () => {
      throw new TypeError('fetch failed')
    })

    await expect(
      descargarDadosAna({ codigoEstacao: '14990000', desde, hasta, fetchImpl }),
    ).rejects.toBeInstanceOf(ErrorRedAna)
  })
})
