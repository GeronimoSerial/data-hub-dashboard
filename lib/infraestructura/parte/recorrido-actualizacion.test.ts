import { describe, expect, it } from 'vitest'
import {
  RECORRIDO_INICIAL,
  consecuenciasActivas,
  carrerasDelServicio,
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

describe('institutos: alcance por carrera en el envío', () => {
  const situacion: SituacionRecorrido = {
    id: 'a', motivo: 'Inundación', categoria: 'establecimiento', severidad: 'Media',
    rigeDesde: '2026-10-02T10:00:00.000Z', creadaEn: '2026-10-02T10:00:00.000Z', causadaPorId: null,
  }

  it('envía carreras y alumnos de la modificación, y el servicio por carrera', () => {
    const estado = responder(RECORRIDO_INICIAL, 'a', {
      tipo: 'cambio',
      cambio: { aspectos: ['alcance', 'clases-edificio'], carreras: [1], alumnos: [], alumnosElegidos: [] },
    })
    const envio = construirEnvio([situacion], { ...estado, clasesEdificio: { servicioEstado: 'suspendido', estadoEstablecimiento: 'habitual', confirmarInterrupcionTotal: false } }, { carreras: [1] })
    expect(envio.afectacionesModificadas).toEqual([{ id: 'a', carreras: [1], alumnos: [] }])
    expect(envio.servicioEducativo).toEqual({ estado: 'suspendido', alcance: { tipo: 'carrera', carreras: [1] } })
  })

  it('sin alcance de carreras el servicio sigue siendo del establecimiento (GE)', () => {
    const estado = { ...RECORRIDO_INICIAL, clasesEdificio: { servicioEstado: 'suspendido' as const, estadoEstablecimiento: 'habitual' as const, confirmarInterrupcionTotal: false } }
    expect(construirEnvio([situacion], estado).servicioEducativo).toEqual({ estado: 'suspendido', alcance: { tipo: 'establecimiento' } })
  })

  it('la interrupción de clases alcanza las carreras de las situaciones activas, no las solucionadas', () => {
    const otra: SituacionRecorrido = { ...situacion, id: 'b' }
    const estado = responder(
      responder(RECORRIDO_INICIAL, 'a', { tipo: 'sigue' }),
      'b',
      { tipo: 'solucionada', solucionadaEn: '2026-10-03T10:00:00.000Z' },
    )
    const carreras = carrerasDelServicio([situacion, otra], estado, [1, 2, 3], (s) => (s.id === 'a' ? [2] : [3]))
    expect(carreras).toEqual([2])
  })

  it('sin situaciones activas la interrupción vale para todo el catálogo del CUE', () => {
    expect(carrerasDelServicio([], RECORRIDO_INICIAL, [1, 2], () => [])).toEqual([1, 2])
  })

  it('la interrupción de clases incluye las carreras de la situación nueva', () => {
    const estado = { ...RECORRIDO_INICIAL, nueva: { causadaPorId: null, motivo: 'Tormenta severa', severidad: 'Alta' as const, carreras: [3] } }
    expect(carrerasDelServicio([situacion], estado, [1, 2, 3], () => [1]).sort()).toEqual([1, 3])
  })
})
