// @vitest-environment jsdom
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ensureGeSchema, openGeDb } from '@/lib/infraestructura/ge-db'
import NuevaProblematicaPage from './page'

let dir: string
let prevDataDir: string | undefined

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'contexto-page-'))
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

describe('NuevaProblematicaPage', () => {
  it('muestra la escuela y sus secciones como lectura para un CUE valido', async () => {
    await seedEscuelaConSeccion()

    const jsx = await NuevaProblematicaPage({ searchParams: Promise.resolve({ cue: '1801605-04' }) })
    render(jsx)

    expect(screen.getByText('Escuela 4')).toBeInTheDocument()
    expect(screen.getByText('Mañana')).toBeInTheDocument()
    expect(screen.getByText('Primario')).toBeInTheDocument()
    expect(screen.getByText(/1 "A" — 1 alumnos/)).toBeInTheDocument()
  })

  it('muestra un error claro sin CUE, sin ofrecer alternativas', async () => {
    await seedEscuelaConSeccion()

    const jsx = await NuevaProblematicaPage({ searchParams: Promise.resolve({}) })
    render(jsx)

    expect(screen.getByText(/no incluye el CUE/i)).toBeInTheDocument()
    expect(screen.queryByText(/1801605/)).not.toBeInTheDocument()
  })

  it('muestra un error claro para un CUE inexistente', async () => {
    await seedEscuelaConSeccion()

    const jsx = await NuevaProblematicaPage({ searchParams: Promise.resolve({ cue: '9999999' }) })
    render(jsx)

    expect(screen.getByText(/no encontramos una escuela/i)).toBeInTheDocument()
  })
})
