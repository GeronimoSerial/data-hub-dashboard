import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  calcularIndicesGrillaImerg,
  construirUrlSubsetImerg,
  elegirGranuloMasReciente,
  esGranuloDeDatos,
  IMERG_LAT_MAX,
  IMERG_LAT_MIN,
  IMERG_LON_MAX,
  IMERG_LON_MIN,
  mapearAsciiImergACeldas,
  parsearRespuestaAsciiImerg,
} from './imerg'
import { celdaDeCoordenada } from '../celda'

const fixtureCmr = JSON.parse(
  readFileSync(
    new URL('../__fixtures__/hazard/imerg-cmr-granulos-2026-09-26.json', import.meta.url),
    'utf8',
  ),
) as unknown;

const fixtureAscii = readFileSync(
  new URL('../__fixtures__/hazard/imerg-subset-2026-09-26.ascii', import.meta.url),
  'utf8',
)

const TITULO_REAL =
  'GPM_3IMERGHHE.07:3B-HHR-E.MS.MRG.3IMERG.20260926-S183000-E185959.1110.V07C.HDF5'
const URL_DATOS_REAL =
  'https://data.gesdisc.earthdata.nasa.gov/data/GPM_L3/GPM_3IMERGHHE.07/2026/269/3B-HHR-E.MS.MRG.3IMERG.20260926-S183000-E185959.1110.V07C.HDF5'

function mapear(
  over: Partial<Parameters<typeof mapearAsciiImergACeldas>[0]> &
    Pick<Parameters<typeof mapearAsciiImergACeldas>[0], 'parseado'>,
) {
  return mapearAsciiImergACeldas({
    observadoEn: '2026-09-26T18:59:59.999Z',
    validoDesde: '2026-09-26T18:30:00.000Z',
    validoHasta: '2026-09-26T18:59:59.999Z',
    celdaDeCoordenada,
    ...over,
  })
}

describe('esGranuloDeDatos', () => {
  it('acepta sólo el link cuyo href termina en .HDF5', () => {
    expect(
      esGranuloDeDatos({
        rel: 'http://esipfed.org/ns/fedsearch/1.1/data#',
        href: 'https://data.gesdisc.earthdata.nasa.gov/data/GPM_L3/x.HDF5',
      }),
    ).toBe(true)
  })

  it('rechaza links de credenciales s3 y de documentación .html', () => {
    expect(
      esGranuloDeDatos({
        rel: 'http://esipfed.org/ns/fedsearch/1.1/metadata#',
        href: 'https://data.gesdisc.earthdata.nasa.gov/s3credentials',
      }),
    ).toBe(false)
    expect(
      esGranuloDeDatos({
        rel: 'http://esipfed.org/ns/fedsearch/1.1/metadata#',
        href: 'https://disc.gsfc.nasa.gov/datacollection/GPM_3IMERGHHE_07.html',
      }),
    ).toBe(false)
  })
})

describe('elegirGranuloMasReciente', () => {
  it('extrae título, ventana temporal y URL de datos del fixture real', () => {
    const granulo = elegirGranuloMasReciente(fixtureCmr)
    expect(granulo).not.toBeNull()
    expect(granulo).toEqual({
      titulo: TITULO_REAL,
      inicioEn: '2026-09-26T18:30:00.000Z',
      finEn: '2026-09-26T18:59:59.999Z',
      urlDatos: URL_DATOS_REAL,
    })
  })

  it('elige el link de datos aunque no sea el primero del array', () => {
    const payload = {
      feed: {
        entry: [
          {
            title: 'granulo-sintetico',
            time_start: '2026-09-26T18:30:00.000Z',
            time_end: '2026-09-26T18:59:59.999Z',
            links: [
              { rel: 'metadata#', href: 'https://data.gesdisc.earthdata.nasa.gov/s3credentials' },
              { rel: 'documentation#', href: 'https://ejemplo/GPM_3IMERGHHE_07.html' },
              { rel: 'data#', href: 'https://data.gesdisc.earthdata.nasa.gov/data/x.HDF5' },
            ],
          },
        ],
      },
    }

    expect(elegirGranuloMasReciente(payload)?.urlDatos).toBe(
      'https://data.gesdisc.earthdata.nasa.gov/data/x.HDF5',
    )
  })

  it('devuelve null con feed.entry vacío, sin lanzar', () => {
    expect(elegirGranuloMasReciente({ feed: { entry: [] } })).toBeNull()
  })

  it('devuelve null si ningún link es de datos o el payload es inesperado', () => {
    expect(
      elegirGranuloMasReciente({
        feed: {
          entry: [
            {
              title: 'x',
              time_start: 'a',
              time_end: 'b',
              links: [{ rel: 'metadata#', href: 'https://data.gesdisc.earthdata.nasa.gov/s3credentials' }],
            },
          ],
        },
      }),
    ).toBeNull()
    expect(elegirGranuloMasReciente(null)).toBeNull()
    expect(elegirGranuloMasReciente({})).toBeNull()
  })
})

