import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createClient } from '@libsql/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { activarCorte, attachGe, ensureGeSchema, getCorteVigente, openGeDb } from './ge-db'

let dir: string
let prevDataDir: string | undefined

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'ge-db-'))
  prevDataDir = process.env.DATA_DIR
  process.env.DATA_DIR = dir
})

afterEach(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  rmSync(dir, { recursive: true, force: true })
})

describe('ensureGeSchema', () => {
  it('creates the ge tables and is idempotent when run twice', async () => {
    const client = openGeDb()
    try {
      await ensureGeSchema(client)
      await ensureGeSchema(client)

      const res = await client.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'ge_%' ORDER BY name",
      )
      const names = res.rows.map((r) => r.name as string)
      expect(names).toEqual([
        'ge_alumno_identidad',
        'ge_alumno_seccion',
        'ge_corte',
        'ge_localizacion',
        'ge_seccion',
      ])
    } finally {
      client.close()
    }
  })
})

describe('getCorteVigente', () => {
  it('returns the vigente corte, never the importando one with a higher id', async () => {
    const client = openGeDb()
    try {
      await ensureGeSchema(client)
      await client.execute(
        "INSERT INTO ge_corte (id, ciclo_lectivo, fetched_at, estado) VALUES (1, 2025, '2025-03-01T00:00:00Z', 'vigente')",
      )
      await client.execute(
        "INSERT INTO ge_corte (id, ciclo_lectivo, fetched_at, estado) VALUES (9, 2026, '2026-03-01T00:00:00Z', 'importando')",
      )

      const corte = await getCorteVigente(client)
      expect(corte).not.toBeNull()
      expect(corte!.id).toBe(1)
      expect(corte!.estado).toBe('vigente')
      expect(corte!.cicloLectivo).toBe(2025)
    } finally {
      client.close()
    }
  })

  it('returns null when there is no vigente corte', async () => {
    const client = openGeDb()
    try {
      await ensureGeSchema(client)
      await client.execute(
        "INSERT INTO ge_corte (id, ciclo_lectivo, fetched_at, estado) VALUES (1, 2026, '2026-03-01T00:00:00Z', 'importando')",
      )
      expect(await getCorteVigente(client)).toBeNull()
    } finally {
      client.close()
    }
  })
})

describe('attachGe', () => {
  it('joins hub_cue with ge.ge_localizacion in a single query', async () => {
    const ge = openGeDb()
    try {
      await ensureGeSchema(ge)
      await ge.execute(
        "INSERT INTO ge_localizacion (cue_anexo, cui, nombre, departamento, localidad, lat, lon) VALUES ('1801605-04', 'CUI1', 'Escuela 4', 'Entre Rios', 'Parana', -31.7, -60.5)",
      )
    } finally {
      ge.close()
    }

    const hubClient = createClient({ url: `file:${path.join(dir, 'hub-test.sqlite')}` })
    try {
      await hubClient.execute('CREATE TABLE IF NOT EXISTS hub_cue (cue_anexo TEXT PRIMARY KEY)')
      await hubClient.execute("INSERT INTO hub_cue (cue_anexo) VALUES ('1801605-04')")

      await attachGe(hubClient)

      const res = await hubClient.execute(
        'SELECT h.cue_anexo FROM hub_cue h JOIN ge.ge_localizacion g ON g.cue_anexo = h.cue_anexo',
      )
      expect(res.rows.map((r) => r.cue_anexo)).toEqual(['1801605-04'])
    } finally {
      hubClient.close()
    }
  })

  it('does not alter or drop existing hub tables', async () => {
    const ge = openGeDb()
    try {
      await ensureGeSchema(ge)
    } finally {
      ge.close()
    }

    const hubClient = createClient({ url: `file:${path.join(dir, 'hub-test.sqlite')}` })
    try {
      await hubClient.execute('CREATE TABLE IF NOT EXISTS hub_cue (cue_anexo TEXT PRIMARY KEY)')
      await hubClient.execute("INSERT INTO hub_cue (cue_anexo) VALUES ('1801605-04')")

      const before = await hubClient.execute('SELECT COUNT(*) AS n FROM hub_cue')
      await attachGe(hubClient)
      const after = await hubClient.execute('SELECT COUNT(*) AS n FROM hub_cue')

      expect(before.rows[0].n).toBe(1)
      expect(after.rows[0].n).toBe(1)
    } finally {
      hubClient.close()
    }
  })
})

