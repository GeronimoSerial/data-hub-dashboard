import { describe, expect, it } from 'vitest'
import { fechaHoraArt, horaArt } from './traza-texto'

const INSTANTE = '2026-11-12T15:30:00Z'

describe('formato de hora de la traza en la región activa', () => {
  it('horaArt muestra la hora local de Corrientes', () => {
    expect(horaArt(INSTANTE)).toBe('12:30')
  })

  it('fechaHoraArt muestra día, mes y hora local de Corrientes', () => {
    expect(fechaHoraArt(INSTANTE)).toBe('12/11 12:30')
  })
})
