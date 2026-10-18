import { describe, expect, it } from 'vitest'
import {
  type FilaDiaria,
  PARAMETROS_ANALOGOS_V1,
  type ParametrosAnalogos,
  crearSerieDiaria,
  cuantilesMaximo,
  ensambleConjunto,
  estimarAnalogos,
  probabilidadExcedencia,
} from './analogos'

// Serie plana de 1,0 m entre 2001-01-01 y 2003-12-31 (sin años bisiestos para
// que el día del año coincida entre años). Con ventana estacional de ±1 día y
// asOf 2003-06-01 los análogos son 31/5, 1/6 y 2/6 de 2001 y de 2002 (6).
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

// Pico de 2,0 m el 3/6/2001 (día 1–3 según el análogo) y de 3,0 m el 8/6/2002
// (día 6–8): picos en días distintos.
const BASE = con(plana(), { '2001-06-03': 2, '2002-06-08': 3 })
const P: ParametrosAnalogos = { ...PARAMETROS_ANALOGOS_V1, ventanaEstacionalDias: 1, minAnalogos: 2 }
const AS_OF = '2003-06-01'

describe('estimarAnalogos', () => {
  it('proyecta h0 + Δ por análogo y toma el máximo de ventanas anidadas', () => {
    const r = estimarAnalogos(crearSerieDiaria(BASE), AS_OF, P)
    if (r.estado !== 'estimado') throw new Error(r.motivo)
    expect(r.h0M).toBe(1)
    expect(r.fechasAnalogas).toEqual(['2001-05-31', '2001-06-01', '2001-06-02', '2002-05-31', '2002-06-01', '2002-06-02'])
    expect(probabilidadExcedencia(r, 24, 1.5)).toBeCloseTo(1 / 6)
    expect(probabilidadExcedencia(r, 72, 1.5)).toBeCloseTo(3 / 6)
    expect(probabilidadExcedencia(r, 240, 1.5)).toBe(1)
    expect(probabilidadExcedencia(r, 240, 2.5)).toBeCloseTo(3 / 6)
    expect(cuantilesMaximo(r, 240)).toEqual({ p10: 2, p50: 2.5, p90: 3 })
  })

  it('P(24) ≤ P(72) ≤ P(240) para cualquier umbral', () => {
    const r = estimarAnalogos(crearSerieDiaria(BASE), AS_OF, P)
    if (r.estado !== 'estimado') throw new Error(r.motivo)
    for (const u of [0.5, 1, 1.2, 2, 2.5, 3, 4]) {
      expect(probabilidadExcedencia(r, 24, u)).toBeLessThanOrEqual(probabilidadExcedencia(r, 72, u))
      expect(probabilidadExcedencia(r, 72, u)).toBeLessThanOrEqual(probabilidadExcedencia(r, 240, u))
    }
  })

  it('ignora datos posteriores a asOf (pico futuro inyectado)', () => {
    const conFuturo = con(BASE, { '2003-06-02': 9, '2003-06-05': 10, '2003-07-01': 12 })
    expect(estimarAnalogos(crearSerieDiaria(conFuturo), AS_OF, P)).toEqual(estimarAnalogos(crearSerieDiaria(BASE), AS_OF, P))
  })

  it('descarta análogos con días faltantes en su ventana futura (sin imputar)', () => {
    const r = estimarAnalogos(crearSerieDiaria(con(BASE, { '2002-06-05': null })), AS_OF, P)
    if (r.estado !== 'estimado') throw new Error(r.motivo)
    expect(r.fechasAnalogas).toEqual(['2001-05-31', '2001-06-01', '2001-06-02'])
  })

  it('no_estimable con análogos insuficientes', () => {
    const r = estimarAnalogos(crearSerieDiaria(BASE), AS_OF, { ...P, minAnalogos: 7 })
    expect(r).toMatchObject({ estado: 'no_estimable', motivo: 'analogos_insuficientes', analogos: 6 })
  })

  it('no_estimable si el nivel actual está vencido o falta', () => {
    const filas = BASE.filter((f) => f.fecha <= '2003-06-01')
    const r = estimarAnalogos(crearSerieDiaria(filas), '2003-06-04', P)
    expect(r).toMatchObject({ estado: 'no_estimable', motivo: 'nivel_actual_no_disponible' })
  })

  it('con nivel de ayer desplaza la ventana: 24 h cubre el día siguiente a asOf', () => {
    const filas = BASE.filter((f) => f.fecha !== AS_OF)
    const r = estimarAnalogos(crearSerieDiaria(filas), AS_OF, P)
    if (r.estado !== 'estimado') throw new Error(r.motivo)
    expect(r.fechaNivel).toBe('2003-05-31')
    expect(r.trayectorias.every((t) => t.length === 11)).toBe(true)
  })

  it('selecciona por nivel y tendencia', () => {
    // Una subida de 0,5 m en los 3 días previos a asOf no tiene análogos.
    const filas = con(BASE, { '2003-06-01': 1.5 })
    const r = estimarAnalogos(crearSerieDiaria(filas), AS_OF, P)
    expect(r).toMatchObject({ estado: 'no_estimable', motivo: 'analogos_insuficientes', analogos: 0 })
  })
})

describe('ensambleConjunto', () => {
  it('toma Δ de las otras estaciones en las mismas fechas y descarta miembros faltantes', () => {
    const ref = crearSerieDiaria(BASE)
    const otra = crearSerieDiaria(con(plana(), { '2001-06-04': 5, '2002-06-03': null }))
    const r = ensambleConjunto(ref, { otra }, AS_OF, P)
    if (r.referencia.estado !== 'estimado') throw new Error('referencia')
    const o = r.estaciones.otra
    if (o.estado !== 'estimado') throw new Error(o.motivo)
    expect(o.fechasAnalogas).toEqual(['2001-05-31', '2001-06-01', '2001-06-02'])
    expect(o.miembrosDescartados).toBe(3)
    expect(probabilidadExcedencia(o, 24, 4)).toBeCloseTo(0)
    expect(probabilidadExcedencia(o, 72, 4)).toBeCloseTo(2 / 3)
    expect(probabilidadExcedencia(o, 240, 4)).toBe(1)
  })

  it('una estación sin nivel actual queda no_estimable sin afectar a la referencia', () => {
    const ref = crearSerieDiaria(BASE)
    const otra = crearSerieDiaria(plana('2003-05-01'))
    const r = ensambleConjunto(ref, { otra }, AS_OF, P)
    expect(r.referencia.estado).toBe('estimado')
    expect(r.estaciones.otra).toMatchObject({ estado: 'no_estimable', motivo: 'nivel_actual_no_disponible' })
  })
})
