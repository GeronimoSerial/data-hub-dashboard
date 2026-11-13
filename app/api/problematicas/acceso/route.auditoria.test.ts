import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb, migrarDb } from '@/lib/db'
import { auditoriaEvento } from '@/lib/db/schema'
import { claveDePrueba } from '@/lib/infraestructura/claves-de-prueba'
import { _resetLimitesParaTests } from '@/lib/infraestructura/limites'
import { conFalloAuditoria } from '@/lib/test-utils/fallo-auditoria'
import { POST } from './route'

// El id de auditoría viaja en X-Audit-Id cuando el handler ya trae X-Request-Id (ruta).
const idAuditoria = (response: Response) => response.headers.get('X-Audit-Id') ?? response.headers.get('X-Request-Id')!

vi.mock('@/lib/session', () => ({ getSessionUser: async () => null }))

const CLAVE = claveDePrueba()
const RUTA = '/api/problematicas/acceso'

beforeAll(async () => {
  process.env.PROBLEMATICAS_ACCESO_PASSWORD = CLAVE
  await migrarDb()
})

beforeEach(() => {
  _resetLimitesParaTests()
})

function pedido(body: unknown): Request {
  return new Request(`http://localhost${RUTA}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

async function eventosDe(response: Response) {
  return getDb().select().from(auditoriaEvento).where(eq(auditoriaEvento.requestId, idAuditoria(response)))
}

describe('POST /api/problematicas/acceso (auditoría)', () => {
  it('ingreso correcto deja un evento compartido sin secretos en la base', async () => {
    const response = await POST(pedido({ password: CLAVE }))
    expect(response.status).toBe(200)
    const cookie = response.headers.get('set-cookie') ?? ''
    expect(cookie).not.toBe('')

    const eventos = await eventosDe(response)
    expect(eventos).toHaveLength(1)
    expect(eventos[0]).toMatchObject({
      accion: 'acceso.ingresar',
      rutaPlantilla: RUTA,
      actorTipo: 'compartido',
      viaAcceso: 'password_compartida',
      resultado: 'exito',
      httpStatus: 200,
    })
    const serializado = JSON.stringify(eventos[0])
    expect(serializado).not.toContain(CLAVE)
    expect(serializado).not.toContain(cookie.split(';')[0]!.split('=')[1]!)
  })

  it('contraseña incorrecta deja un evento rechazado anónimo', async () => {
    const response = await POST(pedido({ password: 'no-es-la-clave' }))
    expect(response.status).toBe(401)
    const eventos = await eventosDe(response)
    expect(eventos).toHaveLength(1)
    expect(eventos[0]).toMatchObject({ actorTipo: 'anonimo', resultado: 'rechazado', httpStatus: 401 })
  })

  it('cuerpo sin contraseña deja un evento invalido', async () => {
    const response = await POST(pedido({}))
    expect(response.status).toBe(400)
    const eventos = await eventosDe(response)
    expect(eventos).toHaveLength(1)
    expect(eventos[0]).toMatchObject({ resultado: 'invalido', httpStatus: 400 })
  })

  it('si falla la auditoría responde 503 y no entrega la cookie de sesión', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const response = await conFalloAuditoria(() => POST(pedido({ password: CLAVE })))
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ code: 'auditoria_no_disponible' })
    expect(response.headers.get('set-cookie')).toBeNull()
    vi.restoreAllMocks()
  })
})
