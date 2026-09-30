import { describe, expect, it } from 'vitest'
import { asignarCeldasADepartamentos, listarDepartamentos } from './departamentos'
import { generarGrilla } from './grilla'

describe('asignarCeldasADepartamentos', () => {
  it('cubre los 25 departamentos y normaliza los pesos', () => {
    const asignaciones = asignarCeldasADepartamentos(generarGrilla())
    const pesoPorDepartamento = new Map<string, number>()
    for (const asignacion of asignaciones) {
      pesoPorDepartamento.set(asignacion.departamentoId, (pesoPorDepartamento.get(asignacion.departamentoId) ?? 0) + asignacion.peso)
    }
    expect(listarDepartamentos()).toHaveLength(25)
    expect(pesoPorDepartamento.size).toBe(25)
    for (const peso of pesoPorDepartamento.values()) expect(peso).toBeCloseTo(1, 10)
  })

  it('produce la misma asignación en llamadas repetidas y cambia el orden sólo con el orden de entrada', () => {
    const grilla = generarGrilla()
    const primera = asignarCeldasADepartamentos(grilla)
    const segunda = asignarCeldasADepartamentos(grilla)
    expect(segunda).toEqual(primera)
    expect(asignarCeldasADepartamentos([...grilla].reverse())).toEqual([...primera].reverse())
  })
})
