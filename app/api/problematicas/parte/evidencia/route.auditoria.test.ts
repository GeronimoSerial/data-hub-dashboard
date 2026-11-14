import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb, migrarDb } from '@/lib/db'
import { auditoriaEvento, infraAdjunto, infraMovimiento, infraParte, infraPeriodo } from '@/lib/db/schema'
import { NOMBRE_COOKIE, crearTokenSesion } from '@/lib/infraestructura/acceso-publico'
import { claveDePrueba } from '@/lib/infraestructura/claves-de-prueba'
import { _resetLimitesParaTests } from '@/lib/infraestructura/limites'
import { conFalloAuditoria } from '@/lib/test-utils/fallo-auditoria'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import type * as AccesoParte from '@/lib/infraestructura/acceso-parte'
import { POST } from './route'

const { enabled, lecturas } = vi.hoisted(() => ({
  enabled: vi.fn(),
  // Cada lectura de sesión o acceso anota si se ejecutó dentro de una transacción auditada.
  lecturas: { todas: [] as string[], dentro: [] as string[] },
}))

vi.mock('@/lib/infraestructura/parte/feature-flags', () => ({
  getReportesOfflineFeatures: enabled,
  reportesOfflineFlagDisabledResponse: () => new Response(null, { status: 404 }),
}))
vi.mock('@/lib/db/seed', () => ({ ensureSeeded: async () => undefined }))
vi.mock('@/lib/session', () => ({ getSessionUser: async () => null }))
vi.mock('@/lib/auth', async () => {
  const { transaccionContextual } = await import('@/lib/db/contexto')
  return {
    auth: {
      api: {
        getSession: async () => {
          lecturas.todas.push('sesion')
          if (transaccionContextual.getStore()) lecturas.dentro.push('sesion')
          return null
        },
      },
    },
  }
})
vi.mock('@/lib/infraestructura/acceso-parte', async importOriginal => {
  const real = await importOriginal<typeof AccesoParte>()
  const { transaccionContextual } = await import('@/lib/db/contexto')
  return {
    ...real,
    tieneAccesoAlParteParaCue: async (request: Request, cue: string) => {
      lecturas.todas.push('acceso')
      if (transaccionContextual.getStore()) lecturas.dentro.push('acceso')
      return real.tieneAccesoAlParteParaCue(request, cue)
    },
  }
})

const CLAVE = claveDePrueba()
const RUTA = '/api/problematicas/parte/evidencia'
const MOMENTO = '2026-10-15T12:00:00.000Z'
const BASE = 'evidencia-ruta-auditoria-base'
// El id de auditoría viaja en X-Audit-Id cuando el handler ya trae X-Request-Id (ruta).
const idAuditoria = (response: Response) => response.headers.get('X-Audit-Id') ?? response.headers.get('X-Request-Id')!
const CUE = '060000777'

usarDbTemporal('evidencia-route-auditoria', { seed: false, env: { PROBLEMATICAS_ACCESO_PASSWORD: CLAVE } })

beforeAll(async () => {
  await migrarDb()
  const db = getDb()
  await db.insert(infraPeriodo).values({ id: 'periodo-evidencia-ruta-auditoria', nombre: 'Periodo', inicioEn: MOMENTO, estado: 'vigente', creadaEn: MOMENTO })
  await db.insert(infraParte).values({
    id: 'parte-evidencia-ruta-auditoria', periodoId: 'periodo-evidencia-ruta-auditoria', cueAnexo: CUE,
    estadoEstablecimiento: 'habitual', estadoEstablecimientoRigeDesde: MOMENTO, corteId: 1, creadaEn: MOMENTO, actualizadaEn: MOMENTO,
  })
  await db.insert(infraMovimiento).values({
    id: BASE, parteId: 'parte-evidencia-ruta-auditoria', tipo: 'actualizacion', rol: 'director',
    resumen: {}, rigeDesde: MOMENTO, creadaEn: MOMENTO,
  })
})

beforeEach(() => {
  enabled.mockReset().mockReturnValue({ fotos: true })
  _resetLimitesParaTests()
})

