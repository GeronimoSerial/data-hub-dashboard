import { describe, expect, it } from 'vitest'
import type { BookletRequestSummary } from '@/lib/cuadernillos/types'
import { defaultApprovalQuantities, fichaEscuelaHref, formatAge, groupPendingByCabecera } from './inbox-model'

function request(overrides: Partial<BookletRequestSummary>): BookletRequestSummary {
  return {
    requestId: 'request-1', rootRequestId: 'request-1', recipientCueAnexo: '180123457', recipientName: 'Escuela Anexo',
    cabeceraCueAnexo: '180123456', cabeceraName: 'Escuela Cabecera', status: 'pending',
    requested: [{ productId: 'book-a', productLabel: 'Cuadernillo A', quantity: 12 }],
    approved: [], remaining: [], submittedAt: '2026-11-12T10:00:00.000Z', approvedAt: null, approvalIdentity: null,
    ...overrides,
  }
}

describe('groupPendingByCabecera', () => {
  it('groups pending requests by cabecera with counts and ignores decided requests', () => {
    const groups = groupPendingByCabecera([
      request({ requestId: 'r1', cabeceraCueAnexo: '180123456', cabeceraName: 'Cabecera B' }),
      request({ requestId: 'r2', cabeceraCueAnexo: '180999999', cabeceraName: 'Cabecera A' }),
      request({ requestId: 'r3', cabeceraCueAnexo: '180123456', cabeceraName: 'Cabecera B' }),
      request({ requestId: 'r4', status: 'approved' }),
    ])

    expect(groups.map((group) => [group.cabeceraName, group.requests.length])).toEqual([
      ['Cabecera A', 1],
      ['Cabecera B', 2],
    ])
    expect(groups[1].requests.map((row) => row.requestId)).toEqual(['r1', 'r3'])
  })

  it('returns no groups when nothing is pending', () => {
    expect(groupPendingByCabecera([request({ status: 'rejected' })])).toEqual([])
  })
})

describe('formatAge', () => {
  const now = new Date('2026-11-12T12:00:00.000Z')

  it('reports minutes, hours and days in Spanish', () => {
    expect(formatAge('2026-11-12T11:58:00.000Z', now)).toBe('hace 2 min')
    expect(formatAge('2026-11-12T10:00:00.000Z', now)).toBe('hace 2 h')
    expect(formatAge('2026-11-10T12:00:00.000Z', now)).toBe('hace 2 días')
  })

  it('returns an empty label when the submission date is missing', () => {
    expect(formatAge(null, now)).toBe('')
  })
})

describe('fichaEscuelaHref', () => {
  it('formats the ENOS ficha route from a 9-digit CUE only', () => {
    expect(fichaEscuelaHref('180123457')).toBe('/mapas/infraestructura/escuelas/1801234-57')
    expect(fichaEscuelaHref('18012')).toBeNull()
  })
})

describe('defaultApprovalQuantities', () => {
  it('defaults each line to the requested quantity when availability is unknown', () => {
    expect(defaultApprovalQuantities(request({}), [])).toEqual({ 'book-a': 12 })
  })

  it('caps each line at the available quantity and never above the requested quantity', () => {
    const row = request({
      requested: [
        { productId: 'book-a', productLabel: 'Cuadernillo A', quantity: 12 },
        { productId: 'book-b', productLabel: 'Cuadernillo B', quantity: 4 },
      ],
    })
    expect(defaultApprovalQuantities(row, [
      { productId: 'book-a', available: 5 },
      { productId: 'book-b', available: 9 },
    ])).toEqual({ 'book-a': 5, 'book-b': 4 })
  })

  it('floors negative availability at zero', () => {
    expect(defaultApprovalQuantities(request({}), [{ productId: 'book-a', available: -3 }])).toEqual({ 'book-a': 0 })
  })
})
