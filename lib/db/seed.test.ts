import { createClient } from '@libsql/client'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { count, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getDb } from './index'
import {
  categorias,
  infraAfectacion,
  infraJobRun,
  infraParte,
  infraPeriodo,
  infraServicioAlcance,
  infraVerificacion,
  infraVerificacionEvento,
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
    const [infraJobRunAntes] = await db.select({ n: count() }).from(infraJobRun)

    await db.$client.executeMultiple(HUB_DDL)
    await db.$client.executeMultiple(HUB_DDL)

    const [nivelesDespues] = await db.select({ n: count() }).from(niveles)
    const [tiposDespues] = await db.select({ n: count() }).from(tipos)
    const [categoriasDespues] = await db.select({ n: count() }).from(categorias)
    const [tagsDespues] = await db.select({ n: count() }).from(tags)
    const [recursosDespues] = await db.select({ n: count() }).from(recursos)
    const [infraJobRunDespues] = await db.select({ n: count() }).from(infraJobRun)

    expect(nivelesDespues.n).toBe(nivelesAntes.n)
    expect(tiposDespues.n).toBe(tiposAntes.n)
    expect(categoriasDespues.n).toBe(categoriasAntes.n)
    expect(tagsDespues.n).toBe(tagsAntes.n)
    expect(recursosDespues.n).toBe(recursosAntes.n)
    expect(infraJobRunDespues.n).toBe(infraJobRunAntes.n)
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
      sql: `INSERT INTO infra_acceso_nominal_log (id, user_id, afectacion_id, cantidad, consultado_en)
            VALUES ('l1', 'u1', 'afect1', 3, '2026-01-02T00:00:00Z')`,
    })

    await db.$client.executeMultiple(HUB_DDL)

    const permisos = await db.$client.execute('SELECT * FROM infra_permiso_nominal')
    const logs = await db.$client.execute('SELECT * FROM infra_acceso_nominal_log')
    expect(permisos.rows).toHaveLength(1)
    expect(logs.rows).toHaveLength(1)
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
    // beforeAll ya corrió sembrarPeriodoEnos (vía ensureSeeded), que siembra
    // el período ENOS vigente: alcanza con intentar sembrar otro vigente.
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

// F4.6: seedHub dropea (IF EXISTS, idempotente) las tres tablas del modelo
// retirado, así que tras ensureSeeded ninguna debe existir ni en una base
// fresca ni en una que ya las tuviera.
describe('modelo retirado: DROP idempotente de las tres tablas', () => {
  it('no deja infra_problematica, infra_problematica_seccion ni infra_problematica_alumno', async () => {
    const db = getDb()
    const tablas = await db.$client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('infra_problematica', 'infra_problematica_seccion', 'infra_problematica_alumno')",
    )
    expect(tablas.rows).toHaveLength(0)
  })
})

describe('ensureAccesoNominalLogAfectacionIdColumn', () => {
  it('renombra problematica_id a afectacion_id y preserva los datos existentes', async () => {
    const db = getDb()
    const { ensureAccesoNominalLogAfectacionIdColumn } = await import('./seed')

    // Simula una base creada con el DDL viejo (columna problematica_id):
    // primero se vuelve atrás para partir del estado pre-migración.
    await db.$client.execute(
      'ALTER TABLE infra_acceso_nominal_log RENAME COLUMN afectacion_id TO problematica_id',
    )
    await db.$client.execute({
      sql: `INSERT INTO infra_acceso_nominal_log (id, user_id, problematica_id, cantidad, consultado_en)
            VALUES ('migracion-1', 'u1', 'afect-migracion-1', 5, '2026-01-03T00:00:00Z')`,
    })

    await ensureAccesoNominalLogAfectacionIdColumn()
    // Idempotente: correrla de nuevo sobre una base ya migrada no debe fallar.
    await ensureAccesoNominalLogAfectacionIdColumn()

    const info = await db.$client.execute("PRAGMA table_info('infra_acceso_nominal_log')")
    const columnas = info.rows.map((r) => String(r.name))
    expect(columnas).toContain('afectacion_id')
    expect(columnas).not.toContain('problematica_id')

    const fila = await db.$client.execute({
      sql: 'SELECT afectacion_id, cantidad FROM infra_acceso_nominal_log WHERE id = ?',
      args: ['migracion-1'],
    })
    expect(fila.rows[0]?.afectacion_id).toBe('afect-migracion-1')
    expect(Number(fila.rows[0]?.cantidad)).toBe(5)
  })
})

