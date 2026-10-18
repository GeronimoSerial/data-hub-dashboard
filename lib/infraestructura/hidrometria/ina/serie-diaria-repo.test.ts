import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb, migrarDb } from '@/lib/db'
import { hidroLoteCrudo, hidroSerieDiaria } from '@/lib/db/schema'
import { guardarLoteSerieDiaria, leerSerieDiaria, ultimaFechaSerieDiaria } from './serie-diaria-repo'

usarDbTemporal('ina-serie-diaria-repo-', { seed: false })

beforeAll(async () => {
  await migrarDb()
})

beforeEach(async () => {
  await getDb().delete(hidroSerieDiaria)
  await getDb().delete(hidroLoteCrudo)
})

const lote = (filas: { fecha: string; valorM: number }[], sha = 'a'.repeat(64), descargadoEn = '2026-10-17T12:00:00.000Z') => ({
  estacionId: 'pna-corrientes',
  serieId: 19,
  url: 'https://alerta.ina.gob.ar/a5/obs/puntual/series/19/observaciones',
  payload: [{ marca: sha }],
  sha256: sha,
  descargadoEn,
  filas,
})

describe('serie diaria INA', () => {
  it('guarda el lote crudo una vez y es idempotente al reejecutar', async () => {
    const db = getDb()
    const filas = [{ fecha: '2026-10-10', valorM: 4.92 }, { fecha: '2026-10-11', valorM: 4.95 }]
    const r1 = await guardarLoteSerieDiaria(db, lote(filas))
    const r2 = await guardarLoteSerieDiaria(db, lote(filas, 'a'.repeat(64), '2026-10-18T12:00:00.000Z'))
    expect(r1).toEqual({ insertadas: 2, existentesIguales: 0, discrepancias: [] })
    expect(r2).toEqual({ insertadas: 0, existentesIguales: 2, discrepancias: [] })
    expect(await db.select().from(hidroLoteCrudo)).toHaveLength(1)
    const guardadas = await leerSerieDiaria(db, 'pna-corrientes', '2026-12-31')
    expect(guardadas).toEqual([
      { fecha: '2026-10-10', valorM: 4.92, serieId: 19, descargadoEn: '2026-10-17T12:00:00.000Z' },
      { fecha: '2026-10-11', valorM: 4.95, serieId: 19, descargadoEn: '2026-10-17T12:00:00.000Z' },
    ])
  })

  it('reporta un valor distinto para una fecha existente sin sobrescribirlo', async () => {
    const db = getDb()
    await guardarLoteSerieDiaria(db, lote([{ fecha: '2026-10-10', valorM: 4.92 }]))
    const r = await guardarLoteSerieDiaria(db, lote([{ fecha: '2026-10-10', valorM: 5.1 }, { fecha: '2026-10-12', valorM: 4.99 }], 'b'.repeat(64)))
    expect(r).toEqual({ insertadas: 1, existentesIguales: 0, discrepancias: [{ fecha: '2026-10-10', guardadoM: 4.92, nuevoM: 5.1 }] })
    const guardadas = await leerSerieDiaria(db, 'pna-corrientes', '2026-10-31')
    expect(guardadas.map((f) => [f.fecha, f.valorM])).toEqual([['2026-10-10', 4.92], ['2026-10-12', 4.99]])
  })

  it('corta por asOf inclusivo y no filtra fechas posteriores', async () => {
    const db = getDb()
    await guardarLoteSerieDiaria(db, lote([
      { fecha: '2026-10-10', valorM: 4.92 },
      { fecha: '2026-10-11', valorM: 4.95 },
      { fecha: '2026-10-12', valorM: 4.99 },
    ]))
    expect((await leerSerieDiaria(db, 'pna-corrientes', '2026-10-11')).map((f) => f.fecha)).toEqual(['2026-10-10', '2026-10-11'])
    expect(await leerSerieDiaria(db, 'pna-goya', '2026-10-11')).toEqual([])
    expect(await ultimaFechaSerieDiaria(db, 'pna-corrientes')).toBe('2026-10-12')
    expect(await ultimaFechaSerieDiaria(db, 'pna-goya')).toBeNull()
    expect(() => leerSerieDiaria(db, 'pna-corrientes', '11/10/2026')).toThrow()
  })
})
