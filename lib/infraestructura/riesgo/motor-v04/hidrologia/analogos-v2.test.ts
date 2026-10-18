import { describe, expect, it } from 'vitest'
import { type FilaDiaria, crearSerieDiaria, probabilidadExcedencia } from './analogos'
import { PARAMETROS_ANALOGOS_V2, type ParametrosAnalogosV2, ensambleConjuntoV2, estimarAnalogosV2 } from './analogos-v2'

// Misma serie plana que en analogos.test.ts: 1,0 m de 2001 a 2003 (sin
// bisiestos). Con ventana estacional ±1 día y asOf 2003-06-01 los candidatos
// son 31/5, 1/6 y 2/6 de 2001 y de 2002 (6).
function plana(hasta = '2003-12-31'): FilaDiaria[] {
  const filas: FilaDiaria[] = []
  for (let t = Date.parse('2001-01-01'); t <= Date.parse(hasta); t += 86_400_000) {
    filas.push({ fecha: new Date(t).toISOString().slice(0, 10), valorM: 1 })
  }
  return filas
}

function con(filas: FilaDiaria[], cambios: Record<string, number | null>): FilaDiaria[] {
  return filas
    .filter((f) => cambios[f.fecha] !== null)
    .map((f) => (f.fecha in cambios ? { fecha: f.fecha, valorM: cambios[f.fecha] as number } : f))
}

const BASE = con(plana(), { '2001-06-03': 2, '2002-06-08': 3 })
const P: ParametrosAnalogosV2 = { ...PARAMETROS_ANALOGOS_V2, ventanaEstacionalDias: 1, k: 4, distanciaMaxNivelM: 0.5 }
const AS_OF = '2003-06-01'

// Nivel actual 1,3 m sostenido desde el 25/5: por encima de todo candidato.
const ALTA: Record<string, number> = {}
for (const d of ['25', '26', '27', '28', '29', '30', '31']) ALTA[`2003-05-${d}`] = 1.3
ALTA[AS_OF] = 1.3

describe('estimarAnalogosV2', () => {
  it('elige los K más cercanos en forma determinística (empates por fecha)', () => {
    const r = estimarAnalogosV2(crearSerieDiaria(BASE), AS_OF, P)
    if (r.estado !== 'estimado') throw new Error(r.motivo)
    expect(r.version).toBe('analogos-v2')
    // Distancia 0 los 1/6; empate (1 día) entre 31/5 y 2/6 de ambos años → por fecha.
    expect(r.fechasAnalogas).toEqual(['2001-05-31', '2001-06-01', '2001-06-02', '2002-06-01'])
    expect(r.diagnostico).toEqual({ distanciaMaxNivelM: 0, fueraDeRangoHistorico: false })
  })

  it('no se abstiene con nivel por encima de todos los análogos si está dentro de la distancia máxima', () => {
    const r = estimarAnalogosV2(crearSerieDiaria(con(BASE, ALTA)), AS_OF, P)
    if (r.estado !== 'estimado') throw new Error(r.motivo)
    expect(r.h0M).toBe(1.3)
    expect(r.diagnostico?.fueraDeRangoHistorico).toBe(true)
    expect(r.diagnostico?.distanciaMaxNivelM).toBeCloseTo(0.3)
    expect(r.trayectorias).toHaveLength(4)
  })

  it('se abstiene con analogos_lejanos más allá de la distancia máxima', () => {
    const r = estimarAnalogosV2(crearSerieDiaria(con(BASE, ALTA)), AS_OF, { ...P, distanciaMaxNivelM: 0.2 })
    expect(r).toMatchObject({ estado: 'no_estimable', motivo: 'analogos_lejanos', version: 'analogos-v2' })
  })

  it('analogos_insuficientes si hay menos de K candidatos con ventana completa', () => {
    const r = estimarAnalogosV2(crearSerieDiaria(BASE), AS_OF, { ...P, k: 7 })
    expect(r).toMatchObject({ estado: 'no_estimable', motivo: 'analogos_insuficientes', analogos: 6 })
  })

  it('nivel vencido sigue siendo nivel_actual_no_disponible', () => {
    const filas = BASE.filter((f) => f.fecha <= '2003-06-01')
    expect(estimarAnalogosV2(crearSerieDiaria(filas), '2003-06-04', P)).toMatchObject({ estado: 'no_estimable', motivo: 'nivel_actual_no_disponible' })
  })

  it('P(24) ≤ P(72) ≤ P(240) para cualquier umbral', () => {
    const r = estimarAnalogosV2(crearSerieDiaria(BASE), AS_OF, { ...P, k: 6 })
    if (r.estado !== 'estimado') throw new Error(r.motivo)
    for (const u of [0.5, 1, 1.5, 2, 2.5, 3, 4]) {
      expect(probabilidadExcedencia(r, 24, u)).toBeLessThanOrEqual(probabilidadExcedencia(r, 72, u))
      expect(probabilidadExcedencia(r, 72, u)).toBeLessThanOrEqual(probabilidadExcedencia(r, 240, u))
    }
    expect(probabilidadExcedencia(r, 240, 2.5)).toBeCloseTo(3 / 6)
  })

  it('ignora datos posteriores a asOf (pico futuro inyectado)', () => {
    const conFuturo = con(BASE, { '2003-06-02': 9, '2003-06-05': 10, '2003-07-01': 12 })
    expect(estimarAnalogosV2(crearSerieDiaria(conFuturo), AS_OF, P)).toEqual(estimarAnalogosV2(crearSerieDiaria(BASE), AS_OF, P))
  })
})

describe('ensambleConjuntoV2', () => {
  it('usa las mismas fechas de la referencia v2 en las otras estaciones', () => {
    const ref = crearSerieDiaria(BASE)
    const otra = crearSerieDiaria(con(plana(), { '2001-06-04': 5, '2002-06-03': null }))
    const r = ensambleConjuntoV2(ref, { otra }, AS_OF, P)
    if (r.referencia.estado !== 'estimado') throw new Error('referencia')
    expect(r.referencia.version).toBe('analogos-v2')
    const o = r.estaciones.otra
    if (o.estado !== 'estimado') throw new Error(o.motivo)
    expect(o.fechasAnalogas).toEqual(['2001-05-31', '2001-06-01', '2001-06-02'])
    expect(o.miembrosDescartados).toBe(1)
    expect(probabilidadExcedencia(o, 240, 4)).toBe(1)
  })
})
