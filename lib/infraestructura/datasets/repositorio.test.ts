import { beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { getDb, migrarDb } from '@/lib/db'
import { infraDatasetVersion, infraDatasetRegistro, infraDatasetPublicacion } from '@/lib/db/schema'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { guardarVersion, leerVersion, listarVersiones, publicarVersion } from './repositorio'
import { prepararVersion, type EntradaVersion } from './codec'
import { cargarReferencias } from './repositorio'
import { referencia } from './memoria'

usarDbTemporal('datasets-versionados', { seed: false })
beforeAll(() => migrarDb())
const entrada = (id: string, datos = [{ id: 'uno', valor: 1 }]): EntradaVersion => ({
  datasetId: id, nombre: 'Prueba', revision: 'v1', fuente: 'fuente pública', formato: 'array', clave: 'id', datos,
})

describe('datasets versionados', () => {
  it('es idempotente y conserva versiones al publicar y volver atrás', async () => {
    const primera = entrada('prueba-historia')
    const id1 = await guardarVersion(primera)
    expect(await guardarVersion(primera)).toBe(id1)
    const id2 = await guardarVersion(entrada('prueba-historia', [{ id: 'uno', valor: 2 }]))
    expect((await leerVersion('prueba-historia'))?.documento).toEqual([{ id: 'uno', valor: 2 }])
    expect(await listarVersiones('prueba-historia')).toHaveLength(2)
    await publicarVersion('prueba-historia', id1)
    expect((await leerVersion('prueba-historia'))?.version.id).toBe(id1)
    expect((await leerVersion('prueba-historia', id2))?.documento).toEqual([{ id: 'uno', valor: 2 }])
  })

  it('versiona un registro de eventos vacío y lo distingue de un dataset ausente', async () => {
    await guardarVersion({ datasetId: 'registro-eventos', nombre: 'Eventos', revision: 'vacia', fuente: 'fixture', formato: 'array', datos: [] })
    expect((await leerVersion('registro-eventos'))?.documento).toEqual([])
    await cargarReferencias(getDb(), true)
    expect(referencia('registro-eventos')).toEqual([])
  })

  it('rechaza cambios y ampliaciones de una versión completa en la DB', async () => {
    const id = await guardarVersion(entrada('prueba-inmutable'))
    await expect(getDb().update(infraDatasetRegistro).set({ datos: { valor: 99 } }).where(eq(infraDatasetRegistro.versionId, id))).rejects.toThrow()
    await expect(getDb().delete(infraDatasetVersion).where(eq(infraDatasetVersion.id, id))).rejects.toThrow()
    await expect(getDb().insert(infraDatasetRegistro).values({ versionId: id, clave: 'extra', orden: 1, datos: {} })).rejects.toThrow()
    expect((await leerVersion('prueba-inmutable'))?.documento).toEqual([{ id: 'uno', valor: 1 }])
  })

  it('no permite publicaciones incompletas o de otro dataset', async () => {
    const id = await guardarVersion(entrada('prueba-fk'))
    await guardarVersion(entrada('prueba-ajena'))
    await expect(getDb().insert(infraDatasetPublicacion).values({ datasetId: 'prueba-ajena', versionId: id })
      .onConflictDoUpdate({ target: infraDatasetPublicacion.datasetId, set: { versionId: id } })).rejects.toThrow()
    await expect(publicarVersion('prueba-ajena', id)).rejects.toThrow('Versión inexistente')
  })

  it('revierte archivo y publicación cuando falla la proyección operativa', async () => {
    await expect(guardarVersion(entrada('prueba-rollback'), getDb(), true, async () => { throw new Error('proyección fallida') }))
      .rejects.toThrow('proyección fallida')
    expect(await leerVersion('prueba-rollback')).toBeNull()
    expect(await listarVersiones('prueba-rollback')).toHaveLength(0)
  })

  it('conserva checksum, orden y claves naturales durante una réplica', () => {
    const original = { ...entrada('prueba-replica'), fechaFuente: '2026-10-16' }
    const preparada = prepararVersion(original)
    const reconstruida = { ...original, clave: undefined, claves: preparada.registros.map((r) => r.clave), fechaFuente: '2026-10-16T00:00:00.000Z' }
    expect(prepararVersion(reconstruida).id).toBe(preparada.id)
    expect(() => prepararVersion(entrada('prueba-duplicada', [{ id: 'uno', valor: 1 }, { id: 'uno', valor: 2 }]))).toThrow('duplicada')
  })
})
