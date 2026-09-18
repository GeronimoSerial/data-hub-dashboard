import { describe, expect, it } from 'vitest'
import {
  parseImpactoPreliminarInput,
  parseProblematicaInput,
  resolverCategoria,
  validarAlumnosPermitidos,
} from './validacion'

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

  it('rechaza un motivo vacío', () => {
    const result = parseProblematicaInput({ ...baseInput, motivo: '' })
    expect(result.ok).toBe(false)
  })

  // El motivo ya no es un enum cerrado en este schema (tiene ABM, ver
  // motivos.ts): que "Incendio" exista en el catálogo lo valida el POST con
  // resolverCategoria, no este parser sin acceso a la DB.
  it('acepta cualquier motivo no vacío: la existencia real la valida resolverCategoria', () => {
    const result = parseProblematicaInput({ ...baseInput, motivo: 'Incendio' })
    expect(result.ok).toBe(true)
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

describe('resolverCategoria', () => {
  const motivos = [
    { nombre: 'Inundación', categoria: 'establecimiento' },
    { nombre: 'Anegamiento', categoria: 'alumnos' },
  ]

  it('resuelve la categoría del motivo encontrado', () => {
    const result = resolverCategoria('Inundación', motivos)
    expect(result).toEqual({ ok: true, categoria: 'establecimiento' })
  })

  it('rechaza un motivo inexistente en la tabla', () => {
    const result = resolverCategoria('Motivo inexistente', motivos)
    expect(result.ok).toBe(false)
  })

  it('rechaza si la categoría persistida no es del catálogo fijo', () => {
    const result = resolverCategoria('Rareza', [{ nombre: 'Rareza', categoria: 'otra-cosa' }])
    expect(result.ok).toBe(false)
  })

  // Si el invariante de nombre único se rompiera, elegir una de las dos
  // coincidencias guardaría la problemática en la categoría equivocada. Falla
  // explícito en vez de adivinar.
  it('rechaza un nombre duplicado en dos categorías en vez de elegir una', () => {
    const result = resolverCategoria('Otro', [
      { nombre: 'Otro', categoria: 'establecimiento' },
      { nombre: 'Otro', categoria: 'alumnos' },
    ])
    expect(result.ok).toBe(false)
  })
})

describe('validarAlumnosPermitidos', () => {
  it('rechaza alumnos no vacíos en categoría establecimiento', () => {
    const result = validarAlumnosPermitidos('establecimiento', [1, 2])
    expect(result.ok).toBe(false)
  })

  it('acepta establecimiento sin alumnos', () => {
    expect(validarAlumnosPermitidos('establecimiento', undefined).ok).toBe(true)
    expect(validarAlumnosPermitidos('establecimiento', []).ok).toBe(true)
  })

  it('acepta alumnos en categoría alumnos', () => {
    const result = validarAlumnosPermitidos('alumnos', [1, 2])
    expect(result.ok).toBe(true)
  })
})
