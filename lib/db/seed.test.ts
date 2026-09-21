import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { count, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getDb } from './index'
import {
  categorias,
  infraAfectacion,
  infraParte,
  infraPeriodo,
  infraProblematica,
  infraServicioAlcance,
  niveles,
  recursos,
  tags,
  tipos,
} from './schema'

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

// B1 de la trayectoria hidrometeorológica: modelo de período/parte. Ver
// docs/especificacion-funcional-trayectoria-evento-hidrometeorologico.md y el
// CONTRACT.md del batch de esquema.
describe('modelo de parte: tablas nuevas en HUB_DDL', () => {
  it('HUB_DDL crea infra_periodo/infra_parte/infra_afectacion y preserva sus filas al reaplicarse', async () => {
    const { HUB_DDL } = await import('./seed')
    const db = getDb()

    await db.insert(infraPeriodo).values({
      id: 'periodo-ddl-test',
      nombre: 'Período de prueba',
      inicioEn: '2026-01-01T00:00:00.000Z',
      finEn: null,
      estado: 'historico',
      creadaEn: '2026-01-01T00:00:00.000Z',
    })
    await db.insert(infraParte).values({
      id: 'parte-ddl-test',
      periodoId: 'periodo-ddl-test',
      cueAnexo: '1801605-04',
      estadoEstablecimiento: 'habitual',
      estadoEstablecimientoRigeDesde: '2026-01-01T00:00:00.000Z',
      corteId: 1,
      creadaEn: '2026-01-01T00:00:00.000Z',
      actualizadaEn: '2026-01-01T00:00:00.000Z',
    })
    await db.insert(infraAfectacion).values({
      id: 'afectacion-ddl-test',
      parteId: 'parte-ddl-test',
      motivo: 'Inundación',
      categoria: 'establecimiento',
      severidad: 'Alta',
      rigeDesde: '2026-01-01T00:00:00.000Z',
      creadaEn: '2026-01-01T00:00:00.000Z',
    })

    await db.$client.executeMultiple(HUB_DDL)
    await db.$client.executeMultiple(HUB_DDL)

    const periodos = await db.$client.execute(
      "SELECT * FROM infra_periodo WHERE id = 'periodo-ddl-test'",
    )
    const partes = await db.$client.execute(
      "SELECT * FROM infra_parte WHERE id = 'parte-ddl-test'",
    )
    const afectaciones = await db.$client.execute(
      "SELECT * FROM infra_afectacion WHERE id = 'afectacion-ddl-test'",
    )
    expect(periodos.rows).toHaveLength(1)
    expect(partes.rows).toHaveLength(1)
    expect(afectaciones.rows).toHaveLength(1)
  })
})

describe('infra_parte: un parte por cueAnexo y período', () => {
  it('impide dos partes para el mismo cueAnexo dentro del mismo período', async () => {
    const db = getDb()
    await db.insert(infraPeriodo).values({
      id: 'periodo-unico-parte-test',
      nombre: 'Período único parte',
      inicioEn: '2026-01-01T00:00:00.000Z',
      finEn: null,
      estado: 'historico',
      creadaEn: '2026-01-01T00:00:00.000Z',
    })
    await db.insert(infraParte).values({
      id: 'parte-unico-1',
      periodoId: 'periodo-unico-parte-test',
      cueAnexo: '1801605-04',
      estadoEstablecimiento: 'habitual',
      estadoEstablecimientoRigeDesde: '2026-01-01T00:00:00.000Z',
      corteId: 1,
      creadaEn: '2026-01-01T00:00:00.000Z',
      actualizadaEn: '2026-01-01T00:00:00.000Z',
    })

    await expect(
      db.insert(infraParte).values({
        id: 'parte-unico-2',
        periodoId: 'periodo-unico-parte-test',
        cueAnexo: '1801605-04',
        estadoEstablecimiento: 'habitual',
        estadoEstablecimientoRigeDesde: '2026-01-01T00:00:00.000Z',
        corteId: 1,
        creadaEn: '2026-01-01T00:00:00.000Z',
        actualizadaEn: '2026-01-01T00:00:00.000Z',
      }),
    ).rejects.toThrow()
  })
})

