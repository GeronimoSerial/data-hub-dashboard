import { describe, expect, it } from 'vitest'
import { pestanaDeMapa, resolverPestana } from './pestanas'

describe('resolverPestana', () => {
  it.each([
    ['#actual', '', 'actual'],
    ['#radar', '', 'radar'],
    ['#planificacion', '', 'planificacion'],
    ['#estadisticas', '', 'estadisticas'],
    ['#capas', '', 'capas'],
    ['#operativa', '', 'actual'],
    ['#evolucion', '', 'estadisticas'],
    ['', '?modo=radar', 'radar'],
    ['#basura', '', 'actual'],
    ['', '', 'actual'],
  ])('hash %s + query %s → %s', (hash, query, esperado) => {
    expect(resolverPestana(hash, query, { radarHabilitado: true })).toBe(esperado)
  })

  it('con el radar apagado, #radar cae en Situación actual', () => {
    expect(resolverPestana('#radar', '', { radarHabilitado: false })).toBe('actual')
  })

  it('con el radar apagado, ?modo=radar cae en Situación actual', () => {
    expect(resolverPestana('', '?modo=radar', { radarHabilitado: false })).toBe('actual')
  })

  it('ignora la sección tras la barra (#metodologia/<id>)', () => {
    expect(resolverPestana('#metodologia/inundacion-ruta-acceso', '', { radarHabilitado: true })).toBe('metodologia')
  })

  it('el hash válido tiene prioridad sobre ?modo=radar', () => {
    expect(resolverPestana('#estadisticas', '?modo=radar', { radarHabilitado: true })).toBe('estadisticas')
  })

  it('ignora nombres heredados de Object.prototype', () => {
    expect(resolverPestana('#constructor', '', { radarHabilitado: true })).toBe('actual')
  })
})

describe('pestanaDeMapa', () => {
  it.each([
    ['capas', 'actual'],
    ['actual', 'actual'],
    ['radar', 'radar'],
    ['planificacion', 'planificacion'],
  ] as const)('%s usa las capas de %s', (panel, mapa) => {
    expect(pestanaDeMapa(panel)).toBe(mapa)
  })
})
