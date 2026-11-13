import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { conFalloAuditoria } from '@/lib/test-utils/fallo-auditoria'
import { getDb } from '@/lib/db'
import { auditoriaEvento } from '@/lib/db/schema'
import { obtenerUltimoCorte } from '@/lib/infraestructura/riesgo/situacion/corte'
import { GET } from './route'

const sesion = vi.hoisted(() => ({ acceso: null as null | { ok: true; user: unknown } | { ok: false; status: 401 | 403 } }))

vi.mock('@/lib/session', () => ({
  getSessionUser: vi.fn(),
  staffGuard: (user: { banned: boolean; role: string } | null) => {
    if (!user) return { status: 401 as const, error: 'No autenticado' }
    if (user.banned || (user.role !== 'admin' && user.role !== 'editor')) {
      return { status: 403 as const, error: 'No tiene acceso a este recurso' }
    }
    return null
  },
}))

vi.mock('@/lib/infraestructura/acceso-lectura', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>()
  const { observarUsuarioAuditoria } = await import('@/lib/infraestructura/auditoria/contexto')
  return {
    ...original,
    verificarAccesoSeccion: vi.fn(async () => {
      const acceso = sesion.acceso!
      if (acceso.ok) observarUsuarioAuditoria(acceso.user as { id: string; role: string })
      return acceso
    }),
  }
})

vi.mock('@/lib/infraestructura/riesgo/situacion/corte', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>()
  return { ...original, obtenerUltimoCorte: vi.fn() }
})

usarDbTemporal('situacion-export-auditoria-')

const editor = { id: 'editor-1', role: 'editor', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [] }

const CORTE = {
  id: 'corte-1',
  generadoEn: '2026-11-12T10:00:00.000Z',
  conteosPorNivelRiesgo: { alto: 2, bajo: 1 },
  kpis: { escuelasAfectacionConfirmadaVigente: 1, escuelasRiesgoAlto24h: 2, fuentesVencidas: 0 },
  episodiosAbiertos: 1,
  episodiosCerradosDesdeAnterior: 0,
}

function req(qs = ''): Request {
  return new Request(`http://localhost/api/infraestructura/situacion/export${qs}`)
}

async function eventoDe(res: Response) {
  const requestId = res.headers.get('X-Audit-Id') ?? res.headers.get('X-Request-Id')
  expect(requestId).toBeTruthy()
  const filas = await getDb().select().from(auditoriaEvento).where(eq(auditoriaEvento.requestId, requestId!))
  expect(filas).toHaveLength(1)
  return filas[0]!
}

beforeEach(() => {
  sesion.acceso = { ok: true, user: editor }
  vi.mocked(obtenerUltimoCorte).mockReset().mockResolvedValue(CORTE as never)
})

describe('auditoría de la exportación del Centro de Situación', () => {
  it('exportar CSV deja un evento situacion.exportar con formato y cantidad', async () => {
    const res = await GET(req('?formato=csv'))
    expect(res.status).toBe(200)

    const evento = await eventoDe(res)
    expect(evento).toMatchObject({
      accion: 'situacion.exportar',
      rutaPlantilla: '/api/infraestructura/situacion/export',
      metodo: 'GET',
      actorTipo: 'usuario',
      actorId: 'editor-1',
      actorRol: 'editor',
      viaAcceso: 'sesion',
      resultado: 'exito',
      httpStatus: 200,
      metadatos: { formato: 'csv', cantidad: 2 },
    })
  })

  it('exportar JSON deja el mismo tipo de evento', async () => {
    const res = await GET(req('?formato=json'))
    expect(res.status).toBe(200)
    expect(await eventoDe(res)).toMatchObject({ accion: 'situacion.exportar', metadatos: { formato: 'json', cantidad: 2 } })
  })

  it('un rechazo de sección deja un evento rechazado con 403', async () => {
    sesion.acceso = { ok: false, status: 403 }
    const res = await GET(req())
    expect(res.status).toBe(403)
    expect(await eventoDe(res)).toMatchObject({ accion: 'situacion.exportar', actorTipo: 'anonimo', resultado: 'rechazado', httpStatus: 403 })
  })

  it('un formato inválido deja un evento invalido', async () => {
    const res = await GET(req('?formato=xml'))
    expect(res.status).toBe(400)
    expect(await eventoDe(res)).toMatchObject({ accion: 'situacion.exportar', resultado: 'invalido', httpStatus: 400 })
  })

  it('si no se puede registrar la auditoría responde 503 y no entrega el archivo', async () => {
    const antes = await getDb().select().from(auditoriaEvento)
    const res = await conFalloAuditoria(() => GET(req('?formato=csv')))
    expect(res.status).toBe(503)
    expect(res.headers.get('Content-Disposition')).toBeNull()
    expect((await res.json()).code).toBe('auditoria_no_disponible')
    expect(await getDb().select().from(auditoriaEvento)).toHaveLength(antes.length)
  })
})
