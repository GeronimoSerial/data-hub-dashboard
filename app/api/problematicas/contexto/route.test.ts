import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ensureGeSchema, openGeDb } from '@/lib/infraestructura/ge-db'
import { GET } from './route'

let dir: string
let prevDataDir: string | undefined

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'contexto-route-'))
  prevDataDir = process.env.DATA_DIR
  process.env.DATA_DIR = dir
})

afterEach(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  rmSync(dir, { recursive: true, force: true })
})

async function seedEscuelaConSeccion() {
  const client = openGeDb()
  try {
    await ensureGeSchema(client)
    await client.execute(
      "INSERT INTO ge_corte (id, ciclo_lectivo, fetched_at, estado) VALUES (1, 2026, '2026-03-01T00:00:00Z', 'vigente')",
    )
    await client.execute(
      "INSERT INTO ge_localizacion (cue_anexo, cui, nombre, departamento, localidad) VALUES ('1801605-04', NULL, 'Escuela 4', 'Entre Rios', 'Parana')",
    )
    await client.execute(
      "INSERT INTO ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, 10, '1801605-04', '1', 'A', 'Primario', 'Mañana')",
    )
    await client.execute('INSERT INTO ge_alumno_seccion (corte_id, ge_section_id, ge_person_id) VALUES (1, 10, 900001)')
  } finally {
    client.close()
  }
}

describe('GET /api/problematicas/contexto', () => {
  it('responde 200 con la escuela y unicamente sus secciones para un CUE valido', async () => {
    await seedEscuelaConSeccion()

    const res = await GET(new Request('http://localhost/api/problematicas/contexto?cue=1801605-04'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.escuela.nombre).toBe('Escuela 4')
    expect(body.turnos).toEqual([
      { turno: 'Mañana', niveles: [{ nivel: 'Primario', secciones: [{ geSectionId: 10, curso: '1', division: 'A', nivel: 'Primario', turno: 'Mañana', matricula: 1 }] }] },
    ])
  })

  it('nunca incluye ge_person_id en el payload', async () => {
    await seedEscuelaConSeccion()

    const res = await GET(new Request('http://localhost/api/problematicas/contexto?cue=1801605-04'))
    const raw = await res.text()
    expect(raw).not.toContain('gePersonId')
    expect(raw).not.toContain('ge_person_id')
    expect(raw).not.toContain('900001')
  })

  it('responde sin sesion (no requiere cookie ni header de autenticacion)', async () => {
    await seedEscuelaConSeccion()

    const res = await GET(new Request('http://localhost/api/problematicas/contexto?cue=1801605-04'))
    expect(res.status).toBe(200)
  })

  it('responde 400 cuando falta el CUE, sin ofrecer alternativas', async () => {
    await seedEscuelaConSeccion()

    const res = await GET(new Request('http://localhost/api/problematicas/contexto'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(typeof body.error).toBe('string')
    expect(body).not.toHaveProperty('sugerencias')
    expect(body).not.toHaveProperty('alternativas')
  })

  it('responde 404 cuando el CUE no existe, sin padron alternativo', async () => {
    await seedEscuelaConSeccion()

    const res = await GET(new Request('http://localhost/api/problematicas/contexto?cue=9999999'))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(typeof body.error).toBe('string')
    expect(body).not.toHaveProperty('sugerencias')
    expect(body).not.toHaveProperty('alternativas')
  })

  it('responde 404 cuando el CUE existe pero no tiene secciones en el corte vigente', async () => {
    const client = openGeDb()
    try {
      await ensureGeSchema(client)
      await client.execute(
        "INSERT INTO ge_corte (id, ciclo_lectivo, fetched_at, estado) VALUES (1, 2026, '2026-03-01T00:00:00Z', 'vigente')",
      )
      await client.execute(
        "INSERT INTO ge_localizacion (cue_anexo, cui, nombre, departamento, localidad) VALUES ('1801605', NULL, 'Escuela Sin Secciones', 'Entre Rios', 'Parana')",
      )
    } finally {
      client.close()
    }

    const res = await GET(new Request('http://localhost/api/problematicas/contexto?cue=1801605'))
    expect(res.status).toBe(404)
  })
})
