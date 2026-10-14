import { describe, expect, it } from 'vitest'
import { textoActualizado, textoAlturaRio } from './textos-dato'

describe('textoAlturaRio', () => {
  it('dice la altura explícita, el estado y los umbrales aparte', () => {
    expect(textoAlturaRio({ alturaM: 9.33, estado: 'evacuacion', alertaM: 7.5, evacuacionM: 8.5 })).toEqual({
      altura: 'Altura del río: 9,33 m',
      estado: 'Evacuación',
      umbrales: 'alerta 7,50 m · evacuación 8,50 m',
    })
  })

  it('sin altura ni umbrales', () => {
    expect(textoAlturaRio({ alturaM: null, estado: 'sin_dato', alertaM: null, evacuacionM: null })).toEqual({
      altura: 'Altura del río: sin dato',
      estado: 'Sin dato',
      umbrales: null,
    })
  })
})

describe('textoActualizado', () => {
  it('usa la hora local argentina', () => {
    expect(textoActualizado('2026-10-13T23:03:00Z')).toBe('Actualizado 13/10 20:03')
    expect(textoActualizado(null)).toBe('Sin fecha de actualización')
  })
})