describe('calcularIndicesGrillaImerg', () => {
  it('calcula índices ordenados para el bbox de Corrientes', () => {
    const indices = calcularIndicesGrillaImerg(
      IMERG_LAT_MIN,
      IMERG_LAT_MAX,
      IMERG_LON_MIN,
      IMERG_LON_MAX,
    )

    expect(indices).toEqual({
      lonIndiceInicio: 1189,
      lonIndiceFin: 1259,
      latIndiceInicio: 580,
      latIndiceFin: 640,
    })
    expect(indices.lonIndiceInicio).toBeLessThanOrEqual(indices.lonIndiceFin)
    expect(indices.latIndiceInicio).toBeLessThanOrEqual(indices.latIndiceFin)
  })

  it('ordena los índices aunque reciba el bbox invertido', () => {
    const invertido = calcularIndicesGrillaImerg(
      IMERG_LAT_MAX,
      IMERG_LAT_MIN,
      IMERG_LON_MAX,
      IMERG_LON_MIN,
    )
    expect(invertido).toEqual({
      lonIndiceInicio: 1189,
      lonIndiceFin: 1259,
      latIndiceInicio: 580,
      latIndiceFin: 640,
    })
  })
})

describe('construirUrlSubsetImerg', () => {
  it('reemplaza host/ruta por OPeNDAP y arma el query .ascii con corchetes encodeados', () => {
    const indices = calcularIndicesGrillaImerg(
      IMERG_LAT_MIN,
      IMERG_LAT_MAX,
      IMERG_LON_MIN,
      IMERG_LON_MAX,
    )

    const url = construirUrlSubsetImerg({
      urlDatosGranulo: URL_DATOS_REAL,
      ...indices,
    })

    expect(url).toBe(
      'https://gpm1.gesdisc.eosdis.nasa.gov/opendap/GPM_L3/GPM_3IMERGHHE.07/2026/269/3B-HHR-E.MS.MRG.3IMERG.20260926-S183000-E185959.1110.V07C.HDF5.ascii?precipitation%5B0%5D%5B1189:1259%5D%5B580:640%5D,precipitationQualityIndex%5B0%5D%5B1189:1259%5D%5B580:640%5D,lat%5B580:640%5D,lon%5B1189:1259%5D',
    )
    expect(url).toContain('precipitationQualityIndex')
    expect(url).not.toContain('data.gesdisc.earthdata.nasa.gov')
    expect(url).toContain('gpm1.gesdisc.eosdis.nasa.gov/opendap/GPM_L3/')
  })
})

describe('parsearRespuestaAsciiImerg', () => {
  it('parsea el fixture real con 42 lons, 37 lats y 42 filas de 37 valores', () => {
    const parseado = parsearRespuestaAsciiImerg(fixtureAscii)

    expect(parseado.lat).toHaveLength(37)
    expect(parseado.lon).toHaveLength(42)
    expect(parseado.filas).toHaveLength(42)
    for (const fila of parseado.filas) {
      expect(fila.valoresPorLat).toHaveLength(37)
    }

    expect(parseado.lat[0]).toBeCloseTo(-30.75, 5)
    expect(parseado.lat[36]).toBeCloseTo(-27.15, 5)
    expect(parseado.lon[0]).toBeCloseTo(-59.65, 5)
    expect(parseado.lon[41]).toBeCloseTo(-55.55, 5)
    expect(parseado.filas[0].lonIndiceRelativo).toBe(0)
    expect(parseado.filas[41].lonIndiceRelativo).toBe(41)
    // El fixture real fue capturado ANTES de pedir `precipitationQualityIndex`
    // (ver §1.3/§3 del registro): sin esas filas en el ASCII, filasCalidad
    // queda vacío, no falla el parseo.
    expect(parseado.filasCalidad).toEqual([])
  })

  it('parsea las filas de precipitationQualityIndex cuando la respuesta las trae', () => {
    const texto = [
      'Dataset: x',
      'precipitation[0][0], 4.0, 8.0',
      'precipitationQualityIndex[0][0], 0.9, 0.5',
      'lat, -27.5, -27.4',
      'lon, -58.8',
    ].join('\n')

    const parseado = parsearRespuestaAsciiImerg(texto)

    expect(parseado.filasCalidad).toEqual([{ lonIndiceRelativo: 0, valoresPorLat: [0.9, 0.5] }])
    expect(parseado.filas).toEqual([{ lonIndiceRelativo: 0, valoresPorLat: [4.0, 8.0] }])
  })

  it('lanza error descriptivo si falta la línea "lat,"', () => {
    const sinLat = fixtureAscii
      .split(/\r?\n/)
      .filter((linea) => !linea.trim().startsWith('lat,'))
      .join('\n')

    expect(() => parsearRespuestaAsciiImerg(sinLat)).toThrow(/lat/)
  })

  it('lanza error descriptivo si no hay filas de precipitación', () => {
    expect(() => parsearRespuestaAsciiImerg('Dataset: x\nlat, -30\nlon, -59\n')).toThrow(
      /precipitation/,
    )
  })
})

