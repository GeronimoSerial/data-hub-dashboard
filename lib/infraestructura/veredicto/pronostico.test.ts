// Tests de las señales de pronóstico por departamento y día: caudal de ríos,
// probabilidades de ensamble y avisos SMN. Se prueban contra la base real
// aislada en un tmpdir (mismo patrón que rios.test.ts).
import { beforeEach, describe, expect, it } from 'vitest'
import { getDb } from '@/lib/db'
import { hazardClimatology, hazardEnsembleProb, hazardForecast, smnAlerta } from '@/lib/db/schema'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { departamentoDeCelda } from './celda-departamento'
import { leerAvisosSmnDia, leerCaudalDia, leerEnsambleDia, leerLluviaPronosticadaDia } from './pronostico'

usarDbTemporal('veredicto-pronostico')

const FECHA = '2026-10-12'
const CELDA_A = '-27.5_-58.8'
const CELDA_B = '-27.5_-58.7'

beforeEach(async () => {
  const db = getDb()
  await db.delete(hazardForecast)
  await db.delete(hazardClimatology)
  await db.delete(hazardEnsembleProb)
  await db.delete(smnAlerta)
})

describe('leerCaudalDia', () => {
  it('usa la corrida más reciente, filtra por día ART y clasifica contra climatología', async () => {
    const db = getDb()
    const base = {
      provider: 'open-meteo-flood',
      variable: 'caudal',
      geometryRef: 'parana-ituzaingo',
      horizonteHoras: 12,
      unidad: 'm3/s',
      pasoHoras: 24,
      ingeridoEn: '2026-10-12T00:00:00.000Z',
    }
    await db.insert(hazardForecast).values([
      // Corrida vieja: no debe ganar aunque tenga valor mayor.
      { ...base, id: 'vieja', corridaEn: '2026-10-11T00:00:00.000Z', validoEn: '2026-10-12T12:00:00Z', valor: 20000 },
      // Corrida nueva: pico 12000 el 12 y otro valor el 13 (fuera del día).
      { ...base, id: 'nueva-12', corridaEn: '2026-10-12T06:00:00.000Z', validoEn: '2026-10-12T12:00:00Z', valor: 12000 },
      { ...base, id: 'nueva-13', corridaEn: '2026-10-12T06:00:00.000Z', validoEn: '2026-10-13T06:00:00Z', valor: 30000 },
    ])
    await db.insert(hazardClimatology).values([
      { id: 'c90', geometryRef: 'parana-ituzaingo', variable: 'caudal_diario', percentil: 'p90', muestra: 'todos_los_dias', valor: 10000, unidad: 'm3/s', periodoDesde: '1991-01-01', periodoHasta: '2020-12-31', version: 'v1', calculadoEn: '2026-01-01T00:00:00Z' },
      { id: 'c95', geometryRef: 'parana-ituzaingo', variable: 'caudal_diario', percentil: 'p95', muestra: 'todos_los_dias', valor: 15000, unidad: 'm3/s', periodoDesde: '1991-01-01', periodoHasta: '2020-12-31', version: 'v1', calculadoEn: '2026-01-01T00:00:00Z' },
    ])

    const caudales = await leerCaudalDia(db, FECHA)

    expect(caudales).toHaveLength(1)
    expect(caudales[0]).toMatchObject({
      puntoId: 'parana-ituzaingo',
      picoM3s: 12000,
      picoEn: '2026-10-12T12:00:00Z',
      corridaEn: '2026-10-12T06:00:00.000Z',
      percentil: 'p90',
    })
    expect(caudales[0]?.nombre).toBeTruthy()
  })

  it('toma el valor diario anclado a las 00:00Z del mismo día calendario', async () => {
    const db = getDb()
    const base = {
      provider: 'open-meteo-flood', variable: 'caudal', geometryRef: 'parana-ituzaingo',
      corridaEn: '2026-10-12T00:00:00.000Z', horizonteHoras: 24, unidad: 'm3/s', pasoHoras: 24,
      ingeridoEn: '2026-10-12T00:00:00.000Z',
    }
    await db.insert(hazardForecast).values([
      { ...base, id: 'dia-12', validoEn: '2026-10-12T00:00:00Z', valor: 11000 },
      { ...base, id: 'dia-13', validoEn: '2026-10-13T00:00:00Z', valor: 13000 },
    ])

    const [caudal] = await leerCaudalDia(db, FECHA)

    expect(caudal?.picoM3s).toBe(11000)
  })

  it('percentil null si no hay umbrales de caudal', async () => {
    const db = getDb()
    await db.insert(hazardForecast).values({
      id: 'sin-umbral', provider: 'open-meteo-flood', variable: 'caudal', geometryRef: 'parana-ituzaingo',
      corridaEn: '2026-10-12T06:00:00.000Z', validoEn: '2026-10-12T12:00:00Z', horizonteHoras: 12,
      valor: 1, unidad: 'm3/s', pasoHoras: 24, ingeridoEn: '2026-10-12T00:00:00.000Z',
    })
    const [caudal] = await leerCaudalDia(db, FECHA)
    expect(caudal?.percentil).toBeNull()
  })
})

