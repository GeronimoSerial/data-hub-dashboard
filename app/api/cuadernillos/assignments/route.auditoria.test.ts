import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { conFalloAuditoria } from '@/lib/test-utils/fallo-auditoria'
import { getDb } from '@/lib/db'
import { auditoriaEvento, bookletMembership, user } from '@/lib/db/schema'
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

usarDbTemporal('cuadernillos-assignments-auditoria-')

const sesion = (id: string) => ({ id, role: 'consulta', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [] })

async function sembrarPlanificador(id: string, conPlanificacion = true) {
  await getDb().insert(user).values({ id, name: id, email: `${id}@test.local`, emailVerified: true }).onConflictDoNothing()
  if (conPlanificacion) {
    await getDb().insert(bookletMembership).values({ id: randomUUID(), userId: id, capability: 'planning', grantedByUserId: id })
  }
}

const filaPreliminar = {
  cue: null,
  schoolName: 'Escuela con nombre sensible',
  relationship: 'cabecera',
  supervisorName: 'Supervisora Sensible',
  cabeceraCue: null,
  provenance: { sourceId: 'fuente-prueba', location: 'fila 2' },
}

function postReq(body: unknown): Request {
  return new Request('http://localhost/api/cuadernillos/assignments', {
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

beforeEach(() => {
  sesionDePrueba.user = null
})

describe('auditoría de vista previa de asignaciones', () => {
  it('la vista previa deja un evento sin_cambio con la cantidad de filas y sin nombres', async () => {
    const planificador = `plan-${randomUUID()}`
    await sembrarPlanificador(planificador)
    sesionDePrueba.user = sesion(planificador)

    const res = await POST(postReq({ mode: 'preview', rows: [filaPreliminar] }))
    expect(res.status).toBe(200)

    const evento = await eventoDe(res)
    expect(evento).toMatchObject({
      accion: 'cuadernillo.asignacion_guardar',
      metodo: 'POST',
      rutaPlantilla: '/api/cuadernillos/assignments',
      actorTipo: 'usuario',
      actorId: planificador,
      objetoTipo: 'cuadernillo_asignacion',
      resultado: 'sin_cambio',
      httpStatus: 200,
      metadatos: { cantidad: 1 },
    })
    expect(JSON.stringify(evento)).not.toContain('Escuela con nombre sensible')
    expect(JSON.stringify(evento)).not.toContain('Supervisora Sensible')
  })

  it('sin permiso de planificación deja un evento rechazado', async () => {
    const sinPermiso = `sin-${randomUUID()}`
    await sembrarPlanificador(sinPermiso, false)
    sesionDePrueba.user = sesion(sinPermiso)

    const res = await POST(postReq({ mode: 'preview', rows: [filaPreliminar] }))
    expect(res.status).toBe(403)
    expect(await eventoDe(res)).toMatchObject({ actorId: sinPermiso, resultado: 'rechazado', httpStatus: 403 })
  })

  it('cuerpo inválido deja un evento invalido', async () => {
    const planificador = `plan-${randomUUID()}`
    await sembrarPlanificador(planificador)
    sesionDePrueba.user = sesion(planificador)

    const res = await POST(postReq({ mode: 'otro' }))
    expect(res.status).toBe(400)
    expect(await eventoDe(res)).toMatchObject({ resultado: 'invalido', httpStatus: 400 })
  })

  it('la confirmación no disponible deja un evento error con su 503', async () => {
    const planificador = `plan-${randomUUID()}`
    await sembrarPlanificador(planificador)
    sesionDePrueba.user = sesion(planificador)

    const res = await POST(postReq({ mode: 'confirm', rows: [filaPreliminar], confirmations: [{ cueAnexo: '123456789', supervisorUserId: planificador, cabeceraUserId: planificador }] }))
    expect(res.status).toBe(503)
    expect(await eventoDe(res)).toMatchObject({ resultado: 'error', httpStatus: 503 })
  })

  it('si no se puede registrar la auditoría responde 503', async () => {
    const planificador = `plan-${randomUUID()}`
    await sembrarPlanificador(planificador)
    sesionDePrueba.user = sesion(planificador)

    const res = await conFalloAuditoria(() => POST(postReq({ mode: 'preview', rows: [filaPreliminar] })))
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ code: 'auditoria_no_disponible' })
  })
})
