import { describe, expect, it } from 'vitest'
import { DEPARTAMENTOS_URL, MASCARA_URL } from './departamentos'

describe('departamentos asset URLs (Corrientes default region)', () => {
  it('MASCARA_URL points at the Corrientes mask file', () => {
    expect(MASCARA_URL).toBe('/data/mascara-corrientes.geojson')
  })

  it('DEPARTAMENTOS_URL points at the Corrientes Georef departments file', () => {
    expect(DEPARTAMENTOS_URL).toBe('/data/departamentos-corrientes-georef-2026-09-27.geojson')
  })
})
