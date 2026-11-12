import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Route from './route'
import { getSessionUser } from '@/lib/session'
import { hubApiAccessResponse } from '@/lib/hub-entry-server'
import {
  AssignmentSourceError,
  listAssignmentSourceRevisions,
  stageAssignmentSourceManifest,
} from '@/lib/cuadernillos/assignment-source'
import { MAX_ASSIGNMENT_UPLOAD_BYTES } from '@/lib/cuadernillos/assignment-upload'
import type { SessionUser } from '@/lib/acl'

vi.mock('@/lib/session', () => ({ getSessionUser: vi.fn() }))
vi.mock('@/lib/hub-entry-server', () => ({ hubApiAccessResponse: vi.fn() }))
vi.mock('@/lib/cuadernillos/assignment-source', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/cuadernillos/assignment-source')>()),
  stageAssignmentSourceManifest: vi.fn(),
  listAssignmentSourceRevisions: vi.fn(),
}))

let GET: typeof Route.GET
let POST: typeof Route.POST
beforeAll(async () => { const route = await import('./route'); GET = route.GET; POST = route.POST })

const admin: SessionUser = {
  id: 'admin-1', role: 'admin', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [],
  hubPolicy: { enabledSections: ['cuadernillos'], landing: false },
} as SessionUser

const CSV = [
  'cue_anexo,nombre,departamento,supervisor,relationship,cabecera_cue,source,status',
  '180017000,ESCUELA CABECERA,MERCEDES,MILAGROS GONZALEZ,cabecera,180017000,Datos.xlsx:Hoja1:4,ok',
  '180013600,"ESCUELA, DEPENDIENTE",MERCEDES,MILAGROS GONZALEZ,dependiente,180017000,Datos.xlsx:Hoja1:6,ok',
  '180000100,ESCUELA SIN DATOS,BELLA VISTA,,,,Planilla.xlsx:BELLA VISTA:15,sin_cabecera',
].join('\n')

const stagedResult = {
  revisionId: 'revision-1',
  sourceHash: 'a'.repeat(64),
  previewHash: 'b'.repeat(64),
  preview: {
    accepted: [
      { cueAnexo: '180017000', schoolName: 'ESCUELA CABECERA', relationship: 'cabecera', supervisorName: 'MILAGROS GONZALEZ', cabeceraCue: '180017000', provenance: [] },
      { cueAnexo: '180013600', schoolName: 'ESCUELA, DEPENDIENTE', relationship: 'dependiente', supervisorName: 'MILAGROS GONZALEZ', cabeceraCue: '180017000', provenance: [] },
    ],
    conflicts: [],
    unresolved: [{ cue: '180000100', schoolName: 'ESCUELA SIN DATOS', reason: 'missing_supervisor', provenance: {} }],
  },
  sourceRowHashes: {},
}

function csvRequest(body: string | Uint8Array = CSV, contentType = 'text/csv') {
  return new Request('http://localhost/api/cuadernillos/assignments/sources', {
    method: 'POST', headers: { 'content-type': contentType }, body: body as BodyInit,
  })
}

function multipartRequest(text: string, fileName = 'consejo.csv') {
  const form = new FormData()
  form.append('file', new File([text], fileName, { type: 'text/csv' }))
  return new Request('http://localhost/api/cuadernillos/assignments/sources', { method: 'POST', body: form })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getSessionUser).mockResolvedValue(admin)
  vi.mocked(hubApiAccessResponse).mockResolvedValue(null)
  vi.mocked(stageAssignmentSourceManifest).mockResolvedValue(stagedResult as never)
})