describe('leerEnsambleDia', () => {
  it('toma el máximo por departamento usando sólo la corrida más reciente de cada celda', async () => {
    const db = getDb()
    const base = { variable: 'precipitacion', miembrosTotal: 50, miembrosValidos: 50, dispersion: 0.1, version: 'v1', ingeridoEn: '2026-10-12T00:00:00.000Z', horizonteHoras: 12 }
    await db.insert(hazardEnsembleProb).values([
      // Celda A: corrida vieja con p95 alto que no debe usarse.
      { ...base, id: 'a-vieja', geometryRef: CELDA_A, corridaEn: '2026-10-11T00:00:00.000Z', validoEn: '2026-10-12T12:00:00Z', probabilidadP95: 0.95, probabilidadP99: 0.9 },
      { ...base, id: 'a-nueva', geometryRef: CELDA_A, corridaEn: '2026-10-12T06:00:00.000Z', validoEn: '2026-10-12T12:00:00Z', probabilidadP95: 0.2, probabilidadP99: 0.05 },
      { ...base, id: 'b-nueva', geometryRef: CELDA_B, corridaEn: '2026-10-12T06:00:00.000Z', validoEn: '2026-10-12T12:00:00Z', probabilidadP95: 0.7, probabilidadP99: 0.4 },
      // Fuera del día.
      { ...base, id: 'b-dia-siguiente', geometryRef: CELDA_B, corridaEn: '2026-10-12T06:00:00.000Z', validoEn: '2026-10-13T06:00:00Z', probabilidadP95: 0.99, probabilidadP99: 0.99 },
    ])

    const ensamble = await leerEnsambleDia(db, FECHA)

    expect(ensamble).toEqual([
      {
        departamento: departamentoDeCelda(CELDA_A),
        probP95Max: 0.7,
        probP99Max: 0.4,
        corridaEn: '2026-10-12T06:00:00.000Z',
      },
    ])
    expect(ensamble[0]?.departamento).not.toBeNull()
  })
})

