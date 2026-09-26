import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { count, eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '@/lib/db'
import { PERIODO_ENOS_2026_2027_ID, ensureSeeded } from '@/lib/db/seed'
import { infraAfectacion, infraMovimiento, infraParte, infraVerificacionEvento } from '@/lib/db/schema'
import { NOMBRE_COOKIE, crearTokenSesion } from '@/lib/infraestructura/acceso-publico'
import { claveDePrueba } from '@/lib/infraestructura/claves-de-prueba'
import { ensureGeSchema, openGeDb } from '@/lib/infraestructura/ge-db'
import { _resetLimitesParaTests } from '@/lib/infraestructura/limites'
import {
  NOMBRE_COOKIE_SESION_VERIFICACION,
  crearSesionVerificacion,
} from '@/lib/infraestructura/verificacion-sesion'
import {
  crearVerificacion,
  obtenerVerificacion,
  responderPorEnlace,
} from '@/lib/infraestructura/verificaciones'
import { GET, POST } from './route'

// Estas pruebas cubren la guarda por contraseña. La sesión se fuerza a
// ausente para que 'sin cookie' signifique 401 y no dependa del bypass de
// administrador, que tiene su propia cobertura en acceso-parte.test.ts.
vi.mock('@/lib/session', () => ({ getSessionUser: async () => null }))

// Hook de test para forzar la carrera de idempotencia (UNIQUE constraint) sin
// depender del timing: el POST pre-chequea la idempotencyKey ANTES de la
// transacción, pero recién consulta listarMotivos() más adelante, ya dentro
// del camino de escritura. Inyectamos ahí el movimiento conflictivo para que
// el pre-chequeo no lo vea y el INSERT de la transacción choque contra el
// índice único, entrando por el catch de carrera (route.ts).
const raceHook = vi.hoisted(() => ({
  idempotencyKey: null as string | null,
  parteId: null as string | null,
}))

vi.mock('@/lib/infraestructura/motivos', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  const listarMotivosReal = actual.listarMotivos as (...args: unknown[]) => Promise<unknown>
  return {
    ...actual,
    listarMotivos: async (...args: unknown[]) => {
      if (raceHook.idempotencyKey && raceHook.parteId) {
        const idempotencyKey = raceHook.idempotencyKey
        const parteId = raceHook.parteId
        raceHook.idempotencyKey = null
        raceHook.parteId = null
        const { getDb } = await import('@/lib/db')
        const { infraMovimiento } = await import('@/lib/db/schema')
        const ahora = new Date().toISOString()
        await getDb()
          .insert(infraMovimiento)
          .values({
            id: crypto.randomUUID(),
            parteId,
            tipo: 'reporte_inicial',
            rol: 'director',
            // El movimiento ganador real persiste un DiffParte completo; con
            // el catch corregido esta carrera ahora lo relee y lo describe
            // (respuestaExito → describirMovimiento), así que el fixture debe
            // tener la forma real y no `{}`.
            resumen: {
              afectacionesAgregadas: [
                {
                  afectacionId: crypto.randomUUID(),
                  motivo: 'Inundación',
                  categoria: 'establecimiento',
                  severidad: 'Alta',
                  secciones: 1,
                  alumnos: 0,
                },
              ],
              afectacionesRetiradas: [],
              severidadesCambiadas: [],
              alcancesCambiados: [],
              datosCambiados: [],
              serviciosCambiados: [],
              establecimientoCambiado: null,
            },
            rigeDesde: ahora,
            creadaEn: ahora,
            idempotencyKey,
          })
      }
      return listarMotivosReal(...args)
    },
  }
})

const CLAVE = claveDePrueba()

let dir: string
let prevDataDir: string | undefined
let prevPassword: string | undefined
let prevAdminEmail: string | undefined
let prevAdminPassword: string | undefined
// Verificación REAL de la tabla infra_verificacion asociada a CUE_G: la
// cookie de sesión tiene que apuntar a una fila pendiente y vigente, si no
// tieneAccesoAlParteParaCue la rechaza y los tests del mismo CUE dan 401.
let verificacionIdSesionCueG: string

