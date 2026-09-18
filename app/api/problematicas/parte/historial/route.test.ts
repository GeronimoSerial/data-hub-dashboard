import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ensureSeeded } from '@/lib/db/seed'
import { NOMBRE_COOKIE, crearTokenSesion } from '@/lib/infraestructura/acceso-publico'
import { claveDePrueba } from '@/lib/infraestructura/claves-de-prueba'
import { ensureGeSchema, openGeDb } from '@/lib/infraestructura/ge-db'
import { _resetLimitesParaTests } from '@/lib/infraestructura/limites'
import { POST } from '../route'
import { GET } from './route'

const CLAVE = claveDePrueba()
const CUE_A = '1801605-51'
const CUE_SIN_PARTE = '1801605-52'

let dir: string
let prevDataDir: string | undefined
let prevPassword: string | undefined
let prevAdminEmail: string | undefined
let prevAdminPassword: string | undefined

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

  const ge = openGeDb()
  try {
    await ensureGeSchema(ge)
    await ge.execute(
      "INSERT INTO ge_corte (id, ciclo_lectivo, fetched_at, estado) VALUES (1, 2025, '2025-01-01T00:00:00Z', 'vigente')",
    )
    await ge.execute(
      `INSERT INTO ge_localizacion (cue_anexo, cui, nombre, departamento, localidad) VALUES ('${CUE_A}', NULL, 'Escuela', 'ER', 'Parana')`,
    )
    await ge.execute(
      `INSERT INTO ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, 5110, '${CUE_A}', '1', 'A', 'PRIMARIA', 'MAÑANA')`,
    )
    await ge.execute(
      `INSERT INTO ge_localizacion (cue_anexo, cui, nombre, departamento, localidad) VALUES ('${CUE_SIN_PARTE}', NULL, 'Escuela sin parte', 'ER', 'Parana')`,
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

function cookieHeader(): string {
  const { token } = crearTokenSesion()
  return `${NOMBRE_COOKIE}=${token}`
}

function getReq(cue: string, conCookie = true): Request {
  return new Request(`http://localhost/api/problematicas/parte/historial?cue=${encodeURIComponent(cue)}`, {
    headers: conCookie ? { cookie: cookieHeader() } : {},
  })
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
