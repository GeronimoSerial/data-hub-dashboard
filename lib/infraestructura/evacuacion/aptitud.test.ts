import { describe, expect, it } from 'vitest'
import { evaluarAptitud, type EntradaAptitud } from './aptitud'

const base: EntradaAptitud = {
  tieneCoordenadas: true,
  riesgo: { evidenciaValida: true, nivelRiesgo: 'bajo' },
  claseRio: 'bajo',
  juntoLaguna: false,
  claseRuta: 'sin_riesgo',
}

describe('evaluarAptitud', () => {
  it('es apta con riesgo bajo y exposición de sitio y de ruta baja o nula', () => {
    expect(evaluarAptitud(base)).toEqual({ apta: true, motivo: null, sinAntecedentes: false })
    expect(evaluarAptitud({ ...base, claseRio: 'sin_riesgo', claseRuta: 'bajo' })).toEqual({ apta: true, motivo: null, sinAntecedentes: false })
  })

  it.each<[string, Partial<EntradaAptitud>, string]>([
    ['sin coordenadas', { tieneCoordenadas: false }, 'sin_coordenadas'],
    ['riesgo moderado', { riesgo: { evidenciaValida: true, nivelRiesgo: 'moderado' } }, 'riesgo_no_bajo'],
    ['riesgo alto', { riesgo: { evidenciaValida: true, nivelRiesgo: 'alto' } }, 'riesgo_no_bajo'],
    ['riesgo muy alto', { riesgo: { evidenciaValida: true, nivelRiesgo: 'muy_alto' } }, 'riesgo_no_bajo'],
    ['sitio con exposición alta', { claseRio: 'alto' }, 'exposicion_sitio'],
    ['sitio con exposición media', { claseRio: 'medio' }, 'exposicion_sitio'],
    ['junto a laguna', { juntoLaguna: true }, 'junto_laguna'],
    ['ruta con exposición alta', { claseRuta: 'alto' }, 'exposicion_ruta'],
    ['ruta con exposición media', { claseRuta: 'medio' }, 'exposicion_ruta'],
  ])('no es apta: %s', (_nombre, cambio, motivo) => {
    expect(evaluarAptitud({ ...base, ...cambio })).toEqual({ apta: false, motivo, sinAntecedentes: false })
  })

  it.each<[string, Partial<EntradaAptitud>]>([
    ['sin snapshot de riesgo', { riesgo: null }],
    ['snapshot sin evidencia válida', { riesgo: { evidenciaValida: false, nivelRiesgo: 'alto' } }],
    ['nivel de riesgo null', { riesgo: { evidenciaValida: true, nivelRiesgo: null } }],
    ['sitio sin dato', { claseRio: 'sin_dato' }],
    ['sitio sin fila de exposición', { claseRio: null }],
    ['ruta sin_ruta', { claseRuta: 'sin_ruta' }],
    ['ruta sin dato', { claseRuta: 'sin_dato' }],
    ['ruta sin fila', { claseRuta: null }],
    ['juntoLaguna null', { juntoLaguna: null }],
  ])('el dato ausente no descarta: %s', (_nombre, cambio) => {
    expect(evaluarAptitud({ ...base, ...cambio })).toEqual({ apta: true, motivo: null, sinAntecedentes: false })
  })

  it('una evidencia de riesgo positiva gana aunque falte el resto', () => {
    expect(evaluarAptitud({ ...base, riesgo: { evidenciaValida: true, nivelRiesgo: 'alto' }, claseRio: null, claseRuta: null }).apta).toBe(false)
    expect(evaluarAptitud({ ...base, riesgo: null, claseRio: 'medio' }).apta).toBe(false)
  })

  it('sin ningún antecedente (riesgo, sitio y ruta ausentes) es apta con sinAntecedentes', () => {
    const vacia = { ...base, riesgo: null, claseRio: null, juntoLaguna: null, claseRuta: null }
    expect(evaluarAptitud(vacia)).toEqual({ apta: true, motivo: null, sinAntecedentes: true })
    expect(evaluarAptitud({ ...vacia, claseRio: 'sin_dato', claseRuta: 'sin_ruta' }).sinAntecedentes).toBe(true)
    expect(evaluarAptitud({ ...vacia, claseRio: 'bajo' }).sinAntecedentes).toBe(false)
  })
})
