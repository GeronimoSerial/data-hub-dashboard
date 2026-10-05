import { describe, expect, it } from 'vitest'
import type { EscuelaMapaEnriquecida } from './tipos'
import { iconoPunto, radioPunto } from './punto'

function escuela(overrides: Partial<EscuelaMapaEnriquecida> = {}): EscuelaMapaEnriquecida {
  return {
    cueAnexo: '1800001',
    nombre: 'Escuela de prueba',
    departamento: 'Capital',
    localidad: 'Corrientes',
    lat: -27.46,
    lon: -58.83,
    niveles: [],
    alumnos: 0,
    gravedad: 0,
    categoriaPrincipal: null,
    clases: 'normal',
    apoyo: null,
    sinActualizar: false,
    ultimaNovedad: null,
    alumnosSinClases: 0,
    ...overrides,
  }
}

describe('iconoPunto', () => {
  it.each([
    { nombre: 'evacuado prevalece sobre sin actualizar', entrada: escuela({ clases: 'evacuado', sinActualizar: true }), esperado: 'evacuado' },
    { nombre: 'centro de evacuados', entrada: escuela({ clases: 'centro' }), esperado: 'centro' },
    { nombre: 'sin clases', entrada: escuela({ clases: 'sin' }), esperado: 'sin' },
    { nombre: 'clases parciales', entrada: escuela({ clases: 'parcial' }), esperado: 'parcial' },
    { nombre: 'normal y sin actualizar', entrada: escuela({ sinActualizar: true }), esperado: 'reloj' },
    { nombre: 'normal', entrada: escuela(), esperado: null },
  ])('$nombre', ({ entrada, esperado }) => {
    expect(iconoPunto(entrada)).toBe(esperado)
  })
})

describe('radioPunto', () => {
  it('usa un punto menor para gravedad 0', () => {
    expect(radioPunto(0)).toBeLessThan(radioPunto(1))
  })
})
