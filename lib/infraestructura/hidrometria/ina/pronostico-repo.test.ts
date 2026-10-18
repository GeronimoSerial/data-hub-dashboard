import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb, migrarDb } from '@/lib/db'
import { hidroInaCorrida, hidroInaPronostico, hidroLoteCrudo } from '@/lib/db/schema'
import corrida289 from '../__fixtures__/ina/corrida-289.json'
import { normalizarCorrida, parsearCorridaA5 } from './parser-pronostico-a5'
import { guardarCorridaIna, leerUltimaCorridaIna } from './pronostico-repo'

usarDbTemporal('ina-pronostico-repo-', { seed: false })

beforeAll(async () => {
  await migrarDb()
})

beforeEach(async () => {
  const db = getDb()
  await db.delete(hidroInaPronostico)
  await db.delete(hidroInaCorrida)
  await db.delete(hidroLoteCrudo)
})

function lote(corId: number, forecastDate: string, descargadoEn: string) {
  const json = JSON.parse(JSON.stringify(corrida289)) as typeof corrida289
  json.id = corId
  json.forecast_date = forecastDate
  for (const s of json.series) s.cor_id = corId
  const corrida = parsearCorridaA5(json, 289)
  return {
    calId: 289, corId, forecastDate: corrida.forecastDate, url: 'u', payload: json,
    sha256: `${corId}-${descargadoEn}`.padEnd(64, '0'), descargadoEn, filas: normalizarCorrida(corrida).filas,
  }
}

describe('repositorio de corridas INA', () => {
  it('reingestar la misma corrida no crea filas ni cambia forecast_date', async () => {
    const db = getDb()
    const r1 = await guardarCorridaIna(db, lote(10, '2026-10-16T03:00:00Z', '2026-10-17T00:00:00.000Z'))
    const r2 = await guardarCorridaIna(db, lote(10, '2026-10-17T03:00:00Z', '2026-10-18T00:00:00.000Z'))
    expect(r1).toEqual({ nueva: true, insertadas: 18 })
    expect(r2).toEqual({ nueva: false, insertadas: 0 })
    expect(await db.select().from(hidroInaPronostico)).toHaveLength(18)
    expect(await db.select().from(hidroLoteCrudo)).toHaveLength(1)
    const [c] = await db.select().from(hidroInaCorrida)
    expect(c).toMatchObject({ forecastDate: '2026-10-16T03:00:00.000Z', descargadoEn: '2026-10-17T00:00:00.000Z' })
  })

  it('una emisión vieja descargada después conserva su forecast_date y no pasa a ser la más nueva', async () => {
    const db = getDb()
    await guardarCorridaIna(db, lote(20, '2026-10-16T03:00:00.000Z', '2026-10-16T10:00:00.000Z'))
    await guardarCorridaIna(db, lote(5, '2026-10-01T03:00:00.000Z', '2026-10-17T10:00:00.000Z'))
    const ultima = await leerUltimaCorridaIna(db, 289, '2026-10-17T12:00:00.000Z')
    expect(ultima).toMatchObject({ corId: 20, forecastDate: '2026-10-16T03:00:00.000Z' })
    expect(ultima?.valores).toHaveLength(18)
    expect(ultima?.valores[0]).toMatchObject({ seriesId: 1540, estacionId: 'pna-corrientes', soporte: 'instantaneo' })
  })

  it('excluye corridas emitidas después de asOf', async () => {
    const db = getDb()
    await guardarCorridaIna(db, lote(5, '2026-10-01T03:00:00.000Z', '2026-10-01T10:00:00.000Z'))
    await guardarCorridaIna(db, lote(20, '2026-10-16T03:00:00.000Z', '2026-10-16T10:00:00.000Z'))
    expect(await leerUltimaCorridaIna(db, 289, '2026-10-10T00:00:00.000Z')).toMatchObject({ corId: 5 })
    expect(await leerUltimaCorridaIna(db, 289, '2026-09-30T00:00:00.000Z')).toBeNull()
    expect(await leerUltimaCorridaIna(db, 499, '2026-10-20T00:00:00.000Z')).toBeNull()
  })
})
