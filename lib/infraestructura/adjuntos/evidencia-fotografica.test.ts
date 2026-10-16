import { beforeAll, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { getDb, migrarDb } from '@/lib/db'
import {
  infraAdjunto,
  infraMovimiento,
  infraParte,
  infraPeriodo,
} from '@/lib/db/schema'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'

vi.mock('@/lib/infraestructura/acceso-parte', () => ({
  tieneAccesoAlParteParaCue: vi.fn(async () => true),
}))
vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: vi.fn(async () => null) } },
}))

const MOMENTO = '2026-10-15T12:00:00.000Z'
const PERIODO_ID = 'attachments-period'
const PARTE_ID = 'attachments-part'

usarDbTemporal('evidencia-fotografica', { seed: false })

beforeAll(async () => {
  await migrarDb()
  const db = getDb()
  await db.insert(infraPeriodo).values({
    id: PERIODO_ID,
    nombre: 'Test period',
    inicioEn: MOMENTO,
    estado: 'vigente',
    creadaEn: MOMENTO,
  })
  await db.insert(infraParte).values({
    id: PARTE_ID,
    periodoId: PERIODO_ID,
    cueAnexo: '060000100',
    estadoEstablecimiento: 'habitual',
    estadoEstablecimientoRigeDesde: MOMENTO,
    corteId: 1,
    creadaEn: MOMENTO,
    actualizadaEn: MOMENTO,
  })
  await db.insert(infraMovimiento).values({
    id: 'base-movement',
    parteId: PARTE_ID,
    tipo: 'actualizacion',
    rol: 'director',
    resumen: { afectacionesAgregadas: [] },
    rigeDesde: MOMENTO,
    creadaEn: MOMENTO,
  })
})

describe('photo evidence movement', () => {
  it('creates pending OBS metadata without changing the source movement', async () => {
    const { crearEvidenciaFotografica } = await import('./evidencia-fotografica')
    const result = await crearEvidenciaFotografica(new Request('https://example.test'), {
      movimientoBaseId: 'base-movement',
      idempotencyKey: 'evidence-key-1',
      fotos: [foto('photo-1'), foto('photo-2')],
    })

    const db = getDb()
    const [base] = await db.select().from(infraMovimiento).where(eq(infraMovimiento.id, 'base-movement'))
    const [evidence] = await db.select().from(infraMovimiento).where(eq(infraMovimiento.id, result.movimientoId))
    const attachments = await db.select().from(infraAdjunto).where(eq(infraAdjunto.movimientoId, result.movimientoId))
    expect(base?.tipo).toBe('actualizacion')
    expect(base?.resumen).toEqual({ afectacionesAgregadas: [] })
    expect(evidence).toMatchObject({
      tipo: 'evidencia_fotografica',
      resumen: { documentaMovimientoId: 'base-movement', attachmentIds: ['photo-1', 'photo-2'] },
      rigeDesde: MOMENTO,
    })
    expect(attachments).toHaveLength(2)
    expect(attachments[0]).toMatchObject({
      estado: 'pending',
      optimizadaObsKey: expect.stringContaining('/optimizada.webp'),
      miniaturaObsKey: expect.stringContaining('/miniatura.webp'),
      optimizadaEtag: null,
      miniaturaEtag: null,
      creadaPor: 'public-parte',
    })

    const replay = await crearEvidenciaFotografica(new Request('https://example.test'), {
      movimientoBaseId: 'base-movement',
      idempotencyKey: 'evidence-key-1',
      fotos: [foto('photo-1'), foto('photo-2')],
    })
    expect(replay).toMatchObject({ movimientoId: result.movimientoId, repetido: true })
  })

  it('rejects concurrent inserts that would exceed three photos on one movement', async () => {
    const db = getDb()
    await db.insert(infraMovimiento).values({
      id: 'limit-movement',
      parteId: PARTE_ID,
      tipo: 'evidencia_fotografica',
      rol: 'director',
      resumen: {},
      rigeDesde: MOMENTO,
      creadaEn: MOMENTO,
    })
    const insertar = (id: string) => db.transaction(async (tx) => {
      await tx.insert(infraAdjunto).values({
        id,
        movimientoId: 'limit-movement',
        optimizadaObsKey: `reportes/test/${id}/optimizada.webp`,
        optimizadaSize: 120_000,
        optimizadaContentType: 'image/webp',
        optimizadaEtag: null,
        miniaturaObsKey: `reportes/test/${id}/miniatura.webp`,
        miniaturaSize: 12_000,
        miniaturaContentType: 'image/webp',
        miniaturaEtag: null,
        estado: 'pending',
        creadaPor: 'test-user',
      })
    })
    const writes = await Promise.allSettled(['photo-a', 'photo-b', 'photo-c', 'photo-d'].map(insertar))
    expect(writes.filter((result) => result.status === 'fulfilled')).toHaveLength(3)
    expect(writes.filter((result) => result.status === 'rejected')).toHaveLength(1)
    expect(await db.select().from(infraAdjunto).where(eq(infraAdjunto.movimientoId, 'limit-movement'))).toHaveLength(3)
  })

  it('rejects an idempotency replay with a different frozen declaration', async () => {
    const { crearEvidenciaFotografica, ErrorEvidenciaFotografica } = await import('./evidencia-fotografica')
    await expect(crearEvidenciaFotografica(new Request('https://example.test'), {
      movimientoBaseId: 'base-movement',
      idempotencyKey: 'evidence-key-1',
      fotos: [foto('photo-other')],
    })).rejects.toBeInstanceOf(ErrorEvidenciaFotografica)
  })
})

function foto(attachmentId: string) {
  return {
    attachmentId,
    optimizadaSize: 120_000,
    optimizadaContentType: 'image/webp' as const,
    miniaturaSize: 12_000,
    miniaturaContentType: 'image/webp' as const,
  }
}
