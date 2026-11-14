import { describe, expect, it } from 'vitest'
import { PISO_AMENAZA_POR_ESTADO_RIO, PISO_AMENAZA_REDUCIDO_V04, PISO_RIESGO_POR_ESTADO_RIO, PISO_RIESGO_REDUCIDO_V04 } from './config'
import { valorAmenazaRio } from './nivel-rio'
import type { EstadoNivelRio } from './puertos'
import { TRADUCCION_ESTADO_PREFECTURA, estadoDeLectura } from './rio-prefectura'

describe('TRADUCCION_ESTADO_PREFECTURA', () => {
  it('maps every Prefectura state to the neutral state with the same name', () => {
    expect(TRADUCCION_ESTADO_PREFECTURA).toEqual({
      normal: 'normal',
      alerta: 'alerta',
      evacuacion: 'evacuacion',
    })
  })

  it('translates the state the adapter derives from official thresholds', () => {
    // Umbrales de prueba: alerta 7 m, evacuacion 8.5 m.
    expect(TRADUCCION_ESTADO_PREFECTURA[estadoDeLectura(9.33, 7, 8.5)!]).toBe('evacuacion')
    expect(TRADUCCION_ESTADO_PREFECTURA[estadoDeLectura(7.5, 7, 8.5)!]).toBe('alerta')
    expect(TRADUCCION_ESTADO_PREFECTURA[estadoDeLectura(3, 7, 8.5)!]).toBe('normal')
    expect(estadoDeLectura(3, null, null)).toBeNull()
  })
})

describe('bajante (unused until B13)', () => {
  const ESTADO_BAJANTE: EstadoNivelRio = 'bajante'

  it('is accepted by the neutral state type', () => {
    expect(ESTADO_BAJANTE).toBe('bajante')
  })

  it('has no floor in any state table, like normal', () => {
    expect(PISO_AMENAZA_POR_ESTADO_RIO[ESTADO_BAJANTE]).toBeNull()
    expect(PISO_RIESGO_POR_ESTADO_RIO[ESTADO_BAJANTE]).toBeNull()
    expect(PISO_AMENAZA_REDUCIDO_V04[ESTADO_BAJANTE]).toBeNull()
    expect(PISO_RIESGO_REDUCIDO_V04[ESTADO_BAJANTE]).toBeNull()
  })

  it('scores the river threat exactly like normal', () => {
    const base = { lecturaM: 3.2, alertaM: 7, variacionM: -0.4 }
    expect(valorAmenazaRio({ ...base, estado: 'bajante' })).toBe(valorAmenazaRio({ ...base, estado: 'normal' }))
  })
})
