import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createClient, type Client } from '@libsql/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ensureGeSchema, openGeDb } from './ge-db'
import { calcularImpactoConsolidadoCue, calcularImpactoSecciones } from './impacto'

let dir: string
let prevDataDir: string | undefined

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'impacto-'))
  prevDataDir = process.env.DATA_DIR
  process.env.DATA_DIR = dir
})

afterEach(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  rmSync(dir, { recursive: true, force: true })
})

async function seedGe() {
  const ge = openGeDb()
  try {
    await ensureGeSchema(ge)
    await ge.execute(
      "INSERT INTO ge_corte (id, ciclo_lectivo, fetched_at, estado) VALUES (1, 2025, '2025-01-01T00:00:00Z', 'vigente')",
    )
    await ge.execute(
      "INSERT INTO ge_localizacion (cue_anexo, cui, nombre, departamento, localidad) VALUES ('1801605-04', NULL, 'Escuela 4', 'ER', 'Parana')",
    )
    await ge.execute(
      "INSERT INTO ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, 10, '1801605-04', '1', 'A', 'PRIMARIA', 'MAÑANA')",
    )
    await ge.execute(
      "INSERT INTO ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, 20, '1801605-04', '1', 'B', 'PRIMARIA', 'MAÑANA')",
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
    // Una tercera sección del mismo CUE, deliberadamente fuera de la alerta:
    // si el cálculo tomara la matrícula del establecimiento en vez de las
    // secciones elegidas, este alumnado se filtraría al total.
    await ge.execute(
      "INSERT INTO ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, 30, '1801605-04', '2', 'A', 'PRIMARIA', 'TARDE')",
    )
    for (let i = 200; i < 250; i++) {
      await ge.execute({
        sql: 'INSERT INTO ge_alumno_seccion (corte_id, ge_section_id, ge_person_id) VALUES (1, 30, ?)',
        args: [i],
      })
    }
  } finally {
    ge.close()
  }
}

function openHub(): Client {
  return createClient({ url: `file:${path.join(dir, 'hub-test.sqlite')}` })
}

async function createInfraTables(client: Client) {
  await client.execute(`CREATE TABLE IF NOT EXISTS infra_problematica (
    id text PRIMARY KEY NOT NULL,
    cue_anexo text NOT NULL,
    motivo text NOT NULL,
    severidad text NOT NULL,
    descripcion text,
    corte_id integer NOT NULL,
    creada_en text NOT NULL,
    idempotency_key text NOT NULL,
    origen text NOT NULL
  )`)
  await client.execute(
    'CREATE UNIQUE INDEX IF NOT EXISTS infra_problematica_idempotency_key_unique ON infra_problematica (idempotency_key)',
  )
  await client.execute(`CREATE TABLE IF NOT EXISTS infra_problematica_seccion (
    problematica_id text NOT NULL,
    ge_section_id integer NOT NULL,
    PRIMARY KEY(problematica_id, ge_section_id)
  )`)
}

describe('calcularImpactoSecciones', () => {
  it('dos secciones de 25 alumnos distintos producen 50, no la matrícula total del CUE', async () => {
    await seedGe()
    const hub = openHub()
    try {
      const impacto = await calcularImpactoSecciones(hub, { corteId: 1, geSectionIds: [10, 20] })
      expect(impacto.alumnos).toBe(50)
      expect(impacto.secciones).toBe(2)
      expect(impacto.calculoIncompleto).toBe(false)
    } finally {
      hub.close()
    }
  })

  it('no duplica un alumno matriculado en dos secciones seleccionadas', async () => {
    await seedGe()
    const ge = openGeDb()
    try {
      await ge.execute(
        'INSERT INTO ge_alumno_seccion (corte_id, ge_section_id, ge_person_id) VALUES (1, 20, 5)',
      )
    } finally {
      ge.close()
    }
    const hub = openHub()
    try {
      const impacto = await calcularImpactoSecciones(hub, { corteId: 1, geSectionIds: [10, 20] })
      expect(impacto.alumnos).toBe(50)
    } finally {
      hub.close()
    }
  })

  it('marca cálculo incompleto cuando una sección no se resuelve en el corte, sin descartar las demás', async () => {
    await seedGe()
    const hub = openHub()
    try {
      const impacto = await calcularImpactoSecciones(hub, { corteId: 1, geSectionIds: [10, 9999] })
      expect(impacto.alumnos).toBe(25)
      expect(impacto.calculoIncompleto).toBe(true)
      expect(impacto.seccionesIrresolubles).toBe(1)
    } finally {
      hub.close()
    }
  })

  it('informa la matrícula por CUI como no disponible, nunca como cero', async () => {
    await seedGe()
    const hub = openHub()
    try {
      const impacto = await calcularImpactoSecciones(hub, { corteId: 1, geSectionIds: [10] })
      expect(impacto.cuiDisponible).toBe(false)
      expect(impacto.cuis).toBeNull()
    } finally {
      hub.close()
    }
  })

  it('devuelve un resultado vacío y no incompleto cuando no hay secciones', async () => {
    await seedGe()
    const hub = openHub()
    try {
      const impacto = await calcularImpactoSecciones(hub, { corteId: 1, geSectionIds: [] })
      expect(impacto.alumnos).toBe(0)
      expect(impacto.calculoIncompleto).toBe(false)
    } finally {
      hub.close()
    }
  })
})

describe('calcularImpactoConsolidadoCue', () => {
  it('dos alertas sobre la misma sección no duplican alumnos en el consolidado', async () => {
    await seedGe()
    const hub = openHub()
    try {
      await createInfraTables(hub)
      await hub.execute(
        "INSERT INTO infra_problematica (id, cue_anexo, motivo, severidad, corte_id, creada_en, idempotency_key, origen) VALUES ('p1', '1801605-04', 'Inundación', 'Alta', 1, '2025-01-01T00:00:00Z', 'k1', 'enlace-cue')",
      )
      await hub.execute(
        "INSERT INTO infra_problematica (id, cue_anexo, motivo, severidad, corte_id, creada_en, idempotency_key, origen) VALUES ('p2', '1801605-04', 'Anegamiento', 'Media', 1, '2025-01-02T00:00:00Z', 'k2', 'enlace-cue')",
      )
      await hub.execute("INSERT INTO infra_problematica_seccion (problematica_id, ge_section_id) VALUES ('p1', 10)")
      await hub.execute("INSERT INTO infra_problematica_seccion (problematica_id, ge_section_id) VALUES ('p2', 10)")

      const impacto = await calcularImpactoConsolidadoCue(hub, '1801605-04')
      expect(impacto.alumnos).toBe(25)
    } finally {
      hub.close()
    }
  })

  it('un CUI compartido no marca automáticamente otros CUE como afectados', async () => {
    await seedGe()
    const ge = openGeDb()
    try {
      await ge.execute(
        "INSERT INTO ge_localizacion (cue_anexo, cui, nombre, departamento, localidad) VALUES ('1801605-05', 'CUI-COMPARTIDO', 'Anexo 5', 'ER', 'Parana')",
      )
      await ge.execute(
        "INSERT INTO ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, 40, '1801605-05', '1', 'A', 'PRIMARIA', 'MAÑANA')",
      )
      for (let i = 300; i < 310; i++) {
        await ge.execute({
          sql: 'INSERT INTO ge_alumno_seccion (corte_id, ge_section_id, ge_person_id) VALUES (1, 40, ?)',
          args: [i],
        })
      }
    } finally {
      ge.close()
    }
    const hub = openHub()
    try {
      await createInfraTables(hub)
      await hub.execute(
        "INSERT INTO infra_problematica (id, cue_anexo, motivo, severidad, corte_id, creada_en, idempotency_key, origen) VALUES ('p1', '1801605-04', 'Inundación', 'Alta', 1, '2025-01-01T00:00:00Z', 'k1', 'enlace-cue')",
      )
      await hub.execute("INSERT INTO infra_problematica_seccion (problematica_id, ge_section_id) VALUES ('p1', 10)")

      const impactoOtroAnexo = await calcularImpactoConsolidadoCue(hub, '1801605-05')
      expect(impactoOtroAnexo.alumnos).toBe(0)
    } finally {
      hub.close()
    }
  })
})
