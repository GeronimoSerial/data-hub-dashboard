import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RegionConfig } from '@/lib/infraestructura/region'
import { referencia } from '@/lib/infraestructura/datasets/memoria'
import {
  obtenerEstacionesPrefectura,
  obtenerEstacionesPrefecturaDeRegion,
} from './estaciones-prefectura'

const { CATALOGO } = vi.hoisted(() => ({
  CATALOGO: [
    {
      estacionId: 'pna-corrientes',
      nombrePna: 'CORRIENTES',
      idHistorico: 1,
      rio: 'parana',
      rol: 'corrientes',
      coordenadas: null,
    },
  ],
}))

vi.mock('@/lib/infraestructura/datasets/memoria', () => ({
  referencia: vi.fn(() => CATALOGO),
  versionReferencia: vi.fn(() => 'v-test'),
}))

// Sólo se lee fuentesRio: el resto de la región no interviene en la decisión.
const regionSinPrefectura = { fuentesRio: ['ana', 'sgb'] } as RegionConfig
const regionConPrefectura = { fuentesRio: ['prefectura', 'ina'] } as RegionConfig

describe('obtenerEstacionesPrefecturaDeRegion', () => {
  beforeEach(() => {
    vi.mocked(referencia).mockClear()
  })

  it('devuelve [] sin tocar el dataset si la región no tiene fuente prefectura', () => {
    expect(obtenerEstacionesPrefecturaDeRegion(regionSinPrefectura)).toEqual([])
    expect(referencia).not.toHaveBeenCalled()
  })

  it('devuelve el mismo catálogo que obtenerEstacionesPrefectura() en una región Prefectura', () => {
    expect(obtenerEstacionesPrefecturaDeRegion(regionConPrefectura)).toEqual(obtenerEstacionesPrefectura())
    expect(obtenerEstacionesPrefecturaDeRegion(regionConPrefectura)).toEqual(CATALOGO)
  })
})