// E1 de la trayectoria ENOS: verificaciones (el episodio administrado a mano
// que las agrupaba originalmente se descartó, ver
// ensureVerificacionPeriodoIdColumn más abajo). Misma garantía que el resto
// del HUB_DDL: se instala en una base ya poblada y se reaplica sin perder
// filas.
describe('modelo de verificaciones: tablas nuevas en HUB_DDL', () => {
  it('HUB_DDL crea infra_verificacion/infra_verificacion_evento y preserva sus filas al reaplicarse dos veces', async () => {
    const { HUB_DDL } = await import('./seed')
    const db = getDb()

    await db.insert(infraPeriodo).values({
      id: 'periodo-verificacion-test',
      nombre: 'Período verificación',
      inicioEn: '2026-01-01T00:00:00.000Z',
      finEn: null,
      estado: 'historico',
      creadaEn: '2026-01-01T00:00:00.000Z',
    })
    await db.insert(infraVerificacion).values({
      id: 'verificacion-ddl-test',
      periodoId: 'periodo-verificacion-test',
      cueAnexo: '1801605-04',
      estado: 'pendiente',
      solicitadaEn: '2026-01-01T00:00:00.000Z',
      solicitadaPorUserId: 'user-1',
      vencimientoEn: null,
      resultado: null,
      discrepancia: 0,
      respondidaEn: null,
      respondidaCanal: null,
      respondidaPorUserId: null,
      movimientoId: null,
      canceladaEn: null,
      canceladaPorUserId: null,
      motivoCancelacion: null,
      tokenHash: 'a'.repeat(64),
      tokenExpiraEn: '2026-02-01T00:00:00.000Z',
      tokenRevocadoEn: null,
      tokenConsumidoEn: null,
      creadaEn: '2026-01-01T00:00:00.000Z',
      actualizadaEn: '2026-01-01T00:00:00.000Z',
    })
    await db.insert(infraVerificacionEvento).values({
      id: 'evento-ddl-test',
      verificacionId: 'verificacion-ddl-test',
      tipo: 'creada',
      actorTipo: 'sistema',
      actorUserId: null,
      canal: null,
      motivo: null,
      correlacionId: null,
      creadaEn: '2026-01-01T00:00:00.000Z',
    })

    await db.$client.executeMultiple(HUB_DDL)
    await db.$client.executeMultiple(HUB_DDL)

    const verificaciones = await db.$client.execute(
      "SELECT * FROM infra_verificacion WHERE id = 'verificacion-ddl-test'",
    )
    const eventos = await db.$client.execute(
      "SELECT * FROM infra_verificacion_evento WHERE id = 'evento-ddl-test'",
    )
    expect(verificaciones.rows).toHaveLength(1)
    expect(verificaciones.rows[0]?.periodo_id).toBe('periodo-verificacion-test')
    expect(eventos.rows).toHaveLength(1)
  })
})

describe('ensureMovimientoEpisodioIdColumnDropped', () => {
  it('dropea la columna de una base vieja que la tenía y preserva movimientos existentes', async () => {
    const db = getDb()
    const { ensureMovimientoEpisodioIdColumnDropped } = await import('./seed')

    // Simula una base del batch E1: infra_movimiento CON episodio_id, como la
    // tendría una instalación previa a descartar el episodio administrado a
    // mano.
    await db.$client.execute('DROP TABLE IF EXISTS `infra_movimiento`')
    await db.$client.execute(`
      CREATE TABLE \`infra_movimiento\` (
        \`id\` text PRIMARY KEY NOT NULL,
        \`parte_id\` text NOT NULL,
        \`tipo\` text NOT NULL,
        \`rol\` text NOT NULL,
        \`resumen\` text NOT NULL,
        \`rige_desde\` text NOT NULL,
        \`creada_en\` text NOT NULL,
        \`idempotency_key\` text,
        \`episodio_id\` text,
        FOREIGN KEY (\`parte_id\`) REFERENCES \`infra_parte\`(\`id\`) ON DELETE CASCADE
      )
    `)
    await db.$client.execute({
      sql: `INSERT INTO infra_movimiento (id, parte_id, tipo, rol, resumen, rige_desde, creada_en, episodio_id)
            VALUES ('mov-legacy-1', 'parte-ddl-test', 'reporte_inicial', 'director', '{}', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'episodio-legacy-1')`,
    })

    await ensureMovimientoEpisodioIdColumnDropped()

    const info = await db.$client.execute("PRAGMA table_info('infra_movimiento')")
    const columnas = info.rows.map((r) => String(r.name))
    expect(columnas).not.toContain('episodio_id')

    const fila = await db.$client.execute({
      sql: 'SELECT id FROM infra_movimiento WHERE id = ?',
      args: ['mov-legacy-1'],
    })
    expect(fila.rows).toHaveLength(1)
  })

  it('es idempotente: reejecutarla sobre una base que ya no tiene la columna no falla', async () => {
    const db = getDb()
    const { ensureMovimientoEpisodioIdColumnDropped } = await import('./seed')

    await ensureMovimientoEpisodioIdColumnDropped()
    await ensureMovimientoEpisodioIdColumnDropped()

    const info = await db.$client.execute("PRAGMA table_info('infra_movimiento')")
    const columnas = info.rows.map((r) => String(r.name))
    expect(columnas).not.toContain('episodio_id')
  })
})

