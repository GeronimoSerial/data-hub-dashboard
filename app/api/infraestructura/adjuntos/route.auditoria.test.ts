import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb, migrarDb } from '@/lib/db'
import { auditoriaEvento } from '@/lib/db/schema'
import { ensureSeeded } from '@/lib/db/seed'
import { conFalloAuditoria } from '@/lib/test-utils/fallo-auditoria'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { GET } from './route'

vi.mock('@/lib/infraestructura/acceso-lectura', () => ({ verificarAccesoLectura: vi.fn() }))
vi.mock('@/lib/infraestructura/adjuntos/lectura', () => ({
  firmarLecturaAdjunto: vi.fn(async (key: string) => `https://obs.example.test/lectura/${key}?firma=secreta-555`),
}))

const CUE = '1801605-60'
const URL_FIRMADA_PREFIJO = 'https://obs.example.test/lectura/'

function pedido(query = `cue=${CUE}`) {
  return new Request(`http://localhost/api/infraestructura/adjuntos?${query}`)
}

async function eventoDe(response: Response) {
  const [evento] = await getDb().select().from(auditoriaEvento)
    .where(eq(auditoriaEvento.requestId, response.headers.get('X-Audit-Id') ?? response.headers.get('X-Request-Id') ?? ''))
  return evento
}

beforeAll(() => migrarDb())

beforeEach(async () => {
  vi.stubEnv('REPORTES_OFFLINE_FOTOS', 'true')
  await ensureSeeded()
  vi.mocked(verificarAccesoLectura).mockResolvedValue({
    ok: true,
    user: { id: 'usuario-lectura', role: 'admin' } as never,
  })
})

describe('auditoría de foto.autorizar_lectura', () => {
  it('deja un evento exitoso al listar las fotos del establecimiento', async () => {
    const response = await GET(pedido())
    expect(response.status).toBe(200)
    expect(await eventoDe(response)).toMatchObject({
      accion: 'foto.autorizar_lectura', metodo: 'GET', rutaPlantilla: '/api/infraestructura/adjuntos',
      cueAnexo: CUE, resultado: 'exito', httpStatus: 200,
    })
  })

  it('un acceso denegado responde 403 y deja un evento rechazado', async () => {
    vi.mocked(verificarAccesoLectura).mockResolvedValueOnce({ ok: false, status: 403 })
    const response = await GET(pedido())
    expect(response.status).toBe(403)
    expect(await eventoDe(response)).toMatchObject({ accion: 'foto.autorizar_lectura', resultado: 'rechazado', httpStatus: 403 })
  })

  it('un CUE inválido responde 400 y deja un evento inválido', async () => {
    const response = await GET(pedido('cue=mal'))
    expect(response.status).toBe(400)
    expect(await eventoDe(response)).toMatchObject({ accion: 'foto.autorizar_lectura', resultado: 'invalido', httpStatus: 400 })
  })

  it('si la auditoría no se puede guardar responde 503 y no entrega URL', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const response = await conFalloAuditoria(() => GET(pedido()))
    expect(response.status).toBe(503)
    const texto = await response.text()
    expect(texto).toContain('auditoria_no_disponible')
    expect(texto).not.toContain(URL_FIRMADA_PREFIJO)
  })

  it('el evento no guarda las URL firmadas', async () => {
    const response = await GET(pedido())
    expect(JSON.stringify(await eventoDe(response))).not.toContain('firma=')
  })
})
