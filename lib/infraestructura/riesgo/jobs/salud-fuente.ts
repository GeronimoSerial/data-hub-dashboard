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
    // Filas recibidas de la fuente en esta corrida (no las insertadas: una
    // corrida con todas las lecturas duplicadas recibió filas). Si se omite,
    // no se aplica la regla de `ok` con 0 filas.
    filasRecibidas?: number
    // Sólo cuando 0 filas es lo esperado porque no había nada nuevo que pedir.
    yaSincronizado?: boolean
  },
): Promise<void> {
  // Un `ok` sin filas recibidas no es un éxito: la fuente respondió vacía.
  const sinFilasInesperadas =
    params.estado === 'ok' && params.filasRecibidas === 0 && !params.yaSincronizado
  const estado: EstadoSaludFuente = sinFilasInesperadas ? 'degradado' : params.estado
  const ultimoErrorSaneado = sinFilasInesperadas
    ? 'no rows received from source'
    : params.ultimoErrorSaneado

  const guardar = () => {
    const hayExito = estado === 'ok'
    return db
      .insert(hazardSourceHealth)
      .values({
        provider: params.provider,
        // Un insert degradado/no disponible no conoce un éxito previo: null.
        ultimoExitoEn: hayExito ? params.ahoraIso : null,
        ultimoIntentoEn: params.ahoraIso,
        estado,
        ultimoErrorSaneado,
        ttlMinutos: params.ttlMinutos,
        licencia: params.licencia,
        actualizadaEn: params.ahoraIso,
      })
      .onConflictDoUpdate({
        target: hazardSourceHealth.provider,
        set: {
          estado,
          ultimoIntentoEn: params.ahoraIso,
          ultimoErrorSaneado,
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
