import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { conFalloAuditoria } from '@/lib/test-utils/fallo-auditoria'
import { getDb } from '@/lib/db'
import { auditoriaEvento } from '@/lib/db/schema'
import { invalidarCacheExportaciones } from '@/lib/exportaciones/consulta'
import { listarEscuelasMapaEnriquecidas } from '@/lib/infraestructura/parte-mapa'
import { GET as radarGET } from '@/app/api/infraestructura/radar/route'
import { GET } from './route'

const sesion = vi.hoisted(() => ({ acceso: null as null | { ok: true; user: unknown } | { ok: false; status: 401 | 403 } }))

vi.mock('@/lib/infraestructura/acceso-lectura', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>()
  const { observarUsuarioAuditoria } = await import('@/lib/infraestructura/auditoria/contexto')
  return {
    ...original,
    verificarAccesoLectura: vi.fn(async () => {
      const acceso = sesion.acceso!
      if (acceso.ok) observarUsuarioAuditoria(acceso.user as { id: string; role: string })
      return acceso
    }),
  }
})
vi.mock('@/lib/infraestructura/parte-mapa', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>()
  return { ...original, listarEscuelasMapaEnriquecidas: vi.fn() }
})
vi.mock('@/app/api/infraestructura/radar/route', () => ({ GET: vi.fn() }))

usarDbTemporal('mapa-exportar-auditoria-')

const usuario = { id: 'u1', role: 'consulta', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [], cueAnexo: null }

const escuela = {
  cueAnexo: '1801605-05', nombre: 'Escuela Normal', departamento: 'ER', localidad: 'Paraná', lat: null, lon: null,
  niveles: ['PRIMARIA'], nivelJurisdiccionalId: 4, nivelJurisdiccionalNombre: 'Nivel Primario', alumnos: 100,
  gravedad: 0, categoriaPrincipal: null, clases: 'normal', apoyo: null, sinActualizar: false, ultimaNovedad: null,
  alumnosSinClases: 0, situacionesHistoricas: 0, solucionadasRecientes: 0,
}

function req(qs = '?formato=json'): Request {
  return new Request(`http://localhost/api/infraestructura/exportar${qs}`)
}

async function eventoDe(res: Response) {
  const requestId = res.headers.get('X-Audit-Id') ?? res.headers.get('X-Request-Id')
  expect(requestId).toBeTruthy()
  const filas = await getDb().select().from(auditoriaEvento).where(eq(auditoriaEvento.requestId, requestId!))
  expect(filas).toHaveLength(1)
  return filas[0]!
}

beforeEach(() => {
  invalidarCacheExportaciones()
  sesion.acceso = { ok: true, user: usuario }
  vi.mocked(listarEscuelasMapaEnriquecidas).mockReset().mockResolvedValue(
    { escuelas: [escuela], sinUbicacion: [], totalPadron: 1 } as unknown as Awaited<ReturnType<typeof listarEscuelasMapaEnriquecidas>>,
  )
  vi.mocked(radarGET).mockReset().mockImplementation(async () => Response.json({ puntos: [] }))
})

describe('auditoría de la exportación del mapa', () => {
  it('exportar JSON deja un evento mapa.exportar con el usuario y solo formato y cantidad', async () => {
    const res = await GET(req())
    expect(res.status).toBe(200)

    const evento = await eventoDe(res)
    expect(evento).toMatchObject({
      accion: 'mapa.exportar',
      rutaPlantilla: '/api/infraestructura/exportar',
      metodo: 'GET',
      actorTipo: 'usuario',
      actorId: 'u1',
      actorRol: 'consulta',
      viaAcceso: 'sesion',
      resultado: 'exito',
      httpStatus: 200,
    })
    expect(Object.keys(evento.metadatos).sort()).toEqual(['cantidad', 'formato'])
    expect(evento.metadatos).toMatchObject({ formato: 'json' })
    expect(JSON.stringify(evento)).not.toContain('Escuela Normal')
  })

  it('sin sesión deja un rechazo 401 sin identidad', async () => {
    sesion.acceso = { ok: false, status: 401 }
    const res = await GET(req())
    expect(res.status).toBe(401)
    expect(await eventoDe(res)).toMatchObject({ accion: 'mapa.exportar', actorTipo: 'anonimo', resultado: 'rechazado', httpStatus: 401 })
  })

  it('un formato inválido deja un evento invalido', async () => {
    const res = await GET(req('?formato=pdf'))
    expect(res.status).toBe(400)
    expect(await eventoDe(res)).toMatchObject({ accion: 'mapa.exportar', resultado: 'invalido', httpStatus: 400 })
  })

  it('si no se puede registrar la auditoría responde 503 y no entrega la exportación', async () => {
    const antes = await getDb().select().from(auditoriaEvento)
    const res = await conFalloAuditoria(() => GET(req()))
    expect(res.status).toBe(503)
    expect((await res.json()).code).toBe('auditoria_no_disponible')
    expect(await getDb().select().from(auditoriaEvento)).toHaveLength(antes.length)
  })
})
