import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FS, File, ready } from 'h5wasm/node'
import { describe, expect, it } from 'vitest'
import { mapearAsciiImergACeldas, parsearRespuestaAsciiImerg } from './imerg'
import { parsearHdf5Imerg } from './imerg-hdf5'
import { celdaDeCoordenada } from '../celda'

// Fixture sintético: grilla completa de 4 lon x 6 lat, subset de lon 0..1 y lat 1..3.
const LAT_COMPLETA = [-30.25, -30.5, -30.75, -31, -31.25, -31.5]
const LON_COMPLETA = [-60, -60.25, -60.5, -60.75]
const INDICES = { lonIndiceInicio: 0, lonIndiceFin: 1, latIndiceInicio: 1, latIndiceFin: 3 }
const VALOR_NEGATIVO = -9999

function precipitacionSintetica(lonIdx: number, latIdx: number): number {
  if (lonIdx === 1 && latIdx === 2) return VALOR_NEGATIVO
  return lonIdx * 10 + latIdx + 0.5
}

function calidadSintetica(lonIdx: number, latIdx: number): number {
  return lonIdx + latIdx
}

async function construirHdf5Sintetico(
  precipitacion: (lonIdx: number, latIdx: number) => number = precipitacionSintetica,
): Promise<Uint8Array> {
  await ready
  const fs = FS as NonNullable<typeof FS>
  const directorio = mkdtempSync(join(tmpdir(), 'imerg-hdf5-test-'))
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
      calidad[pos] = calidadSintetica(lonIdx, latIdx)
    }
  }
  const shape = [1, LON_COMPLETA.length, LAT_COMPLETA.length]
  grid.create_dataset({ name: 'precipitation', data: precip, shape })
  grid.create_dataset({ name: 'precipitationQualityIndex', data: calidad, shape })
  archivo.close()

  const bytes = fs.readFile(ruta) as Uint8Array
  rmSync(directorio, { recursive: true, force: true })
  return bytes
}

// Mismo contenido que devolvería OPeNDAP ASCII para el mismo subset.
function asciiEquivalente(): string {
  const lats = [1, 2, 3].map((i) => LAT_COMPLETA[i])
  const lons = [0, 1].map((i) => LON_COMPLETA[i])
  const lineasPrecip = [0, 1].map(
    (lonRel) =>
      `precipitation[0][${lonRel}],${[1, 2, 3].map((latIdx) => precipitacionSintetica(lonRel, latIdx)).join(',')}`,
  )
  const lineasCalidad = [0, 1].map(
    (lonRel) =>
      `precipitationQualityIndex[0][${lonRel}],${[1, 2, 3].map((latIdx) => calidadSintetica(lonRel, latIdx)).join(',')}`,
  )
  return [
    'Dataset: imerg-sintetico',
    `lat,${lats.join(',')}`,
    `lon,${lons.join(',')}`,
    ...lineasPrecip,
    ...lineasCalidad,
  ].join('\n')
}

describe('parsearHdf5Imerg', () => {
  it('produce la misma forma que el parser ASCII OPeNDAP para el mismo subset', async () => {
    const buffer = await construirHdf5Sintetico()

    const desdeHdf5 = await parsearHdf5Imerg(buffer, INDICES)
    const desdeAscii = parsearRespuestaAsciiImerg(asciiEquivalente())

    expect(desdeHdf5).toEqual(desdeAscii)
  })

  it('el resultado alimenta mapearAsciiImergACeldas con valor = tasa * 0.5 y geometryRef correcta', async () => {
    const buffer = await construirHdf5Sintetico()
    const parseado = await parsearHdf5Imerg(buffer, INDICES)

    const puntos = mapearAsciiImergACeldas({
      parseado,
      observadoEn: '2026-09-26T18:30:00Z',
      validoDesde: '2026-09-26T18:00:00Z',
      validoHasta: '2026-09-26T19:00:00Z',
    })

    const esperadoLatLon = { lat: LAT_COMPLETA[3], lon: LON_COMPLETA[1] }
    const punto = puntos.find(
      (p) => p.geometryRef === celdaDeCoordenada(esperadoLatLon.lat, esperadoLatLon.lon),
    )
    expect(punto).toBeDefined()
    // lon indice 1, lat indice 3 (relativa 2): tasa 1*10+3+0.5 -> acumulado 30 min
    expect(punto?.valor).toBeCloseTo((10 + 3 + 0.5) * 0.5)
    expect(punto?.calidad).toBe(1 + 3)
  })

  it('pasa el valor negativo de relleno tal como lo hace el parser ASCII (el mapper no lo filtra)', async () => {
    const buffer = await construirHdf5Sintetico()
    const parseado = await parsearHdf5Imerg(buffer, INDICES)

    expect(parseado.filas[1]?.valoresPorLat[1]).toBe(VALOR_NEGATIVO)
  })

  it('redondea la tasa a 5 decimales, igual que el texto ASCII', async () => {
    const buffer = await construirHdf5Sintetico((lonIdx, latIdx) => (lonIdx + latIdx) / 3)

    const parseado = await parsearHdf5Imerg(buffer, INDICES)

    // precip(lon 0, lat 1) = 1/3 => 0.33333
    expect(parseado.filas[0]?.valoresPorLat[0]).toBe(0.33333)
  })
})
