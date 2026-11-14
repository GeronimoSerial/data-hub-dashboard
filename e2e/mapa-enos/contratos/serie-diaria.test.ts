import { describe, expect, it } from 'vitest'
import { proyectarSerieDiaria } from './serie-diaria'

function serie(desde: string, hasta: string, valorDe: (fecha: string) => number = () => 0) {
  const puntos: Array<{ fecha: string; escuelas: number }> = []
  for (let ms = Date.parse(desde); ms <= Date.parse(hasta); ms += 86_400_000) {
    const fecha = new Date(ms).toISOString().slice(0, 10)
    puntos.push({ fecha, escuelas: valorDe(fecha) })
  }
  return puntos
}

describe('proyectarSerieDiaria', () => {
  it('gives the same projection on two different days for the same data', () => {
    const el12 = proyectarSerieDiaria(serie('2026-01-01', '2026-11-12'), new Date('2026-11-12T10:00:00Z'))
    const el20 = proyectarSerieDiaria(serie('2026-01-01', '2026-11-20'), new Date('2026-11-20T10:00:00Z'))
    expect(el20).toEqual(el12)
    expect(el12).toEqual([{ valores: { escuelas: 0 }, dias: 'hasta-hoy' }])
  })

  it('keeps every value and the exact length of the closed runs', () => {
    const puntos = serie('2026-11-01', '2026-11-10', (f) => (f >= '2026-11-04' && f <= '2026-11-06' ? 3 : 0))
    expect(proyectarSerieDiaria(puntos, new Date('2026-11-10T00:00:00Z'))).toEqual([
      { valores: { escuelas: 0 }, dias: 3 },
      { valores: { escuelas: 3 }, dias: 3 },
      { valores: { escuelas: 0 }, dias: 'hasta-hoy' },
    ])
  })

  it('rejects a gap, an empty series and a series that does not end today', () => {
    const hoy = new Date('2026-11-10T12:00:00Z')
    const conHueco = serie('2026-11-01', '2026-11-10').filter((p) => p.fecha !== '2026-11-05')
    expect(() => proyectarSerieDiaria(conHueco, hoy)).toThrow(/consecutivos/)
    expect(() => proyectarSerieDiaria([], hoy)).toThrow(/vacia/)
    expect(() => proyectarSerieDiaria(serie('2026-11-01', '2026-11-07'), hoy)).toThrow(/no es hoy/)
  })
})
