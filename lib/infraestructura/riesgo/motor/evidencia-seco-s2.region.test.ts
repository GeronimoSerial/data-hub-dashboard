import { describe, expect, it } from 'vitest'
import { evidenciaSecoDeRegion, evidenciaSecoS2 } from './evidencia-seco-s2'

const CUE_CORRIENTES = '1800057-00'

describe('evidencia de seco S2 por región', () => {
  it('corrientes usa la tabla existente, sin cambios', () => {
    expect(evidenciaSecoS2(CUE_CORRIENTES, 'corrientes')).toEqual({ estacionId: 'pna-corrientes', hSecoM: 7.06, fecha: '2023-11-12' })
    expect(evidenciaSecoDeRegion('corrientes')?.get(CUE_CORRIENTES)).toEqual({ estacionId: 'pna-corrientes', hSecoM: 7.06, fecha: '2023-11-12' })
  })

  it('una región sin tabla no tiene evidencia: undefined y null (sin efecto)', () => {
    expect(evidenciaSecoDeRegion('otra')).toBeUndefined()
    expect(evidenciaSecoS2(CUE_CORRIENTES, 'otra')).toBeNull()
  })
})
