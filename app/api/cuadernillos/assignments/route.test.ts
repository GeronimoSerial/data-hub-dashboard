import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import type { SessionUser } from '@/lib/acl'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Route from './route'
import { getSessionUser } from '@/lib/session'
import { getBookletAssignmentsPage } from '@/lib/cuadernillos/queries'
import { hubApiAccessResponse } from '@/lib/hub-entry-server'
import { hasBookletCapability } from '@/lib/cuadernillos/permissions'
import { confirmAndPersistAssignments, validateAssignments } from '@/lib/cuadernillos/assignment-import'
import type { BookletAssignmentsPage } from '@/lib/cuadernillos/types'

usarDbTemporal('cuadernillos-assignments-rutas-')

vi.mock('@/lib/session', () => ({ getSessionUser: vi.fn() }))
vi.mock('@/lib/hub-entry-server', () => ({ hubApiAccessResponse: vi.fn() }))
vi.mock('@/lib/cuadernillos/queries', () => ({ getBookletAssignmentsPage: vi.fn() }))
vi.mock('@/lib/cuadernillos/permissions', () => ({ hasBookletCapability: vi.fn() }))
vi.mock('@/lib/cuadernillos/assignment-import', () => ({ confirmAndPersistAssignments: vi.fn(), validateAssignments: vi.fn() }))

let GET: typeof Route.GET
let POST: typeof Route.POST
beforeAll(async () => { const route = await import('./route'); GET = route.GET; POST = route.POST })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getSessionUser).mockResolvedValue({
    id: 'supervisor-1', role: 'consulta', banned: false,
    nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [],
    hubPolicy: { enabledSections: ['cuadernillos'], landing: false },
  })
  vi.mocked(getBookletAssignmentsPage).mockResolvedValue({
    items: [{
      cueAnexo: '180123456', schoolName: 'Escuela autorizada', relationship: 'dependiente',
      cabeceraCueAnexo: '180123000', supervisorName: 'Nombre de referencia',
    }],
    nextCursor: null,
  })
  vi.mocked(hubApiAccessResponse).mockResolvedValue(null)
  vi.mocked(hasBookletCapability).mockResolvedValue(true)
  vi.mocked(validateAssignments).mockReturnValue({ accepted: [], conflicts: [], unresolved: [] })
  vi.mocked(confirmAndPersistAssignments).mockResolvedValue({
    preview: { accepted: [], conflicts: [], unresolved: [] },
    persistence: { persistedCueAnexos: [], retainedConflictCueAnexos: [], blockedCueAnexos: [] },
  })
})

function request(query = 'capability=supervisor') {
  return new Request(`http://localhost/api/cuadernillos/assignments?${query}`)
}

const assignmentRows = [{
  cue: '180123456', schoolName: 'Escuela de muestra', relationship: 'cabecera',
  supervisorName: 'Supervisión confirmada', cabeceraCue: null,
  provenance: { sourceId: 'fixture', location: 'row-1' },
}]
const importBody = { mode: 'preview', rows: assignmentRows }
function postRequest(body: unknown) {
  return new Request('http://localhost/api/cuadernillos/assignments', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
}

describe('GET /api/cuadernillos/assignments', () => {
  it('rejects anonymous access before reading assignments', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    vi.mocked(hubApiAccessResponse).mockResolvedValue(Response.json({ error: 'Unauthorized' }, { status: 401 }))

    const response = await GET(request())

    expect(response.status).toBe(401)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(getBookletAssignmentsPage).not.toHaveBeenCalled()
  })

  it('requires the cuadernillos hub section before the module query', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({
      id: 'supervisor-1', role: 'consulta', banned: false,
      nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [],
      hubPolicy: { enabledSections: ['maps'], landing: false },
    })
    vi.mocked(hubApiAccessResponse).mockResolvedValue(Response.json({ error: 'No tiene acceso' }, { status: 403 }))

    const response = await GET(request())

    expect(response.status).toBe(403)
    expect(getBookletAssignmentsPage).not.toHaveBeenCalled()
  })

  it('validates capability and unique cursor before the scoped reader', async () => {
    for (const query of [
      'capability=owner',
      'capability=supervisor&cursor=18012345',
      'capability=supervisor&cursor=180123456&cursor=180123457',
      'capability=supervisor&capability=planning',
    ]) {
      const response = await GET(request(query))
      expect(response.status).toBe(400)
    }

    expect(getBookletAssignmentsPage).not.toHaveBeenCalled()
  })

  it('does not reveal whether assignments exist when capability is absent', async () => {
    vi.mocked(getBookletAssignmentsPage).mockResolvedValue(null)

    const response = await GET(request())
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body).toEqual({ error: 'No tiene acceso a este recurso' })
  })

  it('returns only the authorized assignment page and keeps it private', async () => {
    const page: BookletAssignmentsPage = {
      items: [{
        cueAnexo: '180123456', schoolName: 'Escuela autorizada', relationship: 'dependiente',
        cabeceraCueAnexo: '180123000', supervisorName: 'Nombre de referencia',
      }],
      nextCursor: '180123456',
    }
    vi.mocked(getBookletAssignmentsPage).mockResolvedValue(page)

    const response = await GET(request('capability=supervisor&cursor=180123000'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(getBookletAssignmentsPage).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'supervisor-1' }),
      'supervisor',
      { cursor: '180123000' },
    )
    expect(body).toEqual(page)
    expect(JSON.stringify(body)).not.toMatch(/studentId|nombreAlumno|apellidoAlumno|dni|email|phone/i)
  })
})

