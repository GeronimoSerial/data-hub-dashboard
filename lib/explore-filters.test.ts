import { describe, expect, it } from 'vitest'
import {
  canonicalizeExploreSearch,
  exploreHref,
  parseExploreFilters,
} from './explore-filters'

describe('explore filters', () => {
  const allowed = { temas: new Set(['matricula']), niveles: new Set(['primario']) }

  it('parses and normalizes supported values', () => {
    expect(parseExploreFilters(new URLSearchParams('tema=Matricula&nivel=primario&formato=mapa&q=Goya'), allowed)).toEqual({
      tema: 'matricula', nivel: 'primario', formato: 'mapa', q: 'goya',
    })
  })

  it('drops invalid and unknown values', () => {
    expect(parseExploreFilters(new URLSearchParams('tema=secret&nivel=x&formato=video&noise=1'), allowed)).toEqual({
      tema: undefined, nivel: undefined, formato: undefined, q: undefined,
    })
  })

  it('serializes a stable canonical URL', () => {
    expect(exploreHref({ q: 'goya', tema: 'matricula', formato: 'mapa' })).toBe('/explorar?q=goya&tema=matricula&formato=mapa')
  })
})

describe('canonicalizeExploreSearch', () => {
  const allowed = { temas: new Set(['matricula']), niveles: new Set(['primario', 'secundario']) }

  it('keeps a canonical URL unchanged', () => {
    const input = new URLSearchParams('q=goya&tema=matricula&formato=mapa')
    const result = canonicalizeExploreSearch(input, allowed)
    expect(result.changed).toBe(false)
    expect(result.canonical).toBe('q=goya&tema=matricula&formato=mapa')
  })

  it('flags unknown, duplicated and invalid params for normalization', () => {
    expect(canonicalizeExploreSearch(new URLSearchParams('q=goya&noise=1'), allowed).changed).toBe(true)
    expect(canonicalizeExploreSearch(new URLSearchParams('formato=mapa&tema=matricula'), allowed).changed).toBe(true)
    expect(canonicalizeExploreSearch(new URLSearchParams('tema=zzz'), allowed).changed).toBe(true)
    expect(canonicalizeExploreSearch(new URLSearchParams('q=uno&q=dos'), allowed).changed).toBe(true)
  })

  it('produces a stable canonical value that reloads to the same state', () => {
    const result = canonicalizeExploreSearch(new URLSearchParams('tema=Matricula&formato=mapa&q=Goya'), allowed)
    expect(result.canonical).toBe('q=goya&tema=matricula&formato=mapa')
    const again = canonicalizeExploreSearch(new URLSearchParams(result.canonical), allowed)
    expect(again.changed).toBe(false)
    expect(again.canonical).toBe(result.canonical)
  })
})