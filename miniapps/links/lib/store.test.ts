import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { getDb, migrarDb } from '@/lib/db'
import { linktreeConfig } from '@/lib/db/schema'
import { CONFIG_INICIAL } from './config'
import { cargarConfig, guardarConfig } from './store'

vi.mock('@/lib/db/seed', () => ({ ensureSeeded: () => { throw new Error('No seed en links') } }))
beforeAll(() => migrarDb())
beforeEach(async () => { await getDb().delete(linktreeConfig) })

const documento = { ...CONFIG_INICIAL, titulo: 'Accesos' }
describe('documento único de links', () => {
  it('lee vacío sin seed', async () => {
    expect(await cargarConfig()).toEqual(CONFIG_INICIAL)
  })
  it('guarda revisión y autor real', async () => {
    expect(await guardarConfig(documento, 'ana')).toEqual({ ...documento, revision: 1 })
    const [fila] = await getDb().select().from(linktreeConfig).where(eq(linktreeConfig.id, 1))
    expect(fila.actualizadoPor).toBe('ana')
    expect((await cargarConfig()).revision).toBe(1)
  })
  it('rechaza revisión vieja y creación repetida sin sobrescribir', async () => {
    const primero = (await guardarConfig(documento, 'ana'))!
    expect(await guardarConfig(documento, 'otra')).toBeNull()
    const segundo = await guardarConfig({ ...primero, titulo: 'Nuevo' }, 'bea')
    expect(segundo?.revision).toBe(2)
    expect(await guardarConfig({ ...primero, titulo: 'Viejo' }, 'ana')).toBeNull()
    expect((await cargarConfig()).titulo).toBe('Nuevo')
  })
  it('resuelve dos escrituras de la misma revisión con un solo ganador', async () => {
    const resultados = await Promise.all([guardarConfig(documento, 'ana'), guardarConfig(documento, 'bea')])
    expect(resultados.filter(Boolean)).toHaveLength(1)
  })
  it('advierte configuración inválida sin volcarla', async () => {
    const log = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await getDb().insert(linktreeConfig).values({ id: 1, config: { dato: 'no divulgar' }, revision: 4 })
    expect(await cargarConfig()).toEqual({ ...CONFIG_INICIAL, revision: 4 })
    expect(log).toHaveBeenCalledWith('links_config_invalida')
    log.mockRestore()
  })
})