describe('ensureVerificacionPeriodoIdColumn', () => {
  // Recrea el esquema legacy del batch E1 (infra_episodio + infra_verificacion
  // con episodio_id) para ejercitar la migración de una base real que ya
  // tenía episodios y verificaciones cargados.
  async function recrearEsquemaLegacy() {
    const db = getDb()
    await db.$client.executeMultiple(`
      PRAGMA foreign_keys = OFF;
      DROP TABLE IF EXISTS \`infra_verificacion_evento\`;
      DROP TABLE IF EXISTS \`infra_verificacion\`;
      DROP TABLE IF EXISTS \`infra_episodio\`;
      CREATE TABLE \`infra_episodio\` (
        \`id\` text PRIMARY KEY NOT NULL,
        \`periodo_id\` text NOT NULL,
        \`nombre\` text NOT NULL,
        \`descripcion\` text,
        \`estado\` text NOT NULL,
        \`abierto_en\` text NOT NULL,
        \`cerrado_en\` text,
        \`creada_en\` text NOT NULL,
        \`actualizada_en\` text NOT NULL
      );
      CREATE TABLE \`infra_verificacion\` (
        \`id\` text PRIMARY KEY NOT NULL,
        \`episodio_id\` text NOT NULL,
        \`cue_anexo\` text NOT NULL,
        \`estado\` text NOT NULL,
        \`solicitada_en\` text NOT NULL,
        \`solicitada_por_user_id\` text NOT NULL,
        \`vencimiento_en\` text,
        \`resultado\` text,
        \`discrepancia\` integer DEFAULT 0 NOT NULL,
        \`respondida_en\` text,
        \`respondida_canal\` text,
        \`respondida_por_user_id\` text,
        \`movimiento_id\` text,
        \`cancelada_en\` text,
        \`cancelada_por_user_id\` text,
        \`motivo_cancelacion\` text,
        \`token_hash\` text NOT NULL,
        \`token_expira_en\` text NOT NULL,
        \`token_revocado_en\` text,
        \`token_consumido_en\` text,
        \`creada_en\` text NOT NULL,
        \`actualizada_en\` text NOT NULL
      );
      CREATE TABLE \`infra_verificacion_evento\` (
        \`id\` text PRIMARY KEY NOT NULL,
        \`verificacion_id\` text NOT NULL,
        \`tipo\` text NOT NULL,
        \`actor_tipo\` text NOT NULL,
        \`actor_user_id\` text,
        \`canal\` text,
        \`motivo\` text,
        \`correlacion_id\` text,
        \`creada_en\` text NOT NULL,
        FOREIGN KEY (\`verificacion_id\`) REFERENCES \`infra_verificacion\`(\`id\`) ON DELETE CASCADE
      );
      PRAGMA foreign_keys = ON;
    `)
  }

  it('backfillea periodo_id desde infra_episodio.periodo_id y preserva el resto de las columnas', async () => {
    const db = getDb()
    const { ensureVerificacionPeriodoIdColumn } = await import('./seed')

    await recrearEsquemaLegacy()
    await db.insert(infraPeriodo).values({
      id: 'periodo-migracion-test',
      nombre: 'Período migración',
      inicioEn: '2026-01-01T00:00:00.000Z',
      finEn: null,
      estado: 'historico',
      creadaEn: '2026-01-01T00:00:00.000Z',
    })
    await db.$client.execute({
      sql: `INSERT INTO infra_episodio (id, periodo_id, nombre, descripcion, estado, abierto_en, cerrado_en, creada_en, actualizada_en)
            VALUES ('episodio-migracion-1', 'periodo-migracion-test', 'Episodio a migrar', NULL, 'abierto', '2026-01-01T00:00:00.000Z', NULL, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
    })
    await db.$client.execute({
      sql: `INSERT INTO infra_verificacion (
              id, episodio_id, cue_anexo, estado, solicitada_en, solicitada_por_user_id,
              vencimiento_en, resultado, discrepancia, respondida_en, respondida_canal,
              respondida_por_user_id, movimiento_id, cancelada_en, cancelada_por_user_id,
              motivo_cancelacion, token_hash, token_expira_en, token_revocado_en,
              token_consumido_en, creada_en, actualizada_en
            ) VALUES (
              'verificacion-migracion-1', 'episodio-migracion-1', '1801605-09', 'pendiente',
              '2026-01-01T00:00:00.000Z', 'user-director', NULL, NULL, 0, NULL, NULL, NULL,
              NULL, NULL, NULL, NULL, ?, '2026-02-01T00:00:00.000Z', NULL, NULL,
              '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
            )`,
      args: ['b'.repeat(64)],
    })

    await ensureVerificacionPeriodoIdColumn()

    const info = await db.$client.execute("PRAGMA table_info('infra_verificacion')")
    const columnas = info.rows.map((r) => String(r.name))
    expect(columnas).toContain('periodo_id')
    expect(columnas).not.toContain('episodio_id')

    const fila = await db.$client.execute({
      sql: 'SELECT id, periodo_id, cue_anexo, token_hash FROM infra_verificacion WHERE id = ?',
      args: ['verificacion-migracion-1'],
    })
    expect(fila.rows).toHaveLength(1)
    expect(fila.rows[0]?.periodo_id).toBe('periodo-migracion-test')
    expect(fila.rows[0]?.cue_anexo).toBe('1801605-09')
    expect(fila.rows[0]?.token_hash).toBe('b'.repeat(64))
  })

  it('cae al período vigente cuando la referencia a infra_episodio está rota', async () => {
    const db = getDb()
    const { ensureVerificacionPeriodoIdColumn, PERIODO_ENOS_2026_2027_ID } = await import('./seed')

    await recrearEsquemaLegacy()
    // Sin fila en infra_episodio para este episodio_id: referencia huérfana.
    await db.$client.execute({
      sql: `INSERT INTO infra_verificacion (
              id, episodio_id, cue_anexo, estado, solicitada_en, solicitada_por_user_id,
              vencimiento_en, resultado, discrepancia, respondida_en, respondida_canal,
              respondida_por_user_id, movimiento_id, cancelada_en, cancelada_por_user_id,
              motivo_cancelacion, token_hash, token_expira_en, token_revocado_en,
              token_consumido_en, creada_en, actualizada_en
            ) VALUES (
              'verificacion-huerfana-1', 'episodio-inexistente', '1801605-10', 'pendiente',
              '2026-01-01T00:00:00.000Z', 'user-director', NULL, NULL, 0, NULL, NULL, NULL,
              NULL, NULL, NULL, NULL, ?, '2026-02-01T00:00:00.000Z', NULL, NULL,
              '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
            )`,
      args: ['c'.repeat(64)],
    })

    await ensureVerificacionPeriodoIdColumn()

    const fila = await db.$client.execute({
      sql: 'SELECT periodo_id FROM infra_verificacion WHERE id = ?',
      args: ['verificacion-huerfana-1'],
    })
    expect(fila.rows).toHaveLength(1)
    expect(fila.rows[0]?.periodo_id).toBe(PERIODO_ENOS_2026_2027_ID)
  })

  it('es un no-op sobre una base que ya está migrada (sin episodio_id)', async () => {
    const db = getDb()
    const { ensureVerificacionPeriodoIdColumn } = await import('./seed')

    // beforeAll ya corrió ensureSeeded, así que la base ya está en el esquema
    // nuevo: no debería lanzar ni tocar nada.
    await expect(ensureVerificacionPeriodoIdColumn()).resolves.toBeUndefined()

    const info = await db.$client.execute("PRAGMA table_info('infra_verificacion')")
    const columnas = info.rows.map((r) => String(r.name))
    expect(columnas).toContain('periodo_id')
    expect(columnas).not.toContain('episodio_id')
  })
})

// Regresión del bug real reportado: seedHub() corre HUB_DDL completo (que
// declara CREATE INDEX sobre infra_verificacion.periodo_id) ANTES de
// ensureVerificacionPeriodoIdColumn() (la migración que crea esa columna
// sobre una base batch E1). Los tests de arriba llaman a
// ensureVerificacionPeriodoIdColumn() de forma aislada y nunca ejercitan ese
// orden, así que no detectaban que en una base E1 real (todavía con
// episodio_id, sin periodo_id) el CREATE INDEX de HUB_DDL fallaba con
// "SQLITE_ERROR: no such column: periodo_id" y abortaba el resto del script
// completo: la app no arrancaba sobre ninguna base creada durante E1.
//
// Este bloque arma, con el cliente de libsql directo (sin pasar por
// getDb()), una base nueva con el esquema E1 exacto (extraído de
// `git show 5e9c09f:lib/db/seed.ts`: infra_periodo, infra_episodio,
// infra_movimiento e infra_verificacion con episodio_id) y una fila real en
// infra_verificacion. Después apunta un DATA_DIR nuevo a esa base y corre el
// camino real de arranque (ensureSeeded → seedHub → HUB_DDL → los ensure*)
// con un módulo `./seed` fresco (vi.resetModules(), ya que getDb() memoiza
// la conexión a nivel de módulo y auth.ts la resuelve en tiempo de import).
describe('seedHub sobre una base real creada en el batch E1', () => {
  it('arranca sin romperse y backfillea periodo_id sobre infra_verificacion', async () => {
    const e1Dir = mkdtempSync(path.join(tmpdir(), 'seed-ddl-e1-'))
    const prevDataDirLocal = process.env.DATA_DIR
    try {
      const dbPath = path.join(e1Dir, 'hub.sqlite')
      const legacyClient = createClient({ url: `file:${dbPath}` })
      try {
        // Esquema E1 exacto (git show 5e9c09f:lib/db/seed.ts), acotado a las
        // tablas que ensureVerificacionPeriodoIdColumn necesita leer/migrar.
        await legacyClient.executeMultiple(`
PRAGMA foreign_keys = OFF;
CREATE TABLE \`infra_periodo\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`nombre\` text NOT NULL,
  \`inicio_en\` text NOT NULL,
  \`fin_en\` text,
  \`estado\` text NOT NULL,
  \`creada_en\` text NOT NULL
);
CREATE TABLE \`infra_parte\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`periodo_id\` text NOT NULL,
  \`cue_anexo\` text NOT NULL,
  \`estado_establecimiento\` text DEFAULT 'habitual' NOT NULL,
  \`estado_establecimiento_rige_desde\` text NOT NULL,
  \`corte_id\` integer NOT NULL,
  \`creada_en\` text NOT NULL,
  \`actualizada_en\` text NOT NULL,
  FOREIGN KEY (\`periodo_id\`) REFERENCES \`infra_periodo\`(\`id\`)
);
CREATE TABLE \`infra_movimiento\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`parte_id\` text NOT NULL,
  \`tipo\` text NOT NULL,
  \`rol\` text NOT NULL,
  \`resumen\` text NOT NULL,
  \`rige_desde\` text NOT NULL,
  \`creada_en\` text NOT NULL,
  \`idempotency_key\` text,
  \`episodio_id\` text,
  FOREIGN KEY (\`parte_id\`) REFERENCES \`infra_parte\`(\`id\`) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS \`infra_movimiento_parte_id_idx\` ON \`infra_movimiento\` (\`parte_id\`);
CREATE UNIQUE INDEX IF NOT EXISTS \`infra_movimiento_idempotency_key_uidx\` ON \`infra_movimiento\` (\`idempotency_key\`);
CREATE TABLE \`infra_episodio\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`periodo_id\` text NOT NULL,
  \`nombre\` text NOT NULL,
  \`descripcion\` text,
  \`estado\` text NOT NULL,
  \`abierto_en\` text NOT NULL,
  \`cerrado_en\` text,
  \`creada_en\` text NOT NULL,
  \`actualizada_en\` text NOT NULL,
  FOREIGN KEY (\`periodo_id\`) REFERENCES \`infra_periodo\`(\`id\`)
);
CREATE TABLE \`infra_verificacion\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`episodio_id\` text NOT NULL,
  \`cue_anexo\` text NOT NULL,
  \`estado\` text NOT NULL,
  \`solicitada_en\` text NOT NULL,
  \`solicitada_por_user_id\` text NOT NULL,
  \`vencimiento_en\` text,
  \`resultado\` text,
  \`discrepancia\` integer DEFAULT 0 NOT NULL,
  \`respondida_en\` text,
  \`respondida_canal\` text,
  \`respondida_por_user_id\` text,
  \`movimiento_id\` text,
  \`cancelada_en\` text,
  \`cancelada_por_user_id\` text,
  \`motivo_cancelacion\` text,
  \`token_hash\` text NOT NULL,
  \`token_expira_en\` text NOT NULL,
  \`token_revocado_en\` text,
  \`token_consumido_en\` text,
  \`creada_en\` text NOT NULL,
  \`actualizada_en\` text NOT NULL,
  FOREIGN KEY (\`episodio_id\`) REFERENCES \`infra_episodio\`(\`id\`),
  FOREIGN KEY (\`movimiento_id\`) REFERENCES \`infra_movimiento\`(\`id\`)
);
PRAGMA foreign_keys = ON;
`)

        await legacyClient.execute({
          sql: `INSERT INTO infra_periodo (id, nombre, inicio_en, fin_en, estado, creada_en)
                VALUES ('periodo-e1', 'Protocolo E1', '2025-01-01T00:00:00.000Z', NULL, 'vigente', '2025-01-01T00:00:00.000Z')`,
        })
        await legacyClient.execute({
          sql: `INSERT INTO infra_episodio (
                  id, periodo_id, nombre, descripcion, estado, abierto_en, cerrado_en,
                  creada_en, actualizada_en
                ) VALUES (
                  'episodio-e1', 'periodo-e1', 'Episodio E1', NULL, 'abierto',
                  '2025-01-01T00:00:00.000Z', NULL, '2025-01-01T00:00:00.000Z',
                  '2025-01-01T00:00:00.000Z'
                )`,
        })
        await legacyClient.execute({
          sql: `INSERT INTO infra_verificacion (
                  id, episodio_id, cue_anexo, estado, solicitada_en, solicitada_por_user_id,
                  vencimiento_en, resultado, discrepancia, respondida_en, respondida_canal,
                  respondida_por_user_id, movimiento_id, cancelada_en, cancelada_por_user_id,
                  motivo_cancelacion, token_hash, token_expira_en, token_revocado_en,
                  token_consumido_en, creada_en, actualizada_en
                ) VALUES (
                  'verificacion-e1', 'episodio-e1', '1801605-09', 'pendiente',
                  '2025-01-01T00:00:00.000Z', 'user-director', NULL, NULL, 0, NULL, NULL,
                  NULL, NULL, NULL, NULL, NULL, ?, '2025-02-01T00:00:00.000Z', NULL, NULL,
                  '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z'
                )`,
          args: ['e'.repeat(64)],
        })
      } finally {
        legacyClient.close()
      }

      // auth.ts llama a getDb() en tiempo de import, y getDb() memoiza la
      // conexión a nivel de módulo: hace falta un registro de módulos
      // limpio para que el DATA_DIR nuevo tome efecto en un getDb() propio.
      vi.resetModules()
      process.env.DATA_DIR = e1Dir
      const { ensureSeeded } = await import('./seed')
      const { getDb: getDbFresh } = await import('./index')

      await expect(ensureSeeded()).resolves.toBeUndefined()

      const freshDb = getDbFresh()
      const columnas = (
        await freshDb.$client.execute("PRAGMA table_info('infra_verificacion')")
      ).rows.map((r) => String(r.name))
      expect(columnas).toContain('periodo_id')
      expect(columnas).not.toContain('episodio_id')

      const fila = await freshDb.$client.execute({
        sql: 'SELECT periodo_id, cue_anexo, token_hash FROM infra_verificacion WHERE id = ?',
        args: ['verificacion-e1'],
      })
      expect(fila.rows).toHaveLength(1)
      expect(fila.rows[0]?.periodo_id).toBe('periodo-e1')
      expect(fila.rows[0]?.cue_anexo).toBe('1801605-09')
      expect(fila.rows[0]?.token_hash).toBe('e'.repeat(64))

      const indices = await freshDb.$client.execute(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'infra_verificacion'",
      )
      expect(indices.rows.map((r) => String(r.name))).toContain(
        'infra_verificacion_periodo_id_idx',
      )
    } finally {
      vi.resetModules()
      if (prevDataDirLocal === undefined) delete process.env.DATA_DIR
      else process.env.DATA_DIR = prevDataDirLocal
      rmSync(e1Dir, { recursive: true, force: true })
    }
  })
})