describe('POST /api/cuadernillos/assignments', () => {
  it('requires the module hub section before preview or persistence', async () => {
    vi.mocked(hubApiAccessResponse).mockResolvedValue(Response.json({ error: 'No tiene acceso' }, { status: 403 }))

    const response = await POST(postRequest(importBody))

    expect(response.status).toBe(403)
    expect(validateAssignments).not.toHaveBeenCalled()
  })

  it('requires planning membership before validating submitted rows', async () => {
    vi.mocked(hasBookletCapability).mockResolvedValue(false)

    const response = await POST(postRequest(importBody))

    expect(response.status).toBe(403)
    expect(validateAssignments).not.toHaveBeenCalled()
  })

  it('strictly validates manual preview rows and excludes contact or authority fields', async () => {
    const response = await POST(postRequest({ ...importBody, rows: [{ ...assignmentRows[0], email: 'person@example.test' }] }))

    expect(response.status).toBe(400)
    expect(validateAssignments).not.toHaveBeenCalled()
  })

  it('returns a server-generated preview for planning members', async () => {
    const preview = {
      accepted: [{ cueAnexo: '180123456', schoolName: 'Escuela de muestra', relationship: 'cabecera', supervisorName: 'Supervisión confirmada', cabeceraCue: '180123456', provenance: [{ sourceId: 'fixture', location: 'row-1' }] }],
      conflicts: [], unresolved: [],
    }
    vi.mocked(validateAssignments).mockReturnValue(preview as never)

    const response = await POST(postRequest(importBody))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ preview })
    expect(validateAssignments).toHaveBeenCalledWith(assignmentRows)
  })

  it('fails closed on client-provided rows even when the account is a planner', async () => {
    const confirmations = [{ cueAnexo: '180123456', supervisorUserId: 'supervisor-id', cabeceraUserId: 'head-id' }]
    const untrustedRows = [{
      ...assignmentRows[0],
      provenance: { sourceId: 'caller-fabricated-source', location: 'invented-row-1' },
    }]

    const response = await POST(postRequest({ mode: 'confirm', rows: untrustedRows, confirmations }))

    expect(response.status).toBe(503)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await response.json()).toEqual({ error: 'assignment_confirmation_unavailable' })
    expect(validateAssignments).not.toHaveBeenCalled()
    expect(confirmAndPersistAssignments).not.toHaveBeenCalled()
  })

  it('rejects client-supplied validation results or unknown confirmation modes', async () => {
    for (const body of [
      { mode: 'confirm', rows: assignmentRows, accepted: [], conflicts: [], unresolved: [], confirmations: [] },
      { mode: 'persist', rows: assignmentRows },
      { mode: 'confirm', rows: assignmentRows, confirmations: [{ cueAnexo: '180123456', supervisorUserId: 'id', cabeceraUserId: 'id', role: 'planning' }] },
    ]) {
      expect((await POST(postRequest(body))).status).toBe(400)
    }
    expect(validateAssignments).not.toHaveBeenCalled()
    expect(confirmAndPersistAssignments).not.toHaveBeenCalled()
  })
})

describe('removed view-as parameter on /api/cuadernillos/assignments', () => {
  it('rejects viewAs on reads and never reads another account', async () => {
    const response = await GET(request('capability=supervisor&viewAs=target-2'))

    expect(response.status).toBe(400)
    expect(getBookletAssignmentsPage).not.toHaveBeenCalled()
  })
})
