import { describe, expect, it } from 'vitest'
import { idiomaDeLocale, idiomaEfectivo, mostrarSelectorIdioma } from './idioma'

const corrientes = { locale: 'es-AR', idiomas: ['es'] as const }
const bilingue = { locale: 'es-AR', idiomas: ['pt', 'es'] as const }
const brasil = { locale: 'pt-BR', idiomas: ['pt'] as const }

describe('idiomaDeLocale', () => {
  it('maps pt-BR to pt', () => {
    expect(idiomaDeLocale('pt-BR')).toBe('pt')
  })

  it('maps es-AR to es', () => {
    expect(idiomaDeLocale('es-AR')).toBe('es')
  })

  it('throws for a locale with no dictionary', () => {
    expect(() => idiomaDeLocale('en-US')).toThrow(/en-US/)
  })
})

describe('idiomaEfectivo', () => {
  it('uses the region default from region.locale when there is no preference', () => {
    expect(idiomaEfectivo({ preferencia: null, region: corrientes })).toBe('es')
    expect(idiomaEfectivo({ preferencia: undefined, region: brasil })).toBe('pt')
  })

  it('takes the default from region.locale, not from the first offered language', () => {
    const bilingueEsAr = { locale: 'es-AR', idiomas: ['pt', 'es'] as const }
    expect(idiomaEfectivo({ preferencia: null, region: bilingueEsAr })).toBe('es')
  })

  it('honours a preference that the region offers', () => {
    expect(idiomaEfectivo({ preferencia: 'pt', region: bilingue })).toBe('pt')
  })

  it('ignores a preference outside region.idiomas and falls back to the default', () => {
    expect(idiomaEfectivo({ preferencia: 'pt', region: corrientes })).toBe('es')
  })
})

describe('mostrarSelectorIdioma', () => {
  it('is false for a single-language region (Corrientes)', () => {
    expect(mostrarSelectorIdioma(corrientes)).toBe(false)
  })

  it('is true for a region offering pt and es', () => {
    expect(mostrarSelectorIdioma(bilingue)).toBe(true)
  })
})
