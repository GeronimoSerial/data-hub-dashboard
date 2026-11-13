import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { conFalloAuditoria } from '@/lib/test-utils/fallo-auditoria'
import { getDb } from '@/lib/db'
import { auditoriaEvento } from '@/lib/db/schema'
import { crearEnlace, revocarEnlacesDelDia } from '@/lib/infraestructura/veredicto/enlaces'
import { GET } from './route'

vi.mock('@/lib/infraestructura/veredicto/eventos-terreno', () => ({ cargarEventosTerreno: vi.fn(async () => []) }))

usarDbTemporal('enlace-pdf-auditoria-')

const RUTA = '/api/veredicto/compartido/[token]/pdf'

function req(): Request {
  return new Request('http://localhost/api/veredicto/compartido/x/pdf')
}

function ctx(token: string) {
  return { params: Promise.resolve({ token }) }
}

async function eventoDe(res: Response) {
  const requestId = res.headers.get('X-Audit-Id') ?? res.headers.get('X-Request-Id')
  expect(requestId).toBeTruthy()
  const filas = await getDb().select().from(auditoriaEvento).where(eq(auditoriaEvento.requestId, requestId!))
  expect(filas).toHaveLength(1)
  return filas[0]!
}

async function enlaceVigente() {
  const id = crypto.randomUUID()
  const enlace = await crearEnlace(getDb(), { id, desde: '2026-10-01', hasta: '2026-10-05', creadoPor: 'admin-1' })
  return { ...enlace, id }
}

describe('auditoría del PDF del veredicto compartido', () => {
  it('un enlace vigente deja un evento enlace.pdf sin token ni URL', async () => {
    const { token, id } = await enlaceVigente()

    const res = await GET(req(), ctx(token))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/pdf')

    const evento = await eventoDe(res)
    expect(evento).toMatchObject({
      accion: 'enlace.pdf',
      rutaPlantilla: RUTA,
      metodo: 'GET',
      actorTipo: 'enlace',
      actorId: id,
      viaAcceso: 'enlace',
      objetoTipo: 'enlace_veredicto',
      resultado: 'exito',
      httpStatus: 200,
    })
    expect(typeof evento.metadatos.cantidad).toBe('number')
    const serializado = JSON.stringify(evento)
    expect(serializado).not.toContain(token)
    expect(serializado).not.toContain(`/veredicto/compartido/${token}`)
  })

  it('un token inexistente deja un rechazo y no entrega datos', async () => {
    const res = await GET(req(), ctx('token-que-no-existe'))
    expect(res.status).toBe(404)

    const evento = await eventoDe(res)
    expect(evento).toMatchObject({ accion: 'enlace.pdf', actorTipo: 'anonimo', resultado: 'invalido', httpStatus: 404 })
    expect(JSON.stringify(evento)).not.toContain('token-que-no-existe')
  })

  it('un enlace revocado deja un rechazo 410 con el enlace identificado como actor', async () => {
    const { token, id } = await enlaceVigente()
    await revocarEnlacesDelDia(getDb(), { revocadoPor: 'admin-1' })

    const res = await GET(req(), ctx(token))
    expect(res.status).toBe(410)
    expect(await eventoDe(res)).toMatchObject({ actorTipo: 'enlace', actorId: id, resultado: 'invalido', httpStatus: 410 })
  })

  it('un enlace vencido deja un rechazo 410', async () => {
    const { token } = await crearEnlace(getDb(), {
      desde: '2026-01-05', hasta: '2026-01-05', creadoPor: 'admin-1', ahora: new Date('2026-01-05T12:00:00Z'),
    })

    const res = await GET(req(), ctx(token))
    expect(res.status).toBe(410)
    expect(await eventoDe(res)).toMatchObject({ actorTipo: 'enlace', resultado: 'invalido', httpStatus: 410 })
  })

  it('si no se puede registrar la auditoría responde 503 y no entrega el PDF', async () => {
    const { token } = await enlaceVigente()

    const antes = await getDb().select().from(auditoriaEvento)

    const res = await conFalloAuditoria(() => GET(req(), ctx(token)))
    expect(res.status).toBe(503)
    expect(res.headers.get('Content-Disposition')).toBeNull()
    const cuerpo = await res.json()
    expect(cuerpo.code).toBe('auditoria_no_disponible')
    expect(await getDb().select().from(auditoriaEvento)).toHaveLength(antes.length)
  })
})
