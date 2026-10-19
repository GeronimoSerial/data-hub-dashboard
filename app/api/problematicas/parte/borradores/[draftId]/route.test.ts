import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { infraBorrador } from '@/lib/db/schema'
import { ensureSeeded } from '@/lib/db/seed'
import { GET, PUT } from './route'
import { POST } from '../route'
import { POST as discardDraftRoute } from './descarte/route'
import { conFalloAuditoria } from '@/lib/test-utils/fallo-auditoria'

vi.mock('@/lib/infraestructura/acceso-parte', () => ({
  tieneAccesoAlParteParaCue: vi.fn(async () => true),
}))

let draftId = ''
const cue = '1801605-04'
const fecha = '2026-10-15T12:00:00.000Z'

function req(path: string, body?: unknown, method = 'GET') {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

async function create() {
  return POST(req('/api/problematicas/parte/borradores', {
    version: 1,
    draftId,
    generacion: 1,
    contexto: { version: 1, draftId, cue, flujo: 'inicial', escuela: { nombre: 'Escuela', cue, departamento: 'Paraná' } },
    paso: 'situacion',
    respuestas: { estado: 'habitual' },
    actividadEn: fecha,
  }, 'POST'))
}

beforeEach(async () => {
  vi.stubEnv('REPORTES_OFFLINE_BORRADORES_SYNC', 'true')
  process.env.REPORTES_OFFLINE_BORRADORES_SYNC = 'true'
  draftId = crypto.randomUUID()
  await ensureSeeded()
})

afterEach(() => vi.unstubAllEnvs())

describe('draft detail and revisioned sync', () => {
  it('revierte creación, sincronización y descarte si no se guarda su auditoría', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      await conFalloAuditoria(async () => {
        expect((await create()).status).toBe(503)
        expect(await getDb().select().from(infraBorrador).where(eq(infraBorrador.id, draftId))).toHaveLength(0)
      })
      expect((await create()).status).toBe(201)
      await conFalloAuditoria(async () => {
        const sync = await PUT(req(`/api/problematicas/parte/borradores/${draftId}`, {
          version: 1, baseRevision: 0, paso: 'evidencias', actividadEn: fecha,
        }, 'PUT'), { params: Promise.resolve({ draftId }) })
        expect(sync.status).toBe(503)
        const discarded = await discardDraftRoute(req(`/api/problematicas/parte/borradores/${draftId}/descarte`, {
          version: 1, baseRevision: 0,
        }, 'POST'), { params: Promise.resolve({ draftId }) })
        expect(discarded.status).toBe(503)
        const [row] = await getDb().select().from(infraBorrador).where(eq(infraBorrador.id, draftId))
        expect(row).toMatchObject({ revision: 0, estado: 'open', paso: 'situacion' })
      })
    } finally { log.mockRestore() }
  })
  it('accepts only the current revision and returns the remote revision on conflict', async () => {
    await create()
    const first = await PUT(req(`/api/problematicas/parte/borradores/${draftId}`, {
      version: 1,
      baseRevision: 0,
      respuestas: { descripcion: 'partial answer' },
      paso: 'evidencias',
      pasosCompletados: ['situacion'],
      actividadEn: fecha,
    }, 'PUT'), { params: Promise.resolve({ draftId }) })
    const stale = await PUT(req(`/api/problematicas/parte/borradores/${draftId}`, {
      version: 1, baseRevision: 0, paso: 'situacion', actividadEn: fecha,
    }, 'PUT'), { params: Promise.resolve({ draftId }) })

    expect(first.status).toBe(200)
    expect(await first.json()).toMatchObject({ revision: 1 })
    expect(stale.status).toBe(409)
    expect(await stale.json()).toMatchObject({ code: 'conflicto', revisionServidor: 1 })
    const replay = await POST(req('/api/problematicas/parte/borradores', {
      version: 1,
      draftId,
      generacion: 1,
      contexto: { version: 1, draftId, cue, flujo: 'inicial', escuela: { nombre: 'Escuela', cue, departamento: 'Paraná' } },
      paso: 'situacion',
      respuestas: { estado: 'habitual' },
      actividadEn: fecha,
    }, 'POST'))
    expect(replay.status).toBe(200)
    expect(await replay.json()).toMatchObject({ revision: 1 })
  })

  it('reads the draft without nominal answers and tombstones a discard against late sync', async () => {
    await create()
    await getDb().update(infraBorrador).set({ revision: 1, respuestas: { estado: 'habitual', alumnos: [123], alumno: { nombre: 'Nominal' } } })
      .where(eq(infraBorrador.id, draftId))
    const read = await GET(req(`/api/problematicas/parte/borradores/${draftId}`), { params: Promise.resolve({ draftId }) })
    expect(read.status).toBe(200)
    const readBody = await read.json()
    expect(readBody).toMatchObject({ draftId, revision: 1, respuestas: { estado: 'habitual' } })
    expect(readBody).not.toHaveProperty('respuestas.alumnos')
    expect(readBody).not.toHaveProperty('respuestas.alumno')

    const discard = await discardDraftRoute(req(`/api/problematicas/parte/borradores/${draftId}/descarte`, {
      version: 1, baseRevision: 1,
    }, 'POST'), { params: Promise.resolve({ draftId }) })
    const lateSync = await PUT(req(`/api/problematicas/parte/borradores/${draftId}`, {
      version: 1, baseRevision: 1, paso: 'reopen', actividadEn: fecha,
    }, 'PUT'), { params: Promise.resolve({ draftId }) })

    expect(discard.status).toBe(200)
    expect(lateSync.status).toBe(410)
    expect(await lateSync.json()).toMatchObject({ code: 'cerrado', estado: 'descartado' })
  })
})
