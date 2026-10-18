import { beforeAll, describe, expect, it } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb } from '@/lib/db'
import { hazardClimatology, infraGeoProfile } from '@/lib/db/schema'
import type { obtenerAvanceClimatologia as ObtenerAvanceClimatologia } from './avance-climatologia'

let obtenerAvanceClimatologia: typeof ObtenerAvanceClimatologia

usarDbTemporal('avance-climatologia')

const VERSION_PRECIPITACION = 'climatologia-v1'
const PERIODO_DESDE_PRECIPITACION = '1991-01-01'
const PERIODO_HASTA_PRECIPITACION = '2020-12-31'
const VERSION_CAUDAL = 'caudal-climatologia-v0.1'
const PERIODO_DESDE_CAUDAL = '2015-01-01'
const PERIODO_HASTA_CAUDAL = '2024-12-31'

beforeAll(async () => {
  ;({ obtenerAvanceClimatologia } = await import('./avance-climatologia'))
})

async function insertarPerfilGeo(geometryRef: string) {
  await getDb()
    .insert(infraGeoProfile)
    .values({
      cueAnexo: `cue-${geometryRef}`,
      lat: 0,
      lon: 0,
      geoCalidad: 'exacta',
      departamento: 'CAPITAL',
      geometryRef,
      motivoExclusion: null,
      perfilVersion: 'v1',
      calculadoEn: '2026-09-27T00:00:00.000Z',
    })
}

async function insertarFilaClimatologia(params: {
  geometryRef: string
  version: string
  periodoDesde: string
  periodoHasta: string
}) {
  await getDb()
    .insert(hazardClimatology)
    .values({
      id: `${params.geometryRef}-${params.version}`,
      geometryRef: params.geometryRef,
      variable: 'precipitacion_diaria',
      percentil: 'p90',
      muestra: 'todos_los_dias',
      valor: 42,
      unidad: 'mm',
      periodoDesde: params.periodoDesde,
      periodoHasta: params.periodoHasta,
      version: params.version,
      calculadoEn: '2026-09-27T00:00:00.000Z',
    })
}

describe('obtenerAvanceClimatologia', () => {
  it('cuenta el total de celdas candidatas y las ya calculadas para precipitación', async () => {
    await insertarPerfilGeo('geo-1')
    await insertarPerfilGeo('geo-2')
    await insertarPerfilGeo('geo-3')
    await insertarFilaClimatologia({
      geometryRef: 'geo-1',
      version: VERSION_PRECIPITACION,
      periodoDesde: PERIODO_DESDE_PRECIPITACION,
      periodoHasta: PERIODO_HASTA_PRECIPITACION,
    })

    const avance = await obtenerAvanceClimatologia()
    expect(avance.precipitacion).toEqual({ completas: 1, total: 3 })
  })

  it('no cuenta filas de una version/período distinto (recalculo sin pisar la anterior)', async () => {
    await insertarFilaClimatologia({
      geometryRef: 'geo-2',
      version: 'climatologia-v0-vieja',
      periodoDesde: PERIODO_DESDE_PRECIPITACION,
      periodoHasta: PERIODO_HASTA_PRECIPITACION,
    })

    const avance = await obtenerAvanceClimatologia()
    // Sigue en 1: la fila de geo-2 es de una version vieja, no cuenta para el
    // avance de climatologia-v1.
    expect(avance.precipitacion.completas).toBe(1)
  })

  it('cuenta el avance de caudal contra el total fijo de obtenerPuntosRio()', async () => {
    const { obtenerPuntosRio } = await import('./puntos-rio')
    await insertarFilaClimatologia({
      geometryRef: obtenerPuntosRio()[0].id,
      version: VERSION_CAUDAL,
      periodoDesde: PERIODO_DESDE_CAUDAL,
      periodoHasta: PERIODO_HASTA_CAUDAL,
    })

    const avance = await obtenerAvanceClimatologia()
    expect(avance.caudal).toEqual({ completas: 1, total: obtenerPuntosRio().length })
  })
})
