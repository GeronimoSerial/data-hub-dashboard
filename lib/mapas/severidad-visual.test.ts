import { describe, expect, it } from 'vitest'
import { iconoEstadoEscuela, rangoSeveridad } from './severidad-visual'

describe('rangoSeveridad', () => {
  it('respeta el orden de severidad usado en los clusters', () => {
    expect(['Baja', 'Media', 'Alta', 'Crítica'].map(rangoSeveridad)).toEqual([0, 1, 2, 3])
  })

  it('trata un valor desconocido como la severidad más baja', () => {
    expect(rangoSeveridad('Desconocida')).toBe(0)
  })
})

describe('iconoEstadoEscuela', () => {
  const base = {
    estadoEstablecimiento: 'habitual',
    servicio: 'normal',
    sinActualizar: false,
  }

  it('mapea cada condición a su ícono lucide', () => {
    expect(iconoEstadoEscuela({ ...base, estadoEstablecimiento: 'centro_evacuados' })).toBe('Tent')
    expect(iconoEstadoEscuela({ ...base, estadoEstablecimiento: 'evacuado' })).toBe('DoorOpen')
    expect(iconoEstadoEscuela({ ...base, estadoEstablecimiento: 'parcial' })).toBe('Building')
    expect(iconoEstadoEscuela({ ...base, servicio: 'suspendido' })).toBe('CircleSlash')
    expect(iconoEstadoEscuela({ ...base, servicio: 'parcial' })).toBe('TriangleAlert')
    expect(iconoEstadoEscuela({ ...base, sinActualizar: true })).toBe('CircleHelp')
  })

  it('no devuelve badge para una escuela normal que reporta', () => {
    expect(iconoEstadoEscuela(base)).toBeNull()
  })

  it('respeta el orden de prioridad cuando se cumple más de una condición', () => {
    // centro_evacuados gana sobre evacuado, servicio y sin actualizar.
    expect(
      iconoEstadoEscuela({
        estadoEstablecimiento: 'centro_evacuados',
        servicio: 'suspendido',
        sinActualizar: true,
      }),
    ).toBe('Tent')
    // evacuado gana sobre servicio y sin actualizar.
    expect(
      iconoEstadoEscuela({ estadoEstablecimiento: 'evacuado', servicio: 'suspendido', sinActualizar: true }),
    ).toBe('DoorOpen')
    // suspendido gana sobre parcial y sin actualizar.
    expect(iconoEstadoEscuela({ ...base, servicio: 'suspendido', sinActualizar: true })).toBe('CircleSlash')
    // parcial gana sobre sin actualizar.
    expect(iconoEstadoEscuela({ ...base, servicio: 'parcial', sinActualizar: true })).toBe('TriangleAlert')
  })

  it('trata un valor desconocido como "sin condición" salvo el flag de sin actualizar', () => {
    expect(iconoEstadoEscuela({ ...base, estadoEstablecimiento: 'raro', servicio: 'raro' })).toBeNull()
    expect(iconoEstadoEscuela({ ...base, estadoEstablecimiento: 'raro', servicio: 'raro', sinActualizar: true })).toBe('CircleHelp')
  })
})
