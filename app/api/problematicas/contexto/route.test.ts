import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getRawClient } from '@/lib/db'
import { crearEjecutorSql, ensureGeSchema } from '@/lib/infraestructura/ge-db'
import { NOMBRE_COOKIE, crearTokenSesion } from '@/lib/infraestructura/acceso-publico'
import { GET } from './route'
import { claveDePrueba } from '@/lib/infraestructura/claves-de-prueba'

// Estas pruebas cubren la guarda por contraseña. La sesión se fuerza a
// ausente para que 'sin cookie' signifique 401 y no dependa del bypass de
// administrador, que tiene su propia cobertura en acceso-parte.test.ts.
vi.mock('@/lib/session', () => ({ getSessionUser: async () => null }))

const CLAVE = claveDePrueba()

let dir: string
let prevDataDir: string | undefined
let prevPassword: string | undefined

// DB1/F2: GE ya no es un archivo SQLite por test: es el schema `ge` de la
// única base PGlite compartida por el archivo. Como cada test siembra el
// mismo corte/escuela, se limpia el schema antes de cada caso para conservar
// el aislamiento que antes daba el DATA_DIR por test.
async function resetGe(): Promise<void> {
  const client = crearEjecutorSql(getRawClient())
  await ensureGeSchema(client)
  await client.execute('DELETE FROM ge.ge_alumno_seccion')
  await client.execute('DELETE FROM ge.ge_seccion')
  await client.execute('DELETE FROM ge.ge_localizacion')
  await client.execute('DELETE FROM ge.ge_alumno_identidad')
  await client.execute('DELETE FROM ge.ge_corte')
}

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'contexto-route-'))
  prevDataDir = process.env.DATA_DIR
  prevPassword = process.env.PROBLEMATICAS_ACCESO_PASSWORD
  process.env.DATA_DIR = dir
  process.env.PROBLEMATICAS_ACCESO_PASSWORD = CLAVE
  await resetGe()
})

afterEach(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  if (prevPassword === undefined) delete process.env.PROBLEMATICAS_ACCESO_PASSWORD
  else process.env.PROBLEMATICAS_ACCESO_PASSWORD = prevPassword
  rmSync(dir, { recursive: true, force: true })
})

function conAcceso(url: string) {
  const { token } = crearTokenSesion()
  return new Request(url, { headers: { cookie: `${NOMBRE_COOKIE}=${token}` } })
}

async function seedEscuelaConSeccion() {
  const client = crearEjecutorSql(getRawClient())
  await ensureGeSchema(client)
  await client.execute(
    "INSERT INTO ge.ge_corte (id, ciclo_lectivo, fetched_at, estado) OVERRIDING SYSTEM VALUE VALUES (1, 2026, '2026-03-01T00:00:00Z', 'vigente')",
  )
  await client.execute(
    "INSERT INTO ge.ge_localizacion (cue_anexo, cui, nombre, departamento, localidad) VALUES ('1801605-04', NULL, 'Escuela 4', 'Entre Rios', 'Parana')",
  )
  await client.execute(
    "INSERT INTO ge.ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, 10, '1801605-04', '1', 'A', 'Primario', 'Mañana')",
  )
  await client.execute('INSERT INTO ge.ge_alumno_seccion (corte_id, ge_section_id, ge_person_id) VALUES (1, 10, 900001)')
}

describe('GET /api/problematicas/contexto', () => {
  it('responde 200 con la escuela y unicamente sus secciones para un CUE valido', async () => {
    await seedEscuelaConSeccion()

    const res = await GET(conAcceso('http://localhost/api/problematicas/contexto?cue=1801605-04'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.escuela.nombre).toBe('Escuela 4')
    expect(body.turnos).toEqual([
      {
        turno: 'Mañana',
        niveles: [
          {
            nivel: 'Primario',
            secciones: [{ geSectionId: 10, curso: '1', division: 'A', nivel: 'Primario', turno: 'Mañana', matricula: 1, alumnos: [] }],
          },
        ],
      },
    ])
  })

  // El invariante anterior era "nunca incluye ge_person_id": eso cambió a
  // propósito (ver lib/infraestructura/contexto.ts). Acá no aparece porque la
  // identidad de este alumno nunca se importó (no hay fila en
  // ge_alumno_identidad), no porque el payload lo prohíba.
  it('no incluye identidad de un alumno que no tiene padrón nominal importado', async () => {
    await seedEscuelaConSeccion()

    const res = await GET(conAcceso('http://localhost/api/problematicas/contexto?cue=1801605-04'))
    const raw = await res.text()
    expect(raw).not.toContain('900001')
  })

  it('responde 401 sin la cookie de acceso', async () => {
    await seedEscuelaConSeccion()

    const res = await GET(new Request('http://localhost/api/problematicas/contexto?cue=1801605-04'))
    expect(res.status).toBe(401)
  })

  it('responde 401 con una cookie de acceso inválida', async () => {
    await seedEscuelaConSeccion()

    const res = await GET(
      new Request('http://localhost/api/problematicas/contexto?cue=1801605-04', {
        headers: { cookie: `${NOMBRE_COOKIE}=cualquier-cosa` },
      }),
    )
    expect(res.status).toBe(401)
  })

  it('responde 400 cuando falta el CUE, sin ofrecer alternativas', async () => {
    await seedEscuelaConSeccion()

    const res = await GET(conAcceso('http://localhost/api/problematicas/contexto'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(typeof body.error).toBe('string')
    expect(body).not.toHaveProperty('sugerencias')
    expect(body).not.toHaveProperty('alternativas')
  })

  it('responde 404 cuando el CUE no existe, sin padron alternativo', async () => {
    await seedEscuelaConSeccion()

    const res = await GET(conAcceso('http://localhost/api/problematicas/contexto?cue=9999999'))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(typeof body.error).toBe('string')
    expect(body).not.toHaveProperty('sugerencias')
    expect(body).not.toHaveProperty('alternativas')
  })

  it('responde 200 con la escuela aunque no tenga secciones en el corte vigente', async () => {
    const client = crearEjecutorSql(getRawClient())
    await ensureGeSchema(client)
    await client.execute(
      "INSERT INTO ge.ge_corte (id, ciclo_lectivo, fetched_at, estado) OVERRIDING SYSTEM VALUE VALUES (1, 2026, '2026-03-01T00:00:00Z', 'vigente')",
    )
    await client.execute(
      "INSERT INTO ge.ge_localizacion (cue_anexo, cui, nombre, departamento, localidad) VALUES ('1801605', NULL, 'Escuela Sin Secciones', 'Entre Rios', 'Parana')",
    )

    const res = await GET(conAcceso('http://localhost/api/problematicas/contexto?cue=1801605'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.escuela.nombre).toBe('Escuela Sin Secciones')
    expect(body.turnos).toEqual([])
  })
})
