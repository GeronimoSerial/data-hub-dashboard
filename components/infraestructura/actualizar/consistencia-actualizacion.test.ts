import { describe, expect, it } from 'vitest'
import { alcanceDeSecciones } from '@/lib/infraestructura/consistencia-parte'
import { alcanceDe, mensajesDeBloqueo, respuestasDeSituacion } from './consistencia-actualizacion'

const ESCUELA = [10, 20, 30]

describe('alcanceDe', () => {
  it('coincide con el alcance del módulo común en todos los casos', () => {
    const casos = [undefined, [], [10], [10, 20], [30, 10, 20], [10, 20, 30, 40]]
    for (const secciones of casos) {
      expect(alcanceDe(secciones, ESCUELA), JSON.stringify(secciones)).toEqual(
        alcanceDeSecciones(secciones ?? [], ESCUELA),
      )
    }
  })

  it('es toda la escuela sólo cuando cubre todas las secciones', () => {
    expect(alcanceDe([20, 30, 10], ESCUELA)).toEqual({ tipo: 'toda' })
    expect(alcanceDe([10, 20], ESCUELA)).toEqual({ tipo: 'algunas', secciones: 2 })
  })
})

describe('mensajesDeBloqueo', () => {
  const otroSinDescripcion = respuestasDeSituacion({
    categoria: 'establecimiento',
    motivoId: 'otro-establecimiento',
    severidad: 'Media',
    alcance: null,
    clases: null,
    edificio: null,
  })

  it('exige la descripción sólo en situaciones nuevas', () => {
    expect(mensajesDeBloqueo(otroSinDescripcion, { descripcion: true })).toHaveLength(1)
    expect(mensajesDeBloqueo(otroSinDescripcion, { descripcion: false })).toEqual([])
  })
})
