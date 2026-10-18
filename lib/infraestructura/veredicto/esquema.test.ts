import { describe, expect, it } from 'vitest'
import { esquemaSalidaVeredicto } from './esquema'

const linea = (ambito: string, texto = 'Llovió fuerte y el río sube.', refs: string[] = []) => ({ ambito, texto, refs })
const dia = (extra: Record<string, unknown> = {}) => ({
  fecha: '2026-10-13',
  titular: { texto: 'Crecida del Paraná en el oeste.', refs: [] },
  departamentos: [linea('departamento:GOYA')],
  ...extra,
})

describe('esquemaSalidaVeredicto', () => {
  it('accepts one headline plus one line per department', () => {
    expect(esquemaSalidaVeredicto.safeParse({ dias: [dia()] }).success).toBe(true)
  })

  it('accepts a quiet day with no department lines', () => {
    expect(esquemaSalidaVeredicto.safeParse({ dias: [dia({ departamentos: [] })] }).success).toBe(true)
  })

  it('rejects a headline longer than 140 characters', () => {
    const titular = { texto: 'x'.repeat(141), refs: [] }
    expect(esquemaSalidaVeredicto.safeParse({ dias: [dia({ titular })] }).success).toBe(false)
  })

  it('rejects a department line longer than 220 characters', () => {
    const departamentos = [linea('departamento:GOYA', 'x'.repeat(221))]
    expect(esquemaSalidaVeredicto.safeParse({ dias: [dia({ departamentos })] }).success).toBe(false)
  })

  it('rejects an invalid date and an empty output', () => {
    expect(esquemaSalidaVeredicto.safeParse({ dias: [dia({ fecha: '13/10' })] }).success).toBe(false)
    expect(esquemaSalidaVeredicto.safeParse({ dias: [] }).success).toBe(false)
  })

  it('tolerates a headline citing up to 12 data points (refs are cheap, text is bounded)', () => {
    const titular = { texto: 'Titular.', refs: Array.from({ length: 12 }, (_, i) => `r${i}`) }
    expect(esquemaSalidaVeredicto.safeParse({ dias: [dia({ titular })] }).success).toBe(true)
  })
})
