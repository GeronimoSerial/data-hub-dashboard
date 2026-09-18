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

  it('preserva las filas de infra_motivo (semilla y agregados por un admin) al reaplicarse', async () => {
    const { HUB_DDL } = await import('./seed')
    const db = getDb()

    await db.$client.execute({
      sql: `INSERT INTO infra_motivo (id, nombre, categoria, orden) VALUES ('propio-admin', 'Corte de ruta', 'establecimiento', 50)`,
    })

    await db.$client.executeMultiple(HUB_DDL)
    await db.$client.executeMultiple(HUB_DDL)

    const motivos = await db.$client.execute('SELECT * FROM infra_motivo')
    expect(motivos.rows.some((r) => r.id === 'propio-admin')).toBe(true)
  })
})

describe('ensureCategoriaColumn', () => {
  it('agrega la columna categoria si falta, y no falla si ya existe', async () => {
    const { ensureCategoriaColumn } = await import('./seed')

    await ensureCategoriaColumn()
    await ensureCategoriaColumn()

    const db = getDb()
    const info = await db.$client.execute("PRAGMA table_info('infra_problematica')")
    const columnas = info.rows.map((r) => String(r.name))
    expect(columnas.filter((c) => c === 'categoria')).toHaveLength(1)
  })
})

describe('backfillCategoriaProblematicas', () => {
  it('completa categoria según el motivo de filas preexistentes, y cae a establecimiento si el motivo es desconocido', async () => {
    const db = getDb()
    const { ensureCategoriaColumn, backfillCategoriaProblematicas } = await import('./seed')
    await ensureCategoriaColumn()

    await db.$client.execute({
      sql: `INSERT INTO infra_problematica
              (id, cue_anexo, motivo, severidad, corte_id, creada_en, idempotency_key, origen)
            VALUES ('backfill-establecimiento', '1801605-04', 'Inundación', 'Alta', 1, '2026-01-01T00:00:00Z', 'k-backfill-1', 'enlace-cue')`,
    })
    await db.$client.execute({
      sql: `INSERT INTO infra_problematica
              (id, cue_anexo, motivo, severidad, corte_id, creada_en, idempotency_key, origen)
            VALUES ('backfill-alumnos', '1801605-04', 'Anegamiento', 'Media', 1, '2026-01-01T00:00:00Z', 'k-backfill-2', 'enlace-cue')`,
    })
    await db.$client.execute({
      sql: `INSERT INTO infra_problematica
              (id, cue_anexo, motivo, severidad, corte_id, creada_en, idempotency_key, origen)
            VALUES ('backfill-desconocido', '1801605-04', 'Motivo que no está en la semilla', 'Baja', 1, '2026-01-01T00:00:00Z', 'k-backfill-3', 'enlace-cue')`,
    })

    await backfillCategoriaProblematicas()
    // Idempotente: correrlo de nuevo no debería tocar filas ya categorizadas.
    await backfillCategoriaProblematicas()

    const filas = await db.$client.execute(
      "SELECT id, categoria FROM infra_problematica WHERE id IN ('backfill-establecimiento', 'backfill-alumnos', 'backfill-desconocido')",
    )
    const porId = new Map(filas.rows.map((r) => [String(r.id), String(r.categoria)]))
    expect(porId.get('backfill-establecimiento')).toBe('establecimiento')
    expect(porId.get('backfill-alumnos')).toBe('alumnos')
    expect(porId.get('backfill-desconocido')).toBe('establecimiento')
  })
})

describe('ensureMotivoNombreUnico', () => {
  // Una base sembrada con la versión anterior tiene los dos comodines
  // llamados "Otro". Eso rompe resolverCategoria y además impide crear el
  // índice único, así que el renombre tiene que correr antes.
  it('renombra los comodines heredados y luego impone el nombre único', async () => {
    const db = getDb()
    const { ensureMotivoNombreUnico, MOTIVOS_SEED } = await import(
      '@/lib/infraestructura/motivos'
    )

    await db.$client.execute('DROP INDEX IF EXISTS `infra_motivo_nombre_unico`')
    for (const id of ['otro-establecimiento', 'otro-alumnos']) {
      await db.$client.execute({
        sql: `INSERT INTO infra_motivo (id, nombre, categoria, orden)
              VALUES (?, 'Otro', 'establecimiento', 90)
              ON CONFLICT(id) DO UPDATE SET nombre = 'Otro'`,
        args: [id],
      })
    }

    await ensureMotivoNombreUnico()
    await ensureMotivoNombreUnico()

    const filas = await db.$client.execute(
      "SELECT id, nombre FROM infra_motivo WHERE id IN ('otro-establecimiento', 'otro-alumnos')",
    )
    const porId = new Map(filas.rows.map((r) => [String(r.id), String(r.nombre)]))
    const esperado = new Map(MOTIVOS_SEED.map((m) => [m.id, m.nombre]))
    expect(porId.get('otro-establecimiento')).toBe(esperado.get('otro-establecimiento'))
    expect(porId.get('otro-alumnos')).toBe(esperado.get('otro-alumnos'))
    expect(porId.get('otro-establecimiento')).not.toBe(porId.get('otro-alumnos'))
  })

  it('la base rechaza dos motivos con el mismo nombre', async () => {
    const db = getDb()
    const { ensureMotivoNombreUnico } = await import('@/lib/infraestructura/motivos')
    await ensureMotivoNombreUnico()

    await expect(
      db.$client.execute({
        sql: `INSERT INTO infra_motivo (id, nombre, categoria, orden)
              VALUES ('duplicado', 'Anegamiento', 'establecimiento', 99)`,
      }),
    ).rejects.toThrow()
  })
})
