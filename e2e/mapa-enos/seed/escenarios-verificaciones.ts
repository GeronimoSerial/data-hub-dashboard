import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { infraVerificacion } from '@/lib/db/schema'
import { cancelarVerificacion, crearVerificacion } from '@/lib/infraestructura/verificaciones'

// Escenarios de verificaciones ENOS (indicador I10). Cada escenario crea su fila con la función de la
// app (crearVerificacion) y la limpia al final: se cancela con cancelarVerificacion si sigue pendiente;
// si ya fue respondida no se puede cancelar, y se borra la fila (no hay trigger que lo impida; los
// eventos caen por ON DELETE CASCADE).

const ACTOR_QA = 'qa-admin'

/** Crea una verificación pendiente con enlace vigente, con la función de la app. Devuelve su id. */
export async function sembrarVerificacionPendiente(cueAnexo: string): Promise<string> {
  const resultado = await crearVerificacion({ cueAnexo, solicitadaPorUserId: ACTOR_QA })
  if (!resultado.ok) {
    throw new Error(`sembrarVerificacionPendiente: crearVerificacion devolvió ${resultado.motivo}`)
  }
  return resultado.verificacion.id
}

/**
 * Deja vencido el enlace de la verificación. Único cambio fuera de la app: `tokenExpiraEn` es la
 * credencial que la app calcula al crear; se retrasa a ayer solo para este escenario.
 */
export async function vencerEnlace(id: string): Promise<void> {
  const ayer = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  await getDb()
    .update(infraVerificacion)
    .set({ tokenExpiraEn: ayer })
    .where(eq(infraVerificacion.id, id))
}

/** Limpia la verificación creada por el escenario. Cancela si sigue pendiente, borra si ya fue respondida. */
export async function limpiarVerificacion(id: string): Promise<void> {
  const cancelada = await cancelarVerificacion({ verificacionId: id, actorUserId: ACTOR_QA, motivo: 'limpieza e2e' })
  if (cancelada.ok) return
  await getDb().delete(infraVerificacion).where(eq(infraVerificacion.id, id))
}
