import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { verification } from '@/lib/db/schema'

// Ticket de un solo uso que GE recibe por redirección y el callback canjea por
// una sesión de better-auth. Sólo se guarda el sha256 en la tabla `verification`.
export const GE_TICKET_TTL_MS = 60_000
const PREFIJO = 'ge-sso:'

export function generarTicket(): string {
  return randomBytes(32).toString('base64url')
}

export function hashTicket(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function emitirTicket(userId: string, ahora = Date.now()): Promise<string> {
  const token = generarTicket()
  await getDb()
    .insert(verification)
    .values({
      id: randomUUID(),
      identifier: `${PREFIJO}${hashTicket(token)}`,
      value: userId,
      expiresAt: new Date(ahora + GE_TICKET_TTL_MS),
    })
  return token
}

/** Consume el ticket en una sola sentencia (DELETE ... RETURNING): un ticket
 *  canjeado o vencido no vuelve a servir. Devuelve el userId o null. */
export async function consumirTicket(token: string, ahora = Date.now()): Promise<string | null> {
  if (!token) return null
  const [fila] = await getDb()
    .delete(verification)
    .where(and(eq(verification.identifier, `${PREFIJO}${hashTicket(token)}`)))
    .returning({ userId: verification.value, expiresAt: verification.expiresAt })
  if (!fila || fila.expiresAt.getTime() <= ahora) return null
  return fila.userId
}
