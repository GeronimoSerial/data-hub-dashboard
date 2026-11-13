import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb, getRawClient, migrarDb } from '@/lib/db'
import { ensureSeeded } from '@/lib/db/seed'
import { auditoriaEvento, infraMovimiento, infraParte } from '@/lib/db/schema'
import { NOMBRE_COOKIE, crearTokenSesion } from '@/lib/infraestructura/acceso-publico'
import { claveDePrueba } from '@/lib/infraestructura/claves-de-prueba'
import { crearEjecutorSql, ensureGeSchema } from '@/lib/infraestructura/ge-db'
import { _resetLimitesParaTests } from '@/lib/infraestructura/limites'
import {
  NOMBRE_COOKIE_SESION_VERIFICACION,
  crearSesionVerificacion,
} from '@/lib/infraestructura/verificacion-sesion'
import { crearVerificacion } from '@/lib/infraestructura/verificaciones'
import { conFalloAuditoria } from '@/lib/test-utils/fallo-auditoria'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { GET, POST } from './route'

// Sesión simulada: getSessionUser observa la identidad como lo hace el real.
const { sesion, lecturas } = vi.hoisted(() => ({
  sesion: { user: null as null | { id: string; role: string; banned: boolean } },
  lecturas: { dentro: [] as string[] },
}))
vi.mock('@/lib/session', async () => {
  const { observarUsuarioAuditoria } = await import('@/lib/infraestructura/auditoria/contexto')
  const { transaccionContextual } = await import('@/lib/db/contexto')
  return {
    getSessionUser: async () => {
      if (transaccionContextual.getStore()) lecturas.dentro.push('sesion')
      observarUsuarioAuditoria(sesion.user ? { id: sesion.user.id, role: sesion.user.role } : null)
      return sesion.user
    },
  }
})

const CLAVE = claveDePrueba()
const RUTA = '/api/problematicas/parte'
// Cada alta exitosa usa su propio CUE: una segunda alta igual daría 409 (sin cambios).
// El id de auditoría viaja en X-Audit-Id cuando el handler ya trae X-Request-Id (ruta).
const idAuditoria = (response: Response) => response.headers.get('X-Audit-Id') ?? response.headers.get('X-Request-Id')!
const CUE = '1801605-92'
const CUE_ENLACE = '1801605-93'
const CUE_SESION = '1801605-94'
const CUE_ADMIN = '1801605-95'
const CUE_REPETIDA = '1801605-96'
const CUE_FALLO = '1801605-97'
const CUE_VINCULO = '1801605-98'
const CUE_SIN_CAMBIO = '1801605-99'
const CUE_LECTURA = '1801605-88'
const SECCION = (cue: string) => Number(`${cue.slice(-2)}10`)

usarDbTemporal('parte-route-auditoria', { seed: false, env: { PROBLEMATICAS_ACCESO_PASSWORD: CLAVE, ADMIN_EMAIL: undefined, ADMIN_PASSWORD: undefined } })

beforeAll(async () => {
  await migrarDb()
  const client = crearEjecutorSql(getRawClient())
  await ensureGeSchema(client)
  await client.execute(
    "INSERT INTO ge.ge_corte (id, ciclo_lectivo, fetched_at, estado) OVERRIDING SYSTEM VALUE VALUES (1, 2025, '2025-01-01T00:00:00Z', 'vigente')",
  )
  for (const cue of [CUE, CUE_ENLACE, CUE_SESION, CUE_ADMIN, CUE_REPETIDA, CUE_FALLO, CUE_VINCULO, CUE_SIN_CAMBIO, CUE_LECTURA]) {
    await client.execute(
      `INSERT INTO ge.ge_localizacion (cue_anexo, cui, nombre, departamento, localidad) VALUES ('${cue}', NULL, 'Escuela', 'ER', 'Parana')`,
    )
    await client.execute(
      `INSERT INTO ge.ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, ${SECCION(cue)}, '${cue}', '1', 'A', 'PRIMARIA', 'MAÑANA')`,
    )
    for (let i = 0; i < 5; i++) {
      await client.execute({
        sql: 'INSERT INTO ge.ge_alumno_seccion (corte_id, ge_section_id, ge_person_id) VALUES (1, ?, ?)',
        args: [SECCION(cue), Number(`${cue.slice(-2)}000`) + i],
      })
    }
  }
  await ensureSeeded()
})

beforeEach(() => {
  sesion.user = null
  _resetLimitesParaTests()
})

function cookieCompartida(): string {
  const { token } = crearTokenSesion()
  return `${NOMBRE_COOKIE}=${token}`
}

