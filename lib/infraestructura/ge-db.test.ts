import { beforeEach, describe, expect, it } from 'vitest'
import { getRawClient } from '../db'
import { activarCorte, attachGe, crearEjecutorSql, ensureGeSchema, getCorteVigente } from './ge-db'

// DB1/F2: GE ya no es un archivo SQLite aislado por DATA_DIR, sino el schema
// `ge` de la base PGlite compartida por todo el archivo. Cada test limpia sus
// tablas para conservar el aislamiento que antes daba el ge.sqlite por test.
function cliente() {
  return crearEjecutorSql(getRawClient())
}

async function resetGe(): Promise<void> {
  const client = cliente()
  await ensureGeSchema(client)
  await client.execute('DELETE FROM ge.ge_alumno_seccion')
  await client.execute('DELETE FROM ge.ge_seccion')
  await client.execute('DELETE FROM ge.ge_localizacion')
  await client.execute('DELETE FROM ge.ge_alumno_identidad')
  await client.execute('DELETE FROM ge.ge_corte')
}

beforeEach(resetGe)

describe('ensureGeSchema', () => {
  it('creates the ge tables and is idempotent when run twice', async () => {
    const client = cliente()
    await ensureGeSchema(client)
    await ensureGeSchema(client)

    const res = await client.execute(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'ge' AND starts_with(table_name, 'ge_') ORDER BY table_name",
    )
    const names = res.rows.map((r) => r.table_name as string)
    expect(names).toEqual([
      'ge_alumno_identidad',
      'ge_alumno_seccion',
      'ge_corte',
      'ge_escuela_nivel_jur',
      'ge_localizacion',
      'ge_nivel_jurisdiccional',
      'ge_seccion',
    ])
  })
})

describe('getCorteVigente', () => {
  it('returns the vigente corte, never the importando one with a higher id', async () => {
    const client = cliente()
    await ensureGeSchema(client)
    await client.execute(
      "INSERT INTO ge.ge_corte (id, ciclo_lectivo, fetched_at, estado) OVERRIDING SYSTEM VALUE VALUES (1, 2025, '2025-03-01T00:00:00Z', 'vigente')",
    )
    await client.execute(
      "INSERT INTO ge.ge_corte (id, ciclo_lectivo, fetched_at, estado) OVERRIDING SYSTEM VALUE VALUES (9, 2026, '2026-03-01T00:00:00Z', 'importando')",
    )

    const corte = await getCorteVigente(client)
    expect(corte).not.toBeNull()
    expect(corte!.id).toBe(1)
    expect(corte!.estado).toBe('vigente')
    expect(corte!.cicloLectivo).toBe(2025)
  })

  it('returns null when there is no vigente corte', async () => {
    const client = cliente()
    await ensureGeSchema(client)
    await client.execute(
      "INSERT INTO ge.ge_corte (id, ciclo_lectivo, fetched_at, estado) OVERRIDING SYSTEM VALUE VALUES (1, 2026, '2026-03-01T00:00:00Z', 'importando')",
    )
    expect(await getCorteVigente(client)).toBeNull()
  })
})

describe('attachGe', () => {
  // En Postgres `ge` es un schema nativo de la MISMA base: no hay ATTACH. Lo que
  // se verifica acá es que, tras attachGe (que re-ejecuta el DDL idempotente),
  // una tabla del hub y una de GE se pueden consultar juntas en una sola query.
  it('joins a hub table with ge.ge_localizacion in a single query', async () => {
    const client = cliente()
    await client.execute('CREATE TABLE IF NOT EXISTS hub_cue (cue_anexo TEXT PRIMARY KEY)')
    await client.execute('DELETE FROM hub_cue')
    await client.execute("INSERT INTO hub_cue (cue_anexo) VALUES ('1801605-04')")
    await client.execute(
      "INSERT INTO ge.ge_localizacion (cue_anexo, cui, nombre, departamento, localidad, lat, lon) VALUES ('1801605-04', 'CUI1', 'Escuela 4', 'Entre Rios', 'Parana', -31.7, -60.5)",
    )

    await attachGe(client)

    const res = await client.execute(
      'SELECT h.cue_anexo FROM hub_cue h JOIN ge.ge_localizacion g ON g.cue_anexo = h.cue_anexo',
    )
    expect(res.rows.map((r) => r.cue_anexo)).toEqual(['1801605-04'])
  })

  it('does not alter or drop existing hub tables', async () => {
    const client = cliente()
    await client.execute('CREATE TABLE IF NOT EXISTS hub_cue (cue_anexo TEXT PRIMARY KEY)')
    await client.execute('DELETE FROM hub_cue')
    await client.execute("INSERT INTO hub_cue (cue_anexo) VALUES ('1801605-04')")

    const before = await client.execute('SELECT COUNT(*) AS n FROM hub_cue')
    await attachGe(client)
    const after = await client.execute('SELECT COUNT(*) AS n FROM hub_cue')

    expect(Number(before.rows[0].n)).toBe(1)
    expect(Number(after.rows[0].n)).toBe(1)
  })
})

