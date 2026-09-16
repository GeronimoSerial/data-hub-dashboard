import { describe, expect, it } from 'vitest'
import { parseImpactoPreliminarInput, parseProblematicaInput } from './validacion'

const baseInput = {
  cue: '1801605-04',
  motivo: 'Inundación',
  severidad: 'Alta',
  descripcion: 'Acceso principal anegado',
  secciones: [10, 20],
  idempotencyKey: 'k-1',
}

describe('parseProblematicaInput', () => {
  it('acepta un cuerpo válido', () => {
    const result = parseProblematicaInput(baseInput)
    expect(result.ok).toBe(true)
  })

  it('acepta sin descripción, es opcional', () => {
    const { descripcion: _descripcion, ...rest } = baseInput
    const result = parseProblematicaInput(rest)
    expect(result.ok).toBe(true)
  })

  it('rechaza un motivo fuera del catálogo cerrado', () => {
    const result = parseProblematicaInput({ ...baseInput, motivo: 'Incendio' })
    expect(result.ok).toBe(false)
  })

  it('rechaza una severidad fuera del catálogo cerrado', () => {
    const result = parseProblematicaInput({ ...baseInput, severidad: 'Extrema' })
    expect(result.ok).toBe(false)
  })

  it('rechaza una descripción con HTML', () => {
    const result = parseProblematicaInput({
      ...baseInput,
      descripcion: '<script>alert(1)</script>',
    })
    expect(result.ok).toBe(false)
  })

  it('rechaza una descripción demasiado larga', () => {
    const result = parseProblematicaInput({ ...baseInput, descripcion: 'a'.repeat(501) })
    expect(result.ok).toBe(false)
  })

  it('rechaza un CUE inválido', () => {
    const result = parseProblematicaInput({ ...baseInput, cue: 'no-es-un-cue' })
    expect(result.ok).toBe(false)
  })

  it('rechaza una lista de secciones vacía', () => {
    const result = parseProblematicaInput({ ...baseInput, secciones: [] })
    expect(result.ok).toBe(false)
  })

  it('rechaza sin idempotencyKey', () => {
    const { idempotencyKey: _idempotencyKey, ...rest } = baseInput
    const result = parseProblematicaInput(rest)
    expect(result.ok).toBe(false)
  })
})

describe('parseImpactoPreliminarInput', () => {
  it('acepta cue + secciones', () => {
    const result = parseImpactoPreliminarInput({ cue: '1801605-04', secciones: [10] })
    expect(result.ok).toBe(true)
  })

  it('rechaza secciones vacías', () => {
    const result = parseImpactoPreliminarInput({ cue: '1801605-04', secciones: [] })
    expect(result.ok).toBe(false)
  })
})
