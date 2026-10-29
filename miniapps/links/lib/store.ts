import { and, eq, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { linktreeConfig } from '@/lib/db/schema'
import { CONFIG_INICIAL, leerConfig, type LinksConfig } from './config'

const FILA_UNICA = 1

// Migrations are an operational prerequisite; an anonymous read never initializes the Hub.
export async function cargarConfig(): Promise<LinksConfig> {
  const [fila] = await getDb().select().from(linktreeConfig).where(eq(linktreeConfig.id, FILA_UNICA))
  return fila ? { ...leerConfig(fila.config), revision: fila.revision } : { ...CONFIG_INICIAL }
}

/** Null signals a stale revision, including concurrent creation of the first document. */
export async function guardarConfig(config: LinksConfig, usuario: string): Promise<LinksConfig | null> {
  const { revision, ...documento } = config
  const valores = {
    config: documento as unknown as Record<string, unknown>,
    actualizadoPor: usuario,
    actualizadoEn: sql`now()`,
    revision: revision + 1,
  }
  const filas = revision === 0
    ? await getDb().insert(linktreeConfig).values({ id: FILA_UNICA, ...valores }).onConflictDoNothing().returning({ id: linktreeConfig.id })
    : await getDb().update(linktreeConfig).set(valores)
      .where(and(eq(linktreeConfig.id, FILA_UNICA), eq(linktreeConfig.revision, revision)))
      .returning({ id: linktreeConfig.id })
  return filas.length ? { ...config, revision: revision + 1 } : null
}
