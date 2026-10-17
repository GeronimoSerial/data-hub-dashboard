import { describe, expect, it } from 'vitest'
import { evaluarCambioAHabitual, type EntradaCambioAHabitual } from './consistencia-estado-activo'

const base: EntradaCambioAHabitual = {
  estadoActual: 'evacuado',
  nuevoEstado: 'habitual',
  servicioActual: 'suspendido',
  servicioEnvio: null,
  afectacionesActivas: [],
  solucionadas: [],
  sigueActiva: [],
}

describe('evaluarCambioAHabitual', () => {
  it('no aplica cuando el edificio no pasa de evacuado o centro de evacuados a habitual', () => {
    const sinServicio = { ...base, servicioActual: 'normal' as const }
    const activa = [{ id: 'a1' }]
    expect(evaluarCambioAHabitual({ ...base, nuevoEstado: 'parcial', afectacionesActivas: activa })).toEqual({ bloqueos: [], advertencias: [] })
    expect(evaluarCambioAHabitual({ ...base, estadoActual: 'habitual', afectacionesActivas: activa })).toEqual({ bloqueos: [], advertencias: [] })
    expect(evaluarCambioAHabitual({ ...base, estadoActual: 'parcial', afectacionesActivas: activa })).toEqual({ bloqueos: [], advertencias: [] })
    expect(evaluarCambioAHabitual({ ...base, estadoActual: 'centro_evacuados', nuevoEstado: 'evacuado', afectacionesActivas: activa })).toEqual({ bloqueos: [], advertencias: [] })
    expect(evaluarCambioAHabitual({ ...sinServicio, afectacionesActivas: [] })).toEqual({ bloqueos: [], advertencias: [] })
  })

  it('bloquea evacuado a habitual con una afectación activa sin decidir', () => {
    const r = evaluarCambioAHabitual({ ...base, servicioEnvio: 'normal', afectacionesActivas: [{ id: 'a1' }] })
    expect(r.bloqueos.map((b) => b.codigo)).toEqual(['habitual-con-afectaciones-activas'])
    expect(r.bloqueos[0]?.campo).toBe('edificio')
    expect(r.advertencias).toEqual([])
  })

  it('bloquea centro de evacuados a habitual si queda una afectación sin decidir aunque otra esté resuelta', () => {
    const r = evaluarCambioAHabitual({
      ...base,
      estadoActual: 'centro_evacuados',
      servicioEnvio: 'normal',
      afectacionesActivas: [{ id: 'a1' }, { id: 'a2' }],
      solucionadas: ['a1'],
    })
    expect(r.bloqueos.map((b) => b.codigo)).toEqual(['habitual-con-afectaciones-activas'])
  })

  it('permite el cambio si cada afectación activa está solucionada en el mismo envío', () => {
    const r = evaluarCambioAHabitual({
      ...base,
      servicioEnvio: 'normal',
      afectacionesActivas: [{ id: 'a1' }, { id: 'a2' }],
      solucionadas: ['a1', 'a2'],
    })
    expect(r).toEqual({ bloqueos: [], advertencias: [] })
  })

  it('permite el cambio si la afectación queda explícitamente activa, con advertencia en línea', () => {
    const r = evaluarCambioAHabitual({
      ...base,
      servicioEnvio: 'normal',
      afectacionesActivas: [{ id: 'a1' }],
      sigueActiva: ['a1'],
    })
    expect(r.bloqueos).toEqual([])
    expect(r.advertencias.map((a) => a.codigo)).toEqual(['habitual-con-afectacion-activa'])
  })

  it('bloquea si el servicio sigue suspendido y el envío no lo vuelve a normal', () => {
    const r = evaluarCambioAHabitual({ ...base, afectacionesActivas: [], servicioEnvio: null })
    expect(r.bloqueos.map((b) => b.codigo)).toEqual(['habitual-con-servicio-suspendido'])
    expect(r.bloqueos[0]?.campo).toBe('clases')
    expect(evaluarCambioAHabitual({ ...base, afectacionesActivas: [], servicioEnvio: 'suspendido' }).bloqueos).toHaveLength(1)
  })

  it('el servicio parcial cuenta como suspendido para el bloqueo', () => {
    const r = evaluarCambioAHabitual({ ...base, servicioActual: 'parcial', servicioEnvio: null })
    expect(r.bloqueos.map((b) => b.codigo)).toEqual(['habitual-con-servicio-suspendido'])
  })

  it('no bloquea por servicio cuando el envío lo vuelve a normal', () => {
    const r = evaluarCambioAHabitual({ ...base, servicioEnvio: 'normal' })
    expect(r).toEqual({ bloqueos: [], advertencias: [] })
  })

  it('reporta ambos bloqueos cuando faltan la decisión y el servicio', () => {
    const r = evaluarCambioAHabitual({ ...base, afectacionesActivas: [{ id: 'a1' }], servicioEnvio: null })
    expect(r.bloqueos.map((b) => b.codigo)).toEqual(['habitual-con-afectaciones-activas', 'habitual-con-servicio-suspendido'])
  })
})