describe('POST /api/cuadernillos/assignments/sources', () => {
  it('rejects an anonymous upload before parsing or staging', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    vi.mocked(hubApiAccessResponse).mockResolvedValue(Response.json({ error: 'Unauthorized' }, { status: 401 }))

    const response = await POST(csvRequest())

    expect(response.status).toBe(401)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(stageAssignmentSourceManifest).not.toHaveBeenCalled()
  })

  it('maps a staging refusal for an actor without planning access to 403', async () => {
    vi.mocked(stageAssignmentSourceManifest).mockRejectedValue(new AssignmentSourceError('forbidden', 403))

    const response = await POST(csvRequest())

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'forbidden' })
  })

  it('maps a missing actor to 401 from the staging authority', async () => {
    vi.mocked(stageAssignmentSourceManifest).mockRejectedValue(new AssignmentSourceError('unauthorized', 401))

    const response = await POST(csvRequest())

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'unauthorized' })
  })

  it('lets an admin stage a CSV and returns the preview contract', async () => {
    const response = await POST(csvRequest())
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(stageAssignmentSourceManifest).toHaveBeenCalledWith(
      admin,
      expect.stringMatching(/^upload\.csv:[a-f0-9]{64}$/),
      expect.arrayContaining([
        expect.objectContaining({ cue: '180017000', supervisorName: 'MILAGROS GONZALEZ', relationship: 'cabecera' }),
      ]),
    )
    expect(body).toEqual({
      revisionId: 'revision-1',
      previewHash: 'b'.repeat(64),
      accepted: stagedResult.preview.accepted,
      conflicts: [],
      unresolved: stagedResult.preview.unresolved,
      supervisorNames: ['MILAGROS GONZALEZ'],
      cabeceras: [{ cue: '180017000', nombre: 'ESCUELA CABECERA' }],
    })
  })

  it('reports re-uploading an identical file as already staged, not as an outage', async () => {
    vi.mocked(stageAssignmentSourceManifest).mockRejectedValue(Object.assign(new Error('duplicate key value'), { code: '23505' }))

    const response = await POST(csvRequest())

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'assignment_source_already_staged' })
  })

  it('accepts a multipart upload and binds the revision to the file name and sha256', async () => {
    const response = await POST(multipartRequest(CSV, 'Consejo 2026.csv'))

    expect(response.status).toBe(201)
    const [, sourceId] = vi.mocked(stageAssignmentSourceManifest).mock.calls[0]
    expect(sourceId).toMatch(/^Consejo_2026\.csv:[a-f0-9]{64}$/)
  })

  it('refuses a file over 2 MB before staging', async () => {
    const oversized = new Uint8Array(MAX_ASSIGNMENT_UPLOAD_BYTES + 1).fill(0x61)

    const response = await POST(csvRequest(oversized))

    expect(response.status).toBe(413)
    expect(await response.json()).toEqual({ error: 'file_too_large' })
    expect(stageAssignmentSourceManifest).not.toHaveBeenCalled()
  })

  it('refuses a CSV without the required columns', async () => {
    const response = await POST(csvRequest('cue_anexo,nombre\n180017000,ESCUELA'))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'invalid_csv_header' })
    expect(stageAssignmentSourceManifest).not.toHaveBeenCalled()
  })

  it('refuses unsupported media types', async () => {
    const response = await POST(csvRequest(JSON.stringify({ rows: [] }), 'application/json'))

    expect(response.status).toBe(415)
    expect(stageAssignmentSourceManifest).not.toHaveBeenCalled()
  })
})

describe('GET /api/cuadernillos/assignments/sources', () => {
  it('lists recent revisions with counts for a planning actor', async () => {
    const revisions = [{ revisionId: 'revision-1', sourceId: 'consejo.csv:x', status: 'staged', createdAt: '2026-11-11T10:00:00.000Z', counts: { accepted: 2, conflicts: 0, unresolved: 1 } }]
    vi.mocked(listAssignmentSourceRevisions).mockResolvedValue(revisions)

    const response = await GET(new Request('http://localhost/api/cuadernillos/assignments/sources'))

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await response.json()).toEqual({ revisions })
  })

  it('denies listing with 403 when the actor has no planning access', async () => {
    vi.mocked(listAssignmentSourceRevisions).mockRejectedValue(new AssignmentSourceError('forbidden', 403))

    const response = await GET(new Request('http://localhost/api/cuadernillos/assignments/sources'))

    expect(response.status).toBe(403)
  })

  it('rejects anonymous listing before reading revisions', async () => {
    vi.mocked(hubApiAccessResponse).mockResolvedValue(Response.json({ error: 'Unauthorized' }, { status: 401 }))

    const response = await GET(new Request('http://localhost/api/cuadernillos/assignments/sources'))

    expect(response.status).toBe(401)
    expect(listAssignmentSourceRevisions).not.toHaveBeenCalled()
  })
})