const CUE_A = '1801605-41'
const CUE_B = '1801605-42'
const CUE_C = '1801605-43'
const CUE_D = '1801605-44'
const CUE_E = '1801605-45'
const CUE_F = '1801605-46'
const CUE_G = '1801605-47'
const CUE_SIN_SECCIONES = '1801605-49'
// CUEs exclusivos de los tests del enlace verificación → movimiento (batch
// E1), para no interferir con los partes ya creados por los tests previos.
const CUE_H = '1801605-50'
const CUE_I = '1801605-51'
const CUE_J = '1801605-52'
const CUE_K = '1801605-53'
const CUE_L = '1801605-54'
const CUE_M = '1801605-55'
const CUE_N = '1801605-56'

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'parte-route-'))
  prevDataDir = process.env.DATA_DIR
  prevPassword = process.env.PROBLEMATICAS_ACCESO_PASSWORD
  prevAdminEmail = process.env.ADMIN_EMAIL
  prevAdminPassword = process.env.ADMIN_PASSWORD
  process.env.DATA_DIR = dir
  process.env.PROBLEMATICAS_ACCESO_PASSWORD = CLAVE
  delete process.env.ADMIN_EMAIL
  delete process.env.ADMIN_PASSWORD

  const ge = openGeDb()
  try {
    await ensureGeSchema(ge)
    await ge.execute(
      "INSERT INTO ge_corte (id, ciclo_lectivo, fetched_at, estado) VALUES (1, 2025, '2025-01-01T00:00:00Z', 'vigente')",
    )
    for (const cue of [CUE_A, CUE_B, CUE_C, CUE_D, CUE_E, CUE_F, CUE_G, CUE_H, CUE_I, CUE_J, CUE_K, CUE_L, CUE_M, CUE_N]) {
      await ge.execute(
        `INSERT INTO ge_localizacion (cue_anexo, cui, nombre, departamento, localidad) VALUES ('${cue}', NULL, 'Escuela', 'ER', 'Parana')`,
      )
      await ge.execute(
        `INSERT INTO ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, ${cue.slice(-2)}10, '${cue}', '1', 'A', 'PRIMARIA', 'MAÑANA')`,
      )
      await ge.execute(
        `INSERT INTO ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, ${cue.slice(-2)}20, '${cue}', '1', 'B', 'PRIMARIA', 'TARDE')`,
      )
      for (let i = 0; i < 5; i++) {
        await ge.execute({
          sql: 'INSERT INTO ge_alumno_seccion (corte_id, ge_section_id, ge_person_id) VALUES (1, ?, ?)',
          args: [Number(`${cue.slice(-2)}10`), Number(`${cue.slice(-2)}000`) + i],
        })
      }
      for (let i = 0; i < 5; i++) {
        await ge.execute({
          sql: 'INSERT INTO ge_alumno_seccion (corte_id, ge_section_id, ge_person_id) VALUES (1, ?, ?)',
          args: [Number(`${cue.slice(-2)}20`), Number(`${cue.slice(-2)}100`) + i],
        })
      }
    }
    await ge.execute(
      `INSERT INTO ge_localizacion (cue_anexo, cui, nombre, departamento, localidad) VALUES ('${CUE_SIN_SECCIONES}', NULL, 'Escuela sin secciones', 'ER', 'Parana')`,
    )
  } finally {
    ge.close()
  }

  await ensureSeeded()
})

afterAll(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  if (prevPassword === undefined) delete process.env.PROBLEMATICAS_ACCESO_PASSWORD
  else process.env.PROBLEMATICAS_ACCESO_PASSWORD = prevPassword
  if (prevAdminEmail === undefined) delete process.env.ADMIN_EMAIL
  else process.env.ADMIN_EMAIL = prevAdminEmail
  if (prevAdminPassword === undefined) delete process.env.ADMIN_PASSWORD
  else process.env.ADMIN_PASSWORD = prevAdminPassword
  rmSync(dir, { recursive: true, force: true })
})

beforeEach(() => {
  _resetLimitesParaTests()
})

function seccionId(cue: string, sufijo: '10' | '20'): number {
  return Number(`${cue.slice(-2)}${sufijo}`)
}

function alumnoIds(cue: string, base: '000' | '100', cantidad = 5): number[] {
  const inicio = Number(`${cue.slice(-2)}${base}`)
  return Array.from({ length: cantidad }, (_, i) => inicio + i)
}

function cookieHeader(): string {
  const { token } = crearTokenSesion()
  return `${NOMBRE_COOKIE}=${token}`
}

function getReq(cue: string, conCookie = true): Request {
  const url = `http://localhost/api/problematicas/parte?cue=${encodeURIComponent(cue)}`
  return new Request(url, {
    headers: conCookie ? { cookie: cookieHeader() } : {},
  })
}

function postReq(body: unknown, conCookie = true): Request {
  return new Request('http://localhost/api/problematicas/parte', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(conCookie ? { cookie: cookieHeader() } : {}),
    },
    body: JSON.stringify(body),
  })
}

