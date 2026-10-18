import { describe, expect, it } from 'vitest'
import type { AislamientoEscuelaMapa } from '@/lib/infraestructura/territorio-mapa'
import { detalleAislamiento, ordenarAisladas, resumenAisladas } from './escuelas-aisladas'

function dato(over: Partial<AislamientoEscuelaMapa> = {}): AislamientoEscuelaMapa {
  return {
    nivel: 3, cruces: null, conPuente: null, sinPuente: null, alternativaSinCruce: null,
    distanciaLocalidadM: null, kmSinPavimentar: null, distanciaViaPavimentadaM: null, destinoNombre: null,
    ...over,
  }
}

describe('detalleAislamiento', () => {
  it('arma la línea con todas las partes disponibles', () => {
    expect(detalleAislamiento(dato({ distanciaLocalidadM: 42_300, destinoNombre: 'Goya', kmSinPavimentar: 18.2, sinPuente: 2, alternativaSinCruce: false })))
      .toBe('42 km hasta Goya · 18 km de tierra · 2 vados sin puente · sin alternativa')
  })
  it('omite partes sin dato o en cero y usa singular', () => {
    expect(detalleAislamiento(dato({ distanciaLocalidadM: 12_000, kmSinPavimentar: 0, sinPuente: 1, alternativaSinCruce: true })))
      .toBe('12 km hasta una localidad urbana · 1 vado sin puente')
    expect(detalleAislamiento(dato())).toBe('')
  })
})

describe('ordenarAisladas', () => {
  const items = [
    { cueAnexo: 'a', nombre: 'A', dato: dato({ distanciaLocalidadM: 10_000, kmSinPavimentar: 9, sinPuente: 0 }) },
    { cueAnexo: 'b', nombre: 'B', dato: dato({ distanciaLocalidadM: 40_000, kmSinPavimentar: 1, sinPuente: 1 }) },
    { cueAnexo: 'c', nombre: 'C', dato: dato({ distanciaLocalidadM: null, kmSinPavimentar: null, sinPuente: 3 }) },
  ]
  it('ordena por distancia, km de tierra o vados; nulos al final', () => {
    expect(ordenarAisladas(items, 'distancia').map((i) => i.cueAnexo)).toEqual(['b', 'a', 'c'])
    expect(ordenarAisladas(items, 'tierra').map((i) => i.cueAnexo)).toEqual(['a', 'b', 'c'])
    expect(ordenarAisladas(items, 'vados').map((i) => i.cueAnexo)).toEqual(['c', 'b', 'a'])
  })
})

describe('resumenAisladas', () => {
  it('cuenta escuelas, alumnos, lejanas y sin alternativa', () => {
    expect(resumenAisladas([
      { alumnos: 10, dato: dato({ distanciaLocalidadM: 31_000, alternativaSinCruce: false }) },
      { alumnos: 5, dato: dato({ distanciaLocalidadM: 30_000, alternativaSinCruce: null }) },
    ])).toEqual({ escuelas: 2, alumnos: 15, lejanas: 1, sinAlternativa: 1 })
  })
})
