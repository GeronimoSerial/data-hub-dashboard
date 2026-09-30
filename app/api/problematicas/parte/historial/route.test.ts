import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getRawClient } from '@/lib/db'
import { ensureSeeded } from '@/lib/db/seed'
import { NOMBRE_COOKIE, crearTokenSesion } from '@/lib/infraestructura/acceso-publico'
import { claveDePrueba } from '@/lib/infraestructura/claves-de-prueba'
import { crearEjecutorSql, ensureGeSchema } from '@/lib/infraestructura/ge-db'
import { _resetLimitesParaTests } from '@/lib/infraestructura/limites'
import {
  NOMBRE_COOKIE_SESION_VERIFICACION,
  crearSesionVerificacion,
} from '@/lib/infraestructura/verificacion-sesion'
import { crearVerificacion } from '@/lib/infraestructura/verificaciones'
import { POST } from '../route'
import { GET } from './route'

// Estas pruebas cubren la guarda por contraseña. La sesión se fuerza a
// ausente para que 'sin cookie' signifique 401 y no dependa del bypass de
// administrador, que tiene su propia cobertura en acceso-parte.test.ts.
vi.mock('@/lib/session', () => ({ getSessionUser: async () => null }))

const CLAVE = claveDePrueba()
const CUE_A = '1801605-51'
const CUE_SIN_PARTE = '1801605-52'
// CUE exclusivo de la sesión de verificación acotada por CUE (batch E1).
const CUE_SESION = '1801605-53'
const SECCION_SESION = 5310

let dir: string
let prevDataDir: string | undefined
let prevPassword: string | undefined
let prevAdminEmail: string | undefined
let prevAdminPassword: string | undefined
// Verificación REAL de la tabla infra_verificacion asociada a CUE_SESION: la
// cookie de sesión tiene que apuntar a una fila pendiente y vigente, si no
// tieneAccesoAlParteParaCue la rechaza y los tests del mismo CUE dan 401.
let verificacionIdSesion: string

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'parte-historial-route-'))
  prevDataDir = process.env.DATA_DIR
  prevPassword = process.env.PROBLEMATICAS_ACCESO_PASSWORD
  prevAdminEmail = process.env.ADMIN_EMAIL
  prevAdminPassword = process.env.ADMIN_PASSWORD
  process.env.DATA_DIR = dir
  process.env.PROBLEMATICAS_ACCESO_PASSWORD = CLAVE
  delete process.env.ADMIN_EMAIL
  delete process.env.ADMIN_PASSWORD

  const client = crearEjecutorSql(getRawClient())
  await ensureGeSchema(client)
  await client.execute(
    "INSERT INTO ge.ge_corte (id, ciclo_lectivo, fetched_at, estado) OVERRIDING SYSTEM VALUE VALUES (1, 2025, '2025-01-01T00:00:00Z', 'vigente')",
  )
  await client.execute(
    `INSERT INTO ge.ge_localizacion (cue_anexo, cui, nombre, departamento, localidad) VALUES ('${CUE_A}', NULL, 'Escuela', 'ER', 'Parana')`,
  )
  await client.execute(
    `INSERT INTO ge.ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, 5110, '${CUE_A}', '1', 'A', 'PRIMARIA', 'MAÑANA')`,
  )
  await client.execute(
    `INSERT INTO ge.ge_localizacion (cue_anexo, cui, nombre, departamento, localidad) VALUES ('${CUE_SIN_PARTE}', NULL, 'Escuela sin parte', 'ER', 'Parana')`,
  )
  await client.execute(
    `INSERT INTO ge.ge_localizacion (cue_anexo, cui, nombre, departamento, localidad) VALUES ('${CUE_SESION}', NULL, 'Escuela con sesión acotada', 'ER', 'Parana')`,
  )
  await client.execute(
    `INSERT INTO ge.ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, ${SECCION_SESION}, '${CUE_SESION}', '1', 'A', 'PRIMARIA', 'MAÑANA')`,
  )

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

function cookieHeader(): string {
  const { token } = crearTokenSesion()
  return `${NOMBRE_COOKIE}=${token}`
}

function getReq(cue: string, conCookie = true): Request {
  return new Request(`http://localhost/api/problematicas/parte/historial?cue=${encodeURIComponent(cue)}`, {
    headers: conCookie ? { cookie: cookieHeader() } : {},
  })
}

// Cookie de sesión acotada por CUE (batch E1), firmada con la misma env var
// que usa la guarda. No incluye la cookie de contraseña a propósito: el test
// prueba que la sesión de verificación alcanza por sí sola.
function cookieSesionVerificacion(cue: string, ahora?: Date): string {
  const { valorCookie } = crearSesionVerificacion(verificacionIdSesion, cue, ahora)
  return `${NOMBRE_COOKIE_SESION_VERIFICACION}=${valorCookie}`
}

