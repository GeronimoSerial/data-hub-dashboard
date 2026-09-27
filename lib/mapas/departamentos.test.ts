import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { FeatureCollection, Geometry, Position } from 'geojson'
import {
  agregarEscuelasCaidasPorDepartamento,
  LIMITES_CORRIENTES,
  normalizarNombreDepartamento,
} from './departamentos'

function cargarDepartamentos(): FeatureCollection {
  const filePath = path.resolve(
    process.cwd(),
    'public/data/departamentos-corrientes-georef-2026-09-27.geojson',
  )
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

describe('departamentos-corrientes-georef-2026-09-27.geojson', () => {
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

describe('normalizarNombreDepartamento', () => {
  it('unifica capitalización de título con tildes y mayúsculas sin tildes', () => {
    expect(normalizarNombreDepartamento('Ituzaingó')).toBe('ITUZAINGO')
    expect(normalizarNombreDepartamento('ITUZAINGO')).toBe('ITUZAINGO')
  })

  it('unifica el gotcha confirmado en la base: CONCEPCION y CONCEPCIÓN son el mismo departamento', () => {
    expect(normalizarNombreDepartamento('Concepción')).toBe('CONCEPCION')
    expect(normalizarNombreDepartamento('CONCEPCION')).toBe('CONCEPCION')
    expect(normalizarNombreDepartamento('CONCEPCIÓN')).toBe('CONCEPCION')
  })

  it('recorta espacios sobrantes', () => {
    expect(normalizarNombreDepartamento('  Goya  ')).toBe('GOYA')
  })
})

describe('agregarEscuelasCaidasPorDepartamento', () => {
  const departamentosConocidos = ['Goya', 'Concepción', 'Ituzaingó', 'Sauce']

  it('cuenta escuelas con servicio suspendido o parcial, ignora las de servicio normal', () => {
    const { escuelasCaidasPorDepartamento } = agregarEscuelasCaidasPorDepartamento(
      [
        { departamento: 'Goya', servicio: 'suspendido' },
        { departamento: 'GOYA', servicio: 'parcial' },
        { departamento: 'Goya', servicio: 'normal' },
      ],
      departamentosConocidos,
    )

    expect(escuelasCaidasPorDepartamento.get('GOYA')).toBe(2)
  })

  it('cruza ambos lados normalizados: ITUZAINGO (base) matchea Ituzaingó (geojson)', () => {
    const { escuelasCaidasPorDepartamento } = agregarEscuelasCaidasPorDepartamento(
      [{ departamento: 'ITUZAINGO', servicio: 'suspendido' }],
      departamentosConocidos,
    )

    expect(escuelasCaidasPorDepartamento.get('ITUZAINGO')).toBe(1)
  })

  it('cruza el gotcha confirmado: CONCEPCION y CONCEPCIÓN de la base suman al mismo departamento', () => {
    const { escuelasCaidasPorDepartamento } = agregarEscuelasCaidasPorDepartamento(
      [
        { departamento: 'CONCEPCION', servicio: 'suspendido' },
        { departamento: 'CONCEPCIÓN', servicio: 'parcial' },
      ],
      departamentosConocidos,
    )

    expect(escuelasCaidasPorDepartamento.get('CONCEPCION')).toBe(2)
  })

  it('un departamento sin escuelas afectadas simplemente no aparece en el mapa de conteos', () => {
    const { escuelasCaidasPorDepartamento } = agregarEscuelasCaidasPorDepartamento(
      [{ departamento: 'Goya', servicio: 'suspendido' }],
      departamentosConocidos,
    )

    expect(escuelasCaidasPorDepartamento.has('SAUCE')).toBe(false)
  })

  it('un departamento que no matchea ningún conocido se reporta en departamentosSinMatch, no desaparece', () => {
    const { escuelasCaidasPorDepartamento, departamentosSinMatch } = agregarEscuelasCaidasPorDepartamento(
      [{ departamento: 'DEPARTAMENTO INEXISTENTE', servicio: 'suspendido' }],
      departamentosConocidos,
    )

    expect(escuelasCaidasPorDepartamento.size).toBe(0)
    expect(departamentosSinMatch).toEqual(['DEPARTAMENTO INEXISTENTE'])
  })
})