// Cookie de sesión acotada por CUE (batch E1), firmada con la misma env var.
function cookieSesion(cue: string, ahora?: Date): string {
  const { valorCookie } = crearSesionVerificacion(verificacionIdSesionCueG, cue, ahora)
  return `${NOMBRE_COOKIE_SESION_VERIFICACION}=${valorCookie}`
}

function getReqSesion(cue: string, cookie: string): Request {
  const url = `http://localhost/api/problematicas/parte?cue=${encodeURIComponent(cue)}`
  return new Request(url, { headers: { cookie } })
}

function postReqSesion(body: unknown, cookie: string | null): Request {
  return new Request('http://localhost/api/problematicas/parte', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  })
}

describe('GET /api/problematicas/parte', () => {
  it('responde 401 sin cookie de acceso', async () => {
    const res = await GET(getReq(CUE_A, false))
    expect(res.status).toBe(401)
  })

  it('responde 400 con CUE inválido', async () => {
    const res = await GET(getReq('no-es-un-cue'))
    expect(res.status).toBe(400)
  })

  it('sin parte para el CUE, responde ok con parte null y sin 500', async () => {
    const res = await GET(getReq(CUE_B))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.parte).toBeNull()
    expect(Array.isArray(body.secciones)).toBe(true)
    expect(body.secciones.length).toBe(2)
  })

  it('setea Cache-Control privado porque la respuesta puede llevar nombres de alumnos', async () => {
    const res = await GET(getReq(CUE_B))
    expect(res.headers.get('cache-control')).toBe('private, no-store')
  })
})