function getReqSesion(cue: string, cookie: string): Request {
  return new Request(
    `http://localhost/api/problematicas/parte/historial?cue=${encodeURIComponent(cue)}`,
    { headers: { cookie } },
  )
}

function postParte(body: unknown): Request {
  return new Request('http://localhost/api/problematicas/parte', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: cookieHeader() },
    body: JSON.stringify(body),
  })
}

describe('GET /api/problematicas/parte/historial', () => {
  it('responde 401 sin cookie de acceso', async () => {
    const res = await GET(getReq(CUE_A, false))
    expect(res.status).toBe(401)
  })

  it('responde 400 con CUE inválido', async () => {
    const res = await GET(getReq('no-es-un-cue'))
    expect(res.status).toBe(400)
  })

  it('sin parte para el CUE, responde movimientos vacío sin error', async () => {
    const res = await GET(getReq(CUE_SIN_PARTE))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.movimientos).toEqual([])
  })

  it('devuelve los movimientos en orden más nuevo primero, con prosa no vacía', async () => {
    const reporte = await POST(
      postParte({
        cue: CUE_A,
        idempotencyKey: crypto.randomUUID(),
        rigeDesde: new Date().toISOString(),
        afectacionesNuevas: [{ motivo: 'Inundación', severidad: 'Alta', secciones: [5110] }],
      }),
    )
    expect(reporte.status).toBe(201)

    // creadaEn tiene precisión de milisegundo: sin esta espera, dos POST
    // consecutivos podrían empatar y el ORDER BY ... DESC de la ruta no
    // tendría un desempate determinístico que probar.
    await new Promise((resolve) => setTimeout(resolve, 5))

    const actualizacion = await POST(
      postParte({
        cue: CUE_A,
        idempotencyKey: crypto.randomUUID(),
        rigeDesde: new Date().toISOString(),
        estadoEstablecimiento: { estado: 'evacuado' },
        // The initial report was scoped to one section, so evacuating the
        // whole building requires the explicit confirmation.
        confirmarInterrupcionTotal: true,
      }),
    )
    expect(actualizacion.status).toBe(201)

    const res = await GET(getReq(CUE_A))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.movimientos).toHaveLength(2)
    expect(body.movimientos[0].tipo).toBe('actualizacion')
    expect(body.movimientos[1].tipo).toBe('reporte_inicial')
    for (const movimiento of body.movimientos) {
      expect(movimiento.cambios.length).toBeGreaterThan(0)
    }
  })

  it('setea Cache-Control privado', async () => {
    const res = await GET(getReq(CUE_A))
    expect(res.headers.get('cache-control')).toBe('private, no-store')
  })
})

// Batch E1: un director que entró por el enlace de verificación puede ver el
// historial SIN la contraseña compartida, pero SÓLO para el CUE de esa sesión.
// Es el mismo contrato que ya cubre route.test.ts del parte; acá se verifica
// que el endpoint de historial quedó alineado con la guarda acotada por CUE.
describe('historial con sesión acotada por CUE', () => {
  // Fila real de infra_verificacion sobre CUE_SESION, pendiente y con token
  // vigente, para que la cookie firmada apunte a un verificacionId que
  // verificacionHabilitaSesionEscritura acepte (mismo patrón que el describe
  // de route.test.ts del parte). Corre después del beforeAll de módulo, que ya
  // dejó DATA_DIR y la contraseña seteados.
  beforeAll(async () => {
    const creada = await crearVerificacion({
      cueAnexo: CUE_SESION,
      solicitadaPorUserId: 'user-director',
    })
    if (!creada.ok) throw new Error(`no se pudo crear la verificación de ${CUE_SESION}: ${creada.motivo}`)
    verificacionIdSesion = creada.verificacion.id
  })

  it('GET con la sesión del mismo CUE (sin cookie de contraseña): 200 con los movimientos', async () => {
    const reporte = await POST(
      postParte({
        cue: CUE_SESION,
        idempotencyKey: crypto.randomUUID(),
        rigeDesde: new Date().toISOString(),
        afectacionesNuevas: [{ motivo: 'Inundación', severidad: 'Alta', secciones: [SECCION_SESION] }],
      }),
    )
    expect(reporte.status).toBe(201)

    const res = await GET(getReqSesion(CUE_SESION, cookieSesionVerificacion(CUE_SESION)))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.movimientos.length).toBeGreaterThan(0)
    expect(body.movimientos[0].cambios.length).toBeGreaterThan(0)
  })

  it('la sesión de un CUE no habilita el historial de OTRO CUE: 401', async () => {
    const res = await GET(getReqSesion(CUE_A, cookieSesionVerificacion(CUE_SESION)))
    expect(res.status).toBe(401)
  })
})
