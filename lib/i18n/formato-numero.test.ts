import { describe, expect, it } from 'vitest'
import { localeNumero } from './formato-numero'

describe('localeNumero', () => {
  it('maps each dictionary language to its number locale', () => {
    expect(localeNumero('es')).toBe('es-AR')
    expect(localeNumero('pt')).toBe('pt-BR')
  })

  it('formats thousands and decimals per language', () => {
    expect(new Intl.NumberFormat(localeNumero('pt')).format(1234.5)).toBe('1.234,5')
    expect(new Intl.NumberFormat(localeNumero('es')).format(1234.5)).toBe('1.234,5')
  })
})
