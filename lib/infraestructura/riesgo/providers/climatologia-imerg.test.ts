import { describe, expect, it } from 'vitest'
import { celdaDeCoordenada } from '../celda'
import {
  ANIO_INICIO_IMERG,
  PREFIJO_SERIE_IMERG,
  VERSION_CLIMATOLOGIA_IMERG,
  claveSerieImerg,
  construirUrlCmrMes,
  construirUrlSubsetDiario,
  listarGranulosDiarios,
  parsearSubsetDiario,
  periodoClimatologiaImerg,
} from './climatologia-imerg'

describe('constantes y claves', () => {
  it('expone versión, año de inicio y prefijo de serie', () => {
    expect(VERSION_CLIMATOLOGIA_IMERG).toBe('climatologia-imerg-v1')
    expect(ANIO_INICIO_IMERG).toBe(2001)
    expect(PREFIJO_SERIE_IMERG).toBe('imerg:')
  })

  it('construye la clave de serie con el prefijo', () => {
    expect(claveSerieImerg('celda-1')).toBe('imerg:celda-1')
  })
})

describe('periodoClimatologiaImerg', () => {
  it('en octubre de 2026 cierra en 2025-12-31', () => {
    expect(periodoClimatologiaImerg(new Date('2026-10-13T12:00:00Z'))).toEqual({
      periodoDesde: '2001-01-01',
      periodoHasta: '2025-12-31',
    })
  })

  it('en marzo de 2026 cierra en 2024-12-31', () => {
    expect(periodoClimatologiaImerg(new Date('2026-03-01T00:00:00Z'))).toEqual({
      periodoDesde: '2001-01-01',
      periodoHasta: '2024-12-31',
    })
  })
})

describe('listarGranulosDiarios', () => {
  it('toma el link opendap, omite entries sin él y ordena por fecha', () => {
    const cmr = {
      feed: {
        entry: [
          {
            time_start: '2026-05-03T00:00:00.000Z',
            links: [
              { href: 'https://data.example.org/otro.HDF5' },
              { href: 'https://opendap.earthdata.nasa.gov/x/2026/05/03.nc4' },
            ],
          },
          {
            time_start: '2026-05-01T00:00:00.000Z',
            links: [{ href: 'https://s3.example.org/2026/05/01.nc4' }],
          },
          {
            time_start: '2026-05-02T00:00:00.000Z',
            links: [{ href: 'https://opendap.earthdata.nasa.gov/x/2026/05/02.nc4' }],
          },
        ],
      },
    }
    expect(listarGranulosDiarios(cmr)).toEqual([
      { fecha: '2026-05-02', urlOpendap: 'https://opendap.earthdata.nasa.gov/x/2026/05/02.nc4' },
      { fecha: '2026-05-03', urlOpendap: 'https://opendap.earthdata.nasa.gov/x/2026/05/03.nc4' },
    ])
  })

  it('payload inválido devuelve lista vacía', () => {
    expect(listarGranulosDiarios({ nada: true })).toEqual([])
    expect(listarGranulosDiarios(null)).toEqual([])
  })
})

describe('construirUrlCmrMes', () => {
  it('arma el rango del mes con días de dos dígitos', () => {
    const url = construirUrlCmrMes(2026, 2)
    expect(url).toBe(
      'https://cmr.earthdata.nasa.gov/search/granules.json?short_name=GPM_3IMERGDF&version=07&page_size=50&sort_key=start_date&temporal=2026-02-01T00:00:00Z,2026-02-28T23:59:59Z',
    )
  })

  it('usa el último día real del mes', () => {
    expect(construirUrlCmrMes(2024, 2)).toContain('temporal=2024-02-01T00:00:00Z,2024-02-29T23:59:59Z')
  })
})

describe('construirUrlSubsetDiario', () => {
  it('pide el bbox por índices de grilla', () => {
    const url = construirUrlSubsetDiario('https://opendap.earthdata.nasa.gov/x/3B-DAY.nc4')
    expect(url.startsWith('https://opendap.earthdata.nasa.gov/x/3B-DAY.nc4.dap.csv?')).toBe(true)
    expect(url).toContain('%5B1189:1:1259%5D')
    expect(url).toContain('%5B580:1:640%5D')
  })
})

describe('parsearSubsetDiario', () => {
  const texto = [
    'Dataset: 3B-DAY.nc4',
    '/lon, -61.05, -60.95',
    '/lat, -31.95, -31.85',
    '/precipitation[0][0], 0, 0.045',
    '/precipitation[0][1], 2.5, -9999.9',
  ].join('\n')

  it('mapea cada (lat, lon) a su celda sin escalar los valores', () => {
    const mapa = parsearSubsetDiario(texto)
    expect(mapa.size).toBe(4)
    expect(mapa.get(celdaDeCoordenada(-31.95, -61.05))).toBe(0)
    expect(mapa.get(celdaDeCoordenada(-31.85, -61.05))).toBe(0.045)
    expect(mapa.get(celdaDeCoordenada(-31.95, -60.95))).toBe(2.5)
  })

  it('valor de relleno negativo queda como null', () => {
    const mapa = parsearSubsetDiario(texto)
    expect(mapa.get(celdaDeCoordenada(-31.85, -60.95))).toBeNull()
  })

  it('lanza error si falta /lat', () => {
    const sinLat = texto.replace('/lat, -31.95, -31.85\n', '')
    expect(() => parsearSubsetDiario(sinLat)).toThrow('Subset IMERG diario inválido')
  })

  it('lanza error si no hay filas de precipitación', () => {
    const sinPrecip = texto
      .split('\n')
      .filter((l) => !l.startsWith('/precipitation'))
      .join('\n')
    expect(() => parsearSubsetDiario(sinPrecip)).toThrow('Subset IMERG diario inválido')
  })
})
