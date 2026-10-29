import { eq, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { linktreeConfig } from '@/lib/db/schema'
import { ensureSeeded } from '@/lib/db/seed'
import { CONFIG_INICIAL, configSchema, leerConfig, type LinktreeConfig } from './config'

const FILA_UNICA = 1

export async function cargarConfig(): Promise<LinktreeConfig> {
  await ensureSeeded()
  const [fila] = await getDb()
    .select({ config: linktreeConfig.config })
    .from(linktreeConfig)
    .where(eq(linktreeConfig.id, FILA_UNICA))
  return fila ? leerConfig(fila.config) : CONFIG_INICIAL
}

/** The caller must have validated `config` with `configSchema` and authorized `userId`. */
export async function guardarConfig(config: LinktreeConfig, userId: string) {
  await ensureSeeded()
  const valores = {
    config: config as unknown as Record<string, unknown>,
    actualizadoPor: userId,
    actualizadoEn: sql`now()`,
  }
  await getDb()
    .insert(linktreeConfig)
    .values({ id: FILA_UNICA, ...valores })
    .onConflictDoUpdate({ target: linktreeConfig.id, set: valores })
}

/**
 * Read-modify-write under a row lock, so two simultaneous edits both land.
 * Returns null, saving nothing, when the result does not pass `configSchema`.
 */
export async function actualizarConfig(
  userId: string,
  cambio: (actual: LinktreeConfig) => LinktreeConfig,
): Promise<LinktreeConfig | null> {
  await ensureSeeded()
  return getDb().transaction(async (tx) => {
    const [fila] = await tx
      .select({ config: linktreeConfig.config })
      .from(linktreeConfig)
      .where(eq(linktreeConfig.id, FILA_UNICA))
      .for('update')
    const siguiente = configSchema.safeParse(cambio(fila ? leerConfig(fila.config) : CONFIG_INICIAL))
    if (!siguiente.success) return null
    const valores = {
      config: siguiente.data as unknown as Record<string, unknown>,
      actualizadoPor: userId,
      actualizadoEn: sql`now()`,
    }
    await tx
      .insert(linktreeConfig)
      .values({ id: FILA_UNICA, ...valores })
      .onConflictDoUpdate({ target: linktreeConfig.id, set: valores })
    return siguiente.data
  })
}
