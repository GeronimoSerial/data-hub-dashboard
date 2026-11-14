import { describe, expect, it } from 'vitest'
import { eventosMovimiento } from './movimiento-eventos'
import type { DiffParte } from './movimiento-diff'

function diff(parcial: Partial<DiffParte>): DiffParte {
  return {
    afectacionesAgregadas: [],
    afectacionesRetiradas: [],
    severidadesCambiadas: [],
    alcancesCambiados: [],
    datosCambiados: [],
    serviciosCambiados: [],
    establecimientoCambiado: null,
    asistenciaPedagogicaCambiada: null,
    afectacionesConfirmadas: [],
    ...parcial,
  }
}

describe('eventosMovimiento', () => {
  it('describes a new situation with severity and scope', () => {
    const eventos = eventosMovimiento(
      diff({
        afectacionesAgregadas: [
          { afectacionId: 'a1', motivo: 'Anegamiento', categoria: 'establecimiento', severidad: 'Media', secciones: 1, alumnos: 20 },
        ],
      }),
      'reporte_inicial',
    )
    expect(eventos).toEqual([
      { tipo: 'nueva', afectacionId: 'a1', motivo: 'Anegamiento', severidad: 'Media', texto: 'Nueva: Anegamiento · media', paso: 'Media · 1 secc.' },
    ])
  })

  it('marks severity direction and keeps the confirmation as an event', () => {
    const eventos = eventosMovimiento(
      diff({
        severidadesCambiadas: [{ afectacionId: 'a1', motivo: 'Anegamiento', de: 'Media', a: 'Crítica' }],
        afectacionesConfirmadas: [{ afectacionId: 'a2', motivo: 'Corte de luz' }],
      }),
      'actualizacion',
    )
    expect(eventos.map((evento) => [evento.tipo, evento.afectacionId, evento.texto, evento.paso])).toEqual([
      ['gravedad', 'a1', 'Anegamiento pasó a crítica', '↑ Crítica'],
      ['confirmada', 'a2', 'Corte de luz sigue igual', 'Sigue igual'],
    ])
  })

  it('summarizes scope changes as net differences', () => {
    const [ampliado, total] = eventosMovimiento(
      diff({
        alcancesCambiados: [
          { afectacionId: 'a1', motivo: 'Anegamiento', seccionesAgregadas: 2, seccionesRetiradas: 0, alumnosAgregados: 40, alumnosRetirados: 0 },
          { afectacionId: 'a2', motivo: 'Corte de luz', seccionesAgregadas: 5, seccionesRetiradas: 0, alumnosAgregados: 0, alumnosRetirados: 0, todaLaEscuela: true },
        ],
      }),
      'actualizacion',
    )
    expect(ampliado.texto).toBe('Anegamiento: +2 secc.')
    expect(ampliado.paso).toBe('+2 secc.')
    expect(total.paso).toBe('Toda la escuela')
  })

  it('distinguishes solved from withdrawn situations', () => {
    const eventos = eventosMovimiento(
      diff({
        afectacionesRetiradas: [
          { afectacionId: 'a1', motivo: 'Filtración', cierre: 'solucionada' },
          { afectacionId: 'a2', motivo: 'Error de carga', cierre: 'retirada' },
        ],
      }),
      'actualizacion',
    )
    expect(eventos.map((evento) => [evento.tipo, evento.texto])).toEqual([
      ['solucionada', 'Resuelta: Filtración'],
      ['retirada', 'Se quitó: Error de carga'],
    ])
  })

  it('quotes a new observation', () => {
    const [evento] = eventosMovimiento(
      diff({
        datosCambiados: [
          { afectacionId: 'a1', motivo: 'Anegamiento', campos: [{ campo: 'descripcion', de: null, a: 'El agua no baja' }], seccionesConSeleccionCambiada: [] },
        ],
      }),
      'actualizacion',
    )
    expect(evento).toMatchObject({ tipo: 'datos', afectacionId: 'a1', texto: 'Anegamiento: «El agua no baja»', paso: 'Nueva observación' })
  })

  it('reports school-wide changes without a situation', () => {
    const eventos = eventosMovimiento(
      diff({
        establecimientoCambiado: { de: 'habitual', a: 'sin_clases' },
        serviciosCambiados: [{ alcance: { tipo: 'establecimiento', referenciaId: null }, de: 'normal', a: 'suspendido' }],
      }),
      'cambio_establecimiento',
    )
    expect(eventos.map((evento) => [evento.afectacionId, evento.texto])).toEqual([
      [null, 'Se interrumpieron clases'],
      [null, 'Edificio: sin clases'],
    ])
  })

  it('falls back to a single event for confirmations, photos and empty diffs', () => {
    expect(eventosMovimiento(diff({}), 'confirmacion')[0].texto).toBe('Parte confirmado sin cambios')
    expect(eventosMovimiento({ documentaMovimientoId: 'm1' } as unknown as DiffParte, 'evidencia_fotografica')[0]).toMatchObject({ tipo: 'evidencia', texto: 'Fotos agregadas' })
    expect(eventosMovimiento(diff({}), 'actualizacion')[0].texto).toBe('Parte actualizado')
  })
})
