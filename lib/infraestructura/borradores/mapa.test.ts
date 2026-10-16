import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { infraAccesoNominalLog, infraBorrador } from '@/lib/db/schema'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDraftCounts, listDraftsForMap } from './mapa'

usarDbTemporal('borradores-mapa')

const CUE = '1801605-60'
const NOW = '2026-10-15T10:00:00.000Z'

async function insertDraft(overrides: Partial<typeof infraBorrador.$inferInsert> = {}) {
  await getDb().insert(infraBorrador).values({
    id: crypto.randomUUID(),
    generacion: 1,
    cueAnexo: CUE,
    contexto: { version: 1, flujo: 'inicial' },
    paso: 'servicios',
    respuestas: { pasosCompletados: ['inicio'], servicio: { agua: 'no' } },
    revision: 1,
    estado: 'open',
    creadoEn: NOW,
    actividadEn: NOW,
    sincronizadoEn: NOW,
    ...overrides,
  })
}

describe('draft map queries', () => {
  it('groups open draft counts by school and excludes closed drafts', async () => {
    await insertDraft({ id: 'draft-a' })
    await insertDraft({ id: 'draft-b' })
    await insertDraft({ id: 'draft-closed', estado: 'submitted' })
    await insertDraft({ id: 'draft-other-school', cueAnexo: '1801605-61' })

    expect(await getDraftCounts([CUE])).toEqual([{ cue: CUE, count: 2 }])
    expect(await getDraftCounts([])).toEqual([])
  })

  it('paginates by activity and draft id and removes nominal answers without permission', async () => {
    await insertDraft({
      id: 'draft-a',
      respuestas: {
        pasosCompletados: ['inicio'],
        servicio: { agua: 'no' },
        afectaciones: [{ motivo: 'Corte', alumnos: [101], ge_person_id: 102, descripcion: 'Sin clase' }],
      },
    })
    await insertDraft({ id: 'draft-b' })
    const first = await listDraftsForMap({
      cue: CUE,
      limit: 1,
      includeNominal: false,
      userId: 'reader',
      ahora: new Date(NOW),
    })
    expect(first.items[0]).toMatchObject({
      draftId: 'draft-b',
      progreso: { pasoActual: 'servicios', pasosCompletados: ['inicio'] },
      actividadEn: NOW,
      respuestas: { servicio: { agua: 'no' } },
    })
    expect(first.nextCursor).toEqual({ actividadEn: NOW, draftId: 'draft-b' })

    const second = await listDraftsForMap({
      cue: CUE,
      cursor: first.nextCursor!,
      limit: 1,
      includeNominal: false,
      userId: 'reader',
      ahora: new Date(NOW),
    })
    expect(second.items[0].draftId).toBe('draft-a')
    expect(JSON.stringify(second.items[0])).not.toMatch(/alumnos|person_id|\b101\b|\b102\b/)
    expect(second.nextCursor).toBeNull()
  })

  it('includes permitted answers and records nominal draft access', async () => {
    await insertDraft({
      id: 'draft-nominal',
      respuestas: { afectaciones: [{ alumnos: [101, 102] }] },
    })
    const result = await listDraftsForMap({
      cue: CUE,
      limit: 20,
      includeNominal: true,
      userId: 'reader',
      ahora: new Date(NOW),
    })

    expect(result.items[0].respuestas).toEqual({ afectaciones: [{ alumnos: [101, 102] }] })
    const audit = await getDb().select().from(infraAccesoNominalLog).where(eq(infraAccesoNominalLog.userId, 'reader'))
    expect(audit).toHaveLength(1)
    expect(audit[0]).toMatchObject({ afectacionId: 'borrador:draft-nominal', cantidad: 2, consultadoEn: NOW })
  })
})
