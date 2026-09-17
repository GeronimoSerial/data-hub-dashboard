import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ensureGeSchema, openGeDb } from '@/lib/infraestructura/ge-db'
import { NOMBRE_COOKIE, crearTokenSesion } from '@/lib/infraestructura/acceso-publico'
import { POST } from './route'
import { claveDePrueba } from '@/lib/infraestructura/claves-de-prueba'

const CLAVE = claveDePrueba()

let dir: string
let prevDataDir: string | undefined
let prevPassword: string | undefined

const CUE = '1801605-04'

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'impacto-preliminar-route-'))
  prevDataDir = process.env.DATA_DIR
  prevPassword = process.env.PROBLEMATICAS_ACCESO_PASSWORD
  process.env.DATA_DIR = dir
  process.env.PROBLEMATICAS_ACCESO_PASSWORD = CLAVE

  const ge = openGeDb()
  try {
    await ensureGeSchema(ge)
    await ge.execute(
      "INSERT INTO ge_corte (id, ciclo_lectivo, fetched_at, estado) VALUES (1, 2025, '2025-01-01T00:00:00Z', 'vigente')",
    )
    await ge.execute(
      `INSERT INTO ge_localizacion (cue_anexo, cui, nombre, departamento, localidad) VALUES ('${CUE}', NULL, 'Escuela', 'ER', 'Parana')`,
    )
    await ge.execute(
      `INSERT INTO ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, 10, '${CUE}', '1', 'A', 'PRIMARIA', 'MAÑANA')`,
    )
    await ge.execute(
      `INSERT INTO ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, 20, '${CUE}', '1', 'B', 'PRIMARIA', 'MAÑANA')`,
    )
    await ge.execute(
      "INSERT INTO ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, 99, '9999999-99', '1', 'A', 'PRIMARIA', 'MAÑANA')",
    )
    for (let i = 0; i < 25; i++) {
      await ge.execute({
        sql: 'INSERT INTO ge_alumno_seccion (corte_id, ge_section_id, ge_person_id) VALUES (1, 10, ?)',
        args: [i],
      })
    }
    for (let i = 100; i < 125; i++) {
      await ge.execute({
        sql: 'INSERT INTO ge_alumno_seccion (corte_id, ge_section_id, ge_person_id) VALUES (1, 20, ?)',
        args: [i],
      })
    }
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

function req(body: unknown) {
  const { token } = crearTokenSesion()
  return new Request('http://localhost/api/problematicas/impacto', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: `${NOMBRE_COOKIE}=${token}` },
    body: JSON.stringify(body),
  })
}

describe('POST /api/problematicas/impacto', () => {
  it('calcula el impacto preliminar con la misma función que el alta', async () => {
    const res = await POST(req({ cue: CUE, secciones: [10, 20] }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.impacto.alumnos).toBe(50)
  })

  it('rechaza secciones que no pertenecen al CUE', async () => {
    const res = await POST(req({ cue: CUE, secciones: [10, 99] }))
    expect(res.status).toBe(400)
  })

  it('rechaza un cuerpo sin secciones', async () => {
    const res = await POST(req({ cue: CUE, secciones: [] }))
    expect(res.status).toBe(400)
  })

  it('responde 401 sin cookie de acceso', async () => {
    const res = await POST(
      new Request('http://localhost/api/problematicas/impacto', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cue: CUE, secciones: [10] }),
      }),
    )
    expect(res.status).toBe(401)
  })

  it('con alumnos seleccionados, cuenta sólo esos alumnos en la sección parcial', async () => {
    // Sección 10 tiene 25 alumnos (ids 0..24, ver beforeAll). Seleccionar 3
    // puntuales tiene que devolver 3, no los 25 completos de la sección.
    const res = await POST(req({ cue: CUE, secciones: [10], alumnos: [1, 2, 3] }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.impacto.alumnos).toBe(3)
  })

  it('sin alumnos explícitos para una sección seleccionada, la cuenta completa', async () => {
    const res = await POST(req({ cue: CUE, secciones: [10] }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.impacto.alumnos).toBe(25)
  })
})
