import { describe, expect, it } from 'vitest'
import { primerBloqueoParte, respuestasAfectacionNueva } from './consistencia-parte-servidor'

const SITUACION_HABITUAL = { estadoEstablecimiento: 'habitual' as const, servicioEstado: 'normal' as const, asistenciaBrinda: true }

describe('respuestasAfectacionNueva', () => {
  it('toma el motivoId resuelto y cuenta las secciones como alcance parcial', () => {
    const r = respuestasAfectacionNueva(
      { categoria: 'establecimiento', motivoId: 'inundacion', severidad: 'Alta', seccionesCantidad: 2 },
      SITUACION_HABITUAL,
    )
    expect(r.motivoId).toBe('inundacion')
    expect(r.alcance).toEqual({ tipo: 'algunas', secciones: 2 })
    expect(r.edificio).toBe('habitual')
    expect(r.clases).toBe('normal')
    expect(r.asistenciaBrinda).toBe(true)
  })

  it('en categoría alumnos no lleva edificio, clases ni asistencia aunque el parte los tenga', () => {
    const r = respuestasAfectacionNueva(
      { categoria: 'alumnos', motivoId: 'otro-alumnos', severidad: 'Media', descripcion: '  ', seccionesCantidad: 1 },
      SITUACION_HABITUAL,
    )
    expect(r.edificio).toBeNull()
    expect(r.clases).toBeNull()
    expect(r.asistenciaBrinda).toBeNull()
    expect(r.descripcion).toBe('')
  })
})

describe('primerBloqueoParte', () => {
  it('devuelve el primer bloqueo de una afectación nueva con evacuación preventiva y edificio habitual', () => {
    const regla = primerBloqueoParte(
      [{ categoria: 'establecimiento', motivoId: 'evacuacion-preventiva', severidad: 'Crítica', seccionesCantidad: 0 }],
      SITUACION_HABITUAL,
    )
    expect(regla?.codigo).toBe('evacuacion-preventiva-habitual')
  })

  it('devuelve null cuando sólo hay advertencias', () => {
    const regla = primerBloqueoParte(
      [{ categoria: 'establecimiento', motivoId: 'inundacion', severidad: 'Crítica', seccionesCantidad: 1 }],
      SITUACION_HABITUAL,
    )
    expect(regla).toBeNull()
  })

  it('bloquea "Otro" sin descripción aunque el edificio esté bien', () => {
    const regla = primerBloqueoParte(
      [{ categoria: 'establecimiento', motivoId: 'otro-establecimiento', severidad: 'Media', descripcion: '', seccionesCantidad: 1 }],
      SITUACION_HABITUAL,
    )
    expect(regla?.codigo).toBe('otro-sin-descripcion')
  })
})
