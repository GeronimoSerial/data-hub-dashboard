import { describe, expect, it } from 'vitest'
import { nivelActual } from './tarjeta-estacion-rio'

describe('nivelActual', () => {
  it('classifies by the numbers with the excess note', () => {
    expect(nivelActual(8.47, 7.9, 10.8)).toEqual({ estado: 'alerta', nota: '▲ 0,57 m sobre alerta' })
    expect(nivelActual(11, 7.9, 10.8)).toEqual({ estado: 'evacuacion', nota: '▲ 0,20 m sobre evacuación' })
    expect(nivelActual(5, 7.9, 10.8)).toEqual({ estado: 'normal', nota: null })
    expect(nivelActual(5, null, null)).toEqual({ estado: 'normal', nota: null })
    expect(nivelActual(null, 7.9, 10.8)).toEqual({ estado: 'sin_dato', nota: null })
  })
})
