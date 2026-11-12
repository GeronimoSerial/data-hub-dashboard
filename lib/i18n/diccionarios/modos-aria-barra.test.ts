import { describe, expect, it } from 'vitest'
import { es } from './es'
import { pt } from './pt'

describe('modos.ariaBarra tablist label', () => {
  it('keeps the Spanish Corrientes label exactly', () => {
    expect(es.modos.ariaBarra('Corrientes')).toBe('Modos y vistas de ENOS Corrientes')
  })

  it('builds the Spanish label from the region name', () => {
    expect(es.modos.ariaBarra('Manaos')).toBe('Modos y vistas de ENOS Manaos')
  })

  it('builds the Portuguese label from the region name', () => {
    expect(pt.modos.ariaBarra('Manaos')).toBe('Modos e visualizações de ENOS Manaos')
  })
})
