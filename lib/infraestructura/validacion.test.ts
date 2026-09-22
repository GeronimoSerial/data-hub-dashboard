import { describe, expect, it } from 'vitest'
import {
  resolverCategoria,
  validarAlumnosPermitidos,
} from './validacion'

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
  // coincidencias guardaría la afectación en la categoría equivocada. Falla
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
