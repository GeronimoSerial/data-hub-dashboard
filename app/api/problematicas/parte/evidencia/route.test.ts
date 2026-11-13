import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { migrarDb } from '@/lib/db'

const { enabled, seeded, crear, resolver } = vi.hoisted(() => ({
  enabled: vi.fn(),
  seeded: vi.fn(),
  crear: vi.fn(),
  resolver: vi.fn(),
}))

vi.mock('@/lib/infraestructura/parte/feature-flags', () => ({
  getReportesOfflineFeatures: enabled,
  reportesOfflineFlagDisabledResponse: () => Response.json({ code: 'flag_disabled' }, { status: 503 }),
}))
vi.mock('@/lib/db/seed', () => ({ ensureSeeded: seeded }))
vi.mock('@/lib/infraestructura/adjuntos/evidencia-fotografica', () => ({
  crearEvidenciaFotografica: crear,
  resolverMovimientoBaseEvidencia: resolver,
  ErrorEvidenciaFotografica: class ErrorEvidenciaFotografica extends Error {
    status = 403
  },
}))

import { POST } from './route'

// La ruta audita cada respuesta: la tabla de auditoría debe existir.
beforeAll(async () => {
  await migrarDb()
})

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
    resolver.mockReset().mockResolvedValue(null)
    crear.mockReset().mockResolvedValue({ movimientoId: 'movement-1', attachmentIds: [declaration.attachmentId], repetido: false })
  })

  it('resolves the base movement from the CUE when only the school is known', async () => {
    resolver.mockResolvedValue('latest-movement')
    const response = await POST(request({ cue: '1801605-00', idempotencyKey: 'evidence-key', fotos: [declaration] }))
    expect(response.status).toBe(200)
    expect(resolver).toHaveBeenCalledWith('1801605-00')
    expect(crear).toHaveBeenCalledWith(expect.any(Request), expect.objectContaining({ movimientoBaseId: 'latest-movement' }))
  })

  it('answers sin_parte when the school has no report to attach photos to', async () => {
    const response = await POST(request({ cue: '1801605-00', idempotencyKey: 'evidence-key', fotos: [declaration] }))
    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ code: 'sin_parte' })
    expect(crear).not.toHaveBeenCalled()
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