function foto() {
  return {
    attachmentId: randomUUID(),
    optimizadaSize: 1000,
    optimizadaContentType: 'image/webp',
    miniaturaSize: 200,
    miniaturaContentType: 'image/webp',
  }
}

function pedido(clave: string, fotos = [foto()], conCookie = true): Request {
  const { token } = crearTokenSesion()
  return new Request(`http://localhost${RUTA}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(conCookie ? { cookie: `${NOMBRE_COOKIE}=${token}` } : {}) },
    body: JSON.stringify({ movimientoBaseId: BASE, idempotencyKey: clave, fotos }),
  })
}

async function eventosDe(response: Response) {
  return getDb().select().from(auditoriaEvento).where(eq(auditoriaEvento.requestId, idAuditoria(response)))
}

async function evidenciasCon(clave: string) {
  return getDb().select().from(infraMovimiento).where(eq(infraMovimiento.idempotencyKey, clave))
}

describe('POST /api/problematicas/parte/evidencia (auditoría)', () => {
  it('alta exitosa deja un movimiento y exactamente un evento evidencia.crear compartido', async () => {
    const clave = randomUUID()
    const response = await POST(pedido(clave))
    expect(response.status).toBe(200)
    expect(await evidenciasCon(clave)).toHaveLength(1)

    const eventos = await eventosDe(response)
    expect(eventos).toHaveLength(1)
    expect(eventos[0]).toMatchObject({
      accion: 'evidencia.crear',
      rutaPlantilla: RUTA,
      actorTipo: 'compartido',
      viaAcceso: 'password_compartida',
      resultado: 'exito',
      httpStatus: 200,
    })
    const serializado = JSON.stringify(eventos[0])
    expect(serializado).not.toContain(CLAVE)
    expect(serializado).not.toContain('optimizada')
  })

  it('sesión y acceso se leen antes de abrir la transacción auditada', async () => {
    lecturas.todas.length = 0
    lecturas.dentro.length = 0
    const response = await POST(pedido(randomUUID()))
    expect(response.status).toBe(200)
    expect(lecturas.todas).toEqual(expect.arrayContaining(['acceso', 'sesion']))
    expect(lecturas.dentro).toEqual([])
  })

  it('repetir la misma clave responde repetido, sin segundo movimiento y con un evento repetido', async () => {
    const clave = randomUUID()
    const fotos = [foto()]
    expect((await POST(pedido(clave, fotos))).status).toBe(200)
    const repetida = await POST(pedido(clave, fotos))
    expect(repetida.status).toBe(200)
    expect(await repetida.json()).toMatchObject({ repetido: true })
    expect(await evidenciasCon(clave)).toHaveLength(1)
    const eventos = await eventosDe(repetida)
    expect(eventos).toHaveLength(1)
    expect(eventos[0]).toMatchObject({ resultado: 'repetido', httpStatus: 200 })
  })

  it('sin credencial deja un evento rechazado anónimo y no escribe evidencia', async () => {
    const clave = randomUUID()
    const response = await POST(pedido(clave, [foto()], false))
    expect(response.status).toBe(403)
    expect(await evidenciasCon(clave)).toHaveLength(0)
    const eventos = await eventosDe(response)
    expect(eventos).toHaveLength(1)
    expect(eventos[0]).toMatchObject({ actorTipo: 'anonimo', resultado: 'rechazado', httpStatus: 403 })
  })

  it('una entrada inválida deja un evento invalido', async () => {
    const response = await POST(pedido(randomUUID(), []))
    expect(response.status).toBe(422)
    const eventos = await eventosDe(response)
    expect(eventos).toHaveLength(1)
    expect(eventos[0]).toMatchObject({ resultado: 'invalido', httpStatus: 422 })
  })

  it('si falla la auditoría responde 503 y revierte la evidencia y sus adjuntos', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const clave = randomUUID()
    const fotos = [foto()]
    const response = await conFalloAuditoria(() => POST(pedido(clave, fotos)))
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ code: 'auditoria_no_disponible' })
    expect(await evidenciasCon(clave)).toHaveLength(0)
    expect(await getDb().select().from(infraAdjunto).where(eq(infraAdjunto.id, fotos[0]!.attachmentId))).toHaveLength(0)
    vi.restoreAllMocks()
  })
})
