import { beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { getDb, migrarDb } from '@/lib/db'
import { infraRutaEvacuacionOsm, infraSusceptibilidadEstatica } from '@/lib/db/schema'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { ingestarGeo } from './geo-static'
import { leerVersion, listarVersiones } from './repositorio'

usarDbTemporal('geo-static-versionado', { seed: false })
beforeAll(() => migrarDb())
const opciones = (revision: string) => ({ revision, fuente: 'fixture', entradas: [] })
const base = (version: string) => [{ cue_anexo: '1800001-00', version_job: version,
  peligro_inundacion_fluvial: 1, peligro_inundacion_pluvial: null, peligro_viento: null, peligro_calor: null,
  periodo_retorno_anios: 100, fuente: 'physrisk', fecha_corrida: '2026-10-16', licencia: 'fixture' }]
const v2 = { cue_anexo: '1800001-00', version_job: '1', clase_rio: 'alto', junto_laguna: false }

describe('ingesta geográfica atómica', () => {
  it('enriquece sólo la base vigente y conserva las versiones de algoritmo anteriores', async () => {
    await ingestarGeo('susceptibilidad', base('1'), opciones('base-1'))
    await ingestarGeo('susceptibilidad', base('2'), opciones('base-2'))
    await getDb().update(infraSusceptibilidadEstatica).set({ importadoEn: '2026-01-01T00:00:00Z' }).where(eq(infraSusceptibilidadEstatica.versionJob, '1'))
    const version = await ingestarGeo('inundacion-v2', [v2], opciones('inundacion-1'))
    const filas = await getDb().select().from(infraSusceptibilidadEstatica).orderBy(infraSusceptibilidadEstatica.versionJob)
    expect(filas.map((f) => f.claseRio)).toEqual([null, 'alto'])
    expect((await leerVersion('geo-inundacion-v2'))?.version.id).toBe(version)
  })
  it('revierte todo si una escuela no tiene base y mantiene la publicación anterior', async () => {
    const anterior = await leerVersion('geo-inundacion-v2')
    await expect(ingestarGeo('inundacion-v2', [v2, { ...v2, cue_anexo: 'inexistente' }], opciones('inundacion-fallida'))).rejects.toThrow('No existe fila base')
    expect((await leerVersion('geo-inundacion-v2'))?.version.id).toBe(anterior?.version.id)
    expect(await listarVersiones('geo-inundacion-v2')).toHaveLength(1)
  })
})

describe('ingesta de rutas a centros de evacuados', () => {
  const candidato = (destino: string, distancia: number) => ({
    destino_cue: destino, destino_nombre: `Escuela ${destino}`, distancia_m: distancia,
    ruta: { type: 'LineString', coordinates: [[-58.1, -28.1], [-58.2, -28.2]] },
  })
  const fila = (cue: string, candidatos: unknown[]) => ({
    cue_anexo: cue, version_job: '1', fecha_extracto_osm: '2026-09-26', licencia: 'ODbL', candidatos,
  })

  it('proyecta los candidatos por escuela y reimporta la misma versión sin duplicar', async () => {
    await ingestarGeo('ruta-evacuacion', [fila('1800001-00', [candidato('1800002-00', 1200), candidato('1800003-00', 4000)])], opciones('rutas-1'))
    await ingestarGeo('ruta-evacuacion', [fila('1800001-00', [candidato('1800002-00', 1300)])], opciones('rutas-2'))
    const filas = await getDb().select().from(infraRutaEvacuacionOsm)
    expect(filas).toHaveLength(1)
    expect(filas[0].candidatos).toEqual([
      { destinoCue: '1800002-00', destinoNombre: 'Escuela 1800002-00', distanciaM: 1300, ruta: { type: 'LineString', coordinates: [[-58.1, -28.1], [-58.2, -28.2]] } },
    ])
  })

  it('rechaza una ruta de menos de 2 puntos o una distancia negativa', async () => {
    const mala = { ...candidato('1800002-00', 10), ruta: { type: 'LineString', coordinates: [[-58.1, -28.1]] } }
    await expect(ingestarGeo('ruta-evacuacion', [fila('1800009-00', [mala])], opciones('rutas-mala'))).rejects.toThrow()
    await expect(ingestarGeo('ruta-evacuacion', [fila('1800009-00', [candidato('1800002-00', -5)])], opciones('rutas-neg'))).rejects.toThrow()
  })

  it('acepta una escuela sin candidatos (sin ruta hacia ninguno)', async () => {
    await ingestarGeo('ruta-evacuacion', [fila('1800008-00', [])], opciones('rutas-vacia'))
    const f = (await getDb().select().from(infraRutaEvacuacionOsm)).find((x) => x.cueAnexo === '1800008-00')
    expect(f?.candidatos).toEqual([])
  })
})
