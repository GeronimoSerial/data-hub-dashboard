import { describe, expect, it } from 'vitest'
import { calendarioBA, instanteBA } from './zona-horaria'

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

describe('calendarioBA', () => {
  it('lee el día de Buenos Aires, no el de UTC, cerca de medianoche', () => {
    // 2026-10-18 02:30 UTC = 2026-10-17 23:30 en Buenos Aires
    const cal = conZonaDelProceso('UTC', () => calendarioBA(new Date('2026-10-18T02:30:00.000Z')))
    expect(cal).toEqual({ año: 2026, mes: 10, dia: 17, diaSemana: 6 })
  })

  it('cambia de día a las 00:00 de Buenos Aires (03:00 UTC)', () => {
    const cal = conZonaDelProceso('UTC', () => calendarioBA(new Date('2026-10-18T03:00:00.000Z')))
    expect(cal.dia).toBe(18)
  })
})

describe('instanteBA', () => {
  it('convierte un reloj de Buenos Aires a instante, sin depender de la zona del proceso', () => {
    const iso = conZonaDelProceso('Asia/Tokyo', () => instanteBA(2026, 10, 17, 23, 30).toISOString())
    expect(iso).toBe('2026-10-18T02:30:00.000Z')
  })
})
