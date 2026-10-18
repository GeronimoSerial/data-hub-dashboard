import { beforeAll, describe, expect, it } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb, getRawClient, migrarDb } from '@/lib/db'
import { infraGeoProfile } from '@/lib/db/schema'
import { crearEjecutorSql, ensureGeSchema } from '@/lib/infraestructura/ge-db'
import type { crearAdapterPadronV04 as CrearAdapterPadronV04 } from './padron'

// Sin siembra: el padrón de prueba se arma a mano para controlar qué escuelas
// tienen coordenadas y perfil.
usarDbTemporal('padron-v04-', { seed: false })

let crearAdapterPadronV04: typeof CrearAdapterPadronV04

const CALCULADO = '2026-10-17T00:00:00.000Z'

beforeAll(async () => {
  await migrarDb()
  const client = crearEjecutorSql(getRawClient())
  await ensureGeSchema(client)
  const escuelas: Array<[string, number | null, number | null]> = [
    ['1800001-00', -27.47, -58.83],
    ['1800002-00', -29.18, -59.26],
    ['1800003-00', null, null],
    ['1800004-00', -28.5, -58.0],
  ]
  for (const [cue, lat, lon] of escuelas) {
    await client.execute({
      sql: `INSERT INTO ge.ge_localizacion (cue_anexo, cui, nombre, departamento, localidad, lat, lon, geo_calidad)
            VALUES (?, NULL, 'Escuela', 'CAPITAL', 'Corrientes', ?, ?, NULL)`,
      args: [cue, lat, lon],
    })
  }
  // 1800004-00 tiene coordenadas en GE pero todavía no tiene perfil calculado.
  await getDb()
    .insert(infraGeoProfile)
    .values([
      { cueAnexo: '1800001-00', lat: -27.47, lon: -58.83, geometryRef: 'g1', motivoExclusion: null, perfilVersion: 'geo-perfil-v1', calculadoEn: CALCULADO },
      { cueAnexo: '1800002-00', lat: -29.18, lon: -59.26, geometryRef: 'g2', motivoExclusion: null, perfilVersion: 'geo-perfil-v1', calculadoEn: CALCULADO },
      { cueAnexo: '1800003-00', lat: null, lon: null, geometryRef: null, motivoExclusion: 'sin_coordenadas', perfilVersion: 'geo-perfil-v1', calculadoEn: CALCULADO },
    ])
  ;({ crearAdapterPadronV04 } = await import('./padron'))
})

describe('crearAdapterPadronV04', () => {
  it('devuelve el padrón completo por unión por izquierda, incluidas las escuelas sin coordenadas', async () => {
    const padron = await crearAdapterPadronV04().listarPadron()
    expect(padron).toEqual([
      { cueAnexo: '1800001-00', motivoUbicacion: null },
      { cueAnexo: '1800002-00', motivoUbicacion: null },
      { cueAnexo: '1800003-00', motivoUbicacion: 'sin_coordenadas' },
      { cueAnexo: '1800004-00', motivoUbicacion: 'perfil_geografico_pendiente' },
    ])
  })
})
