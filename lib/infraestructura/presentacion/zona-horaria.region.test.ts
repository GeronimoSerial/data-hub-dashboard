import { describe, expect, it } from 'vitest'
import { textoActualizado } from './textos-dato'

describe('textoActualizado en la zona de la región activa', () => {
  it('muestra la fecha y hora locales de Corrientes', () => {
    expect(textoActualizado('2026-11-12T15:30:00Z')).toBe('Actualizado 12/11 12:30')
  })
})
