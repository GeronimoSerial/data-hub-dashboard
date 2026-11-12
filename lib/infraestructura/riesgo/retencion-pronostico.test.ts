import { count, eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb } from '@/lib/db'
import { hazardForecast } from '@/lib/db/schema'
import { purgarPronosticoAntiguo } from './retencion-pronostico'

usarDbTemporal('retencion-pronostico-')

const AHORA = new Date('2026-11-11T12:00:00.000Z')
// Corte exacto con dias = 14: AHORA - 14 días.
const CORTE_14_DIAS = '2026-10-28T12:00:00.000Z'

function fila(id: string, corridaEn: string) {
  return {
    id,
    provider: 'open-meteo-ecmwf',
    variable: 'precipitacion',
    geometryRef: '-27.4_-58.8',
    corridaEn,
    validoEn: corridaEn,
    horizonteHoras: 0,
    valor: 1.5,
    unidad: 'mm',
    pasoHoras: 1,
    rawRef: null,
    ingeridoEn: corridaEn,
  }
}

async function ids(): Promise<string[]> {
  const filas = await getDb().select({ id: hazardForecast.id }).from(hazardForecast)
  return filas.map((f) => f.id).sort()
}

beforeAll(async () => {
  // Una sola vez para todo el archivo: la tabla arranca vacía por el seed.
  await getDb().delete(hazardForecast)
})

describe('purgarPronosticoAntiguo', () => {
  it('borra corridas anteriores al corte y conserva las iguales o posteriores', async () => {
    const db = getDb()
    await db.delete(hazardForecast)
    await db.insert(hazardForecast).values([
      fila('vieja', '2026-10-27T23:59:59.999Z'),
      fila('en-corte', CORTE_14_DIAS),
      fila('reciente', '2026-11-10T00:00:00.000Z'),
    ])

    const resultado = await purgarPronosticoAntiguo(db, { ahora: AHORA })

    expect(resultado).toEqual({ borradas: 1, lotes: 1, corte: CORTE_14_DIAS })
    expect(await ids()).toEqual(['en-corte', 'reciente'])
  })

  it('borra en lotes de tamanoLote hasta que un lote queda incompleto', async () => {
    const db = getDb()
    await db.delete(hazardForecast)
    await db.insert(hazardForecast).values(
      [1, 2, 3, 4, 5].map((n) => fila(`v${n}`, `2026-10-01T00:0${n}:00.000Z`)),
    )

    const resultado = await purgarPronosticoAntiguo(db, { ahora: AHORA, tamanoLote: 2 })

    expect(resultado.borradas).toBe(5)
    expect(resultado.lotes).toBe(3)
    expect(await ids()).toEqual([])
  })

  it('se detiene en maxLotes aunque queden filas antiguas', async () => {
    const db = getDb()
    await db.delete(hazardForecast)
    await db.insert(hazardForecast).values(
      [1, 2, 3, 4, 5].map((n) => fila(`m${n}`, `2026-10-01T00:0${n}:00.000Z`)),
    )

    const resultado = await purgarPronosticoAntiguo(db, {
      ahora: AHORA,
      tamanoLote: 2,
      maxLotes: 2,
    })

    expect(resultado.borradas).toBe(4)
    expect(resultado.lotes).toBe(2)
    const [{ restantes }] = await db.select({ restantes: count() }).from(hazardForecast)
    expect(restantes).toBe(1)
  })

  it.each([6, 0, -14, 1.5, Number.NaN])('rechaza dias=%s y no borra nada', async (dias) => {
    const db = getDb()
    await db.delete(hazardForecast)
    await db.insert(hazardForecast).values([fila('intacta', '2000-01-01T00:00:00.000Z')])

    await expect(purgarPronosticoAntiguo(db, { ahora: AHORA, dias })).rejects.toThrow()
    expect(await ids()).toEqual(['intacta'])
  })

  it('no toca filas de otras corridas cuando el corte es exacto (eq sobre corrida)', async () => {
    const db = getDb()
    await db.delete(hazardForecast)
    await db.insert(hazardForecast).values([fila('igual', CORTE_14_DIAS)])

    await purgarPronosticoAntiguo(db, { ahora: AHORA })

    const [fila1] = await db
      .select({ id: hazardForecast.id })
      .from(hazardForecast)
      .where(eq(hazardForecast.corridaEn, CORTE_14_DIAS))
    expect(fila1?.id).toBe('igual')
  })
})
