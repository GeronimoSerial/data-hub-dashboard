import { describe, expect, it } from 'vitest'
import { evaluarExposicionV04, explicacionExposicionV04 } from './exposicion-v04'
import type { EscenarioHorizonte, EscenarioSubidaEstacion } from './escenarios-subida'

function escenario(posible: { 24: number; 72: number; 240: number }, decide: EscenarioHorizonte['decide'] = 'analogos'): EscenarioSubidaEstacion {
  const h = (p: number): EscenarioHorizonte => ({ analogosP90M: p, tendenciaCortaM: 0, tendenciaMediaM: 0, ondaM: 0, posibleM: p, decide })
  return {
    estacionId: 'pna-x',
    h0M: 5,
    fechaH0: '2026-10-17',
    tasaCortaM: 0,
    tasaMediaM: 0,
    ondaM: null,
    estacionAguasArriba: null,
    porHorizonte: { 24: h(posible[24]), 72: h(posible[72]), 240: h(posible[240]) },
  }
}

const base = {
  nivelRioTramoM: 55,
  anomaliaM: 1.5,
  represaAguasArriba: false,
  claseRio: 'sin_riesgo' as string | null,
  escenario: escenario({ 24: 0.1, 72: 0.3, 240: 0.8 }),
}

describe('evaluarExposicionV04', () => {
  it('casco de Ituzaingó (15 m sobre el agua) no es alcanzable aunque una celda gruesa lo marque', () => {
    const r = evaluarExposicionV04({ ...base, claseRio: 'alto', dem: { sueloM: 72, nivelRioDemM: 55, distanciaRioM: 600 }, anomaliaM: 3.6 })
    if (r.tipo !== 'evaluada') throw new Error(r.tipo)
    for (const h of [24, 72, 240] as const) expect(r.porHorizonte[h]).toMatchObject({ criterio: 'dem_agua_posible', alcance: 'ninguno' })
    expect(r.porHorizonte[240].margenM).toBeCloseTo(55 + 3.6 + 0.8 + 2 - 72, 2)
  })

  it('escuela baja dentro del margen → piso completo', () => {
    const r = evaluarExposicionV04({ ...base, dem: { sueloM: 57, nivelRioDemM: 55, distanciaRioM: 300 } })
    if (r.tipo !== 'evaluada') throw new Error(r.tipo)
    expect(r.porHorizonte[24]).toMatchObject({ alcance: 'completo', confianzaBaja: false })
    expect(r.porHorizonte[24].margenM).toBeCloseTo(55 + 1.5 + 0.1 + 2 - 57, 2)
  })

  it('en la banda → piso un nivel menor; debajo de la banda → sin piso', () => {
    const banda = evaluarExposicionV04({ ...base, dem: { sueloM: 60, nivelRioDemM: 55, distanciaRioM: 300 } })
    if (banda.tipo !== 'evaluada') throw new Error(banda.tipo)
    expect(banda.porHorizonte[24].alcance).toBe('reducido') // margen −1,4
    const lejos = evaluarExposicionV04({ ...base, dem: { sueloM: 61, nivelRioDemM: 55, distanciaRioM: 300 } })
    if (lejos.tipo !== 'evaluada') throw new Error(lejos.tipo)
    expect(lejos.porHorizonte[24].alcance).toBe('ninguno') // margen −2,4
  })

  it('los horizontes pueden diferir por la subida posible', () => {
    const r = evaluarExposicionV04({ ...base, escenario: escenario({ 24: 0, 72: 1, 240: 3 }), dem: { sueloM: 61, nivelRioDemM: 55, distanciaRioM: 300 } })
    if (r.tipo !== 'evaluada') throw new Error(r.tipo)
    expect([r.porHorizonte[24].alcance, r.porHorizonte[72].alcance, r.porHorizonte[240].alcance]).toEqual(['ninguno', 'reducido', 'completo'])
  })

  it('una tendencia en subida alcanza una escuela que los análogos solos no alcanzan', () => {
    const dem = { sueloM: 61, nivelRioDemM: 55, distanciaRioM: 300 }
    const soloAnalogos = evaluarExposicionV04({ ...base, dem, escenario: escenario({ 24: 0.1, 72: 0.3, 240: 0.8 }) })
    const conTendencia = evaluarExposicionV04({ ...base, dem, escenario: escenario({ 24: 0.36, 72: 1.08, 240: 3.6 }, 'tendencia') })
    if (soloAnalogos.tipo !== 'evaluada' || conTendencia.tipo !== 'evaluada') throw new Error('no evaluada')
    expect(soloAnalogos.porHorizonte[240].alcance).toBe('reducido')
    expect(conTendencia.porHorizonte[240]).toMatchObject({ alcance: 'completo' })
    expect(conTendencia.porHorizonte[240].subida?.decide).toBe('tendencia')
  })

  it('sin el corte de 500 m: agua a 1,5 km sigue siendo evaluable; a más de 2 km no', () => {
    const cerca = evaluarExposicionV04({ ...base, dem: { sueloM: 57, nivelRioDemM: 55, distanciaRioM: 1500 } })
    if (cerca.tipo !== 'evaluada') throw new Error(cerca.tipo)
    expect(cerca.porHorizonte[24]).toMatchObject({ criterio: 'dem_agua_posible', alcance: 'completo' })
    const lejos = evaluarExposicionV04({ ...base, dem: { sueloM: 57, nivelRioDemM: 55, distanciaRioM: 2500 } })
    if (lejos.tipo !== 'evaluada') throw new Error(lejos.tipo)
    expect(lejos.porHorizonte[24]).toMatchObject({ criterio: 'no_evaluable', alcance: 'ninguno' })
  })

  it('no evaluable → respaldo JRC clase_rio, con confianza baja', () => {
    const jrc = evaluarExposicionV04({ ...base, claseRio: 'medio', dem: null })
    if (jrc.tipo !== 'evaluada') throw new Error(jrc.tipo)
    expect(jrc.porHorizonte[72]).toMatchObject({ criterio: 'jrc_respaldo', alcance: 'completo', confianzaBaja: true })
    const sin = evaluarExposicionV04({ ...base, claseRio: 'sin_riesgo', dem: null })
    if (sin.tipo !== 'evaluada') throw new Error(sin.tipo)
    expect(sin.porHorizonte[72]).toMatchObject({ criterio: 'no_evaluable', alcance: 'ninguno' })
  })

  it('agua cercana que no es el río (laguna) → respaldo JRC', () => {
    const r = evaluarExposicionV04({ ...base, claseRio: 'bajo', dem: { sueloM: 66, nivelRioDemM: 59.5 + 6, distanciaRioM: 300 }, nivelRioTramoM: 59.5 })
    if (r.tipo !== 'evaluada') throw new Error(r.tipo)
    expect(r.porHorizonte[24]).toMatchObject({ criterio: 'jrc_respaldo', alcance: 'completo' })
  })

  it('costa de embalse → no aplica; DEM sin nivel actual y sin JRC → sin dato', () => {
    expect(evaluarExposicionV04({ ...base, represaAguasArriba: true, dem: { sueloM: 90, nivelRioDemM: 80, distanciaRioM: 300 } }).tipo).toBe('no_aplica_embalse')
    expect(evaluarExposicionV04({ ...base, anomaliaM: null, dem: { sueloM: 57, nivelRioDemM: 55, distanciaRioM: 300 } }).tipo).toBe('sin_dato')
  })

  it('sin escenario de la estación la subida es 0 y queda marcada', () => {
    const r = evaluarExposicionV04({ ...base, escenario: null, dem: { sueloM: 57, nivelRioDemM: 55, distanciaRioM: 300 } })
    if (r.tipo !== 'evaluada') throw new Error(r.tipo)
    expect(r.porHorizonte[240]).toMatchObject({ alcance: 'completo', subida: null })
    expect(explicacionExposicionV04(r.porHorizonte[240], 240)).toContain('sin_escenario')
  })

  it('la explicación tiene formato fijo con criterio, margen, subida y horizonte', () => {
    const r = evaluarExposicionV04({ ...base, dem: { sueloM: 57, nivelRioDemM: 55, distanciaRioM: 300 } })
    if (r.tipo !== 'evaluada') throw new Error(r.tipo)
    expect(explicacionExposicionV04(r.porHorizonte[72], 72)).toBe(
      'exposicion v0.4 a 72h: criterio dem_agua_posible; alcance completo; margen 1.8m (suelo 57m, agua posible 56.8m = dem 55 + anomalia 1.5 + subida 0.3 por analogos [analogos_p90 0.3, tendencia 0 a 0 m/dia, onda 0]; margen_error 2m; banda 2m)',
    )
  })
})
