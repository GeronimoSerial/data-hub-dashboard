import { describe, expect, it } from 'vitest'
import { construirUrlOsrm, normalizarRespuestaOsrm, parseCoordenadas } from './ruta-osrm'

describe('parseCoordenadas', () => {
  it('acepta lat,lon dentro de Corrientes', () => {
    expect(parseCoordenadas('-27.47,-58.83')).toEqual({ lat: -27.47, lon: -58.83 })
    expect(parseCoordenadas(' -28.5 , -57.0 ')).toEqual({ lat: -28.5, lon: -57 })
  })

  it.each([
    ['vacío', ''],
    ['ausente', null],
    ['un solo número', '-27.5'],
    ['tres partes', '-27.5,-58.8,1'],
    ['texto', 'abc,def'],
    ['no finito', 'Infinity,-58'],
    ['notación exponencial', '1e1,-58'],
    ['lat fuera de rango', '-91,-58'],
    ['fuera de la caja de Corrientes', '-34.6,-58.4'],
    ['lon fuera de la caja', '-28,-54.0'],
  ])('rechaza %s', (_nombre, valor) => {
    expect(parseCoordenadas(valor)).toBeNull()
  })
})

describe('construirUrlOsrm', () => {
  it('usa orden lon,lat y quita barras finales de la base', () => {
    const url = construirUrlOsrm(
      'https://router.project-osrm.org/',
      { lat: -27.5, lon: -58.8 },
      { lat: -28.1, lon: -57.1 },
    )
    expect(url).toBe(
      'https://router.project-osrm.org/route/v1/driving/-58.8,-27.5;-57.1,-28.1?overview=full&geometries=geojson',
    )
  })
})

describe('normalizarRespuestaOsrm', () => {
  const geometria = { type: 'LineString', coordinates: [[-58.8, -27.5], [-57.1, -28.1]] }

  it('convierte distancia y duración a km (1 decimal) y minutos enteros', () => {
    const res = normalizarRespuestaOsrm({
      code: 'Ok',
      routes: [{ distance: 12345, duration: 1049, geometry: geometria }],
    })
    expect(res).toEqual({
      ok: true,
      ruta: { distanciaKm: 12.3, duracionMin: 17, geometria },
    })
  })

  it('code distinto de Ok es sin_ruta_vial', () => {
    expect(normalizarRespuestaOsrm({ code: 'NoRoute', routes: [] })).toEqual({ ok: false, error: 'sin_ruta_vial' })
  })

  it('sin rutas es sin_ruta_vial', () => {
    expect(normalizarRespuestaOsrm({ code: 'Ok', routes: [] })).toEqual({ ok: false, error: 'sin_ruta_vial' })
  })

  it.each([
    ['sin code', { routes: [] }],
    ['null', null],
    ['geometría que no es LineString', { code: 'Ok', routes: [{ distance: 1, duration: 1, geometry: { type: 'Point', coordinates: [0, 0] } }] }],
    ['distancia no numérica', { code: 'Ok', routes: [{ distance: '1', duration: 1, geometry: geometria }] }],
    ['duración negativa', { code: 'Ok', routes: [{ distance: 1, duration: -1, geometry: geometria }] }],
  ])('respuesta malformada (%s) es proveedor_no_disponible', (_nombre, body) => {
    expect(normalizarRespuestaOsrm(body)).toEqual({ ok: false, error: 'proveedor_no_disponible' })
  })
})
