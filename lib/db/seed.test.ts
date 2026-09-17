import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { count } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getDb } from './index'
import { categorias, niveles, recursos, tags, tipos } from './schema'

let dir: string
let prevDataDir: string | undefined

// Una sola base para todo el archivo: getDb() memoiza la conexión a nivel de
// módulo, así que crear un directorio nuevo por test dejaría al segundo test
// escribiendo contra un archivo que el primero ya borró.
beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'seed-ddl-'))
  prevDataDir = process.env.DATA_DIR
  process.env.DATA_DIR = dir

  const { ensureSeeded } = await import('./seed')
  await ensureSeeded()
})

afterAll(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  rmSync(dir, { recursive: true, force: true })
})

// Deuda heredada de B3: el DDL corre sobre una base ya poblada en cada
// arranque (ensureSeeded), y cada batch que agrega tablas nuevas al HUB_DDL
// corre el mismo riesgo de romper esa garantía sin que ningún test lo note.
// Este es el test de regresión que faltaba: puebla la base, aplica el DDL
// completo dos veces más sobre ella, y verifica que ni una fila se pierde ni
// se duplica.
describe('HUB_DDL sobre una base ya poblada', () => {
  it('no pierde filas y no duplica nada al reaplicarse dos veces', async () => {
    const { HUB_DDL } = await import('./seed')
    const db = getDb()

    const [nivelesAntes] = await db.select({ n: count() }).from(niveles)
    const [tiposAntes] = await db.select({ n: count() }).from(tipos)
    const [categoriasAntes] = await db.select({ n: count() }).from(categorias)
    const [tagsAntes] = await db.select({ n: count() }).from(tags)
    const [recursosAntes] = await db.select({ n: count() }).from(recursos)

    await db.$client.executeMultiple(HUB_DDL)
    await db.$client.executeMultiple(HUB_DDL)

    const [nivelesDespues] = await db.select({ n: count() }).from(niveles)
    const [tiposDespues] = await db.select({ n: count() }).from(tipos)
    const [categoriasDespues] = await db.select({ n: count() }).from(categorias)
    const [tagsDespues] = await db.select({ n: count() }).from(tags)
    const [recursosDespues] = await db.select({ n: count() }).from(recursos)

    expect(nivelesDespues.n).toBe(nivelesAntes.n)
    expect(tiposDespues.n).toBe(tiposAntes.n)
    expect(categoriasDespues.n).toBe(categoriasAntes.n)
    expect(tagsDespues.n).toBe(tagsAntes.n)
    expect(recursosDespues.n).toBe(recursosAntes.n)
    expect(nivelesAntes.n).toBeGreaterThan(0)
  })

  it('preserva filas de las tablas nuevas de B7 (permiso y log nominal) al reaplicarse', async () => {
    const { HUB_DDL } = await import('./seed')
    const db = getDb()

    await db.$client.execute({
      sql: `INSERT INTO infra_permiso_nominal (id, user_id, otorgado_por, otorgado_en, vence_en)
            VALUES ('p1', 'u1', 'admin1', '2026-01-01T00:00:00Z', '2026-12-31T00:00:00Z')`,
    })
    await db.$client.execute({
      sql: `INSERT INTO infra_acceso_nominal_log (id, user_id, problematica_id, cantidad, consultado_en)
            VALUES ('l1', 'u1', 'prob1', 3, '2026-01-02T00:00:00Z')`,
    })

    await db.$client.executeMultiple(HUB_DDL)

    const permisos = await db.$client.execute('SELECT * FROM infra_permiso_nominal')
    const logs = await db.$client.execute('SELECT * FROM infra_acceso_nominal_log')
    expect(permisos.rows).toHaveLength(1)
    expect(logs.rows).toHaveLength(1)
  })

  it('preserva filas de infra_problematica_alumno (selección de alumnos) al reaplicarse', async () => {
    const { HUB_DDL } = await import('./seed')
    const db = getDb()

    await db.$client.execute({
      sql: `INSERT INTO infra_problematica
              (id, cue_anexo, motivo, severidad, corte_id, creada_en, idempotency_key, origen)
            VALUES ('probAlumno1', '1801605-04', 'Inundación', 'Alta', 1, '2026-01-01T00:00:00Z', 'k-alumno-1', 'enlace-cue')`,
    })
    await db.$client.execute({
      sql: `INSERT INTO infra_problematica_alumno (problematica_id, ge_person_id) VALUES ('probAlumno1', 12345)`,
    })

    await db.$client.executeMultiple(HUB_DDL)

    const alumnos = await db.$client.execute('SELECT * FROM infra_problematica_alumno')
    expect(alumnos.rows).toHaveLength(1)
  })
})
