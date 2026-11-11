import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { replicarRiesgoOm, tablasReplicadas } from './replicacion-riesgo-om.mjs'

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

describe('réplica riesgo con fuente hazard de solo lectura', () => {
  beforeEach(async () => {
    origen = new PGlite(); destino = new PGlite()
    for (const db of [origen, destino]) await db.exec(ESQUEMA)
  })
  afterEach(async () => {
    vi.unstubAllEnvs()
    await origen.close(); await destino.close()
  })

  it('incluye hazard_forecast sin HAZARD_SOURCE_DATABASE_URL', () => {
    vi.stubEnv('HAZARD_SOURCE_DATABASE_URL', '')
    expect(tablasReplicadas().map(t => t.nombre)).toContain('hazard_forecast')
  })

  it('omite hazard_forecast cuando HAZARD_SOURCE_DATABASE_URL está definida', async () => {
    vi.stubEnv('HAZARD_SOURCE_DATABASE_URL', 'postgres://lector@prod.internal/hub_prod')
    expect(tablasReplicadas().map(t => t.nombre)).not.toContain('hazard_forecast')

    await origen.query("INSERT INTO hazard_forecast VALUES ('ecmwf-1','open-meteo-ecmwf','precipitacion','celda-1','2026-10-17T00:00:00Z','2026-10-17T01:00:00Z',1)")
    await origen.query("INSERT INTO hazard_ensemble_prob VALUES ('ens-1','celda-1','precipitacion_24h','2026-10-17T00:00:00Z','2026-10-18T00:00:00Z',0.4)")

    const resultado = await replicarRiesgoOm(origen, destino, { ahora })

    expect(resultado).not.toHaveProperty('hazard_forecast')
    expect(resultado.hazard_ensemble_prob.copiadas).toBe(1)
    expect((await destino.query('SELECT count(*)::int AS n FROM hazard_forecast')).rows[0]).toEqual({ n: 0 })
  })
})
