import { describe, expect, it } from 'vitest'
import { SEVERIDAD_CRITERIOS, SEVERIDAD_CRITERIOS_POR_CATEGORIA, criterioSeveridad } from './severidad'

describe('criterios por categoría', () => {
  it('alumnos tiene criterios propios centrados en poder llegar', () => {
    expect(SEVERIDAD_CRITERIOS_POR_CATEGORIA.alumnos.Crítica).toBe(
      'Llegar implica riesgo para los alumnos (cruzar un arroyo crecido, un camino anegado).',
    )
    expect(criterioSeveridad('Baja', 'alumnos')).toBe('Llegan con demora o dificultad, pero asisten.')
  })

  it('establecimiento conserva los criterios acordados y es el default', () => {
    expect(SEVERIDAD_CRITERIOS).toBe(SEVERIDAD_CRITERIOS_POR_CATEGORIA.establecimiento)
    expect(criterioSeveridad('Crítica')).toBe('Impide el funcionamiento o hay riesgo para las personas.')
  })

  it('devuelve null para una gravedad desconocida', () => {
    expect(criterioSeveridad('Gravísima', 'alumnos')).toBeNull()
  })
})
