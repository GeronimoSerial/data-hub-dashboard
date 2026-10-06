import { describe, expect, it } from 'vitest'
import { errorVigencia, etiquetaVigencia, MENSAJE_HORA_FUTURA, resolverVigencia, resumenVigencia } from './vigencia-eleccion'
import { MENSAJE_FUERA_DE_RANGO_VIGENCIA } from './vigencia-rango'

// 2026-10-04 15:00 en Argentina (UTC-3)
const AHORA = new Date('2026-10-04T18:00:00.000Z')

describe('resolverVigencia', () => {
  it('"ahora" resuelve al instante recibido', () => {
    expect(resolverVigencia({ modo: 'ahora' }, AHORA)).toBe(AHORA.toISOString())
  })
  it('"hoy" combina la fecha de hoy con la hora local elegida', () => {
    const iso = resolverVigencia({ modo: 'hoy', hora: '08:30' }, AHORA)
    const d = new Date(iso!)
    expect(d.getHours()).toBe(8)
    expect(d.getMinutes()).toBe(30)
    expect(d.getDate()).toBe(AHORA.getDate())
  })
  it('"hoy" con una hora futura es inválido', () => {
    const futura = new Date(AHORA.getTime() + 60 * 60 * 1000)
    const hora = `${String(futura.getHours()).padStart(2, '0')}:${String(futura.getMinutes()).padStart(2, '0')}`
    expect(resolverVigencia({ modo: 'hoy', hora }, AHORA)).toBeNull()
    expect(errorVigencia({ modo: 'hoy', hora }, AHORA)).toBe(MENSAJE_HORA_FUTURA)
  })
  it('"otro" fuera de la ventana de 12 meses es inválido', () => {
    const eleccion = { modo: 'otro' as const, fecha: '2025-09-01', hora: '10:00' }
    expect(resolverVigencia(eleccion, AHORA)).toBeNull()
    expect(errorVigencia(eleccion, AHORA)).toBe(MENSAJE_FUERA_DE_RANGO_VIGENCIA)
  })
  it('una elección incompleta es inválida', () => {
    expect(resolverVigencia({ modo: 'otro', fecha: '', hora: '10:00' }, AHORA)).toBeNull()
    expect(resolverVigencia({ modo: 'hoy', hora: '' }, AHORA)).toBeNull()
  })
})

describe('resumenVigencia', () => {
  it('describe cada modo en lenguaje llano', () => {
    expect(resumenVigencia({ modo: 'ahora' })).toBe('Desde ahora')
    expect(resumenVigencia({ modo: 'hoy', hora: '08:30' })).toBe('Desde hoy a las 08:30')
    expect(resumenVigencia({ modo: 'otro', fecha: '2026-10-02', hora: '08:30' })).toBe('Desde el vie 02/10 a las 08:30')
  })
})

describe('etiquetaVigencia', () => {
  it('depende de la categoría', () => {
    expect(etiquetaVigencia('establecimiento')).toBe('¿Desde cuándo ocurre?')
    expect(etiquetaVigencia('alumnos')).toBe('¿Desde cuándo no pueden llegar?')
    expect(etiquetaVigencia('')).toBe('¿Desde cuándo ocurre?')
  })
})
