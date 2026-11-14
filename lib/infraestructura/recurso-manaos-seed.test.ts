import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb } from '@/lib/db'
import { recursos } from '@/lib/db/schema'
import { ensureSeeded } from '@/lib/db/seed'
import { upsertRecursoManaos } from '@/lib/infraestructura/recurso-seed'

usarDbTemporal('recurso-manaos-', { seed: false })

const URL_MANAOS = 'https://manaos.example/mapas/infraestructura'

async function filaManaos() {
  const [row] = await getDb().select().from(recursos).where(eq(recursos.id, 'recurso-enos-manaos'))
  return row
}

describe('upsertRecursoManaos', () => {
  beforeEach(async () => {
    await ensureSeeded()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('is a no-op when ENOS_MANAOS_URL is not set', async () => {
    vi.stubEnv('ENOS_MANAOS_URL', '')
    await upsertRecursoManaos()
    expect(await filaManaos()).toBeUndefined()
  })

  it('is a no-op when ENOS_MANAOS_URL is not https', async () => {
    vi.stubEnv('ENOS_MANAOS_URL', 'http://manaos.example/mapas/infraestructura')
    await upsertRecursoManaos()
    expect(await filaManaos()).toBeUndefined()
  })

  it('inserts the external card when ENOS_MANAOS_URL is https, idempotently', async () => {
    vi.stubEnv('ENOS_MANAOS_URL', URL_MANAOS)
    await upsertRecursoManaos()
    await upsertRecursoManaos()

    const row = await filaManaos()
    expect(row).toBeDefined()
    expect(row?.titulo).toBe('ENOS Manaos')
    expect(row?.formato).toBe('mapa')
    expect(row?.estado).toBe('publicado')
    expect(row?.categoriaId).toBe('infraestructura')
    expect(row?.ruta).toBe(URL_MANAOS)
    expect(row?.descripcion).toBe('Mapa de infraestructura escolar del despliegue de Manaos (Amazonas, Brasil).')
  })
})
