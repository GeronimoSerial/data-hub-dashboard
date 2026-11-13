import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb, migrarDb } from '@/lib/db'
import { auditoriaEvento, infraBorrador } from '@/lib/db/schema'
import { ensureSeeded } from '@/lib/db/seed'
import { conFalloAuditoria } from '@/lib/test-utils/fallo-auditoria'
import { tieneAccesoAlParteParaCue } from '@/lib/infraestructura/acceso-parte'
import { tieneAccesoPublico } from '@/lib/infraestructura/acceso-publico'
import type * as PublicoModulo from '@/lib/infraestructura/acceso-publico'
import { POST } from './route'

vi.mock('@/lib/infraestructura/acceso-parte', () => ({
  tieneAccesoAlParteParaCue: vi.fn(async () => true),
}))
vi.mock('@/lib/infraestructura/acceso-publico', async importOriginal => ({
  ...(await importOriginal<typeof PublicoModulo>()),
  tieneAccesoPublico: vi.fn(() => false),
}))

const CUE = '1801605-04'
const FECHA = '2026-10-15T12:00:00.000Z'
const MARCADOR = 'RESPUESTA-PRIVADA-7431'
let draftId = ''

function cuerpo(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    draftId,
    generacion: 1,
    contexto: { version: 1, draftId, cue: CUE, flujo: 'inicial', escuela: { nombre: 'Escuela', cue: CUE, departamento: 'Paraná' } },
    paso: 'situacion',
    respuestas: { estado: 'habitual', observacion: MARCADOR },
    actividadEn: FECHA,
    ...overrides,
  }
}

function pedido(body: unknown) {
  return new Request('http://localhost/api/problematicas/parte/borradores', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

async function eventoDe(response: Response) {
  const [evento] = await getDb().select().from(auditoriaEvento)
    .where(eq(auditoriaEvento.requestId, response.headers.get('X-Audit-Id') ?? response.headers.get('X-Request-Id') ?? ''))
  return evento
}

async function filasDeBorrador() {
  return getDb().select().from(infraBorrador).where(eq(infraBorrador.id, draftId))
}

beforeAll(() => migrarDb())

beforeEach(async () => {
  vi.stubEnv('REPORTES_OFFLINE_BORRADORES_SYNC', 'true')
  draftId = crypto.randomUUID()
  await ensureSeeded()
  vi.mocked(tieneAccesoAlParteParaCue).mockResolvedValue(true)
  vi.mocked(tieneAccesoPublico).mockReturnValue(false)
})

describe('auditoría de borrador.crear', () => {
  it('deja un evento exitoso con el borrador como objeto y la respuesta 201', async () => {
    const response = await POST(pedido(cuerpo()))
    expect(response.status).toBe(201)
    const evento = await eventoDe(response)
    expect(evento).toMatchObject({
      accion: 'borrador.crear', metodo: 'POST', rutaPlantilla: '/api/problematicas/parte/borradores',
      objetoTipo: 'borrador', objetoId: draftId, cueAnexo: CUE, resultado: 'exito', httpStatus: 201,
      actorTipo: 'anonimo',
    })
    expect(await getDb().select().from(auditoriaEvento).where(eq(auditoriaEvento.objetoId, draftId))).toHaveLength(1)
  })

  it('registra la identidad compartida cuando el acceso es por contraseña del parte', async () => {
    vi.mocked(tieneAccesoPublico).mockReturnValue(true)
    const response = await POST(pedido(cuerpo()))
    expect(await eventoDe(response)).toMatchObject({ actorTipo: 'compartido', actorId: null, resultado: 'exito' })
  })

  it('un reenvío idéntico responde 200 y deja un evento repetido sin duplicar el borrador', async () => {
    await POST(pedido(cuerpo()))
    const repetido = await POST(pedido(cuerpo()))
    expect(repetido.status).toBe(200)
    expect(await eventoDe(repetido)).toMatchObject({ accion: 'borrador.crear', resultado: 'repetido', httpStatus: 200 })
    expect(await filasDeBorrador()).toHaveLength(1)
  })

  it('una validación fallida responde 422 y deja un evento inválido', async () => {
    const response = await POST(pedido(cuerpo({ contexto: { cue: 'mal' } })))
    expect(response.status).toBe(422)
    expect(await eventoDe(response)).toMatchObject({ accion: 'borrador.crear', resultado: 'invalido', httpStatus: 422 })
  })

  it('un acceso denegado responde 401 y deja un evento rechazado', async () => {
    vi.mocked(tieneAccesoAlParteParaCue).mockResolvedValueOnce(false)
    const response = await POST(pedido(cuerpo()))
    expect(response.status).toBe(401)
    expect(await eventoDe(response)).toMatchObject({ accion: 'borrador.crear', resultado: 'rechazado', httpStatus: 401 })
  })

  it('si la auditoría no se puede guardar responde 503 y no deja borrador', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const response = await conFalloAuditoria(() => POST(pedido(cuerpo())))
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ code: 'auditoria_no_disponible' })
    expect(await filasDeBorrador()).toHaveLength(0)
  })

  it('el evento no guarda el cuerpo ni las respuestas del borrador', async () => {
    const response = await POST(pedido(cuerpo()))
    const evento = await eventoDe(response)
    expect(JSON.stringify(evento)).not.toContain(MARCADOR)
    expect(JSON.stringify(evento)).not.toContain('Escuela')
  })
})
