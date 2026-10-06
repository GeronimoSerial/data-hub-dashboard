import { describe, expect, it } from 'vitest'
import {
  RECORRIDO_INICIAL,
  consecuenciasActivas,
  construirEnvio,
  ordenarSituaciones,
  responder,
  situacionConMismoMotivo,
  situacionesSinRespuesta,
  type SituacionRecorrido,
} from './recorrido-actualizacion'

const inundacion: SituacionRecorrido = { id: 'a', motivo: 'Inundación', categoria: 'establecimiento', severidad: 'Crítica', rigeDesde: '2026-10-02T10:00:00.000Z', creadaEn: '2026-10-02T10:00:00.000Z', causadaPorId: null }
const luz: SituacionRecorrido = { id: 'b', motivo: 'Sin energía o agua', categoria: 'establecimiento', severidad: 'Media', rigeDesde: '2026-10-03T10:00:00.000Z', creadaEn: '2026-10-03T10:00:00.000Z', causadaPorId: 'a' }
const situaciones = [luz, inundacion]

describe('recorrido de actualización', () => {
  it('ordena por relevancia', () => {
    expect(ordenarSituaciones(situaciones, 'habitual').map((s) => s.id)).toEqual(['a', 'b'])
  })

  it('exige responder todas las situaciones activas', () => {
    const e = responder(RECORRIDO_INICIAL, 'a', { tipo: 'sigue' })
    expect(situacionesSinRespuesta(situaciones, e)).toEqual(['b'])
  })

  it('las consecuencias activas de una causa son sus hijas no solucionadas', () => {
    expect(consecuenciasActivas(situaciones, 'a', RECORRIDO_INICIAL).map((s) => s.id)).toEqual(['b'])
    const e = responder(RECORRIDO_INICIAL, 'b', { tipo: 'solucionada', solucionadaEn: '2026-10-04T12:00:00.000Z' })
    expect(consecuenciasActivas(situaciones, 'a', e)).toEqual([])
  })

  it('detecta una situación activa con el mismo motivo, salvo que ya se haya solucionado en este recorrido', () => {
    expect(situacionConMismoMotivo(situaciones, 'Sin energía o agua', RECORRIDO_INICIAL)?.id).toBe('b')
    const e = responder(RECORRIDO_INICIAL, 'b', { tipo: 'solucionada', solucionadaEn: '2026-10-04T12:00:00.000Z' })
    expect(situacionConMismoMotivo(situaciones, 'Sin energía o agua', e)).toBeNull()
  })

  it('arma un único envío con todas las respuestas', () => {
    let e = responder(RECORRIDO_INICIAL, 'a', { tipo: 'solucionada', solucionadaEn: '2026-10-04T12:00:00.000Z' })
    e = responder(e, 'b', { tipo: 'cambio', cambio: { aspectos: ['gravedad'], severidad: 'Alta' } })
    e = { ...e, nueva: { causadaPorId: 'a', motivo: 'Tormenta severa', severidad: 'Alta', secciones: [10] } }
    expect(construirEnvio(situaciones, e)).toEqual({
      afectacionesConfirmadas: [],
      afectacionesModificadas: [{ id: 'b', severidad: 'Alta' }],
      afectacionesSolucionadas: [{ id: 'a', solucionadaEn: '2026-10-04T12:00:00.000Z' }],
      afectacionesNuevas: [{ motivo: 'Tormenta severa', severidad: 'Alta', secciones: [10], causadaPorId: 'a' }],
      servicioEducativo: undefined,
      estadoEstablecimiento: undefined,
      confirmarInterrupcionTotal: undefined,
    })
  })

  it('un cambio sólo de gravedad no manda alcance, y uno de alcance no manda gravedad', () => {
    let e = responder(RECORRIDO_INICIAL, 'a', { tipo: 'cambio', cambio: { aspectos: ['alcance'], secciones: [10, 20] } })
    e = responder(e, 'b', { tipo: 'sigue' })
    expect(construirEnvio(situaciones, e).afectacionesModificadas).toEqual([{ id: 'a', secciones: [10, 20] }])
    expect(construirEnvio(situaciones, e).afectacionesConfirmadas).toEqual(['b'])
  })
})
