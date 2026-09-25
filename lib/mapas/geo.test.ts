import { describe, expect, it } from 'vitest'
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson'
import { distanciaMinimaAlContorno, puntoDentroDeFeatureCollection } from './geo'

// Cuadrado 0,0 - 1,1 (lon,lat) con un hueco cuadrado 0.4,0.4 - 0.6,0.6.
const CUADRADO_CON_HUECO: FeatureCollection<Polygon, { nombre: string }> = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { nombre: 'Cuadrado' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0],
          ],
          [
            [0.4, 0.4],
            [0.6, 0.4],
            [0.6, 0.6],
            [0.4, 0.6],
            [0.4, 0.4],
          ],
        ],
      },
    },
  ],
}

const MULTIPOLIGONO: FeatureCollection<MultiPolygon, { nombre: string }> = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { nombre: 'Multi' },
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 1],
              [0, 0],
            ],
          ],
          [
            [
              [2, 2],
              [3, 2],
              [3, 3],
              [2, 3],
              [2, 2],
            ],
          ],
        ],
      },
    },
  ],
}

describe('puntoDentroDeFeatureCollection', () => {
  it('un punto adentro del anillo exterior está dentro', () => {
    expect(puntoDentroDeFeatureCollection([0.1, 0.1], CUADRADO_CON_HUECO)).toBe(true)
  })

  it('un punto dentro de un hueco NO está dentro del polígono', () => {
    expect(puntoDentroDeFeatureCollection([0.5, 0.5], CUADRADO_CON_HUECO)).toBe(false)
  })

  it('un punto fuera de todo está afuera', () => {
    expect(puntoDentroDeFeatureCollection([5, 5], CUADRADO_CON_HUECO)).toBe(false)
  })

  it('MultiPolygon: dentro de CUALQUIERA de sus polígonos cuenta como dentro (unión)', () => {
    expect(puntoDentroDeFeatureCollection([0.5, 0.5], MULTIPOLIGONO)).toBe(true)
    expect(puntoDentroDeFeatureCollection([2.5, 2.5], MULTIPOLIGONO)).toBe(true)
    expect(puntoDentroDeFeatureCollection([1.5, 1.5], MULTIPOLIGONO)).toBe(false)
  })
})

describe('distanciaMinimaAlContorno', () => {
  it('un punto muy cerca del borde da una distancia chica (< 1km)', () => {
    // ~0.001 grados de longitud en el ecuador de latitud ~0 son ~111 metros.
    const distancia = distanciaMinimaAlContorno([1.001, 0.5], CUADRADO_CON_HUECO)
    expect(distancia).toBeLessThan(1)
    expect(distancia).toBeGreaterThan(0)
  })

  it('un punto lejos del borde da una distancia grande (> 1km)', () => {
    const distancia = distanciaMinimaAlContorno([10, 10], CUADRADO_CON_HUECO)
    expect(distancia).toBeGreaterThan(1)
  })
})
