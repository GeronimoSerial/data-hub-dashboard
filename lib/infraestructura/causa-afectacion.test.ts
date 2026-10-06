import { describe, expect, it } from 'vitest'
import { causaElegible } from './causa-afectacion'

const RIGE = '2026-10-20T12:00:00.000Z'

describe('causaElegible', () => {
  it('acepta una causa activa de la misma escuela', () => {
    expect(causaElegible({ cueAnexo: 'A', retiradaEn: null }, 'A', RIGE)).toBe(true)
  })
  it('acepta una causa cerrada hace 15 días exactos y rechaza 15 días y un minuto', () => {
    expect(causaElegible({ cueAnexo: 'A', retiradaEn: '2026-10-05T12:00:00.000Z' }, 'A', RIGE)).toBe(true)
    expect(causaElegible({ cueAnexo: 'A', retiradaEn: '2026-10-05T11:59:00.000Z' }, 'A', RIGE)).toBe(false)
  })
  it('rechaza una causa de otra escuela', () => {
    expect(causaElegible({ cueAnexo: 'B', retiradaEn: null }, 'A', RIGE)).toBe(false)
  })
})
