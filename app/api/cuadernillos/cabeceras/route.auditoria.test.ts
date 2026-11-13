import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { conFalloAuditoria } from '@/lib/test-utils/fallo-auditoria'
import { getDb } from '@/lib/db'
import { auditoriaEvento, bookletCabecera, bookletSchoolAssignment, user } from '@/lib/db/schema'
import { POST } from './route'

vi.mock('@/lib/session', async () => {
  const { observarUsuarioAuditoria } = await import('@/lib/infraestructura/auditoria/contexto')
  return {
    getSessionUser: vi.fn(async () => {
      const actor = sesionDePrueba.user
      observarUsuarioAuditoria(actor)
      return actor
    }),
  }
})
vi.mock('@/lib/hub-entry-server', () => ({ hubApiAccessResponse: vi.fn(async () => null) }))

const sesionDePrueba: { user: { id: string; role: string; banned: boolean; nivelJurIds: string[]; accesoRecursos: string; recursoIds: string[] } | null } = { user: null }

usarDbTemporal('cuadernillos-cabeceras-auditoria-')

const sesion = (id: string) => ({ id, role: 'admin', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [] })
const cueAleatorio = () => String(100_000_000 + Math.floor(Math.random() * 899_999_999))

async function sembrarCabeceraConResponsables() {
  const adminId = `admin-${randomUUID()}`
  const supervisorId = `sup-${randomUUID()}`
  const cabeceraId = `cab-${randomUUID()}`
  for (const id of [adminId, supervisorId, cabeceraId]) {
    await getDb().insert(user).values({ id, name: id, email: `${id}@test.local`, emailVerified: true })
  }
  const cue = cueAleatorio()
  await getDb().insert(bookletCabecera).values({ cueAnexo: cue, nombre: `Cabecera ${cue}`, departamento: 'Departamento', supervisorName: 'Supervisor', evidencia: 'planilla' })
  return { adminId, supervisorId, cabeceraId, cue }
}

function postReq(body: unknown): Request {
  return new Request('http://localhost/api/cuadernillos/cabeceras', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function eventoDe(res: Response) {
  const requestId = res.headers.get('X-Audit-Id') ?? res.headers.get('X-Request-Id')
  expect(requestId).toBeTruthy()
  const filas = await getDb().select().from(auditoriaEvento).where(eq(auditoriaEvento.requestId, requestId!))
  expect(filas).toHaveLength(1)
  return filas[0]!
}

async function asignacionDe(cue: string) {
  const [fila] = await getDb().select().from(bookletSchoolAssignment).where(eq(bookletSchoolAssignment.cueAnexo, cue))
  return fila ?? null
}

beforeEach(() => {
  sesionDePrueba.user = null
})

describe('auditoría de cabeceras de cuadernillos', () => {
  it('confirmar una cabecera nueva deja un evento cuadernillo.cabecera_guardar y la asignación', async () => {
    const { adminId, supervisorId, cabeceraId, cue } = await sembrarCabeceraConResponsables()
    sesionDePrueba.user = sesion(adminId)

    const res = await POST(postReq({ mapping: { [cue]: { supervisorUserId: supervisorId, cabeceraUserId: cabeceraId } } }))
    expect(res.status).toBe(200)
    expect(await res.clone().json()).toMatchObject({ confirmed: [cue] })

    expect(await eventoDe(res)).toMatchObject({
      accion: 'cuadernillo.cabecera_guardar',
      metodo: 'POST',
      rutaPlantilla: '/api/cuadernillos/cabeceras',
      actorTipo: 'usuario',
      actorId: adminId,
      objetoTipo: 'cuadernillo_cabecera',
      resultado: 'exito',
      httpStatus: 200,
      metadatos: { cantidad: 1 },
    })
    expect(await asignacionDe(cue)).not.toBeNull()
  })

  it('una cabecera desconocida deja un evento invalido', async () => {
    const { adminId, supervisorId, cabeceraId } = await sembrarCabeceraConResponsables()
    sesionDePrueba.user = sesion(adminId)

    const res = await POST(postReq({ mapping: { [cueAleatorio()]: { supervisorUserId: supervisorId, cabeceraUserId: cabeceraId } } }))
    expect(res.status).toBe(400)
    expect(await eventoDe(res)).toMatchObject({ resultado: 'invalido', httpStatus: 400 })
  })

  it('si no se puede registrar la auditoría responde 503 y la asignación no se guarda', async () => {
    const { adminId, supervisorId, cabeceraId, cue } = await sembrarCabeceraConResponsables()
    sesionDePrueba.user = sesion(adminId)

    const res = await conFalloAuditoria(() => POST(postReq({ mapping: { [cue]: { supervisorUserId: supervisorId, cabeceraUserId: cabeceraId } } })))
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ code: 'auditoria_no_disponible' })
    expect(await asignacionDe(cue)).toBeNull()
  })
})
