import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb, getRawClient, migrarDb } from '@/lib/db'
import { auditoriaEvento } from '@/lib/db/schema'
import { NOMBRE_COOKIE, crearTokenSesion } from '@/lib/infraestructura/acceso-publico'
import { claveDePrueba } from '@/lib/infraestructura/claves-de-prueba'
import { crearEjecutorSql, ensureGeSchema } from '@/lib/infraestructura/ge-db'
import { _resetLimitesParaTests } from '@/lib/infraestructura/limites'
import { conFalloAuditoria } from '@/lib/test-utils/fallo-auditoria'
import { GET } from './route'

vi.mock('@/lib/session', () => ({ getSessionUser: async () => null }))

const CLAVE = claveDePrueba()
// El id de auditoría viaja en X-Audit-Id cuando el handler ya trae X-Request-Id (ruta).
const idAuditoria = (response: Response) => response.headers.get('X-Audit-Id') ?? response.headers.get('X-Request-Id')!
const CUE = '1801605-90'
const RUTA = '/api/problematicas/parte/historial'

beforeAll(async () => {
  process.env.PROBLEMATICAS_ACCESO_PASSWORD = CLAVE
  await migrarDb()
  const client = crearEjecutorSql(getRawClient())
  await ensureGeSchema(client)
  await client.execute(
    "INSERT INTO ge.ge_corte (id, ciclo_lectivo, fetched_at, estado) OVERRIDING SYSTEM VALUE VALUES (1, 2025, '2025-01-01T00:00:00Z', 'vigente')",
  )
  await client.execute(
    `INSERT INTO ge.ge_localizacion (cue_anexo, cui, nombre, departamento, localidad) VALUES ('${CUE}', NULL, 'Escuela', 'ER', 'Parana')`,
  )
})

beforeEach(() => {
  _resetLimitesParaTests()
})

function pedido(conCookie = true): Request {
  const { token } = crearTokenSesion()
  return new Request(`http://localhost${RUTA}?cue=${CUE}`, {
    headers: conCookie ? { cookie: `${NOMBRE_COOKIE}=${token}` } : {},
  })
}

async function eventosDe(response: Response) {
  return getDb().select().from(auditoriaEvento).where(eq(auditoriaEvento.requestId, idAuditoria(response)))
}

describe('GET /api/problematicas/parte/historial (auditoría)', () => {
  it('una lectura exitosa deja exactamente un evento parte.historial con la identidad compartida', async () => {
    const response = await GET(pedido())
    expect(response.status).toBe(200)
    const eventos = await eventosDe(response)
    expect(eventos).toHaveLength(1)
    expect(eventos[0]).toMatchObject({
      accion: 'parte.historial',
      rutaPlantilla: RUTA,
      metodo: 'GET',
      actorTipo: 'compartido',
      viaAcceso: 'password_compartida',
      cueAnexo: CUE,
      resultado: 'exito',
      httpStatus: 200,
    })
    expect(JSON.stringify(eventos[0])).not.toContain(CLAVE)
  })

  it('sin credencial deja un evento rechazado anónimo', async () => {
    const response = await GET(pedido(false))
    expect(response.status).toBe(401)
    const eventos = await eventosDe(response)
    expect(eventos).toHaveLength(1)
    expect(eventos[0]).toMatchObject({ accion: 'parte.historial', actorTipo: 'anonimo', resultado: 'rechazado', httpStatus: 401 })
  })

  it('si falla la auditoría responde 503 y no devuelve movimientos', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const response = await conFalloAuditoria(() => GET(pedido()))
    expect(response.status).toBe(503)
    const cuerpo = await response.json()
    expect(cuerpo).toMatchObject({ code: 'auditoria_no_disponible' })
    expect(cuerpo).not.toHaveProperty('movimientos')
    vi.restoreAllMocks()
  })
})
