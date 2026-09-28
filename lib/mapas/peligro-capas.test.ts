import { describe, expect, it } from 'vitest'
import type { FeatureCollection, Geometry } from 'geojson'
import {
  COLOR_NIVEL_PELIGRO,
  colorPuntoRiesgo,
  construirCoropletaPeligro,
  construirPuntosRiesgo,
  esNivelPeligro,
  ETIQUETA_NIVEL_PELIGRO,
  NIVELES_PELIGRO,
  paintCoropletaPeligro,
  paintPuntosRiesgo,
  peorNivelEntre,
  type EscuelaConCoordenadas,
  type PropiedadesDepartamentoRadar,
  type RiesgoEscuela,
} from './peligro-capas'

// GeoJSON mínimo con los mismos nombres "de exhibición" del dataset real
// (capitalización de título con tildes), mientras que el radar entrega el
// departamento en mayúsculas. Ejercita el cruce normalizado.
const GEOJSON: FeatureCollection<Geometry, PropiedadesDepartamentoRadar> = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [] },
      properties: { nombre: 'Concepción', id: '18042' },
    },
    {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [] },
      properties: { nombre: 'Ituzaingó', id: '18056' },
    },
    {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [] },
      properties: { nombre: 'Bella Vista', id: '18007' },
    },
  ],
}

describe('COLOR_NIVEL_PELIGRO', () => {
  it('define exactamente los 5 niveles con sus hex oficiales', () => {
    expect(Object.keys(COLOR_NIVEL_PELIGRO).sort()).toEqual([...NIVELES_PELIGRO].sort())
    expect(COLOR_NIVEL_PELIGRO).toEqual({
      verde: '#eff6ff',
      amarillo: '#93c5fd',
      naranja: '#3b82f6',
      rojo: '#1e3a8a',
      sin_dato: '#8a8886',
    })
  })
})

describe('ETIQUETA_NIVEL_PELIGRO', () => {
  it('cubre los 5 niveles con texto no vacío y sin_dato fijo en "Sin dato"', () => {
    for (const nivel of NIVELES_PELIGRO) {
      expect(ETIQUETA_NIVEL_PELIGRO[nivel].trim().length).toBeGreaterThan(0)
    }
    expect(ETIQUETA_NIVEL_PELIGRO.sin_dato).toBe('Sin dato')
  })
})

describe('peorNivelEntre', () => {
  it('devuelve el más severo entre varios niveles reales', () => {
    expect(peorNivelEntre(['verde', 'rojo', 'amarillo'])).toBe('rojo')
    expect(peorNivelEntre(['verde', 'naranja'])).toBe('naranja')
  })

  it('ignora sin_dato y valores desconocidos al rankear', () => {
    expect(peorNivelEntre(['sin_dato', 'amarillo', 'bogus'])).toBe('amarillo')
  })

  it('devuelve sin_dato con un arreglo vacío o sin ningún nivel real', () => {
    expect(peorNivelEntre([])).toBe('sin_dato')
    expect(peorNivelEntre(['sin_dato', 'bogus'])).toBe('sin_dato')
  })
})

describe('esNivelPeligro', () => {
  it('acepta sólo los 5 niveles conocidos y rechaza cualquier otra cosa', () => {
    for (const nivel of NIVELES_PELIGRO) expect(esNivelPeligro(nivel)).toBe(true)
    expect(esNivelPeligro('critico')).toBe(false)
    expect(esNivelPeligro(null)).toBe(false)
    expect(esNivelPeligro(undefined)).toBe(false)
  })
})

describe('construirCoropletaPeligro', () => {
  it('copia el GeoJSON y asigna nivelPeligro normalizando nombre en ambos lados', () => {
    const resultado = construirCoropletaPeligro(GEOJSON, [
      { departamento: 'CONCEPCION', peorNivel: 'rojo' },
      { departamento: 'ITUZAINGO', peorNivel: 'amarillo' },
    ])

    expect(resultado.type).toBe('FeatureCollection')
    expect(resultado.features.map((f) => [f.properties?.nombre, f.properties?.nivelPeligro])).toEqual([
      ['Concepción', 'rojo'],
      ['Ituzaingó', 'amarillo'],
      ['Bella Vista', 'sin_dato'],
    ])
  })

  it('asigna "sin_dato" explícito (nunca undefined) a un departamento sin nivel', () => {
    const resultado = construirCoropletaPeligro(GEOJSON, [])
    for (const feature of resultado.features) {
      expect(feature.properties?.nivelPeligro).toBe('sin_dato')
    }
  })

  it('no muta el FeatureCollection de entrada', () => {
    construirCoropletaPeligro(GEOJSON, [{ departamento: 'ITUZAINGO', peorNivel: 'verde' }])
    for (const feature of GEOJSON.features) {
      expect(feature.properties?.nivelPeligro).toBeUndefined()
    }
  })
})