describe('infra_periodo: un solo período vigente a la vez', () => {
  it('impide un segundo período vigente, pero permite varios históricos', async () => {
    const db = getDb()
    // beforeAll ya corrió backfillPeriodoYPartes, que siembra el período ENOS
    // vigente: alcanza con intentar sembrar otro vigente encima.
    await expect(
      db.insert(infraPeriodo).values({
        id: 'periodo-vigente-duplicado-test',
        nombre: 'Otro período vigente',
        inicioEn: '2026-01-01T00:00:00.000Z',
        finEn: null,
        estado: 'vigente',
        creadaEn: '2026-01-01T00:00:00.000Z',
      }),
    ).rejects.toThrow()

    await db.insert(infraPeriodo).values({
      id: 'periodo-historico-a',
      nombre: 'Histórico A',
      inicioEn: '2025-01-01T00:00:00.000Z',
      finEn: '2025-06-01T00:00:00.000Z',
      estado: 'historico',
      creadaEn: '2025-01-01T00:00:00.000Z',
    })
    await db.insert(infraPeriodo).values({
      id: 'periodo-historico-b',
      nombre: 'Histórico B',
      inicioEn: '2024-01-01T00:00:00.000Z',
      finEn: '2024-06-01T00:00:00.000Z',
      estado: 'historico',
      creadaEn: '2024-01-01T00:00:00.000Z',
    })

    const historicos = await db.$client.execute(
      "SELECT id FROM infra_periodo WHERE estado = 'historico'",
    )
    expect(historicos.rows.length).toBeGreaterThanOrEqual(2)
  })
})

describe('soft delete: retirar no borra la fila', () => {
  it('retirar una afectación conserva la fila con retiradaEn', async () => {
    const db = getDb()
    await db.insert(infraPeriodo).values({
      id: 'periodo-soft-delete-test',
      nombre: 'Período soft delete',
      inicioEn: '2026-01-01T00:00:00.000Z',
      finEn: null,
      estado: 'historico',
      creadaEn: '2026-01-01T00:00:00.000Z',
    })
    await db.insert(infraParte).values({
      id: 'parte-soft-delete-test',
      periodoId: 'periodo-soft-delete-test',
      cueAnexo: '1801605-04',
      estadoEstablecimiento: 'habitual',
      estadoEstablecimientoRigeDesde: '2026-01-01T00:00:00.000Z',
      corteId: 1,
      creadaEn: '2026-01-01T00:00:00.000Z',
      actualizadaEn: '2026-01-01T00:00:00.000Z',
    })
    await db.insert(infraAfectacion).values({
      id: 'afectacion-soft-delete-test',
      parteId: 'parte-soft-delete-test',
      motivo: 'Inundación',
      categoria: 'establecimiento',
      severidad: 'Alta',
      rigeDesde: '2026-01-01T00:00:00.000Z',
      creadaEn: '2026-01-01T00:00:00.000Z',
    })

    await db
      .update(infraAfectacion)
      .set({ retiradaEn: '2026-02-01T00:00:00.000Z' })
      .where(eq(infraAfectacion.id, 'afectacion-soft-delete-test'))

    const [fila] = await db
      .select()
      .from(infraAfectacion)
      .where(eq(infraAfectacion.id, 'afectacion-soft-delete-test'))
    expect(fila).toBeDefined()
    expect(fila?.retiradaEn).toBe('2026-02-01T00:00:00.000Z')
  })

  it('retirar un alcance de servicio conserva la fila con retiradaEn', async () => {
    const db = getDb()
    await db.insert(infraPeriodo).values({
      id: 'periodo-alcance-soft-delete-test',
      nombre: 'Período alcance soft delete',
      inicioEn: '2026-01-01T00:00:00.000Z',
      finEn: null,
      estado: 'historico',
      creadaEn: '2026-01-01T00:00:00.000Z',
    })
    await db.insert(infraParte).values({
      id: 'parte-alcance-soft-delete-test',
      periodoId: 'periodo-alcance-soft-delete-test',
      cueAnexo: '1801605-04',
      estadoEstablecimiento: 'habitual',
      estadoEstablecimientoRigeDesde: '2026-01-01T00:00:00.000Z',
      corteId: 1,
      creadaEn: '2026-01-01T00:00:00.000Z',
      actualizadaEn: '2026-01-01T00:00:00.000Z',
    })
    await db.insert(infraServicioAlcance).values({
      id: 'alcance-soft-delete-test',
      parteId: 'parte-alcance-soft-delete-test',
      tipo: 'seccion',
      referenciaId: '123',
      estado: 'suspendido',
      rigeDesde: '2026-01-01T00:00:00.000Z',
      creadaEn: '2026-01-01T00:00:00.000Z',
    })

    await db
      .update(infraServicioAlcance)
      .set({ retiradaEn: '2026-02-01T00:00:00.000Z' })
      .where(eq(infraServicioAlcance.id, 'alcance-soft-delete-test'))

    const [fila] = await db
      .select()
      .from(infraServicioAlcance)
      .where(eq(infraServicioAlcance.id, 'alcance-soft-delete-test'))
    expect(fila).toBeDefined()
    expect(fila?.retiradaEn).toBe('2026-02-01T00:00:00.000Z')
  })
})

