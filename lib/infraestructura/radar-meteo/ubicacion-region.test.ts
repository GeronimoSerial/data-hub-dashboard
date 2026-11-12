import { describe, expect, it } from 'vitest'
import { regionActiva } from '@/lib/infraestructura/region'
import {
  departamentoQueContienePunto,
  listarDepartamentos,
  TOLERANCIA_FUERA_DE_CORRIENTES_KM,
  ubicacionEnCorrientes,
  ubicacionEnRegion,
} from './departamentos'

const KM_POR_GRADO_LAT = 110.574
const KM_POR_GRADO_LON_EN_ECUADOR = 111.32

// Returns a point about `distanciaKm` away from the outer-ring vertex `vertice`,
// pushed in the direction that leaves the department's centroid. It is only
// accepted when it lies outside every administrative unit of the dataset.
function puntoFueraDelBorde(vertice: [number, number], centro: [number, number], distanciaKm: number): [number, number] | null {
  const [lon, lat] = vertice
  const ux = (lon - centro[0]) * KM_POR_GRADO_LON_EN_ECUADOR * Math.cos((lat * Math.PI) / 180)
  const uy = (lat - centro[1]) * KM_POR_GRADO_LAT
  const norma = Math.hypot(ux, uy)
  if (norma === 0) return null
  const dLon = (distanciaKm * ux) / norma / (KM_POR_GRADO_LON_EN_ECUADOR * Math.cos((lat * Math.PI) / 180))
  const dLat = (distanciaKm * uy) / norma / KM_POR_GRADO_LAT
  const candidato: [number, number] = [lon + dLon, lat + dLat]
  return departamentoQueContienePunto(candidato[1], candidato[0]) === null ? candidato : null
}

function puntoJustoFueraDelBorde(distanciaKm: number): [number, number] {
  for (const departamento of listarDepartamentos()) {
    for (const vertice of departamento.geometria.map((poligono) => poligono[0]).flat()) {
      const candidato = puntoFueraDelBorde(vertice, departamento.centro, distanciaKm)
      if (candidato) return candidato
    }
  }
  throw new Error('no vertex yields a point outside the dataset')
}

describe('ubicacionEnRegion', () => {
  it('accepts a point inside a department of the active region', () => {
    expect(ubicacionEnRegion(-27.4698, -58.8306)).toBe(true) // Corrientes capital centre
  })

  it('rejects points clearly outside the active region', () => {
    expect(ubicacionEnRegion(-25.2637, -57.5759)).toBe(false) // Asunción
    expect(ubicacionEnRegion(-34.6, -58.4)).toBe(false) // Buenos Aires
  })

  it('accepts a point just beyond a boundary edge within the default tolerance and rejects it with zero tolerance', () => {
    const [lon, lat] = puntoJustoFueraDelBorde(3)
    expect(ubicacionEnRegion(lat, lon)).toBe(true)
    expect(ubicacionEnRegion(lat, lon, 0)).toBe(false)
  })

  it('takes the default tolerance from the active region config', () => {
    expect(TOLERANCIA_FUERA_DE_CORRIENTES_KM).toBe(regionActiva().toleranciaBorde)
  })
})

describe('ubicacionEnCorrientes (deprecated alias)', () => {
  it('returns the same results as ubicacionEnRegion', () => {
    const [lon, lat] = puntoJustoFueraDelBorde(3)
    const puntos: Array<[number, number]> = [
      [-27.4698, -58.8306],
      [-25.2637, -57.5759],
      [-34.6, -58.4],
      [lat, lon],
    ]
    for (const [la, lo] of puntos) {
      expect(ubicacionEnCorrientes(la, lo)).toBe(ubicacionEnRegion(la, lo))
      expect(ubicacionEnCorrientes(la, lo, 0)).toBe(ubicacionEnRegion(la, lo, 0))
    }
  })
})