describe('activarCorte', () => {
  it('activa un corte importando a vigente cuando los invariantes se cumplen', async () => {
    const client = openGeDb()
    try {
      await ensureGeSchema(client)
      await client.execute(
        "INSERT INTO ge_corte (id, ciclo_lectivo, fetched_at, estado) VALUES (1, 2025, '2025-03-01T00:00:00Z', 'importando')",
      )
      await client.execute(
        "INSERT INTO ge_localizacion (cue_anexo, cui, nombre, departamento, localidad) VALUES ('1801605-04', 'CUI1', 'Escuela 4', 'Entre Rios', 'Parana')",
      )
      await client.execute(
        "INSERT INTO ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, 10, '1801605-04', '1', 'A', 'PRIMARIA', 'MAÑANA')",
      )
      await client.execute(
        'INSERT INTO ge_alumno_seccion (corte_id, ge_section_id, ge_person_id) VALUES (1, 10, 100)',
      )

      await activarCorte(client, 1)

      const res = await client.execute('SELECT estado FROM ge_corte WHERE id = 1')
      expect(res.rows[0].estado).toBe('vigente')
    } finally {
      client.close()
    }
  })

  it('degrada el corte vigente anterior a historico y activa el nuevo', async () => {
    const client = openGeDb()
    try {
      await ensureGeSchema(client)
      await client.execute(
        "INSERT INTO ge_corte (id, ciclo_lectivo, fetched_at, estado) VALUES (1, 2025, '2025-03-01T00:00:00Z', 'vigente')",
      )
      await client.execute(
        "INSERT INTO ge_corte (id, ciclo_lectivo, fetched_at, estado) VALUES (2, 2026, '2026-03-01T00:00:00Z', 'importando')",
      )
      await client.execute(
        "INSERT INTO ge_localizacion (cue_anexo, cui, nombre, departamento, localidad) VALUES ('1801605-04', 'CUI1', 'Escuela 4', 'Entre Rios', 'Parana')",
      )
      await client.execute(
        "INSERT INTO ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (2, 10, '1801605-04', '1', 'A', 'PRIMARIA', 'MAÑANA')",
      )
      await client.execute(
        'INSERT INTO ge_alumno_seccion (corte_id, ge_section_id, ge_person_id) VALUES (2, 10, 100)',
      )

      await activarCorte(client, 2)

      const c1 = await client.execute('SELECT estado FROM ge_corte WHERE id = 1')
      const c2 = await client.execute('SELECT estado FROM ge_corte WHERE id = 2')
      expect(c1.rows[0].estado).toBe('historico')
      expect(c2.rows[0].estado).toBe('vigente')
    } finally {
      client.close()
    }
  })

  it('tira error y no cambia el corte si hay una seccion sin localizacion', async () => {
    const client = openGeDb()
    try {
      await ensureGeSchema(client)
      await client.execute(
        "INSERT INTO ge_corte (id, ciclo_lectivo, fetched_at, estado) VALUES (1, 2025, '2025-03-01T00:00:00Z', 'importando')",
      )
      await client.execute(
        "INSERT INTO ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, 10, '9999999-99', '1', 'A', 'PRIMARIA', 'MAÑANA')",
      )

      await expect(activarCorte(client, 1)).rejects.toThrow()

      const res = await client.execute('SELECT estado FROM ge_corte WHERE id = 1')
      expect(res.rows[0].estado).toBe('importando')
    } finally {
      client.close()
    }
  })

  it('tira error y no cambia el corte si hay una membresia huerfana', async () => {
    const client = openGeDb()
    try {
      await ensureGeSchema(client)
      await client.execute(
        "INSERT INTO ge_corte (id, ciclo_lectivo, fetched_at, estado) VALUES (1, 2025, '2025-03-01T00:00:00Z', 'importando')",
      )
      await client.execute(
        "INSERT INTO ge_localizacion (cue_anexo, cui, nombre, departamento, localidad) VALUES ('1801605-04', 'CUI1', 'Escuela 4', 'Entre Rios', 'Parana')",
      )
      await client.execute(
        "INSERT INTO ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, 10, '1801605-04', '1', 'A', 'PRIMARIA', 'MAÑANA')",
      )
      await client.execute(
        'INSERT INTO ge_alumno_seccion (corte_id, ge_section_id, ge_person_id) VALUES (1, 99, 100)',
      )

      await expect(activarCorte(client, 1)).rejects.toThrow()

      const res = await client.execute('SELECT estado FROM ge_corte WHERE id = 1')
      expect(res.rows[0].estado).toBe('importando')
    } finally {
      client.close()
    }
  })

  it('tira error si el corte no esta en estado importando', async () => {
    const client = openGeDb()
    try {
      await ensureGeSchema(client)
      await client.execute(
        "INSERT INTO ge_corte (id, ciclo_lectivo, fetched_at, estado) VALUES (1, 2025, '2025-03-01T00:00:00Z', 'vigente')",
      )

      await expect(activarCorte(client, 1)).rejects.toThrow()

      const res = await client.execute('SELECT estado FROM ge_corte WHERE id = 1')
      expect(res.rows[0].estado).toBe('vigente')
    } finally {
      client.close()
    }
  })
})