describe('activarCorte', () => {
  it('activa un corte importando a vigente cuando los invariantes se cumplen', async () => {
    const client = cliente()
    await ensureGeSchema(client)
    await client.execute(
      "INSERT INTO ge.ge_corte (id, ciclo_lectivo, fetched_at, estado) OVERRIDING SYSTEM VALUE VALUES (1, 2025, '2025-03-01T00:00:00Z', 'importando')",
    )
    await client.execute(
      "INSERT INTO ge.ge_localizacion (cue_anexo, cui, nombre, departamento, localidad) VALUES ('1801605-04', 'CUI1', 'Escuela 4', 'Entre Rios', 'Parana')",
    )
    await client.execute(
      "INSERT INTO ge.ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, 10, '1801605-04', '1', 'A', 'PRIMARIA', 'MAÑANA')",
    )
    await client.execute(
      'INSERT INTO ge.ge_alumno_seccion (corte_id, ge_section_id, ge_person_id) VALUES (1, 10, 100)',
    )

    await activarCorte(client, 1)

    const res = await client.execute('SELECT estado FROM ge.ge_corte WHERE id = 1')
    expect(res.rows[0].estado).toBe('vigente')
  })

  it('degrada el corte vigente anterior a historico y activa el nuevo', async () => {
    const client = cliente()
    await ensureGeSchema(client)
    await client.execute(
      "INSERT INTO ge.ge_corte (id, ciclo_lectivo, fetched_at, estado) OVERRIDING SYSTEM VALUE VALUES (1, 2025, '2025-03-01T00:00:00Z', 'vigente')",
    )
    await client.execute(
      "INSERT INTO ge.ge_corte (id, ciclo_lectivo, fetched_at, estado) OVERRIDING SYSTEM VALUE VALUES (2, 2026, '2026-03-01T00:00:00Z', 'importando')",
    )
    await client.execute(
      "INSERT INTO ge.ge_localizacion (cue_anexo, cui, nombre, departamento, localidad) VALUES ('1801605-04', 'CUI1', 'Escuela 4', 'Entre Rios', 'Parana')",
    )
    await client.execute(
      "INSERT INTO ge.ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (2, 10, '1801605-04', '1', 'A', 'PRIMARIA', 'MAÑANA')",
    )
    await client.execute(
      'INSERT INTO ge.ge_alumno_seccion (corte_id, ge_section_id, ge_person_id) VALUES (2, 10, 100)',
    )

    await activarCorte(client, 2)

    const c1 = await client.execute('SELECT estado FROM ge.ge_corte WHERE id = 1')
    const c2 = await client.execute('SELECT estado FROM ge.ge_corte WHERE id = 2')
    expect(c1.rows[0].estado).toBe('historico')
    expect(c2.rows[0].estado).toBe('vigente')
  })

  it('tira error y no cambia el corte si hay una seccion sin localizacion', async () => {
    const client = cliente()
    await ensureGeSchema(client)
    await client.execute(
      "INSERT INTO ge.ge_corte (id, ciclo_lectivo, fetched_at, estado) OVERRIDING SYSTEM VALUE VALUES (1, 2025, '2025-03-01T00:00:00Z', 'importando')",
    )
    await client.execute(
      "INSERT INTO ge.ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, 10, '9999999-99', '1', 'A', 'PRIMARIA', 'MAÑANA')",
    )

    await expect(activarCorte(client, 1)).rejects.toThrow()

    const res = await client.execute('SELECT estado FROM ge.ge_corte WHERE id = 1')
    expect(res.rows[0].estado).toBe('importando')
  })

  it('tira error y no cambia el corte si hay una membresia huerfana', async () => {
    const client = cliente()
    await ensureGeSchema(client)
    await client.execute(
      "INSERT INTO ge.ge_corte (id, ciclo_lectivo, fetched_at, estado) OVERRIDING SYSTEM VALUE VALUES (1, 2025, '2025-03-01T00:00:00Z', 'importando')",
    )
    await client.execute(
      "INSERT INTO ge.ge_localizacion (cue_anexo, cui, nombre, departamento, localidad) VALUES ('1801605-04', 'CUI1', 'Escuela 4', 'Entre Rios', 'Parana')",
    )
    await client.execute(
      "INSERT INTO ge.ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, 10, '1801605-04', '1', 'A', 'PRIMARIA', 'MAÑANA')",
    )
    await client.execute(
      'INSERT INTO ge.ge_alumno_seccion (corte_id, ge_section_id, ge_person_id) VALUES (1, 99, 100)',
    )

    await expect(activarCorte(client, 1)).rejects.toThrow()

    const res = await client.execute('SELECT estado FROM ge.ge_corte WHERE id = 1')
    expect(res.rows[0].estado).toBe('importando')
  })

  it('tira error si el corte no esta en estado importando', async () => {
    const client = cliente()
    await ensureGeSchema(client)
    await client.execute(
      "INSERT INTO ge.ge_corte (id, ciclo_lectivo, fetched_at, estado) OVERRIDING SYSTEM VALUE VALUES (1, 2025, '2025-03-01T00:00:00Z', 'vigente')",
    )

    await expect(activarCorte(client, 1)).rejects.toThrow()

    const res = await client.execute('SELECT estado FROM ge.ge_corte WHERE id = 1')
    expect(res.rows[0].estado).toBe('vigente')
  })
})