describe('leerAvisosSmnDia', () => {
  const base = {
    sender: 'smn',
    sent: '2026-10-11T00:00:00Z',
    severity: 'Moderate',
    poligonos: [],
    raw: '<alert/>',
    fetchedAt: '2026-10-11T00:00:00Z',
  }
  const capital = [{ id: '1', nombre: 'Capital' }]

  it('conserva el peor nivel por departamento entre avisos vigentes del día y descarta cancelados', async () => {
    const db = getDb()
    await db.insert(smnAlerta).values([
      { ...base, id: 'amarilla', event: 'Tormentas', onset: '2026-10-12T12:00:00Z', expires: '2026-10-12T18:00:00Z', nivelSat: null, severity: 'Moderate', departamentos: capital, cancelada: false },
      { ...base, id: 'roja', event: 'Viento', onset: '2026-10-12T10:00:00Z', expires: '2026-10-12T20:00:00Z', nivelSat: null, severity: 'Extreme', departamentos: capital, cancelada: false },
      { ...base, id: 'cancelada', event: 'Lluvia', onset: '2026-10-12T10:00:00Z', expires: '2026-10-12T20:00:00Z', nivelSat: null, severity: 'Severe', departamentos: [{ id: '2', nombre: 'Ituzaingó' }], cancelada: true },
      { ...base, id: 'manana', event: 'Lluvia', onset: '2026-10-13T03:00:00Z', expires: '2026-10-13T09:00:00Z', nivelSat: null, severity: 'Extreme', departamentos: [{ id: '2', nombre: 'Ituzaingó' }], cancelada: false },
    ])

    const avisos = await leerAvisosSmnDia(db, FECHA)

    expect(avisos).toEqual([
      { departamento: 'CAPITAL', nivel: 'rojo', avisoId: 'roja', evento: 'Viento', desde: '2026-10-12T10:00:00Z', hasta: '2026-10-12T20:00:00Z' },
    ])
  })

  it('ignora niveles desconocidos', async () => {
    const db = getDb()
    await db.insert(smnAlerta).values({ ...base, id: 'otro', event: 'Niebla', onset: '2026-10-12T00:00:00Z', expires: '2026-10-12T23:00:00Z', nivelSat: null, severity: 'Minor', departamentos: capital, cancelada: false })
    expect(await leerAvisosSmnDia(db, FECHA)).toEqual([])
  })
})

describe('leerLluviaPronosticadaDia', () => {
  const PROVIDER_ECMWF = 'open-meteo-ecmwf'

  // Filas horarias de una corrida, desde 03:00Z (inicio del día ART 2026-10-12).
  function horasEcmwf(geometryRef: string, corridaEn: string, valor: number, cantidad: number) {
    const inicio = Date.parse('2026-10-12T03:00:00Z')
    return Array.from({ length: cantidad }, (_, i) => ({
      id: `${geometryRef}|${corridaEn}|${i}`,
      provider: PROVIDER_ECMWF,
      variable: 'precipitacion',
      geometryRef,
      corridaEn,
      validoEn: new Date(inicio + i * 3_600_000).toISOString().replace('.000Z', 'Z'),
      horizonteHoras: 24,
      unidad: 'mm',
      pasoHoras: 1,
      valor,
      ingeridoEn: corridaEn,
    }))
  }

  it('usa la corrida más reciente, suma la hora ART y descarta celdas con menos de 20 horas', async () => {
    const db = getDb()
    const vieja = '2026-10-11T12:00:00.000Z'
    const nueva = '2026-10-12T06:00:00.000Z'
    await db.insert(hazardForecast).values([
      // Corrida vieja: 24 h de 10 mm (240 mm) no debe contar.
      ...horasEcmwf(CELDA_A, vieja, 10, 24),
      // Corrida nueva: 24 h de 85/24 mm (85 mm en el día ART) más una hora del día siguiente.
      ...horasEcmwf(CELDA_A, nueva, 85 / 24, 24),
      {
        ...horasEcmwf(CELDA_A, nueva, 1000, 1)[0]!,
        id: 'fuera-del-dia',
        validoEn: '2026-10-13T03:00:00Z',
      },
      // Celda con horizonte parcial (10 h): se ignora aunque sume más.
      ...horasEcmwf(CELDA_B, nueva, 100, 10),
    ])

    const filas = await leerLluviaPronosticadaDia(db, FECHA)

    expect(filas.every((f) => f.horas >= 20)).toBe(true)
    expect(filas.find((f) => f.ambito === 'provincia')).toMatchObject({
      maxMm: 85,
      celdaMax: CELDA_A,
      horas: 24,
    })
    const depto = `departamento:${departamentoDeCelda(CELDA_A)}`
    expect(filas.find((f) => f.ambito === depto)).toMatchObject({ maxMm: 85, horas: 24 })
  })

  it('devuelve lista vacía sin corridas ECMWF para el día', async () => {
    expect(await leerLluviaPronosticadaDia(getDb(), FECHA)).toEqual([])
  })
})
