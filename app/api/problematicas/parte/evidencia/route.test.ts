import { beforeEach, describe, expect, it, vi } from 'vitest'

const { enabled, seeded, crear } = vi.hoisted(() => ({ enabled: vi.fn(), seeded: vi.fn(), crear: vi.fn() }))

vi.mock('@/lib/infraestructura/parte/feature-flags', () => ({
  getReportesOfflineFeatures: enabled,
  reportesOfflineFlagDisabledResponse: () => Response.json({ code: 'flag_disabled' }, { status: 503 }),
}))
vi.mock('@/lib/db/seed', () => ({ ensureSeeded: seeded }))
vi.mock('@/lib/infraestructura/adjuntos/evidencia-fotografica', () => ({
  crearEvidenciaFotografica: crear,
  ErrorEvidenciaFotografica: class ErrorEvidenciaFotografica extends Error {
    status = 403
  },
}))

import { POST } from './route'

const declaration = {
  attachmentId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  optimizadaSize: 1000,
  optimizadaContentType: 'image/jpeg',
  miniaturaSize: 200,
  miniaturaContentType: 'image/jpeg',
}

function request(body: unknown) {
  return new Request('https://example.test/api/problematicas/parte/evidencia', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/problematicas/parte/evidencia', () => {
  beforeEach(() => {
    enabled.mockReset().mockReturnValue({ fotos: true })
    seeded.mockReset().mockResolvedValue(undefined)
    crear.mockReset().mockResolvedValue({ movimientoId: 'movement-1', attachmentIds: [declaration.attachmentId], repetido: false })
  })

  it('returns the flag-off response without creating evidence', async () => {
    enabled.mockReturnValue({ fotos: false })
    const response = await POST(request({}))
    expect(response.status).toBe(503)
    expect(crear).not.toHaveBeenCalled()
  })

  it('declares evidence metadata and returns the confirmed movement ID', async () => {
    const response = await POST(request({
      movimientoBaseId: 'base-movement',
      idempotencyKey: 'evidence-key',
      fotos: [declaration],
    }))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, movimientoId: 'movement-1' })
    expect(crear).toHaveBeenCalledWith(expect.any(Request), {
      movimientoBaseId: 'base-movement',
      idempotencyKey: 'evidence-key',
      fotos: [declaration],
    })
  })

  it('rejects an empty declaration without entering the service', async () => {
    const response = await POST(request({ movimientoBaseId: 'base-movement', idempotencyKey: 'key', fotos: [] }))
    expect(response.status).toBe(422)
    expect(crear).not.toHaveBeenCalled()
  })
})
