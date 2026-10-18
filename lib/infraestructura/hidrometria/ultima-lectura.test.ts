import { describe, expect, it } from 'vitest'
import { distanciaAUmbral, estadoUltimaLectura, variacionEnVentana } from './ultima-lectura'

const AHORA = new Date('2026-10-17T12:00:00Z')
const base = { lecturaM: 3, variacionM: 0.1, alertaM: 4, evacuacionM: 5, inconsistente: false }

describe('estadoUltimaLectura', () => {
  it('keeps the level state of a stale reading and reports its age', () => {
    const r = estadoUltimaLectura({ ...base, lecturaM: 4.2, medidaEn: '2026-10-16T10:00:00Z' }, AHORA)
    expect(r).toEqual({ estado: 'alerta', horasDesdeLectura: 26, vencida: true })
  })
  it('is current within 18 h', () => {
    const r = estadoUltimaLectura({ ...base, medidaEn: '2026-10-17T06:00:00Z' }, AHORA)
    expect(r).toEqual({ estado: 'normal', horasDesdeLectura: 6, vencida: false })
  })
  it('is sin_dato only without a reading', () => {
    expect(estadoUltimaLectura(null, AHORA)).toEqual({ estado: 'sin_dato', horasDesdeLectura: null, vencida: false })
  })
  it('stays sin_dato for an inconsistent reading', () => {
    const r = estadoUltimaLectura({ ...base, inconsistente: true, medidaEn: '2026-10-16T10:00:00Z' }, AHORA)
    expect(r.estado).toBe('sin_dato')
  })
})

describe('variacionEnVentana', () => {
  const serie = [
    { medidaEn: '2026-10-14T12:00:00Z', lecturaM: 2 },
    { medidaEn: '2026-10-16T12:00:00Z', lecturaM: 2.5 },
    { medidaEn: '2026-10-17T12:00:00Z', lecturaM: 3 },
  ]
  it('compares the last point with the closest point at or before the window start', () => {
    expect(variacionEnVentana(serie, 24)).toEqual({ deltaM: 0.5, porcentaje: 20 })
    expect(variacionEnVentana(serie, 72)).toEqual({ deltaM: 1, porcentaje: 50 })
  })
  it('returns null when the series does not reach back far enough', () => {
    expect(variacionEnVentana(serie, 24 * 5)).toBeNull()
  })
  it('skips points without a level and avoids dividing by zero', () => {
    expect(variacionEnVentana([{ medidaEn: '2026-10-16T12:00:00Z', lecturaM: 0 }, { medidaEn: '2026-10-17T12:00:00Z', lecturaM: 1 }], 24))
      .toEqual({ deltaM: 1, porcentaje: null })
    expect(variacionEnVentana([{ medidaEn: '2026-10-17T12:00:00Z', lecturaM: null }], 24)).toBeNull()
  })
})

describe('distanciaAUmbral', () => {
  it('is positive while below the threshold and null without one', () => {
    expect(distanciaAUmbral(3, 4)).toBeCloseTo(1)
    expect(distanciaAUmbral(4.5, 4)).toBeCloseTo(-0.5)
    expect(distanciaAUmbral(3, null)).toBeNull()
  })
})
