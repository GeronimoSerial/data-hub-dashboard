import { describe, expect, it } from 'vitest'
import {
  obtenerDepartamentosGeoref,
  compararDepartamentosConGeoref,
  normalizarNombreDepartamento,
} from './georef-departamentos'

describe('obtenerDepartamentosGeoref()', () => {
  it('tiene exactamente los 25 departamentos de Corrientes', () => {
    expect(obtenerDepartamentosGeoref()).toHaveLength(25)
  })
})

describe('normalizarNombreDepartamento', () => {
  it('quita tildes de nombres reales', () => {
    expect(normalizarNombreDepartamento('Curuzú Cuatiá')).toBe('CURUZU CUATIA')
    expect(normalizarNombreDepartamento('Concepción')).toBe('CONCEPCION')
  })

  it('pasa a mayúsculas', () => {
    expect(normalizarNombreDepartamento('San Cosme')).toBe('SAN COSME')
  })

  it('colapsa espacios múltiples y recorta los extremos', () => {
    expect(normalizarNombreDepartamento('  San   Cosme  ')).toBe('SAN COSME')
  })
})

describe('compararDepartamentosConGeoref', () => {
  it('con los 25 nombres reales normalizados coincide con todo Georef', () => {
    const padron = obtenerDepartamentosGeoref().map((departamento) =>
      normalizarNombreDepartamento(departamento.nombre),
    )

    const resultado = compararDepartamentosConGeoref(padron)

    expect(resultado.coinciden).toHaveLength(25)
    expect(resultado.soloEnGeoref).toHaveLength(0)
    expect(resultado.soloEnPadron).toHaveLength(0)
  })

  it('reporta en soloEnPadron un nombre inventado que no existe en Georef', () => {
    const resultado = compararDepartamentosConGeoref(['DEPARTAMENTO INVENTADO'])

    expect(resultado.soloEnPadron).toContain('DEPARTAMENTO INVENTADO')
  })

  it('reporta en soloEnGeoref un departamento oficial ausente en el padrón', () => {
    const padron = obtenerDepartamentosGeoref().filter(
      (departamento) => departamento.nombre !== 'Sauce',
    ).map((departamento) => normalizarNombreDepartamento(departamento.nombre))

    const resultado = compararDepartamentosConGeoref(padron)

    expect(resultado.soloEnGeoref).toContain('SAUCE')
  })
})
