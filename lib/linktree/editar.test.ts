import { describe, expect, it } from 'vitest'
import { CONFIG_INICIAL, type LinktreeConfig, type LinktreeEnlace } from './config'
import {
  agregarGrupo,
  alternarVisible,
  eliminarEnlace,
  eliminarGrupo,
  guardarEnlace,
  moverEnlace,
  moverGrupo,
  renombrarGrupo,
  totalEnlaces,
} from './editar'

function enlace(id: string, parche: Partial<LinktreeEnlace> = {}): LinktreeEnlace {
  return { id, titulo: `Enlace ${id}`, descripcion: '', url: `https://${id}.mec.gob.ar`, icono: null, visible: true, ...parche }
}

const base: LinktreeConfig = {
  ...CONFIG_INICIAL,
  grupos: [
    { id: 'g1', titulo: 'Datos', enlaces: [enlace('a'), enlace('b'), enlace('c')] },
    { id: 'g2', titulo: 'Gestión', enlaces: [enlace('d')] },
  ],
}

const ids = (config: LinktreeConfig, grupo: number) => config.grupos[grupo].enlaces.map((e) => e.id)

describe('edición de grupos', () => {
  it('agrega un grupo vacío al final sin tocar el original', () => {
    const siguiente = agregarGrupo(base, 'g3', 'Soporte')
    expect(siguiente.grupos.map((g) => g.id)).toEqual(['g1', 'g2', 'g3'])
    expect(siguiente.grupos[2]).toEqual({ id: 'g3', titulo: 'Soporte', enlaces: [] })
    expect(base.grupos).toHaveLength(2)
  })

  it('renombra solo el grupo indicado', () => {
    const siguiente = renombrarGrupo(base, 'g2', 'Administración')
    expect(siguiente.grupos.map((g) => g.titulo)).toEqual(['Datos', 'Administración'])
  })

  it('elimina un grupo con todos sus enlaces', () => {
    const siguiente = eliminarGrupo(base, 'g1')
    expect(siguiente.grupos.map((g) => g.id)).toEqual(['g2'])
    expect(totalEnlaces(siguiente)).toBe(1)
  })

  it('mueve un grupo y no hace nada en los extremos', () => {
    expect(moverGrupo(base, 'g2', -1).grupos.map((g) => g.id)).toEqual(['g2', 'g1'])
    expect(moverGrupo(base, 'g1', 1).grupos.map((g) => g.id)).toEqual(['g2', 'g1'])
    expect(moverGrupo(base, 'g1', -1)).toBe(base)
    expect(moverGrupo(base, 'g2', 1)).toBe(base)
  })
})

describe('edición de enlaces', () => {
  it('agrega un enlace nuevo al final del grupo elegido', () => {
    const siguiente = guardarEnlace(base, 'g2', enlace('e'))
    expect(ids(siguiente, 1)).toEqual(['d', 'e'])
    expect(ids(base, 1)).toEqual(['d'])
  })

  it('actualiza un enlace existente conservando su posición en el mismo grupo', () => {
    const siguiente = guardarEnlace(base, 'g1', enlace('b', { titulo: 'Nuevo título' }))
    expect(ids(siguiente, 0)).toEqual(['a', 'b', 'c'])
    expect(siguiente.grupos[0].enlaces[1].titulo).toBe('Nuevo título')
  })

  it('mueve el enlace al final del otro grupo cuando cambia de grupo', () => {
    const siguiente = guardarEnlace(base, 'g2', enlace('b'))
    expect(ids(siguiente, 0)).toEqual(['a', 'c'])
    expect(ids(siguiente, 1)).toEqual(['d', 'b'])
  })

  it('elimina un enlace en cualquier grupo', () => {
    const siguiente = eliminarEnlace(base, 'd')
    expect(ids(siguiente, 1)).toEqual([])
    expect(totalEnlaces(siguiente)).toBe(3)
  })

  it('mueve un enlace dentro de su grupo y no hace nada en los extremos', () => {
    expect(ids(moverEnlace(base, 'c', -1), 0)).toEqual(['a', 'c', 'b'])
    expect(ids(moverEnlace(base, 'a', 1), 0)).toEqual(['b', 'a', 'c'])
    expect(moverEnlace(base, 'a', -1)).toBe(base)
    expect(moverEnlace(base, 'c', 1)).toBe(base)
  })

  it('no cruza enlaces entre grupos al mover', () => {
    expect(moverEnlace(base, 'd', -1)).toBe(base)
    expect(moverEnlace(base, 'd', 1)).toBe(base)
  })

  it('alterna la visibilidad de un enlace', () => {
    const siguiente = alternarVisible(base, 'a', false)
    expect(siguiente.grupos[0].enlaces[0].visible).toBe(false)
    expect(siguiente.grupos[0].enlaces[1].visible).toBe(true)
  })
})
