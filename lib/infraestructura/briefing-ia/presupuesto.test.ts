// Tests de integración de la reserva atómica de presupuesto mensual (E8)
// contra una base libsql real, aislada en un tmpdir (mismo patrón que
// repositorio.test.ts / job-run.test.ts).
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
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

// El test de arriba ('con dos reservas CONCURRENTES...') corre las dos
// reservas contra la MISMA conexión memoizada por getDb() (un solo proceso,
// una sola conexión libsql): demuestra que el WHERE condicionado del UPDATE
// funciona bajo dos promesas concurrentes del mismo cliente, pero no prueba
// nada sobre DOS conexiones físicas distintas al mismo archivo — que es el
// escenario real de dos requests/procesos (ver el comentario de arriba de
// este archivo, y el mismo patrón en
// lib/infraestructura/riesgo/job-run.test.ts, 'adquirirLease reintenta ante
// un lock real de otra conexión'). Este test agrega esa segunda conexión
// NATIVA (@libsql/client) contra el mismo hub.sqlite, ejecutando a mano el
// mismo UPDATE condicionado que reservarPresupuestoMesIntento (ver
// presupuesto.ts): si el invariante dependiera de un mutex en memoria de un
// solo proceso, esta segunda conexión lo evadiría y ambas reservas
// procederían.
describe('reservarPresupuestoMes con una SEGUNDA conexión física real', () => {
  it('dos conexiones distintas al mismo archivo, compitiendo por el mismo mes, sólo una reserva procede al superar el techo', async () => {
    const { createClient } = await import('@libsql/client')
    const { getSqlitePath } = await import('@/lib/data-dir')

    // Crea la fila del mes con acumulado 0 (reserva "nula") ANTES de la
    // carrera: así ambas conexiones compiten sobre el mismo UPDATE
    // condicionado, no sobre el INSERT inicial.
    const creacion = await reservarPresupuestoMes({
      montoReservaUsd: 0,
      presupuestoUsdMes: 5,
      ahora: AHORA,
    })
    expect(creacion.reservado).toBe(true)
    const mes = creacion.mes

    // Segunda conexión NATIVA al mismo archivo hub.sqlite (no la memoizada
    // por getDb() de este proceso de test), ejecutando el MISMO UPDATE
    // condicionado por WHERE que reservarPresupuestoMesIntento: nunca a
    // partir de un select previo, la condición se evalúa en el momento del
    // UPDATE.
    const otraConexion = createClient({ url: `file:${getSqlitePath()}` })

    try {
      const [resultadoA, resultadoOtraConexion] = await Promise.all([
        reservarPresupuestoMes({ montoReservaUsd: 3, presupuestoUsdMes: 5, ahora: AHORA }),
        otraConexion.execute({
          sql: `UPDATE infra_briefing_presupuesto_mes
                SET acumulado_usd = acumulado_usd + 3, actualizada_en = ?
                WHERE mes = ? AND acumulado_usd + 3 <= 5`,
          args: [new Date(AHORA.getTime() + 1_000).toISOString(), mes],
        }),
      ])

      const procedioA = resultadoA.reservado === true
      const procedioOtraConexion = resultadoOtraConexion.rowsAffected > 0

      // Exactamente una de las dos reservas de 3 USD procede: juntas (3+3=6)
      // superarían el techo de 5, y el UPDATE condicionado de CADA conexión
      // sólo aplica si, EN ESE MOMENTO, el acumulado + 3 sigue sin superar el
      // techo — nunca a partir de un valor leído antes de la carrera.
      expect([procedioA, procedioOtraConexion].filter(Boolean)).toHaveLength(1)

      const [fila] = await getDb().select().from(infraBriefingPresupuestoMes)
      expect(fila?.acumuladoUsd).toBe(3)
    } finally {
      otraConexion.close()
    }
  })
})
