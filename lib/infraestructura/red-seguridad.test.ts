import { describe, expect, it } from 'vitest'
import { evaluarRedesSeguridad } from './red-seguridad'

const base = { categoria: 'alumnos' as const, alumnosMarcados: 0, matricula: 100, seccionesMarcadas: 0, seccionesTotales: 4, alcanceEstablecimiento: '' as const }

describe('evaluarRedesSeguridad', () => {
  it('no sugiere cambiar de categoría aunque la mayoría no pueda acceder', () => {
    expect(evaluarRedesSeguridad({ ...base, alumnosMarcados: 51 })).toEqual([])
    expect(evaluarRedesSeguridad({ ...base, alumnosMarcados: 100 })).toEqual([])
    expect(evaluarRedesSeguridad({ ...base, alumnosMarcados: 50 })).toEqual([])
  })
  it('avisa cuando en establecimiento se marcaron todas las secciones a mano', () => {
    const avisos = evaluarRedesSeguridad({ ...base, categoria: 'establecimiento', alcanceEstablecimiento: 'algunas', seccionesMarcadas: 4 })
    expect(avisos.map((a) => a.id)).toEqual(['todas-las-secciones'])
    expect(avisos[0].accion.tipo).toBe('marcar-toda-la-escuela')
  })
  it('no avisa con "toda la escuela" ni con matrícula cero', () => {
    expect(evaluarRedesSeguridad({ ...base, categoria: 'establecimiento', alcanceEstablecimiento: 'toda', seccionesMarcadas: 4 })).toEqual([])
    expect(evaluarRedesSeguridad({ ...base, matricula: 0, alumnosMarcados: 0 })).toEqual([])
  })
})
