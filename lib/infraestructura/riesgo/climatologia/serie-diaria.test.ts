import { describe, expect, it } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb } from '@/lib/db'
import { hazardPrecipitacionSerie } from '@/lib/db/schema'
import {
  aniosDescargadosPorCelda,
  armarValoresAnio,
  diasDelAnio,
  guardarAnioSerie,
} from './serie-diaria'

usarDbTemporal('serie-diaria-')

describe('diasDelAnio', () => {
  it('distingue años bisiestos', () => {
    expect(diasDelAnio(2020)).toBe(366)
    expect(diasDelAnio(2019)).toBe(365)
    expect(diasDelAnio(1900)).toBe(365)
    expect(diasDelAnio(2000)).toBe(366)
  })
})

describe('armarValoresAnio', () => {
  it('ubica cada valor en su día del año y deja null los días sin dato', () => {
    const valores = armarValoresAnio(2019, ['2019-01-01', '2019-01-03', '2019-12-31'], [1.5, null, 7])
    expect(valores).toHaveLength(365)
    expect(valores[0]).toBe(1.5)
    expect(valores[1]).toBeNull()
    expect(valores[2]).toBeNull()
    expect(valores[364]).toBe(7)
  })

  it('ignora fechas fuera del año pedido', () => {
    const valores = armarValoresAnio(2019, ['2018-12-31', '2019-01-01'], [9, 2])
    expect(valores[0]).toBe(2)
    expect(valores.filter((v) => v !== null)).toEqual([2])
  })
})

describe('guardarAnioSerie', () => {
  it('re-descargar el mismo año de la misma celda actualiza la fila en vez de duplicarla', async () => {
    const db = getDb()
    const base = { celdaEra5: 'era5_-27.50_-58.75', anio: 2020, lat: -27.5, lon: -58.75 }

    await guardarAnioSerie(db, { ...base, valores: [1, null, 3], descargadoEn: '2026-10-13T05:00:00.000Z' })
    await guardarAnioSerie(db, { ...base, valores: [1, 2, 3], descargadoEn: '2026-10-14T05:00:00.000Z' })

    const filas = await db.select().from(hazardPrecipitacionSerie)
    expect(filas).toHaveLength(1)
    expect(filas[0].valores).toEqual([1, 2, 3])
    expect(filas[0].diasConDato).toBe(3)
    expect(filas[0].descargadoEn).toBe('2026-10-14T05:00:00.000Z')
  })

  it('aniosDescargadosPorCelda agrupa los años guardados por celda', async () => {
    const db = getDb()
    await guardarAnioSerie(db, {
      celdaEra5: 'era5_-27.50_-58.75',
      anio: 2019,
      lat: -27.5,
      lon: -58.75,
      valores: [0],
      descargadoEn: '2026-10-13T05:00:00.000Z',
    })
    await guardarAnioSerie(db, {
      celdaEra5: 'era5_-28.00_-59.00',
      anio: 2020,
      lat: -28,
      lon: -59,
      valores: [null],
      descargadoEn: '2026-10-13T05:00:00.000Z',
    })

    const anios = await aniosDescargadosPorCelda(db)
    expect([...(anios.get('era5_-27.50_-58.75') ?? [])].sort()).toEqual([2019, 2020])
    expect([...(anios.get('era5_-28.00_-59.00') ?? [])]).toEqual([2020])
  })
})
