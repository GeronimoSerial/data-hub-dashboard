import { describe, expect, it } from 'vitest'
import {
  departamentoDeCelda,
  departamentoDeCeldaEn,
  departamentoDeCoordenada,
  departamentoDeCoordenadaEn,
  type FeatureCollectionDepartamentos,
} from './celda-departamento'

// Dos departamentos sintéticos: un cuadrado simple y un multipolígono con un
// hueco. Coordenadas GeoJSON: [lon, lat].
const sintetico: FeatureCollectionDepartamentos = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { nombre: 'Cuadrado' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-58.0, -27.0],
            [-57.0, -27.0],
            [-57.0, -28.0],
            [-58.0, -28.0],
            [-58.0, -27.0],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { nombre: 'Multí  Con Tilde' },
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [-56.0, -27.0],
              [-55.0, -27.0],
              [-55.0, -28.0],
              [-56.0, -28.0],
              [-56.0, -27.0],
            ],
            // Hueco dentro del primer polígono: no pertenece al departamento.
            [
              [-55.8, -27.2],
              [-55.6, -27.2],
              [-55.6, -27.4],
              [-55.8, -27.4],
              [-55.8, -27.2],
            ],
          ],
          [
            [
              [-50.0, -20.0],
              [-49.0, -20.0],
              [-49.0, -21.0],
              [-50.0, -21.0],
              [-50.0, -20.0],
            ],
          ],
        ],
      },
    },
  ],
}

describe('departamentoDeCoordenadaEn (puro)', () => {
  it('devuelve el id normalizado del departamento que contiene el punto', () => {
    expect(departamentoDeCoordenadaEn(sintetico, -27.5, -57.5)).toBe('CUADRADO')
  })

  it('normaliza tildes, mayúsculas y espacios dobles del nombre', () => {
    expect(departamentoDeCoordenadaEn(sintetico, -27.5, -55.9)).toBe('MULTI CON TILDE')
  })

  it('reconoce partes de un MultiPolygon distintas del primer polígono', () => {
    expect(departamentoDeCoordenadaEn(sintetico, -20.5, -49.5)).toBe('MULTI CON TILDE')
  })

  it('excluye el hueco de un polígono', () => {
    expect(departamentoDeCoordenadaEn(sintetico, -27.3, -55.7)).toBeNull()
  })

  it('devuelve null fuera de todo departamento', () => {
    expect(departamentoDeCoordenadaEn(sintetico, -10, -10)).toBeNull()
  })
})

describe('departamentoDeCelda (puro, sobre la colección)', () => {
  it('usa el centro de la celda 0.1° (la clave ya es el centro) como punto', () => {
    expect(departamentoDeCeldaEn(sintetico, '-27.5_-57.5')).toBe('CUADRADO')
  })

  it('devuelve null para una clave mal formada', () => {
    expect(departamentoDeCeldaEn(sintetico, 'no-es-celda')).toBeNull()
  })
})

describe('departamentoDeCoordenada y departamentoDeCelda (GeoJSON real de Corrientes)', () => {
  it('ubica Corrientes Capital en el departamento CAPITAL', () => {
    expect(departamentoDeCoordenada(-27.47, -58.83)).toBe('CAPITAL')
  })

  it('devuelve null para un punto fuera de la provincia', () => {
    expect(departamentoDeCoordenada(-34.6, -58.4)).toBeNull()
  })

  it('resuelve una celda 0.1° de Capital por su clave', () => {
    expect(departamentoDeCelda('-27.5_-58.8')).toBe('CAPITAL')
  })
})
