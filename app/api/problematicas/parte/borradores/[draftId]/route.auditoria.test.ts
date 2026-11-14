import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb, migrarDb } from '@/lib/db'
import { auditoriaEvento, infraBorrador } from '@/lib/db/schema'
import { ensureSeeded } from '@/lib/db/seed'
import { conFalloAuditoria } from '@/lib/test-utils/fallo-auditoria'
import { PUT as sincronizarRuta } from './route'
import { POST as crear } from '../route'
import { POST as descartarRuta } from './descarte/route'

vi.mock('@/lib/infraestructura/acceso-parte', () => ({
  tieneAccesoAlParteParaCue: vi.fn(async () => true),
}))

const CUE = '1801605-04'
const FECHA = '2026-10-15T12:00:00.000Z'
const MARCADOR = 'RESPUESTA-PRIVADA-9182'
let draftId = ''

// Las rutas con segmento dinámico reciben el contexto con los parámetros del borrador.
const PUT = (request: Request) => sincronizarRuta(request, { params: Promise.resolve({ draftId }) })
const descartar = (request: Request) => descartarRuta(request, { params: Promise.resolve({ draftId }) })

function pedido(path: string, body: unknown) {
  return new Request(`http://localhost/api/problematicas/parte/borradores/${path}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function pedidoDescarte(body: unknown) {
  return new Request(`http://localhost/api/problematicas/parte/borradores/${draftId}/descarte`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function eventoDe(response: Response) {
  const [evento] = await getDb().select().from(auditoriaEvento)
    .where(eq(auditoriaEvento.requestId, response.headers.get('X-Audit-Id') ?? response.headers.get('X-Request-Id') ?? ''))
  return evento
}

async function filaBorrador() {
  const [fila] = await getDb().select().from(infraBorrador).where(eq(infraBorrador.id, draftId))
  return fila
}

beforeAll(() => migrarDb())

beforeEach(async () => {
  vi.stubEnv('REPORTES_OFFLINE_BORRADORES_SYNC', 'true')
  draftId = crypto.randomUUID()
  await ensureSeeded()
  const creado = await crear(new Request('http://localhost/api/problematicas/parte/borradores', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      version: 1,
      draftId,
      generacion: 1,
      contexto: { version: 1, draftId, cue: CUE, flujo: 'inicial', escuela: { nombre: 'Escuela', cue: CUE, departamento: 'Paraná' } },
      paso: 'situacion',
      respuestas: { estado: 'habitual' },
      actividadEn: FECHA,
    }),
  }))
  expect(creado.status).toBe(201)
})

describe('auditoría de borrador.sincronizar', () => {
  it('confirma la revisión y deja un evento exitoso sobre el borrador', async () => {
    const response = await PUT(pedido(draftId, { version: 1, baseRevision: 0, respuestas: { observacion: MARCADOR }, paso: 'situacion', actividadEn: FECHA }))
    expect(response.status).toBe(200)
    expect(await eventoDe(response)).toMatchObject({
      accion: 'borrador.sincronizar', metodo: 'PUT', rutaPlantilla: '/api/problematicas/parte/borradores/[draftId]',
      objetoTipo: 'borrador', objetoId: draftId, cueAnexo: CUE, resultado: 'exito', httpStatus: 200,
    })
  })

  it('una revisión vencida responde 409 y deja un evento conflicto sin cambiar el borrador', async () => {
    const response = await PUT(pedido(draftId, { version: 1, baseRevision: 5, respuestas: { observacion: MARCADOR }, paso: 'situacion', actividadEn: FECHA }))
    expect(response.status).toBe(409)
    expect(await eventoDe(response)).toMatchObject({ accion: 'borrador.sincronizar', resultado: 'conflicto', httpStatus: 409 })
    expect((await filaBorrador()).revision).toBe(0)
  })

  it('si la auditoría no se puede guardar responde 503 y revierte la revisión', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const response = await conFalloAuditoria(() => PUT(pedido(draftId, { version: 1, baseRevision: 0, respuestas: { observacion: MARCADOR }, paso: 'situacion', actividadEn: FECHA })))
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ code: 'auditoria_no_disponible' })
    expect(await filaBorrador()).toMatchObject({ revision: 0, respuestas: { estado: 'habitual' } })
  })

  it('el evento no guarda las respuestas del borrador', async () => {
    const response = await PUT(pedido(draftId, { version: 1, baseRevision: 0, respuestas: { observacion: MARCADOR }, paso: 'situacion', actividadEn: FECHA }))
    expect(JSON.stringify(await eventoDe(response))).not.toContain(MARCADOR)
  })
})

describe('auditoría de borrador.descartar', () => {
  it('descarta el borrador y deja un evento exitoso', async () => {
    const response = await descartar(pedidoDescarte({ version: 1, baseRevision: 0 }))
    expect(response.status).toBe(200)
    expect(await eventoDe(response)).toMatchObject({
      accion: 'borrador.descartar', rutaPlantilla: '/api/problematicas/parte/borradores/[draftId]/descarte',
      objetoTipo: 'borrador', objetoId: draftId, resultado: 'exito', httpStatus: 200,
    })
  })

  it('una revisión vencida responde 409 y deja un evento conflicto', async () => {
    const response = await descartar(pedidoDescarte({ version: 1, baseRevision: 9 }))
    expect(response.status).toBe(409)
    expect(await eventoDe(response)).toMatchObject({ accion: 'borrador.descartar', resultado: 'conflicto', httpStatus: 409 })
    expect((await filaBorrador()).estado).toBe('open')
  })

  it('si la auditoría no se puede guardar responde 503 y el borrador sigue abierto', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const response = await conFalloAuditoria(() => descartar(pedidoDescarte({ version: 1, baseRevision: 0 })))
    expect(response.status).toBe(503)
    expect((await filaBorrador()).estado).toBe('open')
  })
})
