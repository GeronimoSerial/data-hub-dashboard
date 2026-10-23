import { describe, expect, it } from 'vitest'
import { reportesDelRecorrido, seleccionarReporteLocal } from './retomar-reporte-local'

const reportes = [
  { draftId: 'a', cue: '1800114-00', flujo: 'inicial' },
  { draftId: 'b', cue: '1800114-00', flujo: 'actualizacion' },
  { draftId: 'c', cue: '1800115-00', flujo: 'inicial' },
]

describe('retomar el reporte solicitado', () => {
  it('elige el mismo CUE y recorrido aunque haya otros borradores', () => {
    expect(seleccionarReporteLocal(reportes, '?cue=1800114-00&flujo=actualizacion')).toBe('b')
  })
  it('no abre el reporte de otra escuela si falta el solicitado', () => {
    expect(seleccionarReporteLocal([reportes[0]], '?cue=1800999-00&flujo=inicial')).toBeNull()
  })
  it('nunca ofrece borradores de otros CUE o recorridos', () => {
    expect(reportesDelRecorrido(reportes, '?cue=1800114-00&flujo=actualizacion')).toEqual([reportes[1]])
    expect(reportesDelRecorrido(reportes, '?cue=1800999-00&flujo=inicial')).toEqual([])
  })
  it('no expone ningún reporte si la URL no solicita un CUE', () => {
    expect(seleccionarReporteLocal([reportes[0]], '')).toBeNull()
    expect(reportesDelRecorrido(reportes, '')).toEqual([])
  })
  it('pide elegir cuando la selección es ambigua', () => {
    expect(seleccionarReporteLocal(reportes, '')).toBeNull()
    expect(seleccionarReporteLocal([...reportes, { ...reportes[1], draftId: 'd' }], '?cue=1800114-00&flujo=actualizacion')).toBeNull()
  })
})
