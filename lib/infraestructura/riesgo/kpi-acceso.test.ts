import { describe, expect, it } from 'vitest'
import { calcularMatriculaCondicionadaPorAcceso } from './kpi-acceso'

describe('calcularMatriculaCondicionadaPorAcceso', () => {
  it('suma la matrícula de las escuelas con nivel de acceso alto', () => {
    const resultado = calcularMatriculaCondicionadaPorAcceso({
      snapshots: [
        { cueAnexo: 'a', nivelRiesgoAcceso: 'alto', exposicionMatricula: 100 },
        { cueAnexo: 'b', nivelRiesgoAcceso: 'alto', exposicionMatricula: 50 },
        { cueAnexo: 'c', nivelRiesgoAcceso: 'moderado', exposicionMatricula: 999 },
        { cueAnexo: 'd', nivelRiesgoAcceso: 'bajo', exposicionMatricula: 999 },
        { cueAnexo: 'e', nivelRiesgoAcceso: null, exposicionMatricula: 999 },
      ],
      cuesConAfectacionConfirmada: new Set(),
    })

    expect(resultado).toEqual({ escuelas: 2, matricula: 150 })
  })

  it('no duplica una escuela con acceso alto que ya está en afectación confirmada', () => {
    const resultado = calcularMatriculaCondicionadaPorAcceso({
      snapshots: [
        { cueAnexo: 'a', nivelRiesgoAcceso: 'alto', exposicionMatricula: 100 },
        { cueAnexo: 'b', nivelRiesgoAcceso: 'alto', exposicionMatricula: 50 },
      ],
      cuesConAfectacionConfirmada: new Set(['a']),
    })

    expect(resultado).toEqual({ escuelas: 1, matricula: 50 })
  })

  it('cuenta la escuela aunque exposicionMatricula sea null, tratándola como 0', () => {
    const resultado = calcularMatriculaCondicionadaPorAcceso({
      snapshots: [
        { cueAnexo: 'a', nivelRiesgoAcceso: 'alto', exposicionMatricula: null },
        { cueAnexo: 'b', nivelRiesgoAcceso: 'alto', exposicionMatricula: 40 },
      ],
      cuesConAfectacionConfirmada: new Set(),
    })

    expect(resultado).toEqual({ escuelas: 2, matricula: 40 })
  })

  it('deduplica por cueAnexo cuando el caller pasa una fila por horizonte', () => {
    const fila = { cueAnexo: 'a', nivelRiesgoAcceso: 'alto', exposicionMatricula: 100 }
    const resultado = calcularMatriculaCondicionadaPorAcceso({
      snapshots: [{ ...fila }, { ...fila }, { ...fila }],
      cuesConAfectacionConfirmada: new Set(),
    })

    expect(resultado).toEqual({ escuelas: 1, matricula: 100 })
  })

  it('devuelve cero con universo vacío', () => {
    const resultado = calcularMatriculaCondicionadaPorAcceso({
      snapshots: [],
      cuesConAfectacionConfirmada: new Set(),
    })

    expect(resultado).toEqual({ escuelas: 0, matricula: 0 })
  })
})
