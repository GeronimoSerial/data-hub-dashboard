import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Route from './route'
import { getSessionUser } from '@/lib/session'
import { hubApiAccessResponse } from '@/lib/hub-entry-server'
import {
  AssignmentSourceError,
  confirmStagedAssignmentSource,
  loadStagedAssignmentAccepted,
} from '@/lib/cuadernillos/assignment-source'
import type { SessionUser } from '@/lib/acl'

vi.mock('@/lib/session', () => ({ getSessionUser: vi.fn() }))
vi.mock('@/lib/hub-entry-server', () => ({ hubApiAccessResponse: vi.fn() }))
vi.mock('@/lib/cuadernillos/assignment-source', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/cuadernillos/assignment-source')>()),
  loadStagedAssignmentAccepted: vi.fn(),
  confirmStagedAssignmentSource: vi.fn(),
}))

let POST: typeof Route.POST
beforeAll(async () => { const route = await import('./route'); POST = route.POST })

const admin = {
  id: 'admin-1', role: 'admin', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [],
  hubPolicy: { enabledSections: ['cuadernillos'], landing: false },
} as SessionUser

const PREVIEW_HASH = 'c'.repeat(64)
const accepted = [
  { cueAnexo: '180017000', schoolName: 'CABECERA', relationship: 'cabecera', supervisorName: 'MILAGROS GONZALEZ', cabeceraCue: '180017000', provenance: [] },
  { cueAnexo: '180013600', schoolName: 'DEPENDIENTE', relationship: 'dependiente', supervisorName: 'MILAGROS GONZALEZ', cabeceraCue: '180017000', provenance: [] },
  { cueAnexo: '180016000', schoolName: 'OTRO SUPERVISOR', relationship: 'cabecera', supervisorName: 'SIN CUENTA', cabeceraCue: '180016000', provenance: [] },
]

function request(body: unknown) {
  return new Request('http://localhost/api/cuadernillos/assignments/sources/revision-1/confirm', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
}
const context = (id = 'revision-1') => ({ params: Promise.resolve({ id }) })
const body = {
  previewHash: PREVIEW_HASH,
  supervisorAccounts: { 'MILAGROS GONZALEZ': 'user-sup-1' },
  cabeceraAccounts: { '180017000': 'user-cab-1' },
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getSessionUser).mockResolvedValue(admin)
  vi.mocked(hubApiAccessResponse).mockResolvedValue(null)
  vi.mocked(loadStagedAssignmentAccepted).mockResolvedValue({ revisionId: 'revision-1', status: 'staged', accepted: accepted as never })
  vi.mocked(confirmStagedAssignmentSource).mockResolvedValue({
    persistedCueAnexos: ['180013600', '180017000'], retainedConflictCueAnexos: [], blockedCueAnexos: [],
  })
})

describe('POST /api/cuadernillos/assignments/sources/[id]/confirm', () => {
  it('rejects an anonymous confirmation before loading the revision', async () => {
    vi.mocked(hubApiAccessResponse).mockResolvedValue(Response.json({ error: 'Unauthorized' }, { status: 401 }))

    const response = await POST(request(body), context())

    expect(response.status).toBe(401)
    expect(loadStagedAssignmentAccepted).not.toHaveBeenCalled()
    expect(confirmStagedAssignmentSource).not.toHaveBeenCalled()
  })

  it('denies a non-planning actor with the staging 403 and writes nothing', async () => {
    vi.mocked(loadStagedAssignmentAccepted).mockRejectedValue(new AssignmentSourceError('forbidden', 403))

    const response = await POST(request(body), context())

    expect(response.status).toBe(403)
    expect(confirmStagedAssignmentSource).not.toHaveBeenCalled()
  })

  it('expands the name and cabecera mappings and reports confirmed and skipped schools', async () => {
    const response = await POST(request(body), context())
    const result = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(confirmStagedAssignmentSource).toHaveBeenCalledWith(
      admin,
      PREVIEW_HASH,
      [
        expect.objectContaining({ cueAnexo: '180017000', supervisorUserId: 'user-sup-1', cabeceraUserId: 'user-cab-1' }),
        expect.objectContaining({ cueAnexo: '180013600', supervisorUserId: 'user-sup-1', cabeceraUserId: 'user-cab-1' }),
      ],
    )
    expect(result).toEqual({
      confirmedCount: 2,
      confirmed: ['180013600', '180017000'],
      skipped: [{ cueAnexo: '180016000', reason: 'supervisor_unmapped' }],
      retainedConflictCueAnexos: [],
    })
  })

  it('reports a dependent school whose cabecera is not confirmed as skipped', async () => {
    vi.mocked(confirmStagedAssignmentSource).mockResolvedValue({
      persistedCueAnexos: ['180017000'], retainedConflictCueAnexos: [], blockedCueAnexos: ['180013600'],
    })

    const result = await (await POST(request(body), context())).json()

    expect(result.confirmedCount).toBe(1)
    expect(result.skipped).toEqual([
      { cueAnexo: '180016000', reason: 'supervisor_unmapped' },
      { cueAnexo: '180013600', reason: 'dependency_not_confirmed' },
    ])
  })

  it('refuses a body whose preview hash does not belong to this revision', async () => {
    vi.mocked(loadStagedAssignmentAccepted).mockResolvedValue({ revisionId: 'another-revision', status: 'staged', accepted: accepted as never })

    const response = await POST(request(body), context('revision-1'))

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'staged_revision_mismatch' })
    expect(confirmStagedAssignmentSource).not.toHaveBeenCalled()
  })

  it('rejects a malformed body before touching the revision', async () => {
    const response = await POST(request({ ...body, previewHash: 'nope' }), context())

    expect(response.status).toBe(400)
    expect(loadStagedAssignmentAccepted).not.toHaveBeenCalled()
  })

  it('passes an already-confirmed revision refusal through with its status', async () => {
    vi.mocked(confirmStagedAssignmentSource).mockRejectedValue(new AssignmentSourceError('staged_revision_already_confirmed', 409))

    const response = await POST(request(body), context())

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'staged_revision_already_confirmed' })
  })
})
