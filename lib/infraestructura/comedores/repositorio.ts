import { getDb } from '@/lib/db'
import { infraComedorEscuela } from '@/lib/db/schema'
import type { ComedorAgregado } from './importar'
import type { ServicioComedor } from './estado'

const TAMANO_LOTE = 500

// Reemplazo completo en una transacción: la planilla del MEC es la foto vigente,
// así que un CUE que deja de figurar deja de tener servicio registrado.
export async function reemplazarComedores(
  comedores: readonly ComedorAgregado[],
  opciones: { fuente: string; ahora?: Date },
  db = getDb(),
): Promise<{ insertados: number }> {
  const importadoEn = (opciones.ahora ?? new Date()).toISOString()
  await db.transaction(async (tx) => {
    await tx.delete(infraComedorEscuela)
    for (let i = 0; i < comedores.length; i += TAMANO_LOTE) {
      await tx.insert(infraComedorEscuela).values(
        comedores.slice(i, i + TAMANO_LOTE).map((c) => ({
          cueAnexo: c.cueAnexo,
          desayuno: c.desayuno,
          almuerzo: c.almuerzo,
          proveedor: c.proveedor,
          fuente: opciones.fuente,
          importadoEn,
        })),
      )
    }
  })
  return { insertados: comedores.length }
}

export async function cargarComedoresPorCue(db = getDb()): Promise<Map<string, ServicioComedor>> {
  const filas = await db.select().from(infraComedorEscuela)
  return new Map(filas.map((f) => [f.cueAnexo, { desayuno: f.desayuno, almuerzo: f.almuerzo }]))
}
