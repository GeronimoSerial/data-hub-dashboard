import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb, migrarDb } from '@/lib/db'
import { auditoriaEvento, infraAdjunto, infraMovimiento, infraParte, infraPeriodo } from '@/lib/db/schema'
import { ensureSeeded } from '@/lib/db/seed'
import { conFalloAuditoria } from '@/lib/test-utils/fallo-auditoria'
import { tieneAccesoAlParteParaCue } from '@/lib/infraestructura/acceso-parte'
import { headAttachmentObject } from '@/lib/infraestructura/adjuntos/obs'
import { POST as confirmarRuta } from './route'

vi.mock('@/lib/infraestructura/acceso-parte', () => ({
  tieneAccesoAlParteParaCue: vi.fn(async () => true),
}))
vi.mock('@/lib/infraestructura/adjuntos/obs', () => ({
  getObsBucket: () => 'bucket',
  headAttachmentObject: vi.fn(),
  ObsObjectMissingError: class ObsObjectMissingError extends Error {},
}))

const CUE = '060000200'
// La ruta recibe el id del adjunto en los parámetros dinámicos, no como argumento suelto.
const POST = (request: Request, adjunto = ADJUNTO) => confirmarRuta(request, { params: Promise.resolve({ attachmentId: adjunto }) })
const FECHA = '2026-10-15T12:00:00.000Z'
const MOVIMIENTO = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const ADJUNTO = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const ETAG_O = 'a1b2c3'
const ETAG_M = 'd4e5f6'

function pedido(body: unknown, adjunto = ADJUNTO) {
  return new Request(`http://localhost/api/problematicas/parte/adjuntos/${adjunto}/confirmacion`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

const cuerpo = () => ({ movimientoId: MOVIMIENTO, optimizadaEtag: ETAG_O, miniaturaEtag: ETAG_M })

async function eventoDe(response: Response) {
  const [evento] = await getDb().select().from(auditoriaEvento)
    .where(eq(auditoriaEvento.requestId, response.headers.get('X-Audit-Id') ?? response.headers.get('X-Request-Id') ?? ''))
  return evento
}

async function estadoAdjunto() {
  const [fila] = await getDb().select().from(infraAdjunto).where(eq(infraAdjunto.id, ADJUNTO))
  return fila
}

beforeAll(() => migrarDb())

beforeEach(async () => {
  vi.stubEnv('REPORTES_OFFLINE_FOTOS', 'true')
  await ensureSeeded()
  const db = getDb()
  await db.insert(infraPeriodo).values({ id: 'periodo-confirmacion', nombre: 'Periodo', inicioEn: FECHA, estado: 'historico', creadaEn: FECHA }).onConflictDoNothing()
  await db.insert(infraParte).values({
    id: 'parte-confirmacion', periodoId: 'periodo-confirmacion', cueAnexo: CUE, estadoEstablecimiento: 'habitual',
    estadoEstablecimientoRigeDesde: FECHA, corteId: 1, creadaEn: FECHA, actualizadaEn: FECHA,
  }).onConflictDoNothing()
  await db.insert(infraMovimiento).values({
    id: MOVIMIENTO, parteId: 'parte-confirmacion', tipo: 'evidencia_fotografica', rol: 'director',
    resumen: {}, rigeDesde: FECHA, creadaEn: FECHA,
  }).onConflictDoNothing()
  await db.insert(infraAdjunto).values({
    id: ADJUNTO, movimientoId: MOVIMIENTO,
    optimizadaObsKey: `reportes/${CUE}/${MOVIMIENTO}/${ADJUNTO}/optimizada.jpg`, optimizadaSize: 1024,
    optimizadaContentType: 'image/jpeg', optimizadaEtag: null,
    miniaturaObsKey: `reportes/${CUE}/${MOVIMIENTO}/${ADJUNTO}/miniatura.jpg`, miniaturaSize: 256,
    miniaturaContentType: 'image/jpeg', miniaturaEtag: null, estado: 'pending', creadaPor: 'public-parte',
  }).onConflictDoUpdate({ target: infraAdjunto.id, set: { estado: 'pending', optimizadaEtag: null, miniaturaEtag: null } })
  vi.mocked(tieneAccesoAlParteParaCue).mockResolvedValue(true)
  vi.mocked(headAttachmentObject).mockImplementation(async (_bucket, key) => key.endsWith('optimizada.jpg')
    ? { size: 1024, contentType: 'image/jpeg', etag: ETAG_O }
    : { size: 256, contentType: 'image/jpeg', etag: ETAG_M })
})

describe('auditoría de foto.confirmar', () => {
  it('marca el adjunto confirmado y deja un evento exitoso', async () => {
    const response = await POST(pedido(cuerpo()), ADJUNTO)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ estado: 'confirmed', repetido: false })
    expect(await eventoDe(response)).toMatchObject({
      accion: 'foto.confirmar', rutaPlantilla: '/api/problematicas/parte/adjuntos/[attachmentId]/confirmacion',
      objetoTipo: 'adjunto', objetoId: ADJUNTO, cueAnexo: CUE, resultado: 'exito', httpStatus: 200,
    })
    expect((await estadoAdjunto()).estado).toBe('confirmed')
  })

  it('una confirmación ya hecha responde repetido y deja un evento repetido', async () => {
    await POST(pedido(cuerpo()), ADJUNTO)
    const repetida = await POST(pedido(cuerpo()), ADJUNTO)
    expect(repetida.status).toBe(200)
    expect(await repetida.json()).toMatchObject({ repetido: true })
    expect(await eventoDe(repetida)).toMatchObject({ accion: 'foto.confirmar', resultado: 'repetido', httpStatus: 200 })
  })

  it('si un objeto OBS no está listo responde 409 y deja un evento conflicto sin confirmar', async () => {
    const { ObsObjectMissingError } = await import('@/lib/infraestructura/adjuntos/obs')
    vi.mocked(headAttachmentObject).mockRejectedValueOnce(new ObsObjectMissingError())
    const response = await POST(pedido(cuerpo()), ADJUNTO)
    expect(response.status).toBe(409)
    expect(await eventoDe(response)).toMatchObject({ accion: 'foto.confirmar', resultado: 'conflicto', httpStatus: 409 })
    expect((await estadoAdjunto()).estado).toBe('pending')
  })

  it('una validación fallida responde 422 y deja un evento inválido', async () => {
    const response = await POST(pedido({ movimientoId: 'no-es-uuid' }), ADJUNTO)
    expect(response.status).toBe(422)
    expect(await eventoDe(response)).toMatchObject({ accion: 'foto.confirmar', resultado: 'invalido', httpStatus: 422 })
  })

  it('si la auditoría no se puede guardar responde 503 y el adjunto queda pendiente', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const response = await conFalloAuditoria(() => POST(pedido(cuerpo()), ADJUNTO))
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ code: 'auditoria_no_disponible' })
    expect((await estadoAdjunto()).estado).toBe('pending')
  })

  it('el evento no guarda etiquetas de objeto ni la clave del archivo', async () => {
    const response = await POST(pedido(cuerpo()), ADJUNTO)
    const json = JSON.stringify(await eventoDe(response))
    expect(json).not.toContain('optimizada.jpg')
    expect(json).not.toContain(ETAG_O)
  })
})
