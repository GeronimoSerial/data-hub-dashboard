// Tests de integración de la reserva atómica de presupuesto mensual (E8).
//
// Por defecto corren sobre PGlite en memoria (getDb() sin DATABASE_URL, ver
// lib/db/index.ts). El único test que NO corre así es el de concurrencia real
// entre dos conexiones físicas, gateado por DATABASE_URL_TEST. Cómo correrlo:
//
//   1. Levantar un Postgres local con podman:
//        podman run --rm -d --name enos-pg \
//          -p 55432:5432 \
//          -e POSTGRES_USER=enos_test \
//          -e POSTGRES_PASSWORD=enos_test_local_only \
//          -e POSTGRES_DB=enos_db1_f3 \
//          postgres:16
//   2. Exportar la URL antes de correr vitest:
//        export DATABASE_URL_TEST='postgresql://enos_test:enos_test_local_only@localhost:55432/enos_db1_f3'
//        pnpm vitest run lib/infraestructura/briefing-ia/presupuesto.test.ts
//
// Sin DATABASE_URL_TEST ese describe se saltea con motivo explícito y la
// suite normal sigue corriendo 100% sobre PGlite en memoria, sin Docker.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Pool } from 'pg'
import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { infraBriefingPresupuestoMes } from '@/lib/db/schema'
import { ajustarPresupuestoMes, inicioMesUtc, reservarPresupuestoMes } from './presupuesto'

let dir: string
let prevDataDir: string | undefined

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'briefing-presupuesto-'))
  prevDataDir = process.env.DATA_DIR
  process.env.DATA_DIR = dir

  const { ensureSeeded } = await import('@/lib/db/seed')
  await ensureSeeded()
})

afterAll(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  rmSync(dir, { recursive: true, force: true })
})

beforeEach(async () => {
  await getDb().delete(infraBriefingPresupuestoMes)
})

const AHORA = new Date('2026-09-15T12:00:00.000Z')

describe('reservarPresupuestoMes', () => {
  it('reserva simple sobre un mes limpio', async () => {
    const resultado = await reservarPresupuestoMes({
      montoReservaUsd: 1,
      presupuestoUsdMes: 5,
      ahora: AHORA,
    })
    expect(resultado.reservado).toBe(true)
    expect(resultado.mes).toBe(inicioMesUtc(AHORA))
  })

  it('acumula reservas secuenciales que no superan el techo', async () => {
    const r1 = await reservarPresupuestoMes({ montoReservaUsd: 2, presupuestoUsdMes: 5, ahora: AHORA })
    const r2 = await reservarPresupuestoMes({ montoReservaUsd: 2, presupuestoUsdMes: 5, ahora: AHORA })
    expect(r1.reservado).toBe(true)
    expect(r2.reservado).toBe(true)

    // La tercera reserva (2+2+2=6 > 5) debe rechazarse: confirma que el
    // acumulado quedó en 4, no en 0 ni en otro valor.
    const r3 = await reservarPresupuestoMes({ montoReservaUsd: 2, presupuestoUsdMes: 5, ahora: AHORA })
    expect(r3.reservado).toBe(false)
  })

  it('rechaza una reserva que por sí sola ya excede el techo y no deja rastro', async () => {
    const resultado = await reservarPresupuestoMes({
      montoReservaUsd: 10,
      presupuestoUsdMes: 5,
      ahora: AHORA,
    })
    expect(resultado.reservado).toBe(false)

    const filas = await getDb().select().from(infraBriefingPresupuestoMes)
    expect(filas).toHaveLength(0)
  })

  it('con dos reservas CONCURRENTES que juntas superan el techo, sólo una procede', async () => {
    const [r1, r2] = await Promise.all([
      reservarPresupuestoMes({ montoReservaUsd: 3, presupuestoUsdMes: 5, ahora: AHORA }),
      reservarPresupuestoMes({ montoReservaUsd: 3, presupuestoUsdMes: 5, ahora: AHORA }),
    ])
    const exitosas = [r1, r2].filter((r) => r.reservado === true)
    expect(exitosas).toHaveLength(1)

    const [fila] = await getDb().select().from(infraBriefingPresupuestoMes)
    expect(fila?.acumuladoUsd).toBe(3)
  })
})

describe('ajustarPresupuestoMes', () => {
  it('corrige el acumulado con el costo real (delta negativo reduce lo reservado)', async () => {
    const reserva = await reservarPresupuestoMes({
      montoReservaUsd: 2,
      presupuestoUsdMes: 5,
      ahora: AHORA,
    })
    expect(reserva.reservado).toBe(true)
    if (reserva.reservado) {
      await ajustarPresupuestoMes({ mes: reserva.mes, deltaUsd: -1.5, ahora: AHORA })
    }

    // El acumulado bajó de 2 a 0.5: una reserva de 0.4 entra en un techo de 1
    // (0.5 + 0.4 <= 1), lo que sólo es cierto si el ajuste se aplicó.
    const siguiente = await reservarPresupuestoMes({
      montoReservaUsd: 0.4,
      presupuestoUsdMes: 1,
      ahora: AHORA,
    })
    expect(siguiente.reservado).toBe(true)

    const [fila] = await getDb().select().from(infraBriefingPresupuestoMes)
    expect(fila?.acumuladoUsd).toBeCloseTo(0.9, 10)
  })
})

