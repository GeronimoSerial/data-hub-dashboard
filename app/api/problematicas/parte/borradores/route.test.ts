import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ensureSeeded } from '@/lib/db/seed'
import { POST } from './route'

vi.mock('@/lib/infraestructura/acceso-parte', () => ({
  tieneAccesoAlParteParaCue: vi.fn(async () => true),
}))

let draftId = ''
const cue = '1801605-04'
const fecha = '2026-10-15T12:00:00.000Z'

function request(body: unknown, method = 'POST') {
  return new Request('http://localhost/api/problematicas/parte/borradores', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function createBody(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    draftId,
    generacion: 1,
    contexto: { version: 1, draftId, cue, flujo: 'inicial', escuela: { nombre: 'Escuela', cue, departamento: 'Paraná' } },
    paso: 'situacion',
    respuestas: { estado: 'habitual' },
    actividadEn: fecha,
    ...overrides,
  }
}

beforeEach(async () => {
  draftId = crypto.randomUUID()
  await ensureSeeded()
})

describe('POST /api/problematicas/parte/borradores', () => {
  it('creates a partial draft at revision zero and replays identical create idempotently', async () => {
    const first = await POST(request(createBody()))
    const second = await POST(request(createBody()))

    expect(first.status).toBe(201)
    expect(await first.json()).toMatchObject({ draftId, revision: 0, estado: 'activo' })
    expect(second.status).toBe(200)
    expect(await second.json()).toMatchObject({ draftId, revision: 0 })
  })

  it('rejects an incompatible replay and nominal answers without nominal permission', async () => {
    await POST(request(createBody()))

    const duplicate = await POST(request(createBody({ paso: 'otro-paso' })))
    const nominalId = crypto.randomUUID()
    const nominal = await POST(request(createBody({ draftId: nominalId, contexto: { version: 1, draftId: nominalId, cue, flujo: 'inicial', escuela: { nombre: 'Escuela', cue, departamento: 'Paraná' } }, respuestas: { alumnos: [123] } })))

    expect(duplicate.status).toBe(409)
    expect(nominal.status).toBe(422)
  })
})
