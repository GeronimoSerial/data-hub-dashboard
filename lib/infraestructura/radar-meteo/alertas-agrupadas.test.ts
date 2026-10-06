import { describe, expect, it } from 'vitest'
import { agruparAlertas, formatearVentanaAlerta, resumirAlertas, type AlertaRadar } from './alertas-agrupadas'

function alerta(overrides: Partial<AlertaRadar> = {}): AlertaRadar {
  return {
    id: 'a1',
    nivelSat: 'yellow',
    severidad: 'Moderada',
    evento: 'Tormentas',
    headline: 'Alerta de tormentas',
    description: null,
    instruction: null,
    onset: '2026-10-06T12:00:00Z',
    expires: '2026-10-06T18:00:00Z',
    departamentos: [],
    ...overrides,
  }
}

describe('agruparAlertas', () => {
  it('une departamentos sin duplicados y conserva las alertas originales', () => {
    const alertas = [
      alerta({ id: 'a1', nivelSat: 'yellow', departamentos: ['Capital', { id: '2', nombre: 'Bella Vista' }] }),
      alerta({ id: 'a2', nivelSat: 'red', headline: 'Otro titular', departamentos: [{ id: '1', nombre: 'Capital' }, 'Ituzaingó'] }),
    ]

    const [grupo] = agruparAlertas(alertas, Date.parse('2026-10-06T15:00:00Z'))

    expect(grupo.departamentos).toEqual(['Bella Vista', 'Capital', 'Ituzaingó'])
    expect(grupo.ids).toEqual(['a1', 'a2'])
    expect(grupo.alertas).toEqual(alertas)
    expect(grupo.nivelSat).toBe('red')
    expect(grupo.headline).toBe('Alerta de tormentas')
  })

  it('separa alertas con distinto onset, ordena vigentes antes de próximas y deja departamentos vacíos', () => {
    const grupos = agruparAlertas([
      alerta({ id: 'proxima', evento: 'Viento', onset: '2026-10-07T18:00:00Z', departamentos: [] }),
      alerta({ id: 'vigente-tarde', evento: 'Viento', onset: '2026-10-06T14:00:00Z' }),
      alerta({ id: 'vigente-temprana', evento: 'Lluvia', onset: '2026-10-06T13:00:00Z' }),
      alerta({ id: 'otro-onset', evento: 'Viento', onset: '2026-10-06T15:00:00Z' }),
    ], Date.parse('2026-10-06T15:00:00Z'))

    expect(grupos.map(({ ids }) => ids)).toEqual([['vigente-temprana'], ['vigente-tarde'], ['otro-onset'], ['proxima']])
    expect(grupos.at(-1)?.departamentos).toEqual([])
    expect(grupos.at(-1)?.proxima).toBe(true)
  })
})

describe('resumirAlertas', () => {
  const ahora = Date.parse('2026-10-06T15:00:00Z')

  it('resume una y varias alertas sólo próximas con la fecha local exacta', () => {
    const una = agruparAlertas([alerta({ onset: '2026-10-07T18:00:00Z', expires: '2026-10-07T20:00:00Z' })], ahora)
    const varias = agruparAlertas([
      alerta({ id: 'a1', onset: '2026-10-07T18:00:00Z', expires: '2026-10-07T20:00:00Z' }),
      alerta({ id: 'a2', evento: 'Viento', onset: '2026-10-08T18:00:00Z', expires: '2026-10-08T20:00:00Z' }),
    ], ahora)

    expect(resumirAlertas(una).texto).toBe('1 alerta del SMN · próxima desde mié 7, 15:00')
    expect(resumirAlertas(varias).texto).toBe('2 alertas del SMN · próximas desde mié 7, 15:00')
  })

  it('resume una y varias alertas sólo vigentes', () => {
    const una = agruparAlertas([alerta()], ahora)
    const varias = agruparAlertas([alerta(), alerta({ id: 'a2', evento: 'Viento' })], ahora)

    expect(resumirAlertas(una).texto).toBe('1 alerta vigente del SMN')
    expect(resumirAlertas(varias).texto).toBe('2 alertas vigentes del SMN')
  })

  it('resume mezclas con concordancia, nivel mayor y lista vacía', () => {
    const grupos = agruparAlertas([
      alerta({ id: 'vigente', nivelSat: 'amarilla' }),
      alerta({ id: 'proxima', onset: '2026-10-07T18:00:00Z', expires: '2026-10-07T20:00:00Z', nivelSat: 'naranja' }),
      alerta({ id: 'proxima-2', evento: 'Viento', onset: '2026-10-08T18:00:00Z', expires: '2026-10-08T20:00:00Z', nivelSat: 'roja' }),
    ], ahora)

    expect(resumirAlertas(grupos)).toEqual({ total: 3, vigentes: 1, proximas: 2, texto: '1 vigente · 2 próximas', nivel: 'red' })
    const mezclaSingular = agruparAlertas([
      alerta({ id: 'vigente' }),
      alerta({ id: 'proxima', onset: '2026-10-07T18:00:00Z', expires: '2026-10-07T20:00:00Z' }),
    ], ahora)
    expect(resumirAlertas(mezclaSingular).texto).toBe('1 vigente · 1 próxima')
    expect(resumirAlertas([])).toEqual({ total: 0, vigentes: 0, proximas: 0, texto: '', nivel: null })
  })
})

describe('formatearVentanaAlerta', () => {
  it('formatea inicio y fin en la zona horaria de Argentina', () => {
    expect(formatearVentanaAlerta('2026-10-07T18:00:00Z', '2026-10-08T06:00:00Z'))
      .toBe('mié 7, 15:00 – jue 8, 03:00')
  })
})
