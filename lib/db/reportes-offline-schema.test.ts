import { eq, sql } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb, migrarDb } from './index'
import { infraBorrador, infraBorradorCierre } from './schema'

usarDbTemporal('reportes-offline-schema-', { seed: false })

beforeAll(async () => {
  await migrarDb()
})

describe('schema de borradores sincronizados', () => {
  it('persiste contexto, respuestas, revisión, estado, generación y timestamps', async () => {
    const db = getDb()
    await db.insert(infraBorrador).values({
      id: 'draft-1',
      generacion: 2,
      cueAnexo: '060000100',
      contexto: { version: 1, flujo: 'inicial' },
      paso: 'afectaciones',
      respuestas: { descripcion: 'Sin energía' },
      revision: 0,
      estado: 'open',
      creadoEn: '2026-10-15T12:00:00.000Z',
      actividadEn: '2026-10-15T12:00:00.000Z',
    })

    const rows = await db.select().from(infraBorrador)
    expect(rows).toMatchObject([
      {
        id: 'draft-1',
        generacion: 2,
        cueAnexo: '060000100',
        contexto: { version: 1, flujo: 'inicial' },
        respuestas: { descripcion: 'Sin energía' },
        revision: 0,
        estado: 'open',
        movimientoId: null,
      },
    ])

    await expect(
      db.update(infraBorrador).set({ revision: 2 }).where(eq(infraBorrador.id, 'draft-1')),
    ).rejects.toThrow()
    await db.update(infraBorrador).set({ revision: 1 }).where(eq(infraBorrador.id, 'draft-1'))
  })

  it('rechaza revisiones negativas y estados fuera del contrato', async () => {
    const db = getDb()
    const base = {
      id: 'draft-invalid',
      generacion: 1,
      cueAnexo: '060000100',
      contexto: {},
      paso: 'inicio',
      respuestas: {},
      revision: -1,
      estado: 'open',
      creadoEn: '2026-10-15T12:00:00.000Z',
      actividadEn: '2026-10-15T12:00:00.000Z',
    }
    await expect(db.insert(infraBorrador).values(base)).rejects.toThrow()
    await expect(
      db.insert(infraBorrador).values({ ...base, id: 'draft-invalid-status', revision: 0, estado: 'closed' }),
    ).rejects.toThrow()
  })

  it('guarda cierres permanentes y declara índices de conteo y paginación', async () => {
    const db = getDb()
    await db.insert(infraBorrador).values({
      id: 'draft-late-update',
      generacion: 1,
      cueAnexo: '060000100',
      contexto: {},
      paso: 'inicio',
      respuestas: {},
      revision: 0,
      estado: 'open',
      creadoEn: '2026-10-15T12:00:00.000Z',
      actividadEn: '2026-10-15T12:00:00.000Z',
    })
    await db.insert(infraBorradorCierre).values({
      draftId: 'draft-closed',
      cueAnexo: '060000100',
      estadoCierre: 'discarded',
      revisionCierre: 3,
      movimientoId: null,
      cerradoEn: '2026-10-15T12:00:00.000Z',
    })
    await db.insert(infraBorradorCierre).values({
      draftId: 'draft-late-update',
      cueAnexo: '060000100',
      estadoCierre: 'discarded',
      revisionCierre: 0,
      movimientoId: null,
      cerradoEn: '2026-10-15T12:00:00.000Z',
    })

    const indexes = await db.execute(sql`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'infra_borrador'
    `)
    const indexDefs = (indexes as { rows: Array<{ indexdef: string }> }).rows.map(
      (row) => row.indexdef,
    )
    expect(indexDefs.join('\n')).toContain('(cue_anexo, estado, actividad_en, id)')
    expect(indexDefs.join('\n')).toContain('(cue_anexo, estado)')

    await expect(
      db.insert(infraBorrador).values({
        id: 'draft-closed',
        generacion: 1,
        cueAnexo: '060000100',
        contexto: {},
        paso: 'inicio',
        respuestas: {},
        revision: 0,
        estado: 'open',
        creadoEn: '2026-10-15T12:00:00.000Z',
        actividadEn: '2026-10-15T12:00:00.000Z',
      }),
    ).rejects.toThrow(/closed/)
    await expect(
      db.update(infraBorrador)
        .set({ revision: 1 })
        .where(eq(infraBorrador.id, 'draft-late-update')),
    ).rejects.toThrow()

    await expect(
      db.update(infraBorradorCierre).set({ revisionCierre: 4 }).where(eq(infraBorradorCierre.draftId, 'draft-closed')),
    ).rejects.toThrow()

    await expect(
      db.insert(infraBorradorCierre).values({
        draftId: 'draft-closed',
        cueAnexo: '060000100',
        estadoCierre: 'submitted',
        revisionCierre: 4,
        movimientoId: null,
        cerradoEn: '2026-10-15T12:01:00.000Z',
      }),
    ).rejects.toThrow()
  })
})
