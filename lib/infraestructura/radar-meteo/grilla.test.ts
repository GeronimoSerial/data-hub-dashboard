import { describe, expect, it } from 'vitest'
import { generarGrilla, GRID_VERSION } from './grilla'

describe('grilla de Corrientes', () => {
  it('genera celdas estables y deterministas en el polígono provincial con buffer', () => {
    const a = generarGrilla(), b = generarGrilla()
    expect(GRID_VERSION).toBe('corrientes-0.2-v1')
    expect(a).toEqual(b)
    expect(a.length).toBeGreaterThan(230)
    expect(a.length).toBeLessThan(260)
    expect(new Set(a.map((c) => c.id)).size).toBe(a.length)
    expect(a[0].id).toMatch(/^r-?\d+c-?\d+$/)
  })
})
