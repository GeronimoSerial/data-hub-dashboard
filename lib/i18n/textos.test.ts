import { describe, expect, it } from 'vitest'
import { es } from './diccionarios/es'
import { pt } from './diccionarios/pt'
import { textos, textosActuales } from './index'

describe('textos', () => {
  it('returns the dictionary for each language', () => {
    expect(textos('es')).toBe(es)
    expect(textos('pt')).toBe(pt)
  })
})

describe('textosActuales (server)', () => {
  it('returns the Spanish dictionary for the Corrientes region', () => {
    expect(textosActuales()).toBe(es)
  })
})