describe('POST /api/problematicas/parte', () => {
  it('responde 401 sin cookie de acceso', async () => {
    const res = await POST(postReq({ cue: CUE_A, idempotencyKey: 'x', rigeDesde: new Date().toISOString(), afectacionesNuevas: [{ motivo: 'Inundación', severidad: 'Alta', secciones: [seccionId(CUE_A, '10')] }] }, false))
    expect(res.status).toBe(401)
  })

  it('responde 400 con un cuerpo inválido (JSON roto)', async () => {
    const res = await POST(
      new Request('http://localhost/api/problematicas/parte', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: cookieHeader() },
        body: '{ no es json',
      }),
    )
    expect(res.status).toBe(400)
  })

  it('responde 400 con CUE inválido', async () => {
    const res = await POST(
      postReq({
        cue: 'no-es-un-cue',
        idempotencyKey: crypto.randomUUID(),
        rigeDesde: new Date().toISOString(),
        afectacionesNuevas: [{ motivo: 'Inundación', severidad: 'Alta', secciones: [1] }],
      }),
    )
    expect(res.status).toBe(400)
  })

  it('responde 400 si el payload no trae ningún cambio', async () => {
    const res = await POST(
      postReq({ cue: CUE_A, idempotencyKey: crypto.randomUUID(), rigeDesde: new Date().toISOString() }),
    )
    expect(res.status).toBe(400)
  })

  it('responde 400 si una sección no pertenece al CUE', async () => {
    const res = await POST(
      postReq({
        cue: CUE_A,
        idempotencyKey: crypto.randomUUID(),
        rigeDesde: new Date().toISOString(),
        afectacionesNuevas: [{ motivo: 'Inundación', severidad: 'Alta', secciones: [seccionId(CUE_B, '10')] }],
      }),
    )
    expect(res.status).toBe(400)
  })

  it('responde 400 si un alumno no pertenece a las secciones seleccionadas', async () => {
    const res = await POST(
      postReq({
        cue: CUE_A,
        idempotencyKey: crypto.randomUUID(),
        rigeDesde: new Date().toISOString(),
        afectacionesNuevas: [
          {
            motivo: 'Anegamiento',
            severidad: 'Media',
            secciones: [seccionId(CUE_A, '10')],
            alumnos: alumnoIds(CUE_A, '100', 1),
          },
        ],
      }),
    )
    expect(res.status).toBe(400)
  })

  it('el primer POST crea el parte con el corteId del corte vigente y un movimiento reporte_inicial', async () => {
    const idempotencyKey = crypto.randomUUID()
    const rigeDesde = new Date().toISOString()
    const res = await POST(
      postReq({
        cue: CUE_A,
        idempotencyKey,
        rigeDesde,
        // El cliente nunca manda `categoria`: el schema ni siquiera la
        // reconoce como campo, así que agregarla acá no cambia nada — se
        // verifica la resolución server-side por separado más abajo.
        afectacionesNuevas: [{ motivo: 'Inundación', severidad: 'Alta', secciones: [seccionId(CUE_A, '10')] }],
      }),
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.tipo).toBe('reporte_inicial')
    expect(body.cambios.length).toBeGreaterThan(0)

    const db = getDb()
    const [parte] = await db.select().from(infraParte).where(eq(infraParte.id, body.parteId)).limit(1)
    expect(parte).toBeDefined()
    // Caveat del contrato: el corteId sale del corte vigente real, nunca del
    // heurístico de backfill.
    expect(parte!.corteId).toBe(1)

    const movimientos = await db.select().from(infraMovimiento).where(eq(infraMovimiento.parteId, body.parteId))
    expect(movimientos).toHaveLength(1)
    expect(movimientos[0]!.tipo).toBe('reporte_inicial')
    expect(movimientos[0]!.rigeDesde).toBe(rigeDesde)
    expect(movimientos[0]!.creadaEn).not.toBe(rigeDesde)
    expect(movimientos[0]!.idempotencyKey).toBe(idempotencyKey)

    const [afectacion] = await db.select().from(infraAfectacion).where(eq(infraAfectacion.parteId, body.parteId))
    // La categoría la resolvió el servidor a partir del motivo, nunca el
    // cliente (que además no puede mandarla: no es un campo del schema).
    expect(afectacion!.categoria).toBe('establecimiento')
  })

  it('replaying el mismo idempotencyKey devuelve 200 y no escribe un segundo movimiento', async () => {
    const idempotencyKey = crypto.randomUUID()
    const payload = {
      cue: CUE_C,
      idempotencyKey,
      rigeDesde: new Date().toISOString(),
      afectacionesNuevas: [{ motivo: 'Tormenta severa', severidad: 'Baja', secciones: [seccionId(CUE_C, '10')] }],
    }
    const primero = await POST(postReq(payload))
    expect(primero.status).toBe(201)
    const cuerpoPrimero = await primero.json()

    const segundo = await POST(postReq(payload))
    expect(segundo.status).toBe(200)
    const cuerpoSegundo = await segundo.json()
    expect(cuerpoSegundo.movimientoId).toBe(cuerpoPrimero.movimientoId)

    const db = getDb()
    const movimientos = await db
      .select()
      .from(infraMovimiento)
      .where(eq(infraMovimiento.idempotencyKey, idempotencyKey))
    expect(movimientos).toHaveLength(1)
  })

  it('el segundo POST (actualización) escribe tipo actualizacion y no crea un segundo parte', async () => {
    const rigeDesdeInicial = new Date().toISOString()
    const inicial = await POST(
      postReq({
        cue: CUE_D,
        idempotencyKey: crypto.randomUUID(),
        rigeDesde: rigeDesdeInicial,
        afectacionesNuevas: [
          { motivo: 'Inundación', severidad: 'Media', secciones: [seccionId(CUE_D, '10')] },
          { motivo: 'Anegamiento', severidad: 'Baja', secciones: [seccionId(CUE_D, '20')] },
        ],
      }),
    )
    expect(inicial.status).toBe(201)
    const cuerpoInicial = await inicial.json()
    const parteId = cuerpoInicial.parteId

    const db = getDb()
    const afectacionesIniciales = await db.select().from(infraAfectacion).where(eq(infraAfectacion.parteId, parteId))
    const inundacion = afectacionesIniciales.find((a) => a.motivo === 'Inundación')!
    const anegamiento = afectacionesIniciales.find((a) => a.motivo === 'Anegamiento')!

    const actualizacion = await POST(
      postReq({
        cue: CUE_D,
        idempotencyKey: crypto.randomUUID(),
        rigeDesde: new Date().toISOString(),
        afectacionesModificadas: [{ id: inundacion.id, severidad: 'Crítica' }],
      }),
    )
    expect(actualizacion.status).toBe(201)
    const cuerpoActualizacion = await actualizacion.json()
    expect(cuerpoActualizacion.tipo).toBe('actualizacion')
    expect(cuerpoActualizacion.parteId).toBe(parteId)

    const partes = await db.select().from(infraParte).where(eq(infraParte.cueAnexo, CUE_D))
    expect(partes).toHaveLength(1)

    // §9: cambiar la severidad de una afectación no toca las demás.
    const [inundacionDespues] = await db.select().from(infraAfectacion).where(eq(infraAfectacion.id, inundacion.id))
    const [anegamientoDespues] = await db.select().from(infraAfectacion).where(eq(infraAfectacion.id, anegamiento.id))
    expect(inundacionDespues!.severidad).toBe('Crítica')
    expect(anegamientoDespues!.severidad).toBe('Baja')
  })

  it('retirar una afectación marca retiradaEn sin borrar la fila', async () => {
    const inicial = await POST(
      postReq({
        cue: CUE_E,
        idempotencyKey: crypto.randomUUID(),
        rigeDesde: new Date().toISOString(),
        afectacionesNuevas: [{ motivo: 'Sin energía o agua', severidad: 'Media', secciones: [seccionId(CUE_E, '10')] }],
      }),
    )
    const cuerpoInicial = await inicial.json()
    const db = getDb()
    const [afectacion] = await db.select().from(infraAfectacion).where(eq(infraAfectacion.parteId, cuerpoInicial.parteId))

    const retiro = await POST(
      postReq({
        cue: CUE_E,
        idempotencyKey: crypto.randomUUID(),
        rigeDesde: new Date().toISOString(),
        afectacionesRetiradas: [afectacion!.id],
      }),
    )
    expect(retiro.status).toBe(201)

    const [afectacionDespues] = await db.select().from(infraAfectacion).where(eq(infraAfectacion.id, afectacion!.id))
    expect(afectacionDespues).toBeDefined()
    expect(afectacionDespues!.retiradaEn).not.toBeNull()

    const getRes = await GET(getReq(CUE_E))
    const getBody = await getRes.json()
    expect(getBody.afectaciones.find((a: { id: string }) => a.id === afectacion!.id)).toBeUndefined()
  })

  it('un envío que no cambia nada responde 409 con el texto exacto de la spec y no escribe movimiento', async () => {
    const inicial = await POST(
      postReq({
        cue: CUE_F,
        idempotencyKey: crypto.randomUUID(),
        rigeDesde: new Date().toISOString(),
        afectacionesNuevas: [{ motivo: 'Inundación', severidad: 'Alta', secciones: [seccionId(CUE_F, '10')] }],
      }),
    )
    const cuerpoInicial = await inicial.json()
    const db = getDb()
    const [afectacion] = await db.select().from(infraAfectacion).where(eq(infraAfectacion.parteId, cuerpoInicial.parteId))

    const [{ n: movimientosAntes }] = await db
      .select({ n: count() })
      .from(infraMovimiento)
      .where(eq(infraMovimiento.parteId, cuerpoInicial.parteId))

    const sinCambios = await POST(
      postReq({
        cue: CUE_F,
        idempotencyKey: crypto.randomUUID(),
        rigeDesde: new Date().toISOString(),
        afectacionesModificadas: [{ id: afectacion!.id, severidad: 'Alta' }],
      }),
    )
    expect(sinCambios.status).toBe(409)
    const cuerpo = await sinCambios.json()
    expect(cuerpo.error).toBe('Todavía no realizó cambios en el parte actual')

    const [{ n: movimientosDespues }] = await db
      .select({ n: count() })
      .from(infraMovimiento)
      .where(eq(infraMovimiento.parteId, cuerpoInicial.parteId))
    expect(movimientosDespues).toBe(movimientosAntes)
  })

  it('suspender una sección no marca como suspendidas a sus hermanas (§10)', async () => {
    const res = await POST(
      postReq({
        cue: CUE_SIN_SECCIONES,
        idempotencyKey: crypto.randomUUID(),
        rigeDesde: new Date().toISOString(),
        estadoEstablecimiento: { estado: 'evacuado' },
      }),
    )
    // Este CUE no tiene secciones cargadas: sirve para validar el caso
    // "sin secciones" del corte, que calcularEstadoServicioGeneral trata
    // como 'normal' (nada que suspender).
    expect(res.status).toBe(201)

    const seccionA = seccionId(CUE_A, '10')
    const seccionB = seccionId(CUE_A, '20')
    // CUE_A ya tiene un parte de un test anterior (reporte inicial de
    // Inundación): acá se agrega la suspensión de una sola sección.
    const suspender = await POST(
      postReq({
        cue: CUE_A,
        idempotencyKey: crypto.randomUUID(),
        rigeDesde: new Date().toISOString(),
        servicioEducativo: { estado: 'suspendido', alcance: { tipo: 'seccion', secciones: [seccionA] } },
      }),
    )
    expect(suspender.status).toBe(201)

    const getRes = await GET(getReq(CUE_A))
    const body = await getRes.json()
    expect(body.servicio.estadoGeneral).toBe('parcial')
    const filaSeccionB = body.servicio.alcanceVigente.find(
      (a: { tipo: string; referenciaId: string }) => a.tipo === 'seccion' && a.referenciaId === String(seccionB),
    )
    expect(filaSeccionB).toBeUndefined()
  })
})

