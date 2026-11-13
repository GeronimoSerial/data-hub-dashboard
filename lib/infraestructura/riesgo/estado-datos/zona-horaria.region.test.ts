import { describe, expect, it } from 'vitest'
import { clasificarImerg } from './clasificar'

describe('cobertura IMERG con fecha de la región activa', () => {
  it('formatea el inicio de cobertura en la fecha local de Corrientes', () => {
    const item = clasificarImerg({
      desde: '2026-11-10T03:30:00Z',
      hasta: '2026-11-12T15:30:00Z',
      ahora: new Date('2026-11-12T15:40:00Z'),
    })
    expect(item.motivo).toBe('Cobertura desde el 10/11/2026.')
  })
})
