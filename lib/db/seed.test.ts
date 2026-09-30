import { count, eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { crearEjecutorSql } from '@/lib/infraestructura/ge-db'
import { getDb, getRawClient, migrarDb } from './index'
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

usarDbTemporal('seed-ddl-', { seed: false })

beforeAll(async () => {
  const { ensureSeeded } = await import('./seed')
  await ensureSeeded()
})

// Una sola base para todo el archivo: getDb() memoiza la conexión a nivel de
// módulo, así que crear un directorio nuevo por test dejaría al segundo test
// escribiendo contra un archivo que el primero ya borró.
// Deuda heredada de B3: las migraciones versionadas de drizzle-kit corren
// sobre una base ya poblada en cada arranque (ensureSeeded), y cada migración
// nueva que agrega tablas corre el mismo riesgo de romper esa garantía sin que
// ningún test lo note. Este es el test de regresión que faltaba: puebla la
// base, reaplica las migraciones dos veces más sobre ella, y verifica que ni
// una fila se pierde ni se duplica. `migrarDb()` es idempotente (drizzle lleva
// su propia tabla de migraciones aplicadas y no reejecuta lo ya aplicado), así
// que reaplicarla no debe cambiar ningún conteo.
describe('migración inicial sobre una base ya poblada', () => {
  it('no pierde filas y no duplica nada al reaplicarse dos veces', async () => {
    const db = getDb()

    const [nivelesAntes] = await db.select({ n: count() }).from(niveles)
    const [tiposAntes] = await db.select({ n: count() }).from(tipos)
    const [categoriasAntes] = await db.select({ n: count() }).from(categorias)
    const [tagsAntes] = await db.select({ n: count() }).from(tags)
    const [recursosAntes] = await db.select({ n: count() }).from(recursos)
    const [infraJobRunAntes] = await db.select({ n: count() }).from(infraJobRun)

    await migrarDb()
    await migrarDb()

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

  it('preserva filas de las tablas de permiso y log nominal al reaplicarse', async () => {
    const ejecutor = crearEjecutorSql(getRawClient())

    await ejecutor.execute({
      sql: `INSERT INTO infra_permiso_nominal (id, user_id, otorgado_por, otorgado_en, vence_en)
            VALUES ('p1', 'u1', 'admin1', '2026-01-01T00:00:00Z', '2026-12-31T00:00:00Z')`,
    })
    await ejecutor.execute({
      sql: `INSERT INTO infra_acceso_nominal_log (id, user_id, afectacion_id, cantidad, consultado_en)
            VALUES ('l1', 'u1', 'afect1', 3, '2026-01-02T00:00:00Z')`,
    })

    await migrarDb()

    const permisos = await ejecutor.execute('SELECT * FROM infra_permiso_nominal')
    const logs = await ejecutor.execute('SELECT * FROM infra_acceso_nominal_log')
    expect(permisos.rows).toHaveLength(1)
    expect(logs.rows).toHaveLength(1)
  })

  it('preserva las filas de infra_motivo (semilla y agregados por un admin) al reaplicarse', async () => {
    const ejecutor = crearEjecutorSql(getRawClient())

    await ejecutor.execute({
      sql: `INSERT INTO infra_motivo (id, nombre, categoria, orden) VALUES ('propio-admin', 'Corte de ruta', 'establecimiento', 50)`,
    })

    await migrarDb()
    await migrarDb()

    const motivos = await ejecutor.execute('SELECT * FROM infra_motivo')
    expect(motivos.rows.some((r) => r.id === 'propio-admin')).toBe(true)
  })
})

describe('ensureMotivoNombreUnico', () => {
  // Una base sembrada con la versión anterior tiene los dos comodines
  // llamados "Otro". Eso rompe resolverCategoria y además impide crear el
  // índice único, así que el renombre tiene que correr antes.
  it('renombra los comodines heredados y luego impone el nombre único', async () => {
    const { ensureMotivoNombreUnico, MOTIVOS_SEED } = await import(
      '@/lib/infraestructura/motivos'
    )
    const ejecutor = crearEjecutorSql(getRawClient())

    await ejecutor.execute('DROP INDEX IF EXISTS infra_motivo_nombre_unico')
    for (const id of ['otro-establecimiento', 'otro-alumnos']) {
      await ejecutor.execute({
        sql: `INSERT INTO infra_motivo (id, nombre, categoria, orden)
              VALUES (?, 'Otro', 'establecimiento', 90)
              ON CONFLICT(id) DO UPDATE SET nombre = 'Otro'`,
        args: [id],
      })
    }

    await ensureMotivoNombreUnico()
    await ensureMotivoNombreUnico()

    const filas = await ejecutor.execute(
      "SELECT id, nombre FROM infra_motivo WHERE id IN ('otro-establecimiento', 'otro-alumnos')",
    )
    const porId = new Map(filas.rows.map((r) => [String(r.id), String(r.nombre)]))
    const esperado = new Map(MOTIVOS_SEED.map((m) => [m.id, m.nombre]))
    expect(porId.get('otro-establecimiento')).toBe(esperado.get('otro-establecimiento'))
    expect(porId.get('otro-alumnos')).toBe(esperado.get('otro-alumnos'))
    expect(porId.get('otro-establecimiento')).not.toBe(porId.get('otro-alumnos'))
  })

  it('la base rechaza dos motivos con el mismo nombre', async () => {
    const { ensureMotivoNombreUnico } = await import('@/lib/infraestructura/motivos')
    const ejecutor = crearEjecutorSql(getRawClient())
    await ensureMotivoNombreUnico()

    await expect(
      ejecutor.execute({
        sql: `INSERT INTO infra_motivo (id, nombre, categoria, orden)
              VALUES ('duplicado', 'Anegamiento', 'establecimiento', 99)`,
      }),
    ).rejects.toThrow()
  })
})

// B1 de la trayectoria hidrometeorológica: modelo de período/parte. Ver
// docs/especificacion-funcional-trayectoria-evento-hidrometeorologico.md y el
// CONTRACT.md del batch de esquema.
describe('modelo de parte: tablas nuevas en la migración inicial', () => {
  it('la migración inicial crea infra_periodo/infra_parte/infra_afectacion y preserva sus filas al reaplicarse', async () => {
    const db = getDb()
    const ejecutor = crearEjecutorSql(getRawClient())

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

    await migrarDb()
    await migrarDb()

    const periodos = await ejecutor.execute(
      "SELECT * FROM infra_periodo WHERE id = 'periodo-ddl-test'",
    )
    const partes = await ejecutor.execute(
      "SELECT * FROM infra_parte WHERE id = 'parte-ddl-test'",
    )
    const afectaciones = await ejecutor.execute(
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

    const historicos = await crearEjecutorSql(getRawClient()).execute(
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
    const ejecutor = crearEjecutorSql(getRawClient())
    const tablas = await ejecutor.execute({
      sql: `SELECT tablename FROM pg_tables
            WHERE schemaname = 'public'
              AND tablename IN (?, ?, ?)`,
      args: [
        'infra_problematica',
        'infra_problematica_seccion',
        'infra_problematica_alumno',
      ],
    })
    expect(tablas.rows).toHaveLength(0)
  })
})

// E1 de la trayectoria ENOS: verificaciones. Misma garantía que el resto de
// la migración inicial: se instala en una base ya poblada y se reaplica sin
// perder filas.
describe('modelo de verificaciones: tablas nuevas en la migración inicial', () => {
  it('la migración inicial crea infra_verificacion/infra_verificacion_evento y preserva sus filas al reaplicarse dos veces', async () => {
    const db = getDb()
    const ejecutor = crearEjecutorSql(getRawClient())

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
      discrepancia: false,
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

    await migrarDb()
    await migrarDb()

    const verificaciones = await ejecutor.execute(
      "SELECT * FROM infra_verificacion WHERE id = 'verificacion-ddl-test'",
    )
    const eventos = await ejecutor.execute(
      "SELECT * FROM infra_verificacion_evento WHERE id = 'evento-ddl-test'",
    )
    expect(verificaciones.rows).toHaveLength(1)
    expect(verificaciones.rows[0]?.periodo_id).toBe('periodo-verificacion-test')
    expect(eventos.rows).toHaveLength(1)
  })
})

describe('recursos-por-usuario: esquema de datos', () => {
  it('user_recursos existe y user.acceso_recursos por defecto es "todos"', async () => {
    const ejecutor = crearEjecutorSql(getRawClient())

    const tablas = await ejecutor.execute({
      sql: `SELECT tablename FROM pg_tables
            WHERE schemaname = 'public'
              AND tablename = ?`,
      args: ['user_recursos'],
    })
    expect(tablas.rows).toHaveLength(1)

    const columnas = await ejecutor.execute({
      sql: `SELECT column_default FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = ?
              AND column_name = ?`,
      args: ['user', 'acceso_recursos'],
    })
    expect(columnas.rows).toHaveLength(1)
    expect(String(columnas.rows[0]?.column_default)).toContain('todos')
  })
})
