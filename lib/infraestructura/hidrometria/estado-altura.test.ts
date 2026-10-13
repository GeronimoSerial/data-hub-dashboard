import { describe, expect, it } from 'vitest'
import { estadoAltura, type LecturaParaEstado } from './estado-altura'

function lectura(overrides: Partial<LecturaParaEstado> = {}): LecturaParaEstado {
  return {
    lecturaM: 3,
    variacionM: 0,
    alertaM: 5,
    evacuacionM: 6,
    inconsistente: false,
    ...overrides,
  }
}

describe('estadoAltura', () => {
  it('devuelve sin_dato cuando no hay lectura', () => {
    expect(estadoAltura(null)).toEqual({ estado: 'sin_dato', tendencia: 'sin_dato' })
  })

  it('devuelve sin_dato cuando lecturaM es nula', () => {
    expect(estadoAltura(lectura({ lecturaM: null })).estado).toBe('sin_dato')
  })

  it('devuelve sin_dato cuando la lectura es inconsistente', () => {
    expect(estadoAltura(lectura({ inconsistente: true, lecturaM: 9 })).estado).toBe('sin_dato')
  })

  it('devuelve evacuacion cuando lecturaM alcanza evacuacionM', () => {
    expect(estadoAltura(lectura({ lecturaM: 6 })).estado).toBe('evacuacion')
    expect(estadoAltura(lectura({ lecturaM: 6.5 })).estado).toBe('evacuacion')
  })

  it('devuelve alerta cuando lecturaM alcanza alertaM pero no evacuacionM', () => {
    expect(estadoAltura(lectura({ lecturaM: 5 })).estado).toBe('alerta')
    expect(estadoAltura(lectura({ lecturaM: 5.9 })).estado).toBe('alerta')
  })

  it('devuelve normal cuando está bajo los umbrales disponibles', () => {
    expect(estadoAltura(lectura({ lecturaM: 4.99 })).estado).toBe('normal')
  })

  it('usa normal con un solo umbral disponible', () => {
    expect(estadoAltura(lectura({ lecturaM: 2, alertaM: null })).estado).toBe('normal')
    expect(estadoAltura(lectura({ lecturaM: 2, evacuacionM: null })).estado).toBe('normal')
  })

  it('devuelve evacuacion con sólo evacuacionM disponible y lectura por encima', () => {
    expect(estadoAltura(lectura({ lecturaM: 7, alertaM: null })).estado).toBe('evacuacion')
  })

  it('devuelve sin_dato cuando no hay ningún umbral: nunca afirma normal', () => {
    expect(
      estadoAltura(lectura({ lecturaM: 2, alertaM: null, evacuacionM: null })).estado,
    ).toBe('sin_dato')
  })

  it.each([
    [0.01, 'crece'],
    [0.006, 'crece'],
    [-0.01, 'baja'],
    [-0.006, 'baja'],
    [0.005, 'estable'],
    [-0.005, 'estable'],
    [0, 'estable'],
  ] as const)('variacionM %s produce tendencia %s', (variacionM, tendencia) => {
    expect(estadoAltura(lectura({ variacionM })).tendencia).toBe(tendencia)
  })

  it('devuelve tendencia sin_dato cuando variacionM es nula', () => {
    expect(estadoAltura(lectura({ variacionM: null })).tendencia).toBe('sin_dato')
  })
})
