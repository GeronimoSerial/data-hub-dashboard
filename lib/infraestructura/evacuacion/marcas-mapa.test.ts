import { describe, expect, it } from 'vitest'
import { marcasDeEscuela, type MarcasMapa } from './marcas-mapa'

const marcas: MarcasMapa = {
  comedores: new Map(),
  aptos: new Map([['A', true], ['N', true], ['X', false]]),
  sinAntecedentes: new Set(['N']),
}

describe('marcasDeEscuela — posible centro', () => {
  it('apta con datos: sin marca de antecedentes', () => {
    expect(marcasDeEscuela('A', marcas)).toEqual({ comedor: 'sin_servicio', posibleCentroEvacuados: true })
  })
  it('apta sin antecedentes: marca adicional', () => {
    expect(marcasDeEscuela('N', marcas)).toEqual({ comedor: 'sin_servicio', posibleCentroEvacuados: true, posibleCentroSinAntecedentes: true })
  })
  it('no apta o no calculada: sin marca de antecedentes', () => {
    expect(marcasDeEscuela('X', marcas)).toEqual({ comedor: 'sin_servicio', posibleCentroEvacuados: false })
    expect(marcasDeEscuela('Z', marcas)).toEqual({ comedor: 'sin_servicio' })
  })
})
