import { getDb } from '@/lib/db'
import { geSsoEvento } from '@/lib/db/schema'

export type EventoGeSso = {
  email?: string | null
  rol?: string | null
  cue?: string | null
  nivelJurisdiccionalId?: number | null
  ip?: string | null
  /** Código corto: `ok`, `ticket_consumido`, `api_key_invalida`, `rate_limit`, etc. */
  resultado: string
}

/** Registra un evento de auditoría. Nunca recibe ni guarda la api_key. Un fallo
 *  de auditoría no debe tumbar el login: se loguea y se sigue. */
export async function registrarEventoGeSso(evento: EventoGeSso): Promise<void> {
  try {
    await getDb()
      .insert(geSsoEvento)
      .values({
        email: evento.email?.slice(0, 254) ?? null,
        rol: evento.rol ?? null,
        cue: evento.cue?.slice(0, 20) ?? null,
        nivelJurisdiccionalId: evento.nivelJurisdiccionalId ?? null,
        ip: evento.ip?.slice(0, 64) ?? null,
        resultado: evento.resultado,
      })
  } catch (err) {
    console.error('[ge-sso] no se pudo registrar el evento de auditoría', evento.resultado, err)
  }
}
