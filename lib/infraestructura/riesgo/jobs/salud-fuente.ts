import type { getDb } from '@/lib/db'
import { conReintentoPorBloqueo } from '@/lib/db/reintento'
import { hazardSourceHealth } from '@/lib/db/schema'

type Db = ReturnType<typeof getDb>
export type EstadoSaludFuente = 'ok' | 'degradado' | 'no_disponible'

export function resumirErrores(
  errores: Record<string, string>,
  largoMax: number,
): { estado: 'ok' | 'degradado'; ultimoErrorSaneado: string | null } {
  const mensajes = Object.values(errores)
  const hayError = mensajes.length > 0
  return {
    estado: hayError ? 'degradado' : 'ok',
    ultimoErrorSaneado: hayError ? mensajes[0].slice(0, largoMax) : null,
  }
}

export async function actualizarSaludFuente(
  db: Db,
  params: {
    provider: string
    ttlMinutos: number
    licencia: string
    estado: EstadoSaludFuente
    ultimoErrorSaneado: string | null
    ahoraIso: string
    reintentarSiBloqueado?: boolean
  },
): Promise<void> {
  const guardar = () => {
    const hayExito = params.estado === 'ok'
    return db
      .insert(hazardSourceHealth)
      .values({
        provider: params.provider,
        // Un insert degradado/no disponible no conoce un éxito previo: null.
        ultimoExitoEn: hayExito ? params.ahoraIso : null,
        ultimoIntentoEn: params.ahoraIso,
        estado: params.estado,
        ultimoErrorSaneado: params.ultimoErrorSaneado,
        ttlMinutos: params.ttlMinutos,
        licencia: params.licencia,
        actualizadaEn: params.ahoraIso,
      })
      .onConflictDoUpdate({
        target: hazardSourceHealth.provider,
        set: {
          estado: params.estado,
          ultimoIntentoEn: params.ahoraIso,
          ultimoErrorSaneado: params.ultimoErrorSaneado,
          ttlMinutos: params.ttlMinutos,
          licencia: params.licencia,
          actualizadaEn: params.ahoraIso,
          // En degradado se preserva el último éxito conocido; en ok se actualiza.
          ...(hayExito ? { ultimoExitoEn: params.ahoraIso } : {}),
        },
      })
  }

  // El statement de upsert es seguro de reintentar ante SQLITE_BUSY.
  if (params.reintentarSiBloqueado === false) await guardar()
  else await conReintentoPorBloqueo(guardar)
}