// Batch E1: un director que entró por el enlace de verificación puede usar el
// parte SIN la contraseña compartida, pero SÓLO para el CUE de esa sesión.
describe('parte con sesión acotada por CUE', () => {
  // Fila real de infra_verificacion sobre CUE_G, pendiente y con token
  // vigente, para que la cookie firmada apunte a un verificacionId que
  // verificacionHabilitaSesionEscritura acepte (mismo patrón que
  // verificacionPendientePara del describe del enlace). Va en un beforeAll
  // scopeado acá: corre después del beforeAll de módulo (que ya dejó DATA_DIR
  // y la contraseña seteados) y antes de los it de este describe.
  beforeAll(async () => {
    const creada = await crearVerificacion({
      cueAnexo: CUE_G,
      solicitadaPorUserId: 'user-director',
    })
    if (!creada.ok) throw new Error(`no se pudo crear la verificación de CUE_G: ${creada.motivo}`)
    verificacionIdSesionCueG = creada.verificacion.id
  })

  it('GET con la sesión del mismo CUE: 200 (no 401)', async () => {
    const res = await GET(getReqSesion(CUE_G, cookieSesion(CUE_G)))
    expect(res.status).toBe(200)
  })

  it('POST con la sesión del mismo CUE: 201 (no 401)', async () => {
    const res = await POST(
      postReqSesion(
        {
          cue: CUE_G,
          idempotencyKey: crypto.randomUUID(),
          rigeDesde: new Date().toISOString(),
          afectacionesNuevas: [{ motivo: 'Inundación', severidad: 'Alta', secciones: [seccionId(CUE_G, '10')] }],
        },
        cookieSesion(CUE_G),
      ),
    )
    expect(res.status).toBe(201)
  })

  it('la sesión de un CUE no habilita GET de OTRO CUE: 401', async () => {
    const res = await GET(getReqSesion(CUE_B, cookieSesion(CUE_G)))
    expect(res.status).toBe(401)
  })

  it('la sesión de un CUE no habilita POST de OTRO CUE: 401', async () => {
    const res = await POST(
      postReqSesion(
        {
          cue: CUE_B,
          idempotencyKey: crypto.randomUUID(),
          rigeDesde: new Date().toISOString(),
          afectacionesNuevas: [{ motivo: 'Inundación', severidad: 'Alta', secciones: [1] }],
        },
        cookieSesion(CUE_G),
      ),
    )
    expect(res.status).toBe(401)
  })

  it('una sesión vencida: 401', async () => {
    const vencida = cookieSesion(CUE_G, new Date('2020-01-01T00:00:00.000Z'))
    const res = await GET(getReqSesion(CUE_G, vencida))
    expect(res.status).toBe(401)
  })

  it('sin ninguna credencial y con body válido: 401 (no 400)', async () => {
    const res = await POST(
      postReqSesion(
        {
          cue: CUE_G,
          idempotencyKey: crypto.randomUUID(),
          rigeDesde: new Date().toISOString(),
          afectacionesNuevas: [{ motivo: 'Inundación', severidad: 'Alta', secciones: [seccionId(CUE_G, '10')] }],
        },
        null,
      ),
    )
    expect(res.status).toBe(401)
  })
})