// TEST 1 — concurrencia REAL contra Postgres con dos conexiones
// independientes. Reemplaza al viejo test que abría una segunda conexión
// @libsql/client contra un archivo hub.sqlite suelto: ese archivo NUNCA era
// la base que usa reservarPresupuestoMes (getDb() va a PGlite en memoria bajo
// Vitest, o a Postgres con DATABASE_URL), así que su UPDATE no competía
// contra nada real y el test era un falso positivo. Acá las dos conexiones
// son dos pg.Pool distintos contra la MISMA base real: se migra una sola vez
// y luego se lanzan ambas reservas en paralelo. El CAS del UPDATE
// condicionado por WHERE —que Postgres re-evalúa tras el lock de fila—
// exige exactamente un ganador, sin importar cuál gane la carrera.
describe('reservarPresupuestoMes concurrencia real entre dos conexiones Postgres', () => {
  it.skipIf(!process.env.DATABASE_URL_TEST)(
    'dos conexiones independientes compiten por el mismo mes: exactamente una reserva procede al superar el techo — se saltea si no está seteada DATABASE_URL_TEST (requiere un Postgres real)',
    async () => {
      const databaseUrlTest = process.env.DATABASE_URL_TEST
      if (!databaseUrlTest) throw new Error('unreachable: gateado por it.skipIf')

      const prevDatabaseUrl = process.env.DATABASE_URL
      process.env.DATABASE_URL = databaseUrlTest
      let poolA: Pool | undefined
      let poolB: Pool | undefined
      let getDbA: (() => ReturnType<typeof getDb>) | undefined
      let mes: string | undefined
      try {
        // Cada vi.resetModules() + import reconstruye lib/db, así que su
        // memoización de la conexión arranca de cero: dos getDb() distintos,
        // cada uno con su propio pg.Pool (drizzle-orm/node-postgres) contra
        // la MISMA base real.
        vi.resetModules()
        const dbModuleA = await import('@/lib/db')
        getDbA = dbModuleA.getDb
        poolA = dbModuleA.getRawClient() as Pool
        const { reservarPresupuestoMes: reservarA } = await import('./presupuesto')

        vi.resetModules()
        const dbModuleB = await import('@/lib/db')
        poolB = dbModuleB.getRawClient() as Pool
        const { reservarPresupuestoMes: reservarB } = await import('./presupuesto')

        expect(poolA).not.toBe(poolB)

        // El esquema se migra una sola vez (migrarDb es idempotente); la
        // segunda conexión comparte la misma base ya migrada.
        await dbModuleA.migrarDb()

        // Mes único derivado del timestamp (más jitter) para no chocar ni con
        // otras corridas ni con filas de otras suites en la base compartida.
        const ahora = new Date(
          Date.UTC(
            2000 + (Date.now() % 6000),
            Math.floor(Math.random() * 12),
            15,
            12,
          ),
        )
        mes = inicioMesUtc(ahora)

        // Limpia cualquier fila previa de ESE mes (por si una corrida anterior
        // quedó a medias) y luego lo siembra con acumulado 0 usando la conexión
        // A ANTES de la carrera: así ambas conexiones compiten sobre el mismo
        // UPDATE condicionado, no sobre el INSERT inicial.
        await getDbA().delete(infraBriefingPresupuestoMes).where(eq(infraBriefingPresupuestoMes.mes, mes))
        const creacion = await reservarA({ montoReservaUsd: 0, presupuestoUsdMes: 5, ahora })
        expect(creacion.reservado).toBe(true)
        expect(creacion.mes).toBe(mes)

        const [resultadoA, resultadoB] = await Promise.all([
          reservarA({ montoReservaUsd: 3, presupuestoUsdMes: 5, ahora }),
          reservarB({ montoReservaUsd: 3, presupuestoUsdMes: 5, ahora }),
        ])

        // Exactamente una reserva de 3 USD procede: juntas (3+3=6) superarían
        // el techo de 5, y el UPDATE condicionado de CADA conexión sólo aplica
        // si, EN ESE MOMENTO (bajo el lock de fila), el acumulado + 3 sigue
        // sin superar el techo.
        const ganadores = [resultadoA, resultadoB].filter((r) => r.reservado)
        expect(ganadores).toHaveLength(1)

        const [fila] = await getDbA()
          .select()
          .from(infraBriefingPresupuestoMes)
          .where(eq(infraBriefingPresupuestoMes.mes, mes))
        expect(fila?.acumuladoUsd).toBe(3)
      } finally {
        // Limpieza best-effort antes de cerrar los pools.
        if (getDbA && mes) {
          try {
            await getDbA()
              .delete(infraBriefingPresupuestoMes)
              .where(eq(infraBriefingPresupuestoMes.mes, mes))
          } catch {
            // si la conexión ya no sirve, no enmascarar el resultado del test
          }
        }
        if (poolA) await poolA.end()
        if (poolB) await poolB.end()
        if (prevDatabaseUrl === undefined) delete process.env.DATABASE_URL
        else process.env.DATABASE_URL = prevDatabaseUrl
        vi.resetModules()
      }
    },
  )
})