describe('mapearAsciiImergACeldas', () => {
  it('genera 37*42 observaciones desde el fixture real usando la celda real', () => {
    const parseado = parsearRespuestaAsciiImerg(fixtureAscii)

    const puntos = mapear({ parseado })

    expect(puntos).toHaveLength(37 * 42)
    const muestra = puntos[0]
    expect(muestra.variable).toBe('precipitacion_observada_satelital')
    expect(muestra.unidad).toBe('mm/30min')
    // El fixture real no trae precipitationQualityIndex (capturado antes de
    // pedirla, ver §1.3 del registro): calidad queda null para ese caso.
    expect(muestra.calidad).toBeNull()
    expect(muestra.observadoEn).toBe('2026-09-26T18:59:59.999Z')
    expect(muestra.validoDesde).toBe('2026-09-26T18:30:00.000Z')
    expect(muestra.validoHasta).toBe('2026-09-26T18:59:59.999Z')
    expect(typeof muestra.valor).toBe('number')
  })

  it('ante colisión de celda se queda con el primer valor en orden de iteración', () => {
    // Cuatro coordenadas IMERG distintas (2 filas x 2 columnas) que caen todas
    // en la misma celda de 0,1°.
    const parseado = {
      lat: [-27.5, -27.5],
      lon: [-58.8, -58.8],
      filas: [
        { lonIndiceRelativo: 0, valoresPorLat: [1, 2] },
        { lonIndiceRelativo: 1, valoresPorLat: [3, 4] },
      ],
      filasCalidad: [],
    }

    const puntos = mapear({ parseado })

    expect(puntos).toHaveLength(1)
    expect(puntos[0].geometryRef).toBe(celdaDeCoordenada(-27.5, -58.8))
    // Primer valor crudo (tasa) en orden de iteración: 1 mm/h. Convertido a
    // acumulado de media hora: 1 * 0.5 = 0.5 mm/30min (ver test de la
    // conversión de unidades más abajo para el caso numérico documentado por
    // el hallazgo BLOQUEANTE).
    expect(puntos[0].valor).toBe(0.5)
  })

  // BLOQUEANTE (docs/ejecucion-enos/E3a/registro.md, §"Correcciones del gate
  // N1"): `precipitation` es una TASA en mm/h, no un acumulado de media hora.
  // Antes se guardaba el valor crudo tal cual (2x más alto). Caso numérico
  // exacto pedido por la revisión: 4.0 mm/h crudo -> 2.0 mm almacenado.
  const CASOS_CONVERSION: Array<[string, number, number, string]> = [
    ['convierte la tasa mm/h a acumulado de media hora (4.0 mm/h crudo -> 2.0 mm almacenado)', 4, 2.0, 'mm/30min'],
    ['otro caso de la misma conversión: 0 mm/h crudo -> 0 mm (no rompe con ceros)', 0, 0, 'mm/30min'],
  ]

  it.each(CASOS_CONVERSION)(
    '%s',
    (_titulo, valorCrudo, valorEsperado, unidadEsperada) => {
      const puntos = mapear({
        parseado: {
          lat: [-27.5],
          lon: [-58.8],
          filas: [{ lonIndiceRelativo: 0, valoresPorLat: [valorCrudo] }],
          filasCalidad: [],
        },
      })
      expect(puntos).toHaveLength(1)
      expect(puntos[0].valor).toBe(valorEsperado)
      expect(puntos[0].unidad).toBe(unidadEsperada)
    },
  )

  it('propaga precipitationQualityIndex a `calidad` cuando la respuesta la trae', () => {
    const parseado = {
      lat: [-27.5, -27.4],
      lon: [-58.8],
      filas: [{ lonIndiceRelativo: 0, valoresPorLat: [4.0, 8.0] }],
      filasCalidad: [{ lonIndiceRelativo: 0, valoresPorLat: [0.9, 0.5] }],
    }

    const puntos = mapear({ parseado })

    expect(puntos).toHaveLength(2)
    expect(puntos[0].calidad).toBe(0.9)
    expect(puntos[1].calidad).toBe(0.5)
  })
})
