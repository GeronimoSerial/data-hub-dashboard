import { describe, expect, it } from 'vitest'
import type { RemitoSummary } from './remito-api'
import { daysAgo, envioStatus, remitoUnits } from './remito-status'

const now = new Date('2026-11-14T12:00:00.000Z').getTime()

function remito(overrides: Partial<RemitoSummary>): RemitoSummary {
  return {
    remitoId: 'r', campaignId: 'c', modo: 'cabecera', cabeceraCueAnexo: '180000000', status: 'dispatched',
    dispatchedAt: '2026-11-12T12:00:00.000Z', cabeceraReceivedAt: '2026-11-13T12:00:00.000Z', lines: [], ...overrides,
  }
}

const item = (dispatched: number, cabecera: number | null, school: number | null) =>
  ({ productId: 'p', dispatchedQuantity: dispatched, cabeceraReceivedQuantity: cabecera, schoolReceivedQuantity: school })

describe('envioStatus', () => {
  it('waits for the cabecera until it confirms', () => {
    const status = envioStatus(remito({ cabeceraReceivedAt: null, lines: [{ recipientCueAnexo: 'a', recipientName: 'A', status: 'in_transit', items: [item(10, null, null)] }] }), now)
    expect(status).toMatchObject({ stage: 'waiting', short: false, label: 'Esperando a la cabecera', detail: 'Salió hace 2 días y todavía no confirmó que llegó' })
  })

  it('treats a reserve as done once the cabecera has it, and still waits while it has not', () => {
    const line = { reserva: true, recipientCueAnexo: 'a', recipientName: 'A', status: 'at_cabecera' as const, items: [item(100, 100, null)] }
    expect(envioStatus(remito({ lines: [line] }), now)).toMatchObject({ stage: 'done', label: 'Reserva recibida', detail: 'La cabecera la reparte entre sus escuelas' })
    expect(envioStatus(remito({ cabeceraReceivedAt: null, lines: [line] }), now)).toMatchObject({ stage: 'waiting', label: 'Esperando a la cabecera' })
  })

  it('is delivering while some school has not confirmed, and names a shortfall', () => {
    const status = envioStatus(remito({ lines: [
      { recipientCueAnexo: 'a', recipientName: 'A', status: 'received', items: [item(10, 8, 8)] },
      { recipientCueAnexo: 'b', recipientName: 'B', status: 'at_cabecera', items: [item(5, 5, null)] },
    ] }), now)
    expect(status).toMatchObject({ stage: 'delivering', short: true, label: 'En reparto', detail: '1 de 2 escuelas ya recibió · llegaron 2 de menos', schools: 2, schoolsDone: 1 })
  })

  it('is delivered once every school confirmed, with or without shortfalls', () => {
    const line = (school: number) => ({ recipientCueAnexo: 'a', recipientName: 'A', status: 'received' as const, items: [item(10, 10, school)] })
    expect(envioStatus(remito({ lines: [line(10)] }), now)).toMatchObject({ stage: 'done', short: false, label: 'Entregado', detail: 'La escuela confirmó que recibió todo' })
    expect(envioStatus(remito({ lines: [line(9)] }), now)).toMatchObject({ stage: 'done', short: true, label: 'Entregado con faltantes', detail: 'Llegó 1 de menos · la escuela ya confirmó' })
  })
})

describe('envioStatus for a directo remito', () => {
  const directo = (lines: RemitoSummary['lines']) => remito({ modo: 'directo', cabeceraCueAnexo: null, cabeceraReceivedAt: null, lines })
  const line = (status: RemitoSummary['lines'][number]['status'], school: number | null) => ({
    recipientCueAnexo: 'a', recipientName: 'A', status, items: [item(10, null, school)],
  })

  it('never waits for a cabecera and says it is on its way to the schools', () => {
    const status = envioStatus(directo([line('in_transit', null), line('in_transit', null)]), now)
    expect(status).toMatchObject({ stage: 'delivering', label: 'En camino a escuelas', detail: '0 de 2 escuelas ya recibieron', schools: 2, schoolsDone: 0 })
  })

  it('is delivered once every school confirmed', () => {
    expect(envioStatus(directo([line('received', 10)]), now)).toMatchObject({ stage: 'done', label: 'Entregado', short: false })
  })
})

describe('remitoUnits', () => {
  it('adds what was sent, what schools confirmed and what was lost on each leg', () => {
    const units = remitoUnits(remito({ lines: [{ recipientCueAnexo: 'a', recipientName: 'A', status: 'received', items: [item(30, 25, 20), item(10, null, null)] }] }))
    expect(units).toEqual({ dispatched: 40, delivered: 20, shortAtCabecera: 5, shortAtSchool: 5, short: 10 })
  })
})

describe('daysAgo', () => {
  it('says hoy, ayer or the number of days', () => {
    expect(daysAgo('2026-11-14T09:00:00.000Z', now)).toBe('hoy')
    expect(daysAgo('2026-11-13T09:00:00.000Z', now)).toBe('ayer')
    expect(daysAgo('2026-11-04T12:00:00.000Z', now)).toBe('hace 10 días')
  })
})
