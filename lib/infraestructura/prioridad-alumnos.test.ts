import { describe, expect, it } from 'vitest'
import { calcularPrioridadAlumnos, impactoDeAlumnos } from './prioridad-alumnos'

describe('prioridad de inaccesibilidad', () => {
  it.each([
    [3, 5, 'Media'], [5, 5, 'Media'], [700, 1000, 'Crítica'],
    [9, 100, 'Baja'], [10, 100, 'Media'], [30, 100, 'Media'],
    [49, 100, 'Media'], [50, 100, 'Alta'], [60, 100, 'Crítica'],
    [199, 2000, 'Media'], [200, 2001, 'Alta'], [200, 1000, 'Alta'],
    [200, 600, 'Crítica'], [299, 1000, 'Alta'], [300, 1000, 'Crítica'],
    [999, 10000, 'Alta'],
  ])('%i/%i → %s', (afectados, matricula, prioridad) => {
    expect(calcularPrioridadAlumnos(afectados, matricula, 1).prioridad).toBe(prioridad)
  })
  it.each([[1, 0], [0, 10], [11, 10], [1, null], [-1, 10], [1, NaN]])('no inventa prioridad con %s/%s', (a, m) => {
    expect(calcularPrioridadAlumnos(a!, m, 1).prioridad).toBeNull()
  })
  it('deduplica matrícula y afectados entre secciones y excluye alumnos fuera del corte', () => {
    const impacto = impactoDeAlumnos([1, 2, 2, 99], [1, 2, 2, 3, 4, 5], 7)
    expect(impacto).toMatchObject({ afectados: 2, matricula: 5, porcentaje: 40, prioridad: 'Media', corteId: 7, version: 1 })
  })
})

it('usa la membresía completa del contexto aunque falten identidades visibles', async () => {
  const { impactoAlumnosEnContexto } = await import('./prioridad-alumnos')
  const seccion = { geSectionId: 1, curso: '1', division: 'A', turno: 'Mañana', nivel: 'Primario', matricula: 5,
    alumnosMatriculados: [1, 2, 3, 4, 5], alumnos: [{ gePersonId: 1, nombre: 'Ana', apellido: 'Pérez' }] }
  const turnos = [{ turno: 'Mañana', niveles: [{ nivel: 'Primario', secciones: [seccion, { ...seccion, geSectionId: 2 }] }] }]
  expect(impactoAlumnosEnContexto([1], turnos)).toMatchObject({ afectados: 1, matricula: 5, porcentaje: 20, prioridad: 'Baja' })
})

it('no estima matrícula a partir de un contexto nominal incompleto guardado offline', async () => {
  const { impactoAlumnosEnContexto } = await import('./prioridad-alumnos')
  const seccion = { geSectionId: 1, curso: '1', division: 'A', turno: 'Mañana', nivel: 'Primario', matricula: 100, alumnos: [] }
  const turnos = [{ turno: 'Mañana', niveles: [{ nivel: 'Primario', secciones: [seccion, { ...seccion, geSectionId: 2 }] }] }]
  expect(impactoAlumnosEnContexto(Array.from({ length: 60 }, (_, i) => i + 1), turnos)).toMatchObject({ afectados: 60, matricula: null, porcentaje: null, prioridad: null })
})
