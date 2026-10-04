import { describe, expect, it } from 'vitest'
import { requiereJustificacionCritica, validarJustificacionCritica } from './justificacion-critica'

describe('requiereJustificacionCritica', () => {
  it('sólo con Crítica y un sugerido distinto de Crítica o ausente', () => {
    expect(requiereJustificacionCritica('Crítica', 'Media')).toBe(true)
    expect(requiereJustificacionCritica('Crítica', null)).toBe(true)
    expect(requiereJustificacionCritica('Crítica', undefined)).toBe(true)
    expect(requiereJustificacionCritica('Crítica', 'Crítica')).toBe(false)
    expect(requiereJustificacionCritica('Alta', 'Baja')).toBe(false)
  })
})

describe('validarJustificacionCritica', () => {
  it('rechaza Crítica no sugerida sin justificación', () => {
    expect(validarJustificacionCritica({ severidad: 'Crítica', sugerida: 'Media' })).toEqual({
      ok: false,
      error: 'Indique por qué la situación es crítica',
    })
  })
  it('exige detalle con "otro" y lo prohíbe en las demás', () => {
    expect(validarJustificacionCritica({ severidad: 'Crítica', sugerida: 'Media', justificacion: 'otro' }).ok).toBe(false)
    expect(validarJustificacionCritica({ severidad: 'Crítica', sugerida: 'Media', justificacion: 'otro', detalle: 'Cayó un árbol sobre el aula' }).ok).toBe(true)
    expect(validarJustificacionCritica({ severidad: 'Crítica', sugerida: 'Media', justificacion: 'riesgo_fisico', detalle: 'x' }).ok).toBe(false)
  })
  it('rechaza una justificación enviada cuando no corresponde', () => {
    expect(validarJustificacionCritica({ severidad: 'Alta', sugerida: 'Media', justificacion: 'se_prolonga' })).toEqual({
      ok: false,
      error: 'La justificación sólo corresponde a una situación crítica no sugerida',
    })
  })
})
