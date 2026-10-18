import { describe, expect, it } from 'vitest'
import { combinarEscenarios, maximosDiariosPrefectura, subidaDeterminista, tendenciaReciente, type LecturaPrefectura } from './escenarios-subida'

const AS_OF = '2026-10-18T02:15:04.000Z' // día local 2026-10-17

// Una lectura por día local a las 12 h (UTC−3 → 15 Z).
function diarias(desde: string, valores: number[]): LecturaPrefectura[] {
  const base = Date.parse(`${desde}T15:00:00Z`)
  return valores.map((v, i) => ({ medidaEn: new Date(base + i * 86_400_000).toISOString(), lecturaM: v }))
}

describe('maximosDiariosPrefectura', () => {
  it('toma el máximo por día local, ignora inconsistentes y lecturas posteriores a asOf', () => {
    const r = maximosDiariosPrefectura(
      [
        { medidaEn: '2026-10-16T12:00:00Z', lecturaM: 6.5 },
        { medidaEn: '2026-10-16T20:00:00Z', lecturaM: 6.6 },
        { medidaEn: '2026-10-17T02:00:00Z', lecturaM: 6.9 }, // 23 h del 16 local
        { medidaEn: '2026-10-17T13:00:00Z', lecturaM: 9.9, inconsistente: true },
        { medidaEn: '2026-10-17T13:00:00Z', lecturaM: 6.7 },
        { medidaEn: '2026-10-18T13:00:00Z', lecturaM: 7.5 }, // futura
      ],
      AS_OF,
    )
    expect(r).toEqual([
      { fecha: '2026-10-16', valorM: 6.9 },
      { fecha: '2026-10-17', valorM: 6.7 },
    ])
  })
})

describe('tendenciaReciente', () => {
  it('ventana media: subida media diaria de los últimos 5 días', () => {
    const d = maximosDiariosPrefectura(diarias('2026-10-12', [6.0, 6.4, 6.8, 7.2, 7.6, 7.65]), AS_OF)
    const media = tendenciaReciente(d, AS_OF, 5)!
    expect(media.tasaDiariaM).toBeCloseTo(0.33, 3)
    expect(media.subidaAcumuladaM).toBeCloseTo(1.65, 3)
    const corta = tendenciaReciente(d, AS_OF, 2)!
    expect(corta.tasaDiariaM).toBeCloseTo(0.225, 3)
  })

  it('ignora un pico espurio aislado (Empedrado)', () => {
    const d = maximosDiariosPrefectura(diarias('2026-10-12', [5.0, 5.1, 5.2, 12.4, 5.4, 5.5]), AS_OF)
    const t = tendenciaReciente(d, AS_OF, 5)!
    expect(t.saltosDescartados).toBe(2)
    expect(t.h0M).toBe(5.5)
    expect(t.tasaDiariaM).toBeCloseTo(0.1, 3)
  })

  it('un pico en el último día no es el nivel actual', () => {
    const d = maximosDiariosPrefectura(diarias('2026-10-12', [5.0, 5.1, 5.2, 5.3, 5.4, 12.9]), AS_OF)
    const t = tendenciaReciente(d, AS_OF, 5)!
    expect(t.saltosDescartados).toBe(1)
    expect(t.h0M).toBe(5.4)
    expect(t.tasaDiariaM).toBeCloseTo(0.1, 3)
  })

  it('sin lectura reciente (> 2 días) no hay tendencia', () => {
    const d = maximosDiariosPrefectura(diarias('2026-10-05', [5, 5.1, 5.2, 5.3, 5.4]), AS_OF)
    expect(tendenciaReciente(d, AS_OF, 5)).toBeNull()
  })
})

describe('combinarEscenarios', () => {
  it('tendencia en subida supera a los análogos y decide', () => {
    const e = combinarEscenarios({
      estacionId: 'pna-itati',
      asOf: AS_OF,
      lecturas: diarias('2026-10-12', [6.07, 6.5, 7.0, 7.4, 7.84, 7.87]),
      analogosP90: { 24: 0.1, 72: 0.3, 240: 0.8 },
    })
    expect(e.tasaMediaM).toBeCloseTo(0.36, 3)
    expect(e.porHorizonte[240]).toMatchObject({ analogosP90M: 0.8, tendenciaMediaM: 3.6, posibleM: 3.6, decide: 'tendencia' })
    expect(e.porHorizonte[24].decide).toBe('tendencia')
    expect(e.h0M).toBe(7.87)
  })

  it('tendencia en baja o plana no aporta nada (nunca resta)', () => {
    const e = combinarEscenarios({
      estacionId: 'pna-corrientes',
      asOf: AS_OF,
      lecturas: diarias('2026-10-12', [7, 6.8, 6.6, 6.4, 6.2, 6.0]),
      analogosP90: { 24: 0.05, 72: 0.1, 240: 0.4 },
    })
    expect(e.tasaMediaM).toBeLessThan(0)
    expect(e.porHorizonte[240]).toMatchObject({ tendenciaMediaM: 0, posibleM: 0.4, decide: 'analogos' })
    expect(subidaDeterminista(e, 240)).toBe(0)
  })

  it('sin análogos ni subida: posible 0 y criterio ninguno', () => {
    const e = combinarEscenarios({ estacionId: 'x', asOf: AS_OF, lecturas: diarias('2026-10-12', [5, 5, 5, 5, 5, 5]), analogosP90: null })
    expect(e.porHorizonte[72]).toMatchObject({ analogosP90M: null, posibleM: 0, decide: 'ninguno' })
  })

  it('onda aguas arriba: suma el exceso de subida de la estación anterior sólo desde 72 h', () => {
    const e = combinarEscenarios({
      estacionId: 'pna-empedrado',
      asOf: AS_OF,
      lecturas: diarias('2026-10-12', [4.94, 5.1, 5.25, 5.4, 5.55, 5.67]),
      analogosP90: { 24: 0, 72: 0, 240: 0 },
      aguasArriba: { estacionId: 'pna-corrientes', lecturas: diarias('2026-10-12', [5.43, 5.8, 6.2, 6.5, 6.75, 6.77]) },
    })
    expect(e.ondaM).toBeCloseTo(0.61, 3)
    expect(e.porHorizonte[24].ondaM).toBe(0)
    expect(e.porHorizonte[72]).toMatchObject({ ondaM: 0.61, decide: 'tendencia+onda' })
    expect(e.porHorizonte[72].posibleM).toBeCloseTo(0.438 + 0.61, 3)
  })

  it('la onda está acotada y nunca es negativa', () => {
    const arriba = combinarEscenarios({
      estacionId: 'pna-goya',
      asOf: AS_OF,
      lecturas: diarias('2026-10-12', [4, 4.1, 4.2, 4.3, 4.4, 4.5]),
      analogosP90: null,
      aguasArriba: { estacionId: 'pna-bella-vista', lecturas: diarias('2026-10-12', [4, 4.5, 5, 5.5, 6, 6.5]) },
    })
    expect(arriba.ondaM).toBe(1)
    const abajo = combinarEscenarios({
      estacionId: 'pna-goya',
      asOf: AS_OF,
      lecturas: diarias('2026-10-12', [4, 4.5, 5, 5.5, 6, 6.5]),
      analogosP90: null,
      aguasArriba: { estacionId: 'pna-bella-vista', lecturas: diarias('2026-10-12', [4, 4.1, 4.2, 4.3, 4.4, 4.5]) },
    })
    expect(abajo.ondaM).toBe(0)
  })
})
