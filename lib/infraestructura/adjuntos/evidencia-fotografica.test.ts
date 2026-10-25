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

  it('registers content hashes and reuses pending attachments in input hash order across new keys', async () => {
    const { crearEvidenciaFotografica } = await import('./evidencia-fotografica')
    const first = await crearEvidenciaFotografica(new Request('https://example.test'), {
      movimientoBaseId: 'base-movement', idempotencyKey: 'hash-first',
      fotos: [fotoHash('hash-a', 'a'), fotoHash('hash-b', 'b')],
    }, new Date(MOMENTO))
    const duplicate = await crearEvidenciaFotografica(new Request('https://example.test'), {
      movimientoBaseId: 'base-movement', idempotencyKey: 'hash-second',
      fotos: [fotoHash('replacement-b', 'b'), fotoHash('replacement-a', 'a')],
    }, new Date('2026-10-15T12:01:00Z'))
    expect(duplicate).toEqual({ movimientoId: first.movimientoId,
      attachmentIds: ['hash-b', 'hash-a'], documentaMovimientoId: 'base-movement', repetido: true })
    const rows = await getDb().select().from(infraAdjunto).where(eq(infraAdjunto.movimientoId, first.movimientoId))
    expect(rows).toHaveLength(2)
    expect(rows.every((row) => row.estado === 'pending')).toBe(true)
    const [stored] = await getDb().select().from(infraMovimiento).where(eq(infraMovimiento.id, first.movimientoId))
    expect(stored.resumen.fotos).toEqual([fotoHash('hash-a', 'a'), fotoHash('hash-b', 'b')])
    expect(await crearEvidenciaFotografica(new Request('https://example.test'), {
      movimientoBaseId: 'base-movement', idempotencyKey: 'hash-second',
      fotos: [fotoHash('replacement-b', 'b'), fotoHash('replacement-a', 'a')],
    }, new Date('2026-10-15T13:00:00Z'))).toEqual(duplicate)
    await expect(crearEvidenciaFotografica(new Request('https://example.test'), {
      movimientoBaseId: 'base-movement', idempotencyKey: 'hash-second',
      fotos: [fotoHash('replacement-b', 'c'), fotoHash('replacement-a', 'a')],
    })).rejects.toMatchObject({ status: 409 })
  })

  it('keeps repeated hashes as a multiset and does not deduplicate legacy declarations', async () => {
    const { crearEvidenciaFotografica } = await import('./evidencia-fotografica')
    const create = (key: string, fotos: ReturnType<typeof foto>[]) => crearEvidenciaFotografica(new Request('https://example.test'), {
      movimientoBaseId: 'base-movement', idempotencyKey: key, fotos,
    }, new Date(MOMENTO))
    const first = await create('multiset-first', [fotoHash('multi-a', 'e'), fotoHash('multi-b', 'e')])
    const duplicate = await create('multiset-second', [fotoHash('new-multi-a', 'e'), fotoHash('new-multi-b', 'e')])
    expect(duplicate.attachmentIds).toEqual(['multi-a', 'multi-b'])
    expect(duplicate.movimientoId).toBe(first.movimientoId)
    expect((await create('multiset-different', [fotoHash('multi-c', 'e'), fotoHash('multi-d', 'c')])).movimientoId).not.toBe(first.movimientoId)
    const legacy = await create('legacy-first', [foto('legacy-a')])
    expect((await create('legacy-second', [foto('legacy-b')])).movimientoId).not.toBe(legacy.movimientoId)
  })

  it('does not deduplicate outside the time window or across authors or source movements', async () => {
    const { crearEvidenciaFotografica } = await import('./evidencia-fotografica')
    const { auth } = await import('@/lib/auth')
    const create = (key: string, time: string, base = 'base-movement') => crearEvidenciaFotografica(new Request('https://example.test'), {
      movimientoBaseId: base, idempotencyKey: key, fotos: [fotoHash(key, 'd')],
    }, new Date(time))
    const first = await create('window-first', MOMENTO)
    expect((await create('window-expired', '2026-10-15T12:31:00Z')).movimientoId).not.toBe(first.movimientoId)
    vi.mocked(auth.api.getSession).mockResolvedValueOnce({ user: { id: 'other-user' } } as never)
    expect((await create('other-author', '2026-10-15T12:01:00Z')).movimientoId).not.toBe(first.movimientoId)
    await getDb().insert(infraMovimiento).values({ id: 'other-base', parteId: PARTE_ID,
      tipo: 'confirmacion', rol: 'director', resumen: {}, rigeDesde: MOMENTO, creadaEn: MOMENTO })
    expect((await create('other-base-photo', '2026-10-15T12:01:00Z', 'other-base')).movimientoId).not.toBe(first.movimientoId)
  })

  it('rejects a changed hash on the original idempotency key without changing stored rows', async () => {
    const { crearEvidenciaFotografica } = await import('./evidencia-fotografica')
    const rows = await getDb().select().from(infraAdjunto)
    await expect(crearEvidenciaFotografica(new Request('https://example.test'), {
      movimientoBaseId: 'base-movement', idempotencyKey: 'hash-first',
      fotos: [fotoHash('hash-a', 'c'), fotoHash('hash-b', 'b')],
    })).rejects.toMatchObject({ status: 409 })
    expect(await getDb().select().from(infraAdjunto)).toEqual(rows)
  })

  it('checks school access even when replaying an existing key', async () => {
    const { crearEvidenciaFotografica } = await import('./evidencia-fotografica')
    const { tieneAccesoAlParteParaCue } = await import('@/lib/infraestructura/acceso-parte')
    vi.mocked(tieneAccesoAlParteParaCue).mockResolvedValueOnce(false)
    await expect(crearEvidenciaFotografica(new Request('https://example.test'), {
      movimientoBaseId: 'base-movement', idempotencyKey: 'hash-first',
      fotos: [fotoHash('hash-a', 'a'), fotoHash('hash-b', 'b')],
    })).rejects.toMatchObject({ status: 403 })
  })

  it('pins CUE replays to their original source after a newer movement exists', async () => {
    const { resolverMovimientoBaseEvidencia } = await import('./evidencia-fotografica')
    await getDb().insert(infraMovimiento).values({ id: 'newer-base', parteId: PARTE_ID,
      tipo: 'actualizacion', rol: 'director', resumen: {}, rigeDesde: MOMENTO, creadaEn: '2026-10-16T12:00:00Z' })
    expect(await resolverMovimientoBaseEvidencia('060000100', 'hash-second')).toBe('base-movement')
    expect(await resolverMovimientoBaseEvidencia('060000100', 'unknown-key')).toBe('newer-base')
    expect(await resolverMovimientoBaseEvidencia('other-cue', 'hash-second')).toBeNull()
  })

  it.each([
    { optimizadaSha256: 'a'.repeat(64) },
    { optimizadaSha256: 'A'.repeat(64), miniaturaSha256: 'b'.repeat(64) },
    { optimizadaSha256: 'a'.repeat(63), miniaturaSha256: 'b'.repeat(64) },
  ])('rejects malformed or unpaired hashes before reserving evidence', async (hashes) => {
    const { crearEvidenciaFotografica } = await import('./evidencia-fotografica')
    await expect(crearEvidenciaFotografica(new Request('https://example.test'), {
      movimientoBaseId: 'base-movement', idempotencyKey: 'invalid-hash', fotos: [{ ...foto('invalid-photo'), ...hashes }],
    })).rejects.toMatchObject({ status: 400 })
    expect(await getDb().select().from(infraMovimiento).where(eq(infraMovimiento.idempotencyKey, 'invalid-hash'))).toHaveLength(0)
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

function fotoHash(id: string, hash: string) {
  return { ...foto(id), optimizadaSha256: hash.repeat(64), miniaturaSha256: 'f'.repeat(64) }
}
