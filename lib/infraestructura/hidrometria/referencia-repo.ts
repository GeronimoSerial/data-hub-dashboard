// Persistencia de la referencia estadística de niveles por estación (mediana, p10, p90)
// derivada del histórico de Prefectura. Clave: estacionId + ventanaDias.
import { eq, sql } from 'drizzle-orm'
import type { getDb } from '@/lib/db'
import { hidroReferencia } from '@/lib/db/schema'

type Db = ReturnType<typeof getDb>

export type FilaReferencia = {
  estacionId: string
  ventanaDias: number
  n: number
  medianaM: number
  p10M: number
  p90M: number
  desde: string
  hasta: string
  fuente: string
  calculadoEn: string
}

/** Inserta o actualiza la referencia de una estación para una ventana (upsert por PK). */
export async function guardarReferencia(db: Db, fila: FilaReferencia): Promise<void> {
  await db
    .insert(hidroReferencia)
    .values(fila)
    .onConflictDoUpdate({
      target: [hidroReferencia.estacionId, hidroReferencia.ventanaDias],
      set: {
        n: fila.n,
        medianaM: fila.medianaM,
        p10M: fila.p10M,
        p90M: fila.p90M,
        desde: fila.desde,
        hasta: fila.hasta,
        fuente: fila.fuente,
        calculadoEn: fila.calculadoEn,
      },
      setWhere: sql`${hidroReferencia.calculadoEn} <= ${fila.calculadoEn}`,
    })
}

/** Devuelve las referencias de una ventana indexadas por estacionId. */
export async function obtenerReferencias(
  db: Db,
  ventanaDias: number,
): Promise<Map<string, FilaReferencia>> {
  const filas = await db
    .select()
    .from(hidroReferencia)
    .where(eq(hidroReferencia.ventanaDias, ventanaDias))
  return new Map(filas.map((fila) => [fila.estacionId, fila]))
}
