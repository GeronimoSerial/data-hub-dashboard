import { describe, expect, it } from 'vitest'
import { esRutaExterna } from './ruta-externa'

describe('esRutaExterna', () => {
  it('accepts absolute https and http URLs', () => {
    expect(esRutaExterna('https://manaos.example/mapas/infraestructura')).toBe(true)
    expect(esRutaExterna('http://manaos.example/')).toBe(true)
  })

  it('rejects internal paths, protocol-relative and non-web schemes', () => {
    expect(esRutaExterna('/mapas/infraestructura')).toBe(false)
    expect(esRutaExterna('//evil.example')).toBe(false)
    expect(esRutaExterna('javascript:alert(1)')).toBe(false)
    expect(esRutaExterna('data:text/html,hola')).toBe(false)
    expect(esRutaExterna('')).toBe(false)
  })
})
