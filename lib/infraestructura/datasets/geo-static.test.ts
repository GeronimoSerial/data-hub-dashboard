import { beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { getDb, migrarDb } from '@/lib/db'
import { infraSusceptibilidadEstatica } from '@/lib/db/schema'
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
