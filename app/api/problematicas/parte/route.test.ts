import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { count, eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { getDb } from '@/lib/db'
import { ensureSeeded } from '@/lib/db/seed'
import { infraAfectacion, infraMovimiento, infraParte } from '@/lib/db/schema'
import { NOMBRE_COOKIE, crearTokenSesion } from '@/lib/infraestructura/acceso-publico'
import { claveDePrueba } from '@/lib/infraestructura/claves-de-prueba'
import { ensureGeSchema, openGeDb } from '@/lib/infraestructura/ge-db'
import { _resetLimitesParaTests } from '@/lib/infraestructura/limites'
import { GET, POST } from './route'

const CLAVE = claveDePrueba()

let dir: string
let prevDataDir: string | undefined
let prevPassword: string | undefined
let prevAdminEmail: string | undefined
let prevAdminPassword: string | undefined

const CUE_A = '1801605-41'
const CUE_B = '1801605-42'
const CUE_C = '1801605-43'
const CUE_D = '1801605-44'
const CUE_E = '1801605-45'
const CUE_F = '1801605-46'
const CUE_SIN_SECCIONES = '1801605-49'

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
    for (const cue of [CUE_A, CUE_B, CUE_C, CUE_D, CUE_E, CUE_F]) {
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
