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
    expect(evaluarAptitud(base)).toEqual({ apta: true, motivo: null })
    expect(evaluarAptitud({ ...base, claseRio: 'sin_riesgo', claseRuta: 'bajo' })).toEqual({ apta: true, motivo: null })
  })

  it.each<[string, Partial<EntradaAptitud>, string]>([
    ['sin coordenadas', { tieneCoordenadas: false }, 'sin_coordenadas'],
    ['sin snapshot de riesgo', { riesgo: null }, 'sin_dato_riesgo'],
    ['snapshot sin evidencia válida', { riesgo: { evidenciaValida: false, nivelRiesgo: 'bajo' } }, 'sin_dato_riesgo'],
    ['nivel de riesgo null', { riesgo: { evidenciaValida: true, nivelRiesgo: null } }, 'sin_dato_riesgo'],
    ['riesgo moderado', { riesgo: { evidenciaValida: true, nivelRiesgo: 'moderado' } }, 'riesgo_no_bajo'],
    ['riesgo alto', { riesgo: { evidenciaValida: true, nivelRiesgo: 'alto' } }, 'riesgo_no_bajo'],
    ['riesgo muy alto', { riesgo: { evidenciaValida: true, nivelRiesgo: 'muy_alto' } }, 'riesgo_no_bajo'],
    ['sitio con exposición alta', { claseRio: 'alto' }, 'exposicion_sitio'],
    ['sitio con exposición media', { claseRio: 'medio' }, 'exposicion_sitio'],
    ['sitio sin dato', { claseRio: 'sin_dato' }, 'exposicion_sitio'],
    ['sitio sin fila de exposición', { claseRio: null }, 'exposicion_sitio'],
    ['junto a laguna', { juntoLaguna: true }, 'junto_laguna'],
    ['ruta con exposición alta', { claseRuta: 'alto' }, 'exposicion_ruta'],
    ['ruta con exposición media', { claseRuta: 'medio' }, 'exposicion_ruta'],
    ['ruta sin_ruta', { claseRuta: 'sin_ruta' }, 'exposicion_ruta'],
    ['ruta sin dato', { claseRuta: 'sin_dato' }, 'exposicion_ruta'],
    ['ruta sin fila', { claseRuta: null }, 'exposicion_ruta'],
  ])('no es apta: %s', (_nombre, cambio, motivo) => {
    expect(evaluarAptitud({ ...base, ...cambio })).toEqual({ apta: false, motivo })
  })

  it('juntoLaguna null (sin dato) no descarta por sí solo', () => {
    expect(evaluarAptitud({ ...base, juntoLaguna: null }).apta).toBe(true)
  })
})
