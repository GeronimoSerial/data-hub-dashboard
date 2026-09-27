import { describe, expect, it } from 'vitest'
import { buscarEscuelas, type EscuelaBuscable } from './buscar-escuelas'

function make(overrides: Partial<EscuelaBuscable>): EscuelaBuscable {
  return {
    cueAnexo: '000000000',
    nombre: 'Escuela Sin Nombre',
    localidad: 'Sin Localidad',
    departamento: 'Sin Departamento',
    ...overrides,
  }
}

describe('buscarEscuelas', () => {
  it('devuelve [] con una query de menos de 2 caracteres', () => {
    const items = [make({ nombre: 'Escuela N° 17' })]
    expect(buscarEscuelas(items, 'a')).toEqual([])
    expect(buscarEscuelas(items, '1')).toEqual([])
  })

  it('rankea CUE exacto por encima de un nombre que empieza igual', () => {
    const items = [
      make({ cueAnexo: '999', nombre: '680012300 Anexo' }),
      make({ cueAnexo: '680012300', nombre: 'Zeta Escuela' }),
    ]
    const resultado = buscarEscuelas(items, '680012300')
    expect(resultado[0].cueAnexo).toBe('680012300')
  })

  it('rankea un nombre que empieza con la query antes que una palabra completa en el medio', () => {
    const items = [
      make({ cueAnexo: 'X1', nombre: 'Escuela N° 17' }),
      make({ cueAnexo: 'X2', nombre: '17 de Octubre' }),
    ]
    const resultado = buscarEscuelas(items, '17')
    expect(resultado[0].nombre).toBe('17 de Octubre')
  })

  it('rankea la palabra exacta "17" antes que el prefijo de palabra "170"', () => {
    const items = [
      make({ cueAnexo: 'C170', nombre: 'Escuela N° 170' }),
      make({ cueAnexo: 'C17', nombre: 'Escuela N° 17' }),
    ]
    const resultado = buscarEscuelas(items, '17')
    expect(resultado.map((item) => item.nombre)).toEqual(['Escuela N° 17', 'Escuela N° 170'])
  })

  it('matchea por fragmento de localidad o departamento ausente en nombre/CUE', () => {
    const items = [
      make({ cueAnexo: 'A1', nombre: 'Escuela Rural', localidad: 'Goya', departamento: 'Capital' }),
      make({
        cueAnexo: 'A2',
        nombre: 'Escuela Rural Dos',
        localidad: 'Esquina',
        departamento: 'Concepción',
      }),
    ]
    expect(buscarEscuelas(items, 'goya').map((item) => item.cueAnexo)).toEqual(['A1'])
    expect(buscarEscuelas(items, 'concepcion').map((item) => item.cueAnexo)).toEqual(['A2'])
  })

  it('limita el resultado a `limite`', () => {
    const items = [
      make({ cueAnexo: 'B1', nombre: 'Escuela Alfa' }),
      make({ cueAnexo: 'B2', nombre: 'Escuela Beta' }),
      make({ cueAnexo: 'B3', nombre: 'Escuela Gamma' }),
    ]
    const resultado = buscarEscuelas(items, 'escuela', 2)
    expect(resultado).toHaveLength(2)
  })

  it('es insensible a mayúsculas y tildes', () => {
    const items = [make({ nombre: 'Escuela Concepción' })]
    const resultado = buscarEscuelas(items, 'concepcion')
    expect(resultado).toHaveLength(1)
    expect(resultado[0].nombre).toBe('Escuela Concepción')
  })

  it('rankea la palabra exacta "belgrano" antes que el substring en una palabra más larga', () => {
    const items = [
      make({ cueAnexo: 'X1', nombre: 'ESCUELA BELGRANOVILLE' }),
      make({ cueAnexo: 'X2', nombre: 'ESCUELA N° 580 GENERAL MANUEL BELGRANO' }),
    ]
    const resultado = buscarEscuelas(items, 'belgrano')
    expect(resultado[0].nombre).toBe('ESCUELA N° 580 GENERAL MANUEL BELGRANO')
  })

  it('matchea por prefijo de palabra aunque la palabra no sea igual a la query', () => {
    const items = [make({ cueAnexo: 'X3', nombre: 'ESCUELA N° 580 GENERAL MANUEL BELGRANO' })]
    const resultado = buscarEscuelas(items, 'belg')
    expect(resultado).toHaveLength(1)
    expect(resultado[0].cueAnexo).toBe('X3')
  })

  it('rankea CUE exacto por encima de un nombre con esa misma palabra', () => {
    const items = [
      make({ cueAnexo: 'ABC123', nombre: 'ESCUELA GENERAL BELGRANO' }),
      make({ cueAnexo: 'ZZZ', nombre: 'ESCUELA ABC123' }),
    ]
    const resultado = buscarEscuelas(items, 'abc123')
    expect(resultado[0].cueAnexo).toBe('ABC123')
  })

  it('encuentra nombres con Ñ y tildes buscando sin diacríticos', () => {
    const items = [
      make({ cueAnexo: 'N1', nombre: 'ESCUELA N° 12 BERNARDINO RIVADAVIA - NIÑEZ' }),
      make({ cueAnexo: 'N2', nombre: 'ESCUELA CONCEPCIÓN' }),
    ]
    expect(buscarEscuelas(items, 'nin').map((item) => item.cueAnexo)).toEqual(['N1'])
    expect(buscarEscuelas(items, 'concepcion').map((item) => item.cueAnexo)).toEqual(['N2'])
  })

  it('es consistente en dos llamadas seguidas con el mismo array', () => {
    const items = [
      make({ cueAnexo: 'C170', nombre: 'Escuela N° 170' }),
      make({ cueAnexo: 'C17', nombre: 'Escuela N° 17' }),
    ]
    const primera = buscarEscuelas(items, '17').map((item) => item.cueAnexo)
    const segunda = buscarEscuelas(items, '17').map((item) => item.cueAnexo)
    expect(segunda).toEqual(primera)
    expect(segunda).toEqual(['C17', 'C170'])
  })
})
