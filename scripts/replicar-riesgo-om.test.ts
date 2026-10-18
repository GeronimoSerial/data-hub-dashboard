import { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { replicarRiesgoOm, validarDestinosRiesgoOm } from './lib/replicacion-riesgo-om.mjs'

let origen: PGlite, destino: PGlite
const ahora = new Date('2026-10-17T12:00:00Z')

const ESQUEMA = `
CREATE TABLE hazard_forecast (id text PRIMARY KEY, provider text NOT NULL, variable text NOT NULL,
  geometry_ref text NOT NULL, corrida_en text NOT NULL, valido_en text NOT NULL, valor real NOT NULL);
CREATE UNIQUE INDEX hazard_forecast_uidx ON hazard_forecast (provider, variable, geometry_ref, corrida_en, valido_en);
CREATE TABLE hazard_ensemble_prob (id text PRIMARY KEY, geometry_ref text NOT NULL, variable text NOT NULL,
  corrida_en text NOT NULL, valido_en text NOT NULL, probabilidad_p95 real NOT NULL);
CREATE UNIQUE INDEX hazard_ensemble_prob_uidx ON hazard_ensemble_prob (geometry_ref, variable, corrida_en, valido_en);
CREATE TABLE hazard_seasonal_trend (id text PRIMARY KEY, departamento text NOT NULL, variable text NOT NULL,
  emision_en text NOT NULL, horizonte_desde_dias integer NOT NULL, horizonte_hasta_dias integer NOT NULL, media_mm real);
CREATE UNIQUE INDEX hazard_seasonal_trend_uidx ON hazard_seasonal_trend (departamento, variable, emision_en, horizonte_desde_dias, horizonte_hasta_dias);
CREATE TABLE hazard_climatology (id text PRIMARY KEY, geometry_ref text NOT NULL, variable text NOT NULL,
  percentil text NOT NULL, muestra text NOT NULL, valor real NOT NULL, periodo_desde text NOT NULL,
  periodo_hasta text NOT NULL, version text NOT NULL, calculado_en text NOT NULL);
CREATE UNIQUE INDEX hazard_climatology_uidx ON hazard_climatology (geometry_ref, variable, percentil, muestra, periodo_desde, periodo_hasta, version);
CREATE TABLE hazard_precipitacion_serie (celda_era5 text NOT NULL, anio integer NOT NULL, valores jsonb NOT NULL,
  descargado_en text NOT NULL, PRIMARY KEY (celda_era5, anio));
CREATE TABLE hazard_source_health (provider text PRIMARY KEY, estado text NOT NULL, actualizada_en text NOT NULL);
`

async function pronostico(db: PGlite, id: string, provider: string, corrida: string, valor = 1) {
  await db.query('INSERT INTO hazard_forecast VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [id, provider, 'precipitacion', 'celda-1', corrida, corrida, valor])
}
async function climatologia(db: PGlite, id: string, version: string, calculado: string, valor = 1) {
  await db.query('INSERT INTO hazard_climatology VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
    [id, 'celda-1', 'precipitacion_diaria', 'p95', 'todos_los_dias', valor, '1991', '2020', version, calculado])
}
async function serie(db: PGlite, celda: string, descargado: string) {
  await db.query('INSERT INTO hazard_precipitacion_serie VALUES ($1,$2,$3,$4)',
    [celda, 2024, JSON.stringify([1.5, null, 0]), descargado])
}
async function filas(db: PGlite, tabla: string, orden = 'id') {
  return (await db.query(`SELECT * FROM ${tabla} ORDER BY ${orden}`)).rows
}

describe('réplica riesgo Open-Meteo', () => {
  beforeEach(async () => {
    origen = new PGlite(); destino = new PGlite()
    for (const db of [origen, destino]) await db.exec(ESQUEMA)
  })
  afterEach(async () => { vi.unstubAllGlobals(); await origen.close(); await destino.close() })

  it('copia sólo datos Open-Meteo, dos veces sin duplicar ni llamar APIs', async () => {
    const fetch = vi.fn(() => { throw new Error('No debe llamar APIs') })
    vi.stubGlobal('fetch', fetch)
    await pronostico(origen, 'ecmwf-1', 'open-meteo-ecmwf', '2026-10-17T00:00:00Z')
    await pronostico(origen, 'flood-1', 'open-meteo-flood', '2026-10-17T00:00:00Z')
    await pronostico(origen, 'otro-1', 'nasa-imerg', '2026-10-17T00:00:00Z')
    await origen.query("INSERT INTO hazard_ensemble_prob VALUES ('ens-1','celda-1','precipitacion_24h','2026-10-17T00:00:00Z','2026-10-18T00:00:00Z',0.4)")
    await origen.query("INSERT INTO hazard_seasonal_trend VALUES ('sea-1','Capital','precipitacion','2026-10-01',0,30,80)")
    await climatologia(origen, 'clima-era5', 'climatologia-v2-progresiva', '2026-10-10T00:00:00Z')
    await climatologia(origen, 'clima-imerg', 'climatologia-imerg-v1', '2026-10-10T00:00:00Z')
    await serie(origen, 'era5:-27.5:-58.75', '2026-10-10T00:00:00Z')
    await serie(origen, 'imerg:celda-1', '2026-10-10T00:00:00Z')
    await origen.query("INSERT INTO hazard_source_health VALUES ('open-meteo-ensemble','ok','2026-10-17T00:00:00Z'), ('nasa-imerg','ok','2026-10-17T00:00:00Z')")

    const primero = await replicarRiesgoOm(origen, destino, { ahora })
    const segundo = await replicarRiesgoOm(origen, destino, { ahora })

    expect((await filas(destino, 'hazard_forecast')).map(f => f.id)).toEqual(['ecmwf-1', 'flood-1'])
    expect(await filas(destino, 'hazard_ensemble_prob')).toHaveLength(1)
    expect(await filas(destino, 'hazard_seasonal_trend')).toHaveLength(1)
    expect((await filas(destino, 'hazard_climatology')).map(f => f.id)).toEqual(['clima-era5'])
    expect(await filas(destino, 'hazard_precipitacion_serie', 'celda_era5'))
      .toEqual([expect.objectContaining({ celda_era5: 'era5:-27.5:-58.75', valores: [1.5, null, 0] })])
    expect((await filas(destino, 'hazard_source_health', 'provider')).map(f => f.provider)).toEqual(['open-meteo-ensemble'])
    expect(primero.hazard_forecast.copiadas).toBe(2)
    expect(segundo.hazard_forecast.copiadas).toBe(2)
    expect(fetch).not.toHaveBeenCalled()
    expect(await filas(origen, 'hazard_forecast')).toHaveLength(3)
  })

  it('copia sólo corridas iguales o más nuevas que la última del destino, por proveedor', async () => {
    await pronostico(destino, 'local-12', 'open-meteo-ecmwf', '2026-10-16T12:00:00Z', 0)
    await pronostico(destino, 'local-flood', 'open-meteo-flood', '2026-10-15T00:00:00Z', 0)
    await pronostico(origen, 'prod-06', 'open-meteo-ecmwf', '2026-10-16T06:00:00Z', 7)
    await pronostico(origen, 'prod-12', 'open-meteo-ecmwf', '2026-10-16T12:00:00Z', 8)
    await pronostico(origen, 'prod-18', 'open-meteo-ecmwf', '2026-10-16T18:00:00Z', 9)
    await pronostico(origen, 'prod-flood', 'open-meteo-flood', '2026-10-16T00:00:00Z', 5)

    const resultado = await replicarRiesgoOm(origen, destino, { ahora })

    expect((await filas(destino, 'hazard_forecast', 'corrida_en, provider')).map(f => [f.id, f.valor])).toEqual([
      ['local-flood', 0], ['prod-flood', 5], ['local-12', 8], ['prod-18', 9],
    ])
    expect(resultado.hazard_forecast.copiadas).toBe(3)
  })

  it('en la primera copia limita los pronósticos a 14 días y trae toda la climatología', async () => {
    await pronostico(origen, 'viejo', 'open-meteo-ecmwf', '2026-10-01T00:00:00Z')
    await pronostico(origen, 'limite', 'open-meteo-ecmwf', '2026-10-03T12:00:00.000Z')
    await climatologia(origen, 'clima-vieja', 'climatologia-v2-progresiva', '2025-01-01T00:00:00Z')
    await replicarRiesgoOm(origen, destino, { ahora })
    expect((await filas(destino, 'hazard_forecast')).map(f => f.id)).toEqual(['limite'])
    expect(await filas(destino, 'hazard_climatology')).toHaveLength(1)
  })

  it('actualiza climatología recalculada y conserva filas ausentes del origen', async () => {
    await climatologia(destino, 'clima-local', 'climatologia-v2-progresiva', '2026-10-09T00:00:00Z', 0)
    await climatologia(destino, 'solo-destino', 'caudal-climatologia-v0.1', '2026-10-09T00:00:00Z', 3)
    await climatologia(origen, 'clima-prod', 'climatologia-v2-progresiva', '2026-10-10T00:00:00Z', 4)
    await replicarRiesgoOm(origen, destino, { ahora })
    expect((await filas(destino, 'hazard_climatology')).map(f => [f.id, f.valor]))
      .toEqual([['clima-local', 4], ['solo-destino', 3]])
  })

  it('copia más de un lote sin omitir filas', async () => {
    for (let i = 0; i < 12; i++) await pronostico(origen, `lote-${i}`, 'open-meteo-ecmwf', `2026-10-17T${String(i).padStart(2, '0')}:00:00Z`)
    const resultado = await replicarRiesgoOm(origen, destino, { ahora, lote: 5 })
    expect(await filas(destino, 'hazard_forecast')).toHaveLength(12)
    expect(resultado.hazard_forecast.copiadas).toBe(12)
  })

  it('revierte toda la entrega si falla una tabla posterior', async () => {
    await pronostico(origen, 'nuevo', 'open-meteo-ecmwf', '2026-10-17T00:00:00Z')
    await origen.query("INSERT INTO hazard_source_health VALUES ('open-meteo-ecmwf','ok','2026-10-17T00:00:00Z')")
    await destino.exec("ALTER TABLE hazard_source_health ADD CONSTRAINT rechazo CHECK (estado <> 'ok')")
    await expect(replicarRiesgoOm(origen, destino, { ahora })).rejects.toThrow()
    expect(await filas(destino, 'hazard_forecast')).toHaveLength(0)
  })
})

it.each(['hub_staging', 'hub_dev'])('permite réplica prod → %s', db => {
  expect(() => validarDestinosRiesgoOm('postgresql://source/hub_prod', `postgres://target/${db}`)).not.toThrow()
})
it.each([
  [undefined, 'postgres://target/hub_dev'],
  ['postgres://source/hub_staging', 'postgres://target/hub_dev'],
  ['postgres://source/hub_prod', 'postgres://target/hub_prod'],
  ['https://source/hub_prod', 'postgres://target/hub_dev'],
])('rechaza destinos no autorizados (%s → %s)', (source, target) => {
  expect(() => validarDestinosRiesgoOm(source, target)).toThrow(/requiere origen/)
})

