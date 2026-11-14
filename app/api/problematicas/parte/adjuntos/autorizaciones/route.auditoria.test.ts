import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb, migrarDb } from '@/lib/db'
import { auditoriaEvento, infraMovimiento, infraParte, infraPeriodo } from '@/lib/db/schema'
import { ensureSeeded } from '@/lib/db/seed'
import { conFalloAuditoria } from '@/lib/test-utils/fallo-auditoria'
import { tieneAccesoAlParteParaCue } from '@/lib/infraestructura/acceso-parte'
import { authorizeAttachments } from '@/lib/infraestructura/adjuntos/obs'
import { POST } from './route'

vi.mock('@/lib/infraestructura/acceso-parte', () => ({
  tieneAccesoAlParteParaCue: vi.fn(async () => true),
}))
vi.mock('@/lib/infraestructura/adjuntos/obs', () => ({
  authorizeAttachments: vi.fn(),
  ObsConfigurationError: class ObsConfigurationError extends Error {},
  validateAttachmentDeclarations: (value: unknown) => Array.isArray(value) && value.length > 0 && value.length <= 3,
}))

const CUE = '060000100'
const FECHA = '2026-10-15T12:00:00.000Z'
const MOVIMIENTO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ADJUNTO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const URL_FIRMADA = 'https://obs.example.test/firma-secreta-123'

function pedido(body: unknown) {
  return new Request('http://localhost/api/problematicas/parte/adjuntos/autorizaciones', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const cuerpo = () => ({
  movimientoId: MOVIMIENTO,
  adjuntos: [{ attachmentId: ADJUNTO, bytesOptimizado: 1024, bytesMiniatura: 256 }],
})

async function eventoDe(response: Response) {
  const [evento] = await getDb().select().from(auditoriaEvento)
    .where(eq(auditoriaEvento.requestId, response.headers.get('X-Audit-Id') ?? response.headers.get('X-Request-Id') ?? ''))
  return evento
}

beforeAll(() => migrarDb())

beforeEach(async () => {
  vi.stubEnv('REPORTES_OFFLINE_FOTOS', 'true')
  await ensureSeeded()
  const db = getDb()
  await db.insert(infraPeriodo).values({ id: 'periodo-autorizaciones', nombre: 'Periodo', inicioEn: FECHA, estado: 'historico', creadaEn: FECHA }).onConflictDoNothing()
  await db.insert(infraParte).values({
    id: 'parte-autorizaciones', periodoId: 'periodo-autorizaciones', cueAnexo: CUE, estadoEstablecimiento: 'habitual',
    estadoEstablecimientoRigeDesde: FECHA, corteId: 1, creadaEn: FECHA, actualizadaEn: FECHA,
  }).onConflictDoNothing()
  await db.insert(infraMovimiento).values({
    id: MOVIMIENTO, parteId: 'parte-autorizaciones', tipo: 'actualizacion', rol: 'director',
    resumen: {}, rigeDesde: FECHA, creadaEn: FECHA,
  }).onConflictDoNothing()
  vi.mocked(tieneAccesoAlParteParaCue).mockResolvedValue(true)
  vi.mocked(authorizeAttachments).mockResolvedValue([{
    attachmentId: ADJUNTO,
    optimizada: { url: URL_FIRMADA, key: 'k1', contentType: 'image/jpeg', contentLength: 1024, expiresAt: FECHA },
    miniatura: { url: `${URL_FIRMADA}-m`, key: 'k2', contentType: 'image/jpeg', contentLength: 256, expiresAt: FECHA },
  }])
})

describe('auditoría de foto.autorizar_carga', () => {
  it('entrega las URL firmadas y deja un evento exitoso con el movimiento como objeto', async () => {
    const response = await POST(pedido(cuerpo()))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ movimientoId: MOVIMIENTO })
    expect(await eventoDe(response)).toMatchObject({
      accion: 'foto.autorizar_carga', rutaPlantilla: '/api/problematicas/parte/adjuntos/autorizaciones',
      objetoTipo: 'movimiento', objetoId: MOVIMIENTO, cueAnexo: CUE, resultado: 'exito', httpStatus: 200,
      metadatos: { cantidad: 1 },
    })
  })

  it('cada autorización de una firma en caché deja su propio evento', async () => {
    const primera = await POST(pedido(cuerpo()))
    const segunda = await POST(pedido(cuerpo()))
    expect(segunda.status).toBe(200)
    expect(await eventoDe(primera)).toBeDefined()
    expect(await eventoDe(segunda)).toMatchObject({ accion: 'foto.autorizar_carga', resultado: 'exito' })
  })

  it('una validación fallida responde 422 y deja un evento inválido', async () => {
    const response = await POST(pedido({ movimientoId: MOVIMIENTO, adjuntos: [] }))
    expect(response.status).toBe(422)
    expect(await eventoDe(response)).toMatchObject({ accion: 'foto.autorizar_carga', resultado: 'invalido', httpStatus: 422 })
  })

  it('un acceso denegado responde 401 y deja un evento rechazado', async () => {
    vi.mocked(tieneAccesoAlParteParaCue).mockResolvedValueOnce(false)
    const response = await POST(pedido(cuerpo()))
    expect(response.status).toBe(401)
    expect(await eventoDe(response)).toMatchObject({ accion: 'foto.autorizar_carga', resultado: 'rechazado', httpStatus: 401 })
  })

  it('si la auditoría no se puede guardar responde 503 sin URL firmadas', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const response = await conFalloAuditoria(() => POST(pedido(cuerpo())))
    expect(response.status).toBe(503)
    const texto = await response.text()
    expect(texto).toContain('auditoria_no_disponible')
    expect(texto).not.toContain(URL_FIRMADA)
  })

  it('el evento no guarda las URL firmadas ni las claves de objeto', async () => {
    const response = await POST(pedido(cuerpo()))
    const json = JSON.stringify(await eventoDe(response))
    expect(json).not.toContain(URL_FIRMADA)
    expect(json).not.toContain('k1')
  })
})
