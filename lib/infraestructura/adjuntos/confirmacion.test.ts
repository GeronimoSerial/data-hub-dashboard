import { beforeEach, describe, expect, it, vi } from 'vitest'
import { confirmarAdjunto } from './confirmacion'

const { row, headMock, updateMock } = vi.hoisted(() => ({
  row: {
    id: 'attachment-1', movimientoId: 'movement-1',
    optimizadaObsKey: 'reportes/movement-1/attachment-1/optimizada.jpg',
    optimizadaSize: 1024, optimizadaContentType: 'image/jpeg', optimizadaEtag: null as string | null,
    miniaturaObsKey: 'reportes/movement-1/attachment-1/miniatura.jpg',
    miniaturaSize: 256, miniaturaContentType: 'image/jpeg', miniaturaEtag: null as string | null,
    estado: 'pending',
  },
  headMock: vi.fn(),
  updateMock: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ ...row }] }) }) }),
    update: updateMock,
  }),
}))
vi.mock('@/lib/db/schema', () => ({ infraAdjunto: { id: 'attachment.id', movimientoId: 'attachment.movimientoId' } }))
vi.mock('drizzle-orm', () => ({ and: vi.fn((...args: unknown[]) => args), eq: vi.fn((...args: unknown[]) => args) }))
vi.mock('./obs', () => ({
  getObsBucket: () => 'bucket',
  headAttachmentObject: headMock,
  ObsObjectMissingError: class ObsObjectMissingError extends Error {},
}))

describe('idempotent attachment confirmation', () => {
  beforeEach(() => {
    Object.assign(row, {
      optimizadaEtag: null, miniaturaEtag: null, estado: 'pending',
      optimizadaSize: 1024, miniaturaSize: 256,
    })
    headMock.mockReset().mockImplementation(async (_bucket: string, key: string) => key.includes('optimizada')
      ? { etag: 'optimized-etag', size: 1024, contentType: 'image/jpeg' }
      : { etag: 'thumbnail-etag', size: 256, contentType: 'image/jpeg' })
    updateMock.mockReset().mockImplementation(() => ({
      set: (values: typeof row) => ({ where: async () => { Object.assign(row, values) } }),
    }))
  })

  it('verifies both objects and returns the same confirmation on replay', async () => {
    const input = { attachmentId: 'attachment-1', movimientoId: 'movement-1' }
    const first = await confirmarAdjunto(input)
    expect(first).toMatchObject({ ok: true, repetido: false, optimizadaEtag: 'optimized-etag', miniaturaEtag: 'thumbnail-etag' })
    const second = await confirmarAdjunto(input)
    expect(second).toMatchObject({ ok: true, repetido: true })
    expect(headMock).toHaveBeenCalledTimes(4)
    expect(updateMock).toHaveBeenCalledTimes(1)
  })

  it('leaves the row pending when HEAD reports an unexpected size', async () => {
    headMock.mockReset()
      .mockResolvedValueOnce({ etag: 'optimized-etag', size: 999, contentType: 'image/jpeg' })
      .mockResolvedValueOnce({ etag: 'thumbnail-etag', size: 256, contentType: 'image/jpeg' })
    const result = await confirmarAdjunto({ attachmentId: 'attachment-1', movimientoId: 'movement-1' })
    expect(result).toMatchObject({ ok: false, status: 409, missingVariants: ['optimizada'] })
    expect(row.estado).toBe('pending')
    expect(updateMock).not.toHaveBeenCalled()
  })
})
