import { beforeAll, describe, expect, it, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { eq } from 'drizzle-orm'
import { getDb, migrarDb } from '@/lib/db'
import * as schema from '@/lib/db/schema'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { publicarCorridaPrefectura, type CorridaPrefectura } from './publicacion'
import { entregarPrefectura } from './replicacion'
import { leerVersion, listarVersiones } from '../datasets/repositorio'

usarDbTemporal('prefectura-replica', { seed: false })
let target: ReturnType<typeof getDb>
beforeAll(async () => {
  await migrarDb()
  const cliente = new PGlite()
  const db = drizzle(cliente, { schema })
  await migrate(db, { migrationsFolder: 'drizzle' })
  target = db as unknown as ReturnType<typeof getDb>
})
const corrida = (fecha: string, mediana = 2): CorridaPrefectura => ({
  tipo: 'referencias', capturadaEn: fecha, jobRunId: `job-${fecha}`, catalogoVersion: 'fixture',
  filas: [{ estacionId: 'pna-corrientes', ventanaDias: 365, n: 100, medianaM: mediana,
    p10M: 1, p90M: 3, desde: '2025-10-01', hasta: '2026-10-01', fuente: 'prefectura-historico', calculadoEn: fecha }],
  lecturasOriginales: [{ estacionId: 'pna-corrientes', lecturas: [{ medidaEn: fecha, lecturaM: mediana }] }],
})
async function encolar(id: string) {
  await getDb().insert(schema.infraDatasetEntrega).values({ versionId: id, destino: 'staging', proximoIntento: new Date('2026-01-01') })
}

describe('Prefectura: histórico y entrega sin recalcular', () => {
  it('encola automáticamente en producción y conserva varias fechas de una estación', async () => {
    const source = getDb()
    const previa = process.env.DATABASE_URL
    process.env.DATABASE_URL = 'postgres://fixture@localhost/hub_prod'
    try {
      const fila = { estacionId: 'fixture', medidaEn: '2026-10-15T00:00:00Z', lecturaM: 1,
        variacionM: null, periodoHoras: null, estadoPublicado: 'normal', lecturaAnteriorM: null,
        medidaAnteriorEn: null, alertaM: null, evacuacionM: null, inconsistente: false, motivosInconsistencia: [] }
      const entrada: CorridaPrefectura = { tipo: 'alturas', jobRunId: 'fixture-alturas',
        capturadaEn: '2026-10-16T00:00:00Z', catalogoVersion: 'fixture',
        filas: [fila, { ...fila, medidaEn: '2026-10-16T00:00:00Z', lecturaM: 2 }] }
      const { versionId } = await publicarCorridaPrefectura(entrada, source)
      await publicarCorridaPrefectura(entrada, source)
      const cola = await source.select().from(schema.infraDatasetEntrega).where(eq(schema.infraDatasetEntrega.versionId, versionId))
      expect(cola).toHaveLength(1)
      expect((await leerVersion('prefectura-alturas', versionId, source))?.documento).toHaveLength(2)
      // Este test verifica el publisher; no mezclar su entrega con las demás.
      await source.update(schema.infraDatasetEntrega).set({ entregadaEn: new Date() }).where(eq(schema.infraDatasetEntrega.versionId, versionId))
    } finally {
      if (previa === undefined) delete process.env.DATABASE_URL
      else process.env.DATABASE_URL = previa
    }
  })
  it('archiva cada cálculo y entrega el mismo SHA, datos originales y proyección', async () => {
    const { versionId } = await publicarCorridaPrefectura(corrida('2026-10-16T10:00:00Z'))
    await encolar(versionId)
    expect(await entregarPrefectura(getDb(), target)).toEqual({ entregadas: 1, fallidas: 0 })
    expect((await leerVersion('prefectura-referencias', versionId, target))?.version.id).toBe(versionId)
    expect((await leerVersion('prefectura-referencias', versionId, target))?.version.metadatos.lecturasOriginales).toHaveLength(1)
    expect((await target.select().from(schema.hidroReferencia))[0].medianaM).toBe(2)
    expect(await entregarPrefectura(getDb(), target)).toEqual({ entregadas: 0, fallidas: 0 })
  })
  it('conserva el histórico y no retrocede la referencia al entregar una corrida atrasada', async () => {
    const nueva = await publicarCorridaPrefectura(corrida('2026-10-16T12:00:00Z', 5))
    await encolar(nueva.versionId)
    await entregarPrefectura(getDb(), target)
    const vieja = await publicarCorridaPrefectura(corrida('2026-10-16T11:00:00Z', 3))
    await encolar(vieja.versionId)
    await entregarPrefectura(getDb(), target)
    expect((await target.select().from(schema.hidroReferencia))[0].medianaM).toBe(5)
    expect((await leerVersion('prefectura-referencias', undefined, target))?.version.id).toBe(nueva.versionId)
    expect(await listarVersiones('prefectura-referencias', target)).toHaveLength(3)
  })
  it('una falla de staging conserva producción y la cola; reintenta sin duplicar', async () => {
    const nueva = await publicarCorridaPrefectura(corrida('2026-10-16T13:00:00Z', 6))
    await encolar(nueva.versionId)
    const fallando = { transaction: vi.fn().mockRejectedValue(new Error('credenciales privadas')) } as unknown as typeof target
    expect(await entregarPrefectura(getDb(), fallando)).toEqual({ entregadas: 0, fallidas: 1 })
    const [pendiente] = await getDb().select().from(schema.infraDatasetEntrega).where(eq(schema.infraDatasetEntrega.versionId, nueva.versionId))
    expect(pendiente.entregadaEn).toBeNull()
    expect(pendiente.ultimoError).not.toContain('credenciales')
    expect((await getDb().select().from(schema.hidroReferencia))[0].medianaM).toBe(6)
    expect(await entregarPrefectura(getDb(), target, new Date(pendiente.proximoIntento.getTime() + 1))).toEqual({ entregadas: 1, fallidas: 0 })
  })
  it('un error local revierte tanto archivo como proyección', async () => {
    const mala = corrida('2026-10-16T14:00:00Z')
    mala.filas[0].n = null
    const anteriores = (await listarVersiones('prefectura-referencias')).length
    await expect(publicarCorridaPrefectura(mala)).rejects.toThrow()
    expect(await listarVersiones('prefectura-referencias')).toHaveLength(anteriores)
  })
})
