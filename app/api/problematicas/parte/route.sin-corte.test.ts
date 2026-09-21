// Caso 503 "sin corte vigente" aislado en su propio archivo a propósito:
// getDb() y el ATTACH de ge.sqlite (asegurarGeAdjuntada) son singletons por
// instancia de módulo — una vez adjuntada una base a la conexión cacheada,
// cambiar DATA_DIR a mitad de archivo no vuelve a adjuntar nada distinto.
// Vitest sí aísla el registro de módulos por archivo, así que este escenario
// necesita su propio archivo para arrancar con un getDb() nuevo.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ensureGeSchema, openGeDb } from '@/lib/infraestructura/ge-db'
import { NOMBRE_COOKIE, crearTokenSesion } from '@/lib/infraestructura/acceso-publico'
import { claveDePrueba } from '@/lib/infraestructura/claves-de-prueba'
import { GET, POST } from './route'

const CLAVE = claveDePrueba()
const CUE = '1801605-48'

let dir: string
let prevDataDir: string | undefined
let prevPassword: string | undefined

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'parte-route-sin-corte-'))
  prevDataDir = process.env.DATA_DIR
  prevPassword = process.env.PROBLEMATICAS_ACCESO_PASSWORD
  process.env.DATA_DIR = dir
  process.env.PROBLEMATICAS_ACCESO_PASSWORD = CLAVE

  const ge = openGeDb()
  try {
    await ensureGeSchema(ge)
    // A propósito: ningún ge_corte insertado, ningún corte vigente.
  } finally {
    ge.close()
  }
})

afterAll(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  if (prevPassword === undefined) delete process.env.PROBLEMATICAS_ACCESO_PASSWORD
  else process.env.PROBLEMATICAS_ACCESO_PASSWORD = prevPassword
  rmSync(dir, { recursive: true, force: true })
})

function cookieHeader(): string {
  const { token } = crearTokenSesion()
  return `${NOMBRE_COOKIE}=${token}`
}

describe('sin corte vigente de Gestión Educativa', () => {
  it('GET responde 503', async () => {
    const res = await GET(
      new Request(`http://localhost/api/problematicas/parte?cue=${CUE}`, {
        headers: { cookie: cookieHeader() },
      }),
    )
    expect(res.status).toBe(503)
  })

  it('POST responde 503', async () => {
    const res = await POST(
      new Request('http://localhost/api/problematicas/parte', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: cookieHeader() },
        body: JSON.stringify({
          cue: CUE,
          idempotencyKey: crypto.randomUUID(),
          rigeDesde: new Date().toISOString(),
          afectacionesNuevas: [{ motivo: 'Inundación', severidad: 'Alta', secciones: [1] }],
        }),
      }),
    )
    expect(res.status).toBe(503)
  })
})
