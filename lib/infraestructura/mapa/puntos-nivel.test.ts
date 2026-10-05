import { describe, expect, it } from 'vitest'
import { construirPuntosNivel } from './puntos-nivel'

describe('construirPuntosNivel', () => {
  it('conserva el orden y una feature por escuela con coordenadas', () => {
    const puntos = construirPuntosNivel(
      [
        { cueAnexo: 'cue-1', lat: -27.5, lon: -58.8 },
        { cueAnexo: 'sin-coordenadas', lat: null, lon: -58.7 },
        { cueAnexo: 'cue-2', lat: -27.4, lon: -58.6 },
        { cueAnexo: 'sin-longitud', lat: -27.2, lon: null },
        { cueAnexo: 'cue-1', lat: -27.3, lon: -58.5 },
      ],
      new Map([['cue-1', '#f00']]),
    )

    expect(puntos.features.map(({ properties }) => properties.cueAnexo)).toEqual([
      'cue-1', 'cue-2', 'cue-1',
    ])
    expect(puntos.features.map(({ properties }) => [properties.color, properties.conDato])).toEqual([
      ['#f00', true],
      [undefined, false],
      ['#f00', true],
    ])
    expect(puntos.features.map(({ geometry }) => geometry.coordinates)).toEqual([
      [-58.8, -27.5], [-58.6, -27.4], [-58.5, -27.3],
    ])
  })
})
