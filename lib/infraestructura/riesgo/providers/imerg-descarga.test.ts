import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FS, File, ready } from 'h5wasm/node'
import { describe, expect, it, vi } from 'vitest'
import { obtenerParseadoImerg } from './imerg-descarga'

// Fixture sintético mínimo: grilla completa 4 lon x 6 lat, subset lon 0..1 y lat 1..3.
const LAT_COMPLETA = [-30.25, -30.5, -30.75, -31, -31.25, -31.5]
const LON_COMPLETA = [-60, -60.25, -60.5, -60.75]
const INDICES = { lonIndiceInicio: 0, lonIndiceFin: 1, latIndiceInicio: 1, latIndiceFin: 3 }
const URL_GRANULO = 'https://data.gesdisc.earthdata.nasa.gov/data/GPM_L3/x.HDF5'
const HEADERS = { Authorization: 'Bearer token-falso' }

const precipitacion = (lonIdx: number, latIdx: number): number => lonIdx * 10 + latIdx + 0.5

async function construirHdf5Sintetico(): Promise<ArrayBuffer> {
  await ready
  const fs = FS as NonNullable<typeof FS>
  const directorio = mkdtempSync(join(tmpdir(), 'imerg-descarga-test-'))
  const ruta = join(directorio, 'sintetico.h5')
  const archivo = new File(ruta, 'w')
  const grid = archivo.create_group('Grid')
  grid.create_dataset({ name: 'lat', data: new Float32Array(LAT_COMPLETA), shape: [LAT_COMPLETA.length] })
  grid.create_dataset({ name: 'lon', data: new Float32Array(LON_COMPLETA), shape: [LON_COMPLETA.length] })
  const precip = new Float32Array(LON_COMPLETA.length * LAT_COMPLETA.length)
  const calidad = new Float32Array(LON_COMPLETA.length * LAT_COMPLETA.length)
  for (let lonIdx = 0; lonIdx < LON_COMPLETA.length; lonIdx++) {
    for (let latIdx = 0; latIdx < LAT_COMPLETA.length; latIdx++) {
      const pos = lonIdx * LAT_COMPLETA.length + latIdx
      precip[pos] = precipitacion(lonIdx, latIdx)
      calidad[pos] = lonIdx + latIdx
    }
  }
  const shape = [1, LON_COMPLETA.length, LAT_COMPLETA.length]
  grid.create_dataset({ name: 'precipitation', data: precip, shape })
  grid.create_dataset({ name: 'precipitationQualityIndex', data: calidad, shape })
  archivo.close()
  const bytes = fs.readFile(ruta) as Uint8Array
  rmSync(directorio, { recursive: true, force: true })
  return bytes.slice().buffer as ArrayBuffer
}

// Mismo subset que devolvería OPeNDAP ASCII para INDICES.
const ASCII_OPENDAP = [
  'Dataset: imerg-sintetico',
  'lat,-30.5,-30.75,-31',
  'lon,-60,-60.25',
  'precipitation[0][0],10.5,11.5,12.5',
  'precipitation[0][1],20.5,21.5,22.5',
  'precipitationQualityIndex[0][0],1,2,3',
  'precipitationQualityIndex[0][1],2,3,4',
].join('\n')

const esSubset = (url: string | URL | Request): boolean => String(url).includes('.ascii?')

function respuestaVacia(status: number): Response {
  return new Response('', { status })
}

describe('obtenerParseadoImerg', () => {
  it('usa OPeNDAP ASCII cuando el subset responde 200', async () => {
    const fetchImpl = vi.fn(async () => new Response(ASCII_OPENDAP, { status: 200 }))

    const resultado = await obtenerParseadoImerg({
      urlDatosGranulo: URL_GRANULO,
      indices: INDICES,
      fetchImpl,
      headers: HEADERS,
    })

    expect(resultado.via).toBe('opendap')
    expect(resultado.parseado.lat).toEqual([-30.5, -30.75, -31])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('cae a HDF5 cuando el subset responde 503', async () => {
    const buffer = await construirHdf5Sintetico()
    const fetchImpl = vi.fn(async (url: string | URL | Request, _init?: RequestInit) =>
      esSubset(url) ? respuestaVacia(503) : new Response(buffer, { status: 200 }),
    )

    const resultado = await obtenerParseadoImerg({
      urlDatosGranulo: URL_GRANULO,
      indices: INDICES,
      fetchImpl,
      headers: HEADERS,
    })

    expect(resultado.via).toBe('hdf5')
    expect(resultado.parseado.lat).toEqual([-30.5, -30.75, -31])
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(fetchImpl.mock.calls[1]?.[0]).toBe(URL_GRANULO)
    expect(fetchImpl.mock.calls[1]?.[1]).toMatchObject({ headers: HEADERS })
  })

  it('cae a HDF5 cuando el fetch del subset lanza (red o timeout)', async () => {
    const buffer = await construirHdf5Sintetico()
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      if (esSubset(url)) throw new TypeError('fetch failed')
      return new Response(buffer, { status: 200 })
    })

    const resultado = await obtenerParseadoImerg({
      urlDatosGranulo: URL_GRANULO,
      indices: INDICES,
      fetchImpl,
      headers: HEADERS,
    })

    expect(resultado.via).toBe('hdf5')
  })

  it('un 404 de OPeNDAP lanza sin intentar el fallback', async () => {
    const fetchImpl = vi.fn(async () => respuestaVacia(404))

    await expect(
      obtenerParseadoImerg({ urlDatosGranulo: URL_GRANULO, indices: INDICES, fetchImpl, headers: HEADERS }),
    ).rejects.toThrow('subset HTTP 404')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('si subset y HDF5 fallan, el error conserva "subset HTTP 503"', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) =>
      esSubset(url) ? respuestaVacia(503) : respuestaVacia(500),
    )

    await expect(
      obtenerParseadoImerg({ urlDatosGranulo: URL_GRANULO, indices: INDICES, fetchImpl, headers: HEADERS }),
    ).rejects.toThrow('subset HTTP 503; hdf5 HTTP 500')
  })
})
