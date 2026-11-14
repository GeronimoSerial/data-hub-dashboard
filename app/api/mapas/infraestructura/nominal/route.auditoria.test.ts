import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb, getRawClient } from '@/lib/db'
import { auditoriaEvento, infraAfectacion, infraAfectacionSeccion, infraParte } from '@/lib/db/schema'
import { crearEjecutorSql, ensureGeSchema } from '@/lib/infraestructura/ge-db'
import { importarIdentidad } from '@/lib/infraestructura/identidad'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { conFalloAuditoria } from '@/lib/test-utils/fallo-auditoria'

const sesion = vi.hoisted(() => ({ usuario: vi.fn() }))

// Como lib/session.ts: la sesión observa al actor para la auditoría.
vi.mock('@/lib/session', async () => {
  const { observarUsuarioAuditoria } = await import('@/lib/infraestructura/auditoria/contexto')
  return {
    getSessionUser: async () => {
      const usuario = await sesion.usuario()
      observarUsuarioAuditoria(usuario ? { id: usuario.id, role: usuario.role } : null)
      return usuario
    },
  }
})

usarDbTemporal('mapas-nominal-auditoria-', { seed: false })

const RUTA = '/api/mapas/infraestructura/nominal'
const CUE = '1801605-04'
const NOMBRE = 'Facundo'
const APELLIDO = 'Quiroga'

let afectacionId: string
let prevKey: string | undefined

beforeAll(async () => {
  prevKey = process.env.NOMINAL_ENCRYPTION_KEY
  process.env.NOMINAL_ENCRYPTION_KEY = randomBytes(32).toString('base64')

  const { ensureSeeded, PERIODO_ENOS_2026_2027_ID } = await import('@/lib/db/seed')
  await ensureSeeded()

  const client = crearEjecutorSql(getRawClient())
  await ensureGeSchema(client)
  await client.execute(
    "INSERT INTO ge.ge_corte (id, ciclo_lectivo, fetched_at, estado) OVERRIDING SYSTEM VALUE VALUES (1, 2025, '2025-01-01T00:00:00Z', 'vigente')",
  )
  await client.execute(
    `INSERT INTO ge.ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, 10, '${CUE}', '1', 'A', 'PRIMARIA', 'MAÑANA')`,
  )
  await client.execute({
    sql: 'INSERT INTO ge.ge_alumno_seccion (corte_id, ge_section_id, ge_person_id) VALUES (1, 10, ?)',
    args: [7],
  })
  await importarIdentidad(client, 7, NOMBRE, APELLIDO)

  const db = getDb()
  const ahora = new Date().toISOString()
  const parteId = crypto.randomUUID()
  await db.insert(infraParte).values({
    id: parteId,
    periodoId: PERIODO_ENOS_2026_2027_ID,
    cueAnexo: CUE,
    estadoEstablecimiento: 'habitual',
    estadoEstablecimientoRigeDesde: ahora,
    corteId: 1,
    creadaEn: ahora,
    actualizadaEn: ahora,
  })
  afectacionId = crypto.randomUUID()
  await db.insert(infraAfectacion).values({
    id: afectacionId, parteId, motivo: 'Inundación', categoria: 'establecimiento',
    severidad: 'Alta', rigeDesde: ahora, creadaEn: ahora,
  })
  await db.insert(infraAfectacionSeccion).values({ afectacionId, geSectionId: 10 })
})

afterAll(() => {
  if (prevKey === undefined) delete process.env.NOMINAL_ENCRYPTION_KEY
  else process.env.NOMINAL_ENCRYPTION_KEY = prevKey
})

beforeEach(() => {
  sesion.usuario.mockReset()
})

function req(afectacion = afectacionId) {
  return new Request(`http://localhost${RUTA}?afectacionId=${afectacion}`)
}

function admin(id: string) {
  return { id, role: 'admin_ge', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [] }
}

async function eventosDe(requestId: string) {
  return getDb().select().from(auditoriaEvento).where(eq(auditoriaEvento.requestId, requestId))
}

async function eventoDe(res: Response) {
  const requestId = res.headers.get('X-Audit-Id') ?? res.headers.get('X-Request-Id')
  expect(requestId).toBeTruthy()
  const filas = await eventosDe(requestId!)
  expect(filas).toHaveLength(1)
  return filas[0]!
}

async function contarLogsDe(userId: string): Promise<number> {
  const res = await crearEjecutorSql(getRawClient()).execute({
    sql: 'SELECT id FROM infra_acceso_nominal_log WHERE user_id = ?',
    args: [userId],
  })
  return res.rows.length
}

describe('auditoría de la lectura nominal', () => {
  it('una lectura exitosa deja un único evento nominal.consultar con la cantidad y sin datos de alumnos', async () => {
    const userId = 'admin-ge-auditado'
    sesion.usuario.mockResolvedValue(admin(userId))
    const { GET } = await import('./route')

    const res = await GET(req())
    expect(res.status).toBe(200)

    const evento = await eventoDe(res)
    expect(evento).toMatchObject({
      accion: 'nominal.consultar',
      rutaPlantilla: RUTA,
      metodo: 'GET',
      actorTipo: 'usuario',
      actorId: userId,
      actorRol: 'admin_ge',
      viaAcceso: 'sesion',
      objetoTipo: 'establecimiento',
      resultado: 'exito',
      httpStatus: 200,
      metadatos: { cantidad: 1 },
    })
    const serializado = JSON.stringify(evento)
    expect(serializado).not.toContain(NOMBRE)
    expect(serializado).not.toContain(APELLIDO)
    expect(serializado).not.toContain(afectacionId)
    expect(await contarLogsDe(userId)).toBe(1)
  })

  it('sin sesión deja un rechazo 401 y no registra acceso nominal', async () => {
    sesion.usuario.mockResolvedValue(null)
    const { GET } = await import('./route')

    const res = await GET(req())
    expect(res.status).toBe(401)

    const evento = await eventoDe(res)
    expect(evento).toMatchObject({ accion: 'nominal.consultar', actorTipo: 'anonimo', resultado: 'rechazado', httpStatus: 401 })
    expect(evento.metadatos).not.toHaveProperty('cantidad')
  })

  it('sin permiso nominal deja un rechazo 403 y no registra acceso nominal', async () => {
    const userId = 'consulta-auditada'
    sesion.usuario.mockResolvedValue({
      id: userId, role: 'consulta', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [],
    })
    const { GET } = await import('./route')

    const res = await GET(req())
    expect(res.status).toBe(403)

    expect(await eventoDe(res)).toMatchObject({
      accion: 'nominal.consultar', actorId: userId, resultado: 'rechazado', httpStatus: 403,
    })
    expect(await contarLogsDe(userId)).toBe(0)
  })

  it('si no se puede registrar la auditoría responde 503 sin datos nominales y el acceso queda registrado una vez', async () => {
    const userId = 'admin-ge-fallo-auditoria'
    sesion.usuario.mockResolvedValue(admin(userId))
    const { GET } = await import('./route')

    const res = await conFalloAuditoria(() => GET(req()))
    expect(res.status).toBe(503)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    const cuerpo = await res.text()
    expect(cuerpo).toContain('auditoria_no_disponible')
    expect(cuerpo).not.toContain(NOMBRE)
    expect(cuerpo).not.toContain(APELLIDO)
    expect(await contarLogsDe(userId)).toBe(1)
  })
})
