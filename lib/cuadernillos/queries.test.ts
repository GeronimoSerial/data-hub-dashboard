import { describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/acl'
import type { BookletAssignmentView, BookletBalanceView, BookletCapability, BookletRequestSummary, BookletRequestsPage } from './types'
import { getBookletAssignmentsPage, getBookletOverviewPage, type BookletAssignmentsQueryRepository, type BookletOverviewQueryRepository } from './queries'

const actor: SessionUser = {
  id: 'cabecera-user-1', role: 'consulta', banned: false,
  nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [],
}

function assignment(index: number): BookletAssignmentView {
  const cueAnexo = String(180000000 + index).padStart(9, '0')
  return {
    cueAnexo,
    schoolName: `Escuela ${index}`,
    relationship: index === 0 ? 'cabecera' : 'dependiente',
    cabeceraCueAnexo: '180000000',
    supervisorName: 'Supervisor asignado',
  }
}

function setup({ authorized = true, rows = [assignment(1)] } = {}) {
  const listAssignments = vi.fn(async () => rows)
  const authorize = vi.fn(async () => authorized)
  const repository: BookletAssignmentsQueryRepository = { listAssignments }
  return { repository, listAssignments, authorize }
}

describe('getBookletAssignmentsPage', () => {
  it('fails closed before reading assignments when the session has no active capability', async () => {
    const { repository, listAssignments, authorize } = setup({ authorized: false })

    const result = await getBookletAssignmentsPage(actor, 'cabecera', { repository, authorize })

    expect(result).toBeNull()
    expect(authorize).toHaveBeenCalledWith(actor, 'cabecera')
    expect(listAssignments).not.toHaveBeenCalled()
  })

  it.each(['planning', 'cabecera', 'supervisor'] as const)(
    'scopes the repository query to the authenticated actor for %s', async (capability: BookletCapability) => {
      const { repository, listAssignments, authorize } = setup()

      await getBookletAssignmentsPage(actor, capability, { repository, authorize })

      expect(listAssignments).toHaveBeenCalledWith({
        userId: actor.id,
        capability,
        cursor: null,
        limit: 26,
      })
    },
  )

  it('returns only the requested page with a cursor and no nominal fields', async () => {
    const rows = Array.from({ length: 26 }, (_, index) => assignment(index))
    const { repository, listAssignments, authorize } = setup({ rows })

    const result = await getBookletAssignmentsPage(actor, 'planning', { repository, authorize })

    expect(result).toEqual({ items: rows.slice(0, 25), nextCursor: rows[24].cueAnexo })
    expect(result?.items).toHaveLength(25)
    expect(listAssignments).toHaveBeenCalledWith({ userId: actor.id, capability: 'planning', cursor: null, limit: 26 })
    expect(JSON.stringify(result)).not.toMatch(/studentId|nombreAlumno|apellidoAlumno|dni|email|phone/i)
  })

  it('uses a valid exclusive cursor for the next page', async () => {
    const { repository, listAssignments, authorize } = setup()

    await getBookletAssignmentsPage(actor, 'supervisor', {
      cursor: '180000024', repository, authorize,
    })

    expect(listAssignments).toHaveBeenCalledWith({
      userId: actor.id,
      capability: 'supervisor',
      cursor: '180000024',
      limit: 26,
    })
  })
})

const campaignOptions = [
  { id: 'campaign-1', name: 'Distribución 2026', distributionEnabled: true, overassignmentAllowed: false },
]
const requestPage: BookletRequestsPage = {
  campaignId: 'campaign-1', campaignOptions: [], requests: [], hasMore: false, nextCursor: null,
}

function balance(overrides: Partial<BookletBalanceView> = {}): BookletBalanceView {
  return {
    productId: 'book-a', productLabel: 'Cuadernillo A', globalAvailable: 80,
    quotaAssigned: null, quotaAvailable: 20, cabeceraCueAnexo: '180000000', cabeceraName: 'Cabecera',
    ...overrides,
  }
}

function overviewSetup({ authorized = true, page = requestPage, balances = [balance()] }: {
  authorized?: boolean
  page?: BookletRequestsPage
  balances?: BookletBalanceView[]
} = {}) {
  const listBalances = vi.fn(async () => balances)
  const authorize = vi.fn(async () => authorized)
  const loadRequests = vi.fn(async () => page)
  const listActiveCampaigns = vi.fn(async () => campaignOptions)
  const repository: BookletOverviewQueryRepository = { listActiveCampaigns, listBalances }
  return { repository, listBalances, listActiveCampaigns, authorize, loadRequests }
}

describe('getBookletOverviewPage', () => {
  it('does not read campaign or balance data without the requested account capability', async () => {
    const setup = overviewSetup({ authorized: false })

    const result = await getBookletOverviewPage(actor, 'planning', { repository: setup.repository, authorize: setup.authorize, loadRequests: setup.loadRequests })

    expect(result).toBeNull()
    expect(setup.authorize).toHaveBeenCalledWith(actor, 'planning')
    expect(setup.loadRequests).not.toHaveBeenCalled()
    expect(setup.listBalances).not.toHaveBeenCalled()
  })

  it('returns active campaign choices without balances when selection is ambiguous', async () => {
    const page: BookletRequestsPage = { campaignId: null, campaignOptions: [...campaignOptions, { ...campaignOptions[0], id: 'campaign-2', name: 'Complementaria' }], requests: [], hasMore: false, nextCursor: null }
    const setup = overviewSetup({ page })

    const result = await getBookletOverviewPage(actor, 'planning', { repository: setup.repository, authorize: setup.authorize, loadRequests: setup.loadRequests })

    expect(result).toMatchObject({ campaignId: null, campaignOptions: page.campaignOptions, balances: [], requests: [], hasMore: false, nextCursor: null })
    expect(setup.listBalances).not.toHaveBeenCalled()
  })

  it('loads planning balances with the authenticated actor and selected campaign', async () => {
    const setup = overviewSetup()

    const result = await getBookletOverviewPage(actor, 'planning', { campaignId: 'campaign-1', repository: setup.repository, authorize: setup.authorize, loadRequests: setup.loadRequests })

    expect(result?.balances).toEqual([balance()])
    expect(setup.loadRequests).toHaveBeenCalledWith(actor, { campaignId: 'campaign-1', limit: 1 })
    expect(setup.listActiveCampaigns).toHaveBeenCalledOnce()
    expect(setup.listBalances).toHaveBeenCalledWith({ userId: actor.id, capability: 'planning', campaignId: 'campaign-1' })
  })

  it('keeps cabecera balances separate per assigned head instead of pooling quotas', async () => {
    const rows = [
      balance({ cabeceraCueAnexo: '180000001', cabeceraName: 'Cabecera A', quotaAvailable: 8, globalAvailable: null }),
      balance({ cabeceraCueAnexo: '180000002', cabeceraName: 'Cabecera B', quotaAvailable: 12, globalAvailable: null }),
    ]
    const setup = overviewSetup({ balances: rows })

    const result = await getBookletOverviewPage(actor, 'cabecera', { repository: setup.repository, authorize: setup.authorize, loadRequests: setup.loadRequests })

    expect(result?.balances).toEqual(rows)
    expect(setup.listBalances).toHaveBeenCalledWith({ userId: actor.id, capability: 'cabecera', campaignId: 'campaign-1' })
  })

  it('does not widen a capability-specific overview with the request reader union scope', async () => {
    const request: BookletRequestSummary = {
      requestId: 'request-1', rootRequestId: 'request-1', recipientCueAnexo: '180000002', recipientName: 'Dependiente',
      cabeceraCueAnexo: '180000000', cabeceraName: 'Cabecera', status: 'pending',
      requested: [], approved: [], remaining: [], submittedAt: null, approvedAt: null, approvalIdentity: null,
    }
    const setup = overviewSetup({ page: { ...requestPage, requests: [request], hasMore: true, nextCursor: 'cursor' } })

    const result = await getBookletOverviewPage(actor, 'cabecera', { repository: setup.repository, authorize: setup.authorize, loadRequests: setup.loadRequests })

    expect(result?.requests).toEqual([])
    expect(result?.hasMore).toBe(false)
    expect(result?.nextCursor).toBeNull()
  })
})
