import { describe, expect, it } from 'vitest'
import {
  CEROS_EFECTIVOS_V04,
  alturaCriticaCeroEfectivo,
  cotaAguaCeroEfectivo,
  referenciaNivelEstacion,
} from './referencia-nivel'

// Serie diaria sintética: valor fijo por año en [desde, hasta].
function serie(desde: number, hasta: number, valor: (anio: number) => number) {
  const filas: { fecha: string; valorM: number }[] = []
  for (let anio = desde; anio <= hasta; anio++) {
    for (let d = 0; d < 365; d++) {
      const f = new Date(Date.UTC(anio, 0, 1 + d)).toISOString().slice(0, 10)
      if (f.startsWith(String(anio))) filas.push({ fecha: f, valorM: valor(anio) })
    }
  }
  return filas
}

describe('referenciaNivelEstacion', () => {
  it('mediana de largo plazo 1991–2020: no cambia con el año previo (1,97 m vs 4,79 m)', () => {
    const base = (a: number) => (a % 2 === 0 ? 3 : 4)
    const seca = serie(1991, 2025, (a) => (a >= 2023 ? 1.97 : base(a)))
    const humeda = serie(1991, 2025, (a) => (a >= 2023 ? 4.79 : base(a)))
    const r1 = referenciaNivelEstacion(seca, '2025-12-31')
    const r2 = referenciaNivelEstacion(humeda, '2025-12-31')
    expect(r1.medianaLargoPlazoM).toBe(r2.medianaLargoPlazoM)
    expect(r1.medianaLargoPlazoM).toBe(3.5)
    expect(r1.aniosCompletos).toBe(30)
  })

  it('menos de 10 años completos en la ventana: sin mediana de largo plazo', () => {
    expect(referenciaNivelEstacion(serie(2012, 2025, () => 2), '2025-12-31').medianaLargoPlazoM).toBeNull()
  })

  it('récord histórico = máximo de la serie ≤ asOf', () => {
    const filas = [...serie(1991, 2020, () => 2), { fecha: '1983-06-01', valorM: 13.02 }, { fecha: '2026-11-01', valorM: 20 }]
    const r = referenciaNivelEstacion(filas, '2026-10-18')
    expect(r.record).toEqual({ valorM: 13.02, fecha: '1983-06-01' })
  })

  it('el récord ignora picos espurios de un día (1e12 m en Santo Tomé)', () => {
    const filas = [...serie(1991, 2020, () => 2), { fecha: '2021-01-01', valorM: 5 }, { fecha: '2021-01-02', valorM: 1e12 }, { fecha: '2021-01-03', valorM: 5.1 }]
    expect(referenciaNivelEstacion(filas, '2026-10-18').record).toEqual({ valorM: 5.1, fecha: '2021-01-03' })
  })
})

describe('cero efectivo calibrado', () => {
  it('T10d: offsets calibrados con b = 1 (Paso de los Libres 37,12 + h; Paso de la Patria contradicho fuera)', () => {
    const pdl = CEROS_EFECTIVOS_V04['pna-paso-de-los-libres']!
    expect(pdl).toMatchObject({ aM: 37.12, bM: 1 })
    expect(cotaAguaCeroEfectivo(pdl, 9.4)).toBeCloseTo(37.12 + 9.4, 2)
    expect(CEROS_EFECTIVOS_V04['pna-monte-caseros']).toMatchObject({ aM: 32.05, bM: 1 })
    expect(CEROS_EFECTIVOS_V04['pna-paso-de-la-patria']).toBeUndefined()
    expect(CEROS_EFECTIVOS_V04['pna-la-cruz']).toBeUndefined()
  })

  it('altura crítica: h_crit = (cota − margen − a)/b; banda con margen + banda', () => {
    const pdl = CEROS_EFECTIVOS_V04['pna-paso-de-los-libres']!
    const r = alturaCriticaCeroEfectivo(pdl, 53.8, 2, 2)
    expect(r.alturaCriticaM).toBeCloseTo(53.8 - 2 - 37.12, 2)
    expect(r.alturaCriticaBandaM).toBeCloseTo(53.8 - 4 - 37.12, 2)
  })
})
