import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { getDb, migrarDb } from '@/lib/db'
import { auditoriaEvento } from '@/lib/db/schema'
import { conFalloAuditoria } from '@/lib/test-utils/fallo-auditoria'
import { conAuditoria } from './servidor'

beforeAll(() => migrarDb())
afterEach(() => vi.restoreAllMocks())

const RUTA = '/api/infraestructura/motivos'
const solicitud = () => new Request('https://example.test/api/infraestructura/motivos', { method: 'POST', headers: { 'X-Request-Id': 'id-del-cliente' } })
const filasDe = (requestId: string) => getDb().select().from(auditoriaEvento).where(eq(auditoriaEvento.requestId, requestId))
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

describe('X-Request-Id en respuestas auditadas', () => {
  it('sin cabecera del handler, X-Request-Id es el id del evento', async () => {
    const response = await conAuditoria('verificacion.responder', RUTA, async (_request: Request) => Response.json({ ok: true }))(solicitud())
    const requestId = response.headers.get('X-Request-Id')!
    expect(response.headers.get('X-Audit-Id')).toBeNull()
    const filas = await filasDe(requestId)
    expect(filas).toHaveLength(1)
    expect(filas[0].requestId).toBe(requestId)
  })

  it('si el handler ya puso X-Request-Id, lo conserva y el id de auditoría va en X-Audit-Id', async () => {
    const response = await conAuditoria('verificacion.responder', RUTA, async (_request: Request) =>
      Response.json({ ok: true }, { headers: { 'X-Request-Id': 'cliente-123' } }))(solicitud())
    expect(response.headers.get('X-Request-Id')).toBe('cliente-123')
    const auditId = response.headers.get('X-Audit-Id')!
    expect(auditId).toMatch(UUID)
    expect(auditId).not.toBe('cliente-123')
    expect(await filasDe(auditId)).toHaveLength(1)
  })

  it('el X-Request-Id entrante del cliente nunca se convierte en requestId del evento', async () => {
    const response = await conAuditoria('verificacion.responder', RUTA, async (_request: Request) => Response.json({ ok: true }))(solicitud())
    expect(response.headers.get('X-Request-Id')).not.toBe('id-del-cliente')
    expect(response.headers.get('X-Audit-Id')).not.toBe('id-del-cliente')
    expect(await filasDe('id-del-cliente')).toHaveLength(0)
  })

  it('el 503 por falla de auditoría lleva X-Request-Id y X-Audit-Id con el mismo id del servidor', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const handler = conAuditoria('verificacion.responder', RUTA, async (_request: Request) =>
      Response.json({ ok: true }, { headers: { 'X-Request-Id': 'cliente-123' } }))
    const response = await conFalloAuditoria(() => handler(solicitud()))
    expect(response.status).toBe(503)
    const requestId = response.headers.get('X-Request-Id')!
    expect(requestId).toMatch(UUID)
    expect(requestId).not.toBe('cliente-123')
    expect(response.headers.get('X-Audit-Id')).toBe(requestId)
  })

  it('una redirección conserva estado y Location, y recibe el id de auditoría', async () => {
    const response = await conAuditoria('verificacion.responder', RUTA, async (_request: Request) => Response.redirect('https://example.test/x', 302))(solicitud())
    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe('https://example.test/x')
    const requestId = response.headers.get('X-Request-Id')!
    expect(response.headers.get('X-Audit-Id')).toBeNull()
    expect(await filasDe(requestId)).toHaveLength(1)
  })
})