describe('paintCoropletaPeligro', () => {
  it('es un `match` sobre nivelPeligro con los 5 hex y sin_dato como fallback final', () => {
    const paint = paintCoropletaPeligro()!
    const expresion = paint['fill-color'] as unknown[]
    expect(expresion[0]).toBe('match')
    expect(expresion[1]).toEqual(['get', 'nivelPeligro'])
    expect(expresion).toEqual([
      'match',
      ['get', 'nivelPeligro'],
      'verde',
      COLOR_NIVEL_PELIGRO.verde,
      'amarillo',
      COLOR_NIVEL_PELIGRO.amarillo,
      'naranja',
      COLOR_NIVEL_PELIGRO.naranja,
      'rojo',
      COLOR_NIVEL_PELIGRO.rojo,
      COLOR_NIVEL_PELIGRO.sin_dato,
    ])
    expect(expresion[expresion.length - 1]).toBe(COLOR_NIVEL_PELIGRO.sin_dato)
  })

  it('deja `sin_dato` sin relleno (opacity 0) y pinta el resto semitransparente', () => {
    const paint = paintCoropletaPeligro()!
    expect(paint['fill-opacity']).toEqual([
      'case',
      ['==', ['get', 'nivelPeligro'], 'sin_dato'],
      0,
      0.55,
    ])
  })
})

describe('construirPuntosRiesgo', () => {
  const escuelas: EscuelaConCoordenadas[] = [
    { cueAnexo: '1801605-04', lat: -27.47, lon: -58.83 },
    { cueAnexo: '1801605-05', lat: -28.1, lon: -58.2 },
  ]

  it('arma un Feature/Point por escuela con coordenadas [lon, lat]', () => {
    const riesgo = new Map<string, RiesgoEscuela>([
      ['1801605-04', { nivelRiesgo: 'muy_alto', confianza: 'alta' }],
      ['1801605-05', { nivelRiesgo: 'bajo', confianza: 'media' }],
    ])
    const { features } = construirPuntosRiesgo(escuelas, riesgo)
    expect(features).toHaveLength(2)
    expect(features[0].geometry.coordinates).toEqual([-58.83, -27.47])
    expect(features[0].properties).toEqual({
      cueAnexo: '1801605-04',
      nivelRiesgo: 'muy_alto',
      confianza: 'alta',
    })
  })

  it('usa "sin_dato" y confianza "baja" cuando el cue no está en el mapa', () => {
    const { features } = construirPuntosRiesgo([escuelas[0]], new Map())
    expect(features[0].properties.nivelRiesgo).toBe('sin_dato')
    expect(features[0].properties.confianza).toBe('baja')
  })

  it('trata un nivelRiesgo null como "sin_dato"', () => {
    const riesgo = new Map<string, RiesgoEscuela>([
      ['1801605-04', { nivelRiesgo: null, confianza: 'baja' }],
    ])
    const { features } = construirPuntosRiesgo([escuelas[0]], riesgo)
    expect(features[0].properties.nivelRiesgo).toBe('sin_dato')
  })
})

describe('paintPuntosRiesgo', () => {
  it('es un `match` sobre nivelRiesgo con los mismos 5 colores y sin_dato de fallback', () => {
    const paint = paintPuntosRiesgo()!
    const expresion = paint['circle-color'] as unknown[]
    expect(expresion[0]).toBe('match')
    expect(expresion[1]).toEqual(['get', 'nivelRiesgo'])
    expect(expresion).toEqual([
      'match',
      ['get', 'nivelRiesgo'],
      'bajo',
      COLOR_NIVEL_PELIGRO.verde,
      'moderado',
      COLOR_NIVEL_PELIGRO.amarillo,
      'alto',
      COLOR_NIVEL_PELIGRO.naranja,
      'muy_alto',
      COLOR_NIVEL_PELIGRO.rojo,
      COLOR_NIVEL_PELIGRO.sin_dato,
    ])
  })
})

describe('colorPuntoRiesgo', () => {
  it('devuelve el hex plano de la MISMA paleta para cada nivel de riesgo', () => {
    expect(colorPuntoRiesgo('bajo')).toBe(COLOR_NIVEL_PELIGRO.verde)
    expect(colorPuntoRiesgo('moderado')).toBe(COLOR_NIVEL_PELIGRO.amarillo)
    expect(colorPuntoRiesgo('alto')).toBe(COLOR_NIVEL_PELIGRO.naranja)
    expect(colorPuntoRiesgo('muy_alto')).toBe(COLOR_NIVEL_PELIGRO.rojo)
  })

  it('cae a sin_dato (gris neutro) para valores desconocidos', () => {
    expect(colorPuntoRiesgo('sin_dato')).toBe(COLOR_NIVEL_PELIGRO.sin_dato)
    expect(colorPuntoRiesgo('bogus')).toBe(COLOR_NIVEL_PELIGRO.sin_dato)
  })
})
