import { describe, expect, it } from 'vitest'
import { asignarCeldasADepartamentos, listarDepartamentos, ubicacionEnCorrientes } from './departamentos'
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

describe('ubicacionEnCorrientes', () => {
  it('accepts points inside the province and just past its boundary', () => {
    expect(ubicacionEnCorrientes(-27.4692, -58.8306)).toBe(true) // Corrientes capital
    expect(ubicacionEnCorrientes(-27.57289, -56.71054)).toBe(true) // shore school, ~0.5 km out
  })

  it('rejects padrón coordinates far outside the province', () => {
    expect(ubicacionEnCorrientes(-29.097614, -59.457138)).toBe(false) // 1800295-00
    expect(ubicacionEnCorrientes(-27.367046, -59.457138)).toBe(false) // 1800303-00
  })
})
