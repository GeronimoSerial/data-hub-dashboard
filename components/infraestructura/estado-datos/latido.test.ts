import { describe, expect, it } from 'vitest'
import { construirLatido, trazoLatido } from './latido'

const AHORA = '2026-09-27T12:00:00.000Z'
const hace = (horas: number) => new Date(Date.parse(AHORA) - horas * 3_600_000).toISOString()

describe('construirLatido', () => {
  it('cada corrida completada es un latido ubicado en la ventana de 72 h', () => {
    const l = construirLatido({
      corridas: [{ en: hace(72), ok: true }, { en: hace(36), ok: true }, { en: hace(0), ok: true }],
      ahora: AHORA, ultimoExitoEn: hace(0), intervaloMinutos: 36 * 60,
    })
    expect(l.marcas.map((m) => [m.tipo, Math.round(m.pos * 100) / 100])).toEqual([['latido', 0], ['latido', 0.5], ['latido', 1]])
    expect(l.completadas).toBe(3)
  })

  it('una corrida fallida es una muesca, no un latido', () => {
    const l = construirLatido({
      corridas: [{ en: hace(10), ok: true }, { en: hace(5), ok: false }],
      ahora: AHORA, ultimoExitoEn: hace(10), intervaloMinutos: 360,
    })
    expect(l.marcas.map((m) => m.tipo)).toEqual(['latido', 'falla'])
    expect(l.fallidas).toBe(1)
  })

  it('ignora corridas fuera de la ventana', () => {
    const l = construirLatido({
      corridas: [{ en: hace(100), ok: true }],
      ahora: AHORA, ultimoExitoEn: hace(100), intervaloMinutos: 360,
    })
    expect(l.marcas).toEqual([])
  })

  it('viva: latidos sin huecos mayores a dos intervalos', () => {
    const corridas = [60, 54, 48, 42, 36, 30, 24, 18, 12, 6, 1].map((h) => ({ en: hace(h), ok: true }))
    const l = construirLatido({ corridas, ahora: AHORA, ultimoExitoEn: hace(1), intervaloMinutos: 360 })
    expect(l.etiqueta).toEqual({ clave: 'viva' })
  })

  it('intermitente: hay latidos pero con un hueco mayor a dos intervalos', () => {
    const corridas = [{ en: hace(70), ok: true }, { en: hace(66), ok: true }, { en: hace(2), ok: true }]
    const l = construirLatido({ corridas, ahora: AHORA, ultimoExitoEn: hace(2), intervaloMinutos: 360 })
    expect(l.etiqueta).toEqual({ clave: 'intermitente' })
  })

  it('sin latido N d: último éxito fuera de la ventana', () => {
    const l = construirLatido({ corridas: [], ahora: AHORA, ultimoExitoEn: hace(28 * 24), intervaloMinutos: 1440 })
    expect(l.etiqueta).toEqual({ clave: 'sinLatido', dias: 28 })
    expect(l.marcas).toEqual([])
  })

  it('nunca corrió: sin corridas ni éxito conocido', () => {
    const l = construirLatido({ corridas: [], ahora: AHORA, ultimoExitoEn: null, intervaloMinutos: 1440 })
    expect(l.etiqueta).toEqual({ clave: 'nunca' })
  })

  it('sin historial de corridas usa el último éxito como único latido', () => {
    const l = construirLatido({ corridas: null, ahora: AHORA, ultimoExitoEn: hace(6), intervaloMinutos: 360 })
    expect(l.marcas.map((m) => m.tipo)).toEqual(['latido'])
    expect(l.completadas).toBe(1)
  })
})

describe('trazoLatido', () => {
  it('línea plana sin marcas', () => {
    const t = trazoLatido([], 144)
    expect(t.latidos).toBe('')
    expect(t.fallas).toBe('')
    expect(t.base).toMatch(/^M0 /)
  })
  it('un latido dibuja un pico y una falla una muesca hacia abajo', () => {
    const t = trazoLatido([{ pos: 0.5, tipo: 'latido' }, { pos: 0.9, tipo: 'falla' }], 144)
    expect(t.latidos).toContain('L')
    expect(t.fallas).toContain('L')
  })
})