describe('ensureParteIdColumn', () => {
  it('agrega la columna parte_id si falta, y no falla si ya existe', async () => {
    const { ensureParteIdColumn } = await import('./seed')

    await ensureParteIdColumn()
    await ensureParteIdColumn()

    const db = getDb()
    const info = await db.$client.execute("PRAGMA table_info('infra_problematica')")
    const columnas = info.rows.map((r) => String(r.name))
    expect(columnas.filter((c) => c === 'parte_id')).toHaveLength(1)
  })
})

describe('backfillPeriodoYPartes', () => {
  it('crea un período vigente y un parte por cueAnexo, enlaza las problemáticas y es idempotente', async () => {
    const db = getDb()
    const { backfillPeriodoYPartes, PERIODO_ENOS_2026_2027_ID } = await import('./seed')

    await db.$client.execute({
      sql: `INSERT INTO infra_problematica
              (id, cue_anexo, motivo, categoria, severidad, corte_id, creada_en, idempotency_key, origen)
            VALUES ('backfill-parte-1', '1801605-99', 'Inundación', 'establecimiento', 'Alta', 1, '2026-01-01T00:00:00.000Z', 'k-backfill-parte-1', 'enlace-cue')`,
    })
    await db.$client.execute({
      sql: `INSERT INTO infra_problematica
              (id, cue_anexo, motivo, categoria, severidad, corte_id, creada_en, idempotency_key, origen)
            VALUES ('backfill-parte-2', '1801605-99', 'Anegamiento', 'alumnos', 'Media', 2, '2026-02-01T00:00:00.000Z', 'k-backfill-parte-2', 'enlace-cue')`,
    })

    await backfillPeriodoYPartes()
    // Idempotente: correrlo de nuevo no debería duplicar el período ni el parte.
    await backfillPeriodoYPartes()

    const periodos = await db
      .select()
      .from(infraPeriodo)
      .where(eq(infraPeriodo.id, PERIODO_ENOS_2026_2027_ID))
    expect(periodos).toHaveLength(1)
    expect(periodos[0]?.estado).toBe('vigente')

    const partes = await db
      .select()
      .from(infraParte)
      .where(eq(infraParte.cueAnexo, '1801605-99'))
    expect(partes).toHaveLength(1)
    // Se queda con el corte de la problemática más reciente por creada_en
    // (backfill-parte-2, corte 2) — ver decisión documentada en seed.ts.
    expect(partes[0]?.corteId).toBe(2)

    const problematicas = await db
      .select({ id: infraProblematica.id, parteId: infraProblematica.parteId })
      .from(infraProblematica)
      .where(eq(infraProblematica.cueAnexo, '1801605-99'))
    expect(problematicas).toHaveLength(2)
    expect(problematicas.every((p) => p.parteId === partes[0]?.id)).toBe(true)
  })
})
