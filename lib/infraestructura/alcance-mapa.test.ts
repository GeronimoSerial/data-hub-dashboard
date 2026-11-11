import { describe, expect, it } from 'vitest'
import { alcanceMapa, filtrosDeAlcance } from './alcance-mapa'

const base = { banned: false, nivelJurIds: [] as number[] }

describe('alcanceMapa', () => {
  it('admin, editor y consulta ven todo (sin cambio de comportamiento)', () => {
    for (const role of ['admin', 'editor', 'consulta'] as const) {
      expect(alcanceMapa({ ...base, role })).toEqual({ tipo: 'todo' })
    }
  })

  it('admin_ge ve todos los niveles, sin ser staff', () => {
    expect(alcanceMapa({ ...base, role: 'admin_ge' })).toEqual({ tipo: 'todo' })
    expect(alcanceMapa({ ...base, role: 'admin_ge', nivelJurIds: [4] })).toEqual({ tipo: 'todo' })
  })

  it('director_nivel ve sólo sus niveles jurisdiccionales', () => {
    expect(alcanceMapa({ ...base, role: 'director_nivel', nivelJurIds: [3, 7] })).toEqual({
      tipo: 'niveles',
      ids: [3, 7],
    })
  })

  it('director_nivel sin niveles asignados no ve nada', () => {
    expect(alcanceMapa({ ...base, role: 'director_nivel', nivelJurIds: [] })).toEqual({ tipo: 'ninguno' })
  })

  it('operador_establecimiento no ve el mapa', () => {
    expect(alcanceMapa({ ...base, role: 'operador_establecimiento', nivelJurIds: [1] })).toEqual({
      tipo: 'ninguno',
    })
  })

  it('usuario baneado o sin sesión no ve nada, aunque sea admin', () => {
    expect(alcanceMapa({ ...base, role: 'admin', banned: true })).toEqual({ tipo: 'ninguno' })
    expect(alcanceMapa(null)).toEqual({ tipo: 'ninguno' })
  })
})

describe('filtrosDeAlcance', () => {
  it('no restringe para todo y limita por niveles para director_nivel', () => {
    expect(filtrosDeAlcance({ tipo: 'todo' })).toEqual({})
    expect(filtrosDeAlcance({ tipo: 'niveles', ids: [2] })).toEqual({ nivelesJurIds: [2] })
  })
})
