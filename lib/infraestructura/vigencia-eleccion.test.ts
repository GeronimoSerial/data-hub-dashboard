import { describe, expect, it } from 'vitest'
import { errorVigencia, etiquetaVigencia, MENSAJE_HORA_FUTURA, resolverVigencia, resumenVigencia } from './vigencia-eleccion'
import { MENSAJE_FUERA_DE_RANGO_VIGENCIA } from './vigencia-rango'

// 2026-10-04 15:00 en Argentina (UTC-3)
const AHORA = new Date('2026-10-04T18:00:00.000Z')

// 2026-10-17 23:30 en Buenos Aires: en UTC ya es el 18.
const CERCA_DE_MEDIANOCHE_BA = new Date('2026-10-18T02:30:00.000Z')

// El servidor no puede depender de la zona del proceso: se corre el cálculo
// con otra zona y se restaura la original.
function conZonaDelProceso<T>(zona: string, fn: () => T): T {
  const previa = process.env.TZ
  process.env.TZ = zona
  try {
    return fn()
  } finally {
    if (previa === undefined) delete process.env.TZ
    else process.env.TZ = previa
  }
}

describe('resolverVigencia', () => {
  it('"ahora" resuelve al instante recibido', () => {
    expect(resolverVigencia({ modo: 'ahora' }, AHORA)).toBe(AHORA.toISOString())
  })
  it('"hoy" combina la fecha de hoy con la hora de Buenos Aires elegida', () => {
    expect(resolverVigencia({ modo: 'hoy', hora: '08:30' }, AHORA)).toBe('2026-10-04T11:30:00.000Z')
  })
  it('"hoy" con una hora futura es inválido', () => {
    expect(resolverVigencia({ modo: 'hoy', hora: '16:00' }, AHORA)).toBeNull()
    expect(errorVigencia({ modo: 'hoy', hora: '16:00' }, AHORA)).toBe(MENSAJE_HORA_FUTURA)
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
  it('"hoy" usa el día de Buenos Aires aunque el proceso esté en UTC', () => {
    const iso = conZonaDelProceso('UTC', () => resolverVigencia({ modo: 'hoy', hora: '23:00' }, CERCA_DE_MEDIANOCHE_BA))
    expect(iso).toBe('2026-10-18T02:00:00.000Z')
  })
  it('"otro" combina fecha y hora de Buenos Aires aunque el proceso esté en UTC', () => {
    const iso = conZonaDelProceso('UTC', () =>
      resolverVigencia({ modo: 'otro', fecha: '2026-10-17', hora: '23:00' }, CERCA_DE_MEDIANOCHE_BA),
    )
    expect(iso).toBe('2026-10-18T02:00:00.000Z')
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
