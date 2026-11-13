import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from './route'

const { limitMock, authMock, permissionMock } = vi.hoisted(() => ({
  limitMock: vi.fn(),
  authMock: vi.fn(),
  permissionMock: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  getDb: () => ({
    insert: () => ({ values: async () => undefined }),
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({ limit: limitMock }),
        }),
      }),
    }),
  }),
}))
vi.mock('@/lib/db/seed', () => ({ ensureSeeded: vi.fn(async () => undefined) }))
vi.mock('@/lib/db/schema', () => ({
  auditoriaEvento: { requestId: 'auditoria.requestId' },
  infraMovimiento: { id: 'movement.id', parteId: 'movement.parteId' },
  infraParte: { cueAnexo: 'parte.cueAnexo', id: 'parte.id' },
}))
vi.mock('drizzle-orm', () => ({ eq: vi.fn((left: unknown, right: unknown) => [left, right]) }))
vi.mock('@/lib/infraestructura/acceso-parte', () => ({ tieneAccesoAlParteParaCue: permissionMock }))
vi.mock('@/lib/infraestructura/adjuntos/obs', () => ({
  authorizeAttachments: authMock,
  ObsConfigurationError: class ObsConfigurationError extends Error {},
  validateAttachmentDeclarations: (value: unknown) => Array.isArray(value) && value.length > 0 && value.length <= 3,
}))

const movimientoId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const adjuntos = [{ attachmentId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', bytesOptimizado: 1024, bytesMiniatura: 256 }]

function request(body: unknown) {
  return new Request('http://localhost/api/problematicas/parte/adjuntos/autorizaciones', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/problematicas/parte/adjuntos/autorizaciones', () => {
  beforeEach(() => {
    vi.stubEnv('REPORTES_OFFLINE_FOTOS', 'true')
    process.env.REPORTES_OFFLINE_FOTOS = 'true'
    limitMock.mockReset().mockResolvedValue([{ cueAnexo: '1801605-04' }])
    permissionMock.mockReset().mockResolvedValue(true)
    authMock.mockReset().mockResolvedValue([{ attachmentId: adjuntos[0].attachmentId }])
  })

  afterEach(() => vi.unstubAllEnvs())

  it('stops authorization requests when photo uploads are disabled', async () => {
    process.env.REPORTES_OFFLINE_FOTOS = 'false'
    const response = await POST(request({ movimientoId, adjuntos }))

    expect(response.status).toBe(503)
    expect(authMock).not.toHaveBeenCalled()
  })

  it('returns the batch authorizations for an allowed movement', async () => {
    const response = await POST(request({ movimientoId, adjuntos }))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(authMock).toHaveBeenCalledWith(movimientoId, '1801605-04', adjuntos)
  })

  it('returns an application session error before calling OBS when permission is absent', async () => {
    permissionMock.mockResolvedValue(false)
    const response = await POST(request({ movimientoId, adjuntos }))

    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ code: 'session_expired' })
    expect(authMock).not.toHaveBeenCalled()
  })

  it('reports signing failures as OBS errors rather than expired sessions', async () => {
    authMock.mockRejectedValue(new Error('OBS unavailable'))
    const response = await POST(request({ movimientoId, adjuntos }))

    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({ code: 'obs_error' })
  })

  it('rejects invalid bodies without consulting the movement or OBS', async () => {
    const response = await POST(request({ movimientoId, adjuntos: [] }))

    expect(response.status).toBe(422)
    expect(limitMock).not.toHaveBeenCalled()
    expect(authMock).not.toHaveBeenCalled()
  })
})
