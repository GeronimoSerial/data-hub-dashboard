import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'

vi.mock('@/lib/db/seed', () => ({ ensureSeeded: vi.fn() }))
vi.mock('@/lib/infraestructura/acceso-lectura', () => ({ verificarAccesoLectura: vi.fn() }))

describe('GET /api/infraestructura/adjuntos', () => {
  beforeEach(() => {
    vi.stubEnv('REPORTES_OFFLINE_FOTOS', 'true')
    process.env.REPORTES_OFFLINE_FOTOS = 'true'
    vi.mocked(verificarAccesoLectura).mockReset()
  })

  afterEach(() => vi.unstubAllEnvs())

  it('denies photo URL signing without infrastructure access', async () => {
    vi.mocked(verificarAccesoLectura).mockResolvedValue({ ok: false, status: 403 })
    const { GET } = await import('./route')
    const request = new Request('http://localhost/api/infraestructura/adjuntos?cue=1801605-60&attachmentId=attachment-1&variant=optimizada')

    const response = await GET(request)

    expect(response.status).toBe(403)
    expect(verificarAccesoLectura).toHaveBeenCalledWith()
  })
})
