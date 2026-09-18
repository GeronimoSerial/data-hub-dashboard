import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { FeatureCollection, Geometry, Position } from 'geojson'
import { LIMITES_CORRIENTES } from './departamentos'

function cargarDepartamentos(): FeatureCollection {
  const filePath = path.resolve(process.cwd(), 'public/data/departamentos-corrientes.geojson')
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function* recorrerPosiciones(geometry: Geometry): Generator<Position> {
  switch (geometry.type) {
    case 'Point':
      yield geometry.coordinates
      return
    case 'MultiPoint':
    case 'LineString':
      yield* geometry.coordinates
      return
    case 'MultiLineString':
    case 'Polygon':
      for (const linea of geometry.coordinates) yield* linea
      return
    case 'MultiPolygon':
      for (const poligono of geometry.coordinates) for (const linea of poligono) yield* linea
      return
    case 'GeometryCollection':
      for (const g of geometry.geometries) yield* recorrerPosiciones(g)
      return
  }
}

describe('departamentos-corrientes.geojson', () => {
  it('parsea como un FeatureCollection', () => {
    const geojson = cargarDepartamentos()
    expect(geojson.type).toBe('FeatureCollection')
    expect(Array.isArray(geojson.features)).toBe(true)
    expect(geojson.features.length).toBeGreaterThan(0)
  })

  it('todas las features tienen properties.nombre', () => {
    const geojson = cargarDepartamentos()
    for (const feature of geojson.features) {
      expect(feature.properties?.nombre).toBeTruthy()
    }
  })

  it('LIMITES_CORRIENTES contiene todas las coordenadas del geojson', () => {
    const geojson = cargarDepartamentos()
    const [[oesteLon, surLat], [esteLon, norteLat]] = LIMITES_CORRIENTES

    for (const feature of geojson.features) {
      if (!feature.geometry) continue
      for (const [lon, lat] of recorrerPosiciones(feature.geometry)) {
        expect(lon).toBeGreaterThanOrEqual(oesteLon)
        expect(lon).toBeLessThanOrEqual(esteLon)
        expect(lat).toBeGreaterThanOrEqual(surLat)
        expect(lat).toBeLessThanOrEqual(norteLat)
      }
    }
  })
})

describe('máscara de la provincia', () => {
  const mascara = JSON.parse(
    readFileSync(path.resolve(process.cwd(), 'public/data/mascara-corrientes.geojson'), 'utf8'),
  )

  // Point-in-polygon con regla par/impar, contemplando los huecos: un punto
  // cuenta como tapado si cae dentro de un anillo exterior y fuera de todos
  // los huecos de ese polígono.
  function tapado(punto: [number, number]): boolean {
    const enAnillo = (p: [number, number], ring: number[][]) => {
      let dentro = false
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i]
        const [xj, yj] = ring[j]
        if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) {
          dentro = !dentro
        }
      }
      return dentro
    }
    const polys = mascara.features[0].geometry.coordinates as number[][][][]
    let cuenta = 0
    for (const poly of polys) {
      if (!enAnillo(punto, poly[0])) continue
      let enHueco = false
      for (let k = 1; k < poly.length; k++) {
        if (enAnillo(punto, poly[k])) {
          enHueco = true
          break
        }
      }
      if (!enHueco) cuenta++
    }
    return cuenta % 2 === 1
  }

  it('es un FeatureCollection con un único polígono', () => {
    expect(mascara.type).toBe('FeatureCollection')
    expect(mascara.features).toHaveLength(1)
    expect(mascara.features[0].geometry.type).toBe('MultiPolygon')
  })

  it('deja destapadas las ciudades de Corrientes', () => {
    expect(tapado([-58.83, -27.47])).toBe(false) // Capital
    expect(tapado([-59.26, -29.14])).toBe(false) // Goya
    expect(tapado([-57.09, -29.71])).toBe(false) // Paso de los Libres
  })

  it('tapa todo lo que está fuera de la provincia', () => {
    expect(tapado([-58.98, -27.45])).toBe(true) // Resistencia, Chaco
    expect(tapado([-55.89, -27.37])).toBe(true) // Posadas, Misiones
    expect(tapado([-50.0, -35.0])).toBe(true) // Atlántico
  })
})