// Batch E1: el enlace opcional `verificacion: { id, token }` en el body del
// POST enlaza el movimiento recién creado con la verificación de origen
// (infra_verificacion.movimiento_id) y la pasa a 'respondida'/'con_afectacion'.
// Es best-effort: cualquier fallo del enlace NUNCA bloquea el guardado del
// parte.
describe('parte enlaza la verificación de origen (batch E1)', () => {
  async function verificacionPendientePara(cue: string) {
    const creada = await crearVerificacion({
      cueAnexo: cue,
      solicitadaPorUserId: 'user-director',
    })
    if (!creada.ok) throw new Error(`no se pudo crear la verificación: ${creada.motivo}`)
    return creada
  }

  it('con verificación válida: 201, verificacionVinculada true y la verificación queda respondida/con_afectacion con el movimientoId', async () => {
    const { token, verificacion } = await verificacionPendientePara(CUE_H)

    const res = await POST(
      postReq({
        cue: CUE_H,
        idempotencyKey: crypto.randomUUID(),
        rigeDesde: new Date().toISOString(),
        afectacionesNuevas: [{ motivo: 'Inundación', severidad: 'Alta', secciones: [seccionId(CUE_H, '10')] }],
        verificacion: { id: verificacion.id, token },
      }),
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.verificacionVinculada).toBe(true)

    const fila = await obtenerVerificacion(verificacion.id)
    expect(fila?.estado).toBe('respondida')
    expect(fila?.resultado).toBe('con_afectacion')
    expect(fila?.movimientoId).toBe(body.movimientoId)
  })

  it('con token incorrecto: el parte se guarda igual (201), verificacionVinculada false y la verificación sigue pendiente', async () => {
    const { verificacion } = await verificacionPendientePara(CUE_I)

    const res = await POST(
      postReq({
        cue: CUE_I,
        idempotencyKey: crypto.randomUUID(),
        rigeDesde: new Date().toISOString(),
        afectacionesNuevas: [{ motivo: 'Inundación', severidad: 'Alta', secciones: [seccionId(CUE_I, '10')] }],
        verificacion: { id: verificacion.id, token: 'token-incorrecto' },
      }),
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.verificacionVinculada).toBe(false)
    // El motivo del fallo ahora viaja en la respuesta (antes se perdía).
    expect(body.verificacionVinculoMotivo).toBe('credencial_invalida')

    const fila = await obtenerVerificacion(verificacion.id)
    expect(fila?.estado).toBe('pendiente')
    expect(fila?.movimientoId).toBeNull()

    // Y queda exactamente un evento de auditoría para el operador.
    const eventos = await getDb()
      .select()
      .from(infraVerificacionEvento)
      .where(eq(infraVerificacionEvento.verificacionId, verificacion.id))
    const fallidos = eventos.filter((e) => e.tipo === 'vinculo_fallido')
    expect(fallidos).toHaveLength(1)
    expect(fallidos[0]!.motivo).toBe('credencial_invalida')
    expect(fallidos[0]!.actorTipo).toBe('sistema')
  })

  it('respuesta contradictoria: el parte se guarda igual (201) y deja el motivo y el evento de auditoría', async () => {
    const { token, verificacion } = await verificacionPendientePara(CUE_M)
    // El director ya había contestado 'sin_afectacion' por el enlace público;
    // ahora llega un parte con afectación que intenta enlazar la MISMA
    // verificación con 'con_afectacion': contradicción.
    const previa = await responderPorEnlace({
      verificacionId: verificacion.id,
      token,
      resultado: 'sin_afectacion',
    })
    expect(previa.ok).toBe(true)

    const res = await POST(
      postReq({
        cue: CUE_M,
        idempotencyKey: crypto.randomUUID(),
        rigeDesde: new Date().toISOString(),
        afectacionesNuevas: [{ motivo: 'Inundación', severidad: 'Alta', secciones: [seccionId(CUE_M, '10')] }],
        verificacion: { id: verificacion.id, token },
      }),
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.verificacionVinculada).toBe(false)
    expect(body.verificacionVinculoMotivo).toBe('respuesta_contradictoria')

    // La verificación conserva su respuesta original, sin movimiento asociado.
    const fila = await obtenerVerificacion(verificacion.id)
    expect(fila?.estado).toBe('respondida')
    expect(fila?.resultado).toBe('sin_afectacion')
    expect(fila?.movimientoId).toBeNull()

    const eventos = await getDb()
      .select()
      .from(infraVerificacionEvento)
      .where(eq(infraVerificacionEvento.verificacionId, verificacion.id))
    const fallidos = eventos.filter((e) => e.tipo === 'vinculo_fallido')
    expect(fallidos).toHaveLength(1)
    expect(fallidos[0]!.motivo).toBe('respuesta_contradictoria')
  })

  it('sin el campo verificacion: 201, verificacionVinculada false y sin campo de motivo', async () => {
    const res = await POST(
      postReq({
        cue: CUE_J,
        idempotencyKey: crypto.randomUUID(),
        rigeDesde: new Date().toISOString(),
        afectacionesNuevas: [{ motivo: 'Inundación', severidad: 'Alta', secciones: [seccionId(CUE_J, '10')] }],
      }),
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.verificacionVinculada).toBe(false)
    // Cuando no se intentó el vínculo, la clave del motivo ni siquiera existe.
    expect(body.verificacionVinculoMotivo).toBeUndefined()
  })

  it('con verificacion de forma inválida: no rompe, se ignora y el parte se guarda igual', async () => {
    const res = await POST(
      postReq({
        cue: CUE_K,
        idempotencyKey: crypto.randomUUID(),
        rigeDesde: new Date().toISOString(),
        afectacionesNuevas: [{ motivo: 'Inundación', severidad: 'Alta', secciones: [seccionId(CUE_K, '10')] }],
        verificacion: { id: 123 },
      }),
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.verificacionVinculada).toBe(false)
  })

  // Hallazgo de revisión N2: la primera versión del enlace sólo cubría el
  // camino de transacción nueva (201); un retry idéntico (mismo
  // idempotencyKey) entra por el camino de replay idempotente
  // (`movimientoExistente`, 200) y también debe enlazar la verificación —
  // el director puede reintentar por una red inestable sin perder el vínculo.
  it('retry idéntico (mismo idempotencyKey): también enlaza la verificación en el replay (200)', async () => {
    const { token, verificacion } = await verificacionPendientePara(CUE_L)
    const idempotencyKey = crypto.randomUUID()
    const cuerpo = {
      cue: CUE_L,
      idempotencyKey,
      rigeDesde: new Date().toISOString(),
      afectacionesNuevas: [{ motivo: 'Inundación', severidad: 'Alta', secciones: [seccionId(CUE_L, '10')] }],
      verificacion: { id: verificacion.id, token },
    }

    const primera = await POST(postReq(cuerpo))
    expect(primera.status).toBe(201)
    const bodyPrimera = await primera.json()
    expect(bodyPrimera.verificacionVinculada).toBe(true)

    const segunda = await POST(postReq(cuerpo))
    expect(segunda.status).toBe(200)
    const bodySegunda = await segunda.json()
    expect(bodySegunda.verificacionVinculada).toBe(true)
    expect(bodySegunda.movimientoId).toBe(bodyPrimera.movimientoId)

    const fila = await obtenerVerificacion(verificacion.id)
    expect(fila?.estado).toBe('respondida')
    expect(fila?.movimientoId).toBe(bodyPrimera.movimientoId)
  })

  // Tercer camino del enlace: la carrera de idempotencia. Otra request con la
  // misma idempotencyKey gana entre el pre-chequeo y el INSERT, ésta choca
  // contra el índice único y cae en el catch de carrera (route.ts). Ese camino
  // relee el movimiento ganador y también DEBERÍA enlazar la verificación.
  //
  // HALLAZGO de esta revisión adversarial (batch E1): antes NO enlazaba y
  // además respondía 500. El catch de route.ts clasificaba el error con
  // `err.message`, pero drizzle envuelve el error de SQLite: `err.message` es
  // "Failed query: insert ..." y el texto
  // "UNIQUE constraint failed: infra_movimiento.idempotency_key" vive en
  // `err.cause.message`. El regex nunca matcheaba, así que la carrera caía al
  // 500 genérico en vez de re-leer el movimiento ganador y enlazar. Ya
  // corregido: el catch revisa `err.message` y `err.cause.message`, así que
  // este test ahora pasa como `it` normal.
  it('carrera de idempotencia (UNIQUE constraint): el movimiento ganador también enlaza la verificación (200)', async () => {
    const { token, verificacion } = await verificacionPendientePara(CUE_N)
    const idempotencyKey = crypto.randomUUID()

    // Parte preexistente para el CUE: le da un parte_id válido (FK) al
    // movimiento conflictivo y hace que el POST lo trate como actualización.
    const db = getDb()
    const ahora = new Date().toISOString()
    const parteId = crypto.randomUUID()
    await db.insert(infraParte).values({
      id: parteId,
      periodoId: PERIODO_ENOS_2026_2027_ID,
      cueAnexo: CUE_N,
      estadoEstablecimiento: 'habitual',
      estadoEstablecimientoRigeDesde: ahora,
      corteId: 1,
      creadaEn: ahora,
      actualizadaEn: ahora,
    })

    // La inyección ocurre en listarMotivos(), después del pre-chequeo de
    // idempotencia y antes del INSERT de la transacción.
    raceHook.parteId = parteId
    raceHook.idempotencyKey = idempotencyKey

    const res = await POST(
      postReq({
        cue: CUE_N,
        idempotencyKey,
        rigeDesde: ahora,
        afectacionesNuevas: [{ motivo: 'Inundación', severidad: 'Alta', secciones: [seccionId(CUE_N, '10')] }],
        verificacion: { id: verificacion.id, token },
      }),
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.verificacionVinculada).toBe(true)

    const fila = await obtenerVerificacion(verificacion.id)
    expect(fila?.estado).toBe('respondida')
    expect(fila?.resultado).toBe('con_afectacion')
    expect(fila?.movimientoId).toBe(body.movimientoId)
  })
})