async function verificacionPara(cue: string) {
  const creada = await crearVerificacion({ cueAnexo: cue, solicitadaPorUserId: 'user-director' })
  if (!creada.ok) throw new Error(`no se pudo crear la verificación: ${creada.motivo}`)
  return { id: creada.verificacion.id, token: creada.token }
}

function altaBody(cue: string, idempotencyKey = crypto.randomUUID(), extra: Record<string, unknown> = {}) {
  return {
    cue,
    idempotencyKey,
    rigeDesde: new Date().toISOString(),
    afectacionesNuevas: [{ motivo: 'Inundación', severidad: 'Alta', secciones: [SECCION(cue)] }],
    ...extra,
  }
}

function postReq(body: unknown, cookie: string | null = cookieCompartida()): Request {
  return new Request(`http://localhost${RUTA}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

async function eventosDe(response: Response) {
  return getDb().select().from(auditoriaEvento).where(eq(auditoriaEvento.requestId, idAuditoria(response)))
}

async function movimientosCon(clave: string) {
  return getDb().select().from(infraMovimiento).where(eq(infraMovimiento.idempotencyKey, clave))
}

describe('POST /api/problematicas/parte (auditoría)', () => {
  it('alta con contraseña compartida: un movimiento y un evento parte.guardar del mismo cambio', async () => {
    const clave = crypto.randomUUID()
    const response = await POST(postReq(altaBody(CUE, clave)))
    expect(response.status).toBe(201)
    const cuerpo = await response.json()

    const movimientos = await movimientosCon(clave)
    expect(movimientos).toHaveLength(1)
    expect(movimientos[0]!.rol).toBe('director')

    const eventos = await eventosDe(response)
    expect(eventos).toHaveLength(1)
    expect(eventos[0]).toMatchObject({
      accion: 'parte.guardar',
      rutaPlantilla: RUTA,
      actorTipo: 'compartido',
      viaAcceso: 'password_compartida',
      objetoTipo: 'parte',
      objetoId: cuerpo.parteId,
      cueAnexo: CUE,
      resultado: 'exito',
      httpStatus: 201,
    })
    const serializado = JSON.stringify(eventos[0])
    expect(serializado).not.toContain(CLAVE)
    expect(serializado).not.toContain('Inundación')
  })

  it('con sesión de administrador la identidad es el usuario de la sesión', async () => {
    sesion.user = { id: 'admin-auditoria-parte', role: 'admin', banned: false }
    const clave = crypto.randomUUID()
    const response = await POST(postReq(altaBody(CUE_ADMIN, clave), null))
    expect(response.status).toBe(201)
    const eventos = await eventosDe(response)
    expect(eventos).toHaveLength(1)
    expect(eventos[0]).toMatchObject({ actorTipo: 'usuario', actorId: 'admin-auditoria-parte', viaAcceso: 'sesion', resultado: 'exito' })
    expect(lecturas.dentro).toEqual([])
  })

  it('con la sesión acotada de la verificación la identidad es el enlace', async () => {
    const verificacion = await verificacionPara(CUE_SESION)
    const { valorCookie } = crearSesionVerificacion(verificacion.id, CUE_SESION)
    const clave = crypto.randomUUID()
    const response = await POST(postReq(altaBody(CUE_SESION, clave), `${NOMBRE_COOKIE_SESION_VERIFICACION}=${valorCookie}`))
    expect(response.status).toBe(201)
    const eventos = await eventosDe(response)
    expect(eventos).toHaveLength(1)
    expect(eventos[0]).toMatchObject({ actorTipo: 'enlace', actorId: verificacion.id, viaAcceso: 'sesion_verificacion', resultado: 'exito' })
  })

  it('cuerpo inválido deja un evento invalido y no escribe', async () => {
    const response = await POST(postReq('{roto'))
    expect(response.status).toBe(400)
    const eventos = await eventosDe(response)
    expect(eventos).toHaveLength(1)
    expect(eventos[0]).toMatchObject({ accion: 'parte.guardar', resultado: 'invalido', httpStatus: 400 })
  })

  it('sin credencial deja un evento rechazado anónimo y no escribe', async () => {
    const clave = crypto.randomUUID()
    const response = await POST(postReq(altaBody(CUE, clave), null))
    expect(response.status).toBe(401)
    expect(await movimientosCon(clave)).toHaveLength(0)
    const eventos = await eventosDe(response)
    expect(eventos).toHaveLength(1)
    expect(eventos[0]).toMatchObject({ actorTipo: 'anonimo', resultado: 'rechazado', httpStatus: 401 })
  })

  it('repetir la misma clave responde 200 con un evento repetido y sin segundo movimiento', async () => {
    const body = altaBody(CUE_REPETIDA, crypto.randomUUID())
    expect((await POST(postReq(body))).status).toBe(201)
    const repetida = await POST(postReq(body))
    expect(repetida.status).toBe(200)
    expect(await movimientosCon(body.idempotencyKey)).toHaveLength(1)
    const eventos = await eventosDe(repetida)
    expect(eventos).toHaveLength(1)
    expect(eventos[0]).toMatchObject({ resultado: 'repetido', httpStatus: 200, objetoTipo: 'parte' })
  })

  it('repetir el contenido con otra clave responde 409 sin cambios y su evento es sin_cambio', async () => {
    const primera = altaBody(CUE_SIN_CAMBIO, crypto.randomUUID())
    expect((await POST(postReq(primera))).status).toBe(201)
    const segunda = { ...primera, idempotencyKey: crypto.randomUUID() }
    const response = await POST(postReq(segunda))
    expect(response.status).toBe(409)
    expect(await movimientosCon(segunda.idempotencyKey)).toHaveLength(0)
    const eventos = await eventosDe(response)
    expect(eventos).toHaveLength(1)
    expect(eventos[0]).toMatchObject({ accion: 'parte.guardar', resultado: 'sin_cambio', httpStatus: 409 })
  })

  it('si falla la auditoría responde 503 y revierte el parte y el movimiento', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const clave = crypto.randomUUID()
    const response = await conFalloAuditoria(() => POST(postReq(altaBody(CUE_FALLO, clave))))
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ code: 'auditoria_no_disponible' })
    expect(await movimientosCon(clave)).toHaveLength(0)
    expect(await getDb().select().from(infraParte).where(eq(infraParte.cueAnexo, CUE_FALLO))).toHaveLength(0)
    vi.restoreAllMocks()
  })

  it('el enlace de verificación se vincula dentro de la misma transacción y queda en el evento', async () => {
    const clave = crypto.randomUUID()
    const { token, id } = await verificacionPara(CUE_VINCULO)
    const response = await POST(postReq(altaBody(CUE_VINCULO, clave, { verificacion: { id, token } })))
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ verificacionVinculada: true })
    const eventos = await eventosDe(response)
    expect(eventos).toHaveLength(1)
    expect(eventos[0]!.metadatos).toMatchObject({ verificacionId: id })
    expect(JSON.stringify(eventos[0])).not.toContain(token)
  })
})

describe('GET /api/problematicas/parte (auditoría)', () => {
  it('una lectura deja un evento parte.consultar con el CUE y sin credencial en el evento', async () => {
    const response = await GET(new Request(`http://localhost${RUTA}?cue=${CUE}`, { headers: { cookie: cookieCompartida() } }))
    expect(response.status).toBe(200)
    const eventos = await eventosDe(response)
    expect(eventos).toHaveLength(1)
    expect(eventos[0]).toMatchObject({ accion: 'parte.consultar', metodo: 'GET', cueAnexo: CUE, actorTipo: 'compartido', resultado: 'exito' })
    expect(JSON.stringify(eventos[0])).not.toContain(CLAVE)
  })

  it('con la sesión de la verificación la lectura registra el enlace y nunca la cookie', async () => {
    const verificacion = await verificacionPara(CUE_LECTURA)
    const { valorCookie } = crearSesionVerificacion(verificacion.id, CUE_LECTURA)
    const response = await GET(new Request(`http://localhost${RUTA}?cue=${CUE_LECTURA}`, {
      headers: { cookie: `${NOMBRE_COOKIE_SESION_VERIFICACION}=${valorCookie}` },
    }))
    expect(response.status).toBe(200)
    const eventos = await eventosDe(response)
    expect(eventos).toHaveLength(1)
    expect(eventos[0]).toMatchObject({ accion: 'parte.consultar', actorTipo: 'enlace', actorId: verificacion.id, viaAcceso: 'sesion_verificacion', resultado: 'exito' })
    expect(JSON.stringify(eventos[0])).not.toContain(valorCookie)
  })

  it('sin credencial deja un evento rechazado', async () => {
    const response = await GET(new Request(`http://localhost${RUTA}?cue=${CUE}`))
    expect(response.status).toBe(401)
    const eventos = await eventosDe(response)
    expect(eventos).toHaveLength(1)
    expect(eventos[0]).toMatchObject({ accion: 'parte.consultar', resultado: 'rechazado', httpStatus: 401 })
  })
})
