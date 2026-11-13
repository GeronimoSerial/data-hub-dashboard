import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from './route'

const { limitMock, permissionMock, confirmMock } = vi.hoisted(() => ({
  limitMock: vi.fn(),
  permissionMock: vi.fn(),
  confirmMock: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  getDb: () => ({ insert: () => ({ values: async () => undefined }), select: () => ({ from: () => ({
    innerJoin: () => ({ innerJoin: () => ({ where: () => ({ limit: limitMock }) }) }),
  }) }) }),
}))
vi.mock('@/lib/db/seed', () => ({ ensureSeeded: vi.fn(async () => undefined) }))
vi.mock('@/lib/db/schema', () => ({
  auditoriaEvento: { requestId: 'auditoria.requestId' },
  infraAdjunto: { id: 'attachment.id', movimientoId: 'attachment.movimientoId' },
  infraMovimiento: { id: 'movement.id', parteId: 'movement.parteId' },
  infraParte: { cueAnexo: 'part.cueAnexo', id: 'part.id' },
}))
vi.mock('drizzle-orm', () => ({ eq: vi.fn((left: unknown, right: unknown) => [left, right]) }))
vi.mock('@/lib/infraestructura/acceso-parte', () => ({ tieneAccesoAlParteParaCue: permissionMock }))
vi.mock('@/lib/infraestructura/adjuntos/confirmacion', () => ({ confirmarAdjunto: confirmMock }))

const attachmentId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const movimientoId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const context = { params: Promise.resolve({ attachmentId }) }

function request(body: unknown) {
  return new Request(`http://localhost/api/problematicas/parte/adjuntos/${attachmentId}/confirmacion`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}

describe('POST /api/problematicas/parte/adjuntos/[attachmentId]/confirmacion', () => {
  beforeEach(() => {
    vi.stubEnv('REPORTES_OFFLINE_FOTOS', 'true')
    process.env.REPORTES_OFFLINE_FOTOS = 'true'
    limitMock.mockReset().mockResolvedValue([{ cueAnexo: '1801605-04' }])
    permissionMock.mockReset().mockResolvedValue(true)
    confirmMock.mockReset().mockResolvedValue({ ok: true, repetido: false, optimizadaEtag: 'a1', miniaturaEtag: 'b2' })
  })

  afterEach(() => vi.unstubAllEnvs())

  it('returns an idempotent confirmation after permission and object verification', async () => {
    const response = await POST(request({ movimientoId, optimizadaEtag: 'a1', miniaturaEtag: 'b2' }), context)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(confirmMock).toHaveBeenCalledWith({ attachmentId, movimientoId, optimizadaEtag: 'a1', miniaturaEtag: 'b2' })
  })

  it('reports the owning movement when the client holds a stale movement id', async () => {
    const realMovement = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    limitMock.mockResolvedValue([{ cueAnexo: '1801605-04', movimientoId: realMovement }])
    const response = await POST(request({ movimientoId }), context)
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ code: 'not_found', movimientoId: realMovement })
    expect(confirmMock).not.toHaveBeenCalled()
  })

  it('keeps the job when the application session has expired', async () => {
    permissionMock.mockResolvedValue(false)
    const response = await POST(request({ movimientoId }), context)
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ code: 'session_expired' })
    expect(confirmMock).not.toHaveBeenCalled()
  })

  it('rejects an invalid ETag before database access', async () => {
    const response = await POST(request({ movimientoId, optimizadaEtag: 'bad etag' }), context)
    expect(response.status).toBe(422)
    expect(limitMock).not.toHaveBeenCalled()
  })
})
