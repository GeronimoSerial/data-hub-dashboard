// Enlaces compartidos del veredicto diario. El token en claro se devuelve una
// sola vez al crear el enlace; en base solo queda su hash sha256 (hex).
// Vencen al fin del día civil ART de creación (23:59:59.999 ART = 02:59:59.999Z).
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import type { getDb } from '@/lib/db'
import { infraVeredictoEnlace } from '@/lib/db/schema'
import { fechaArt } from './dia'
import { actorAuditoria, describirAuditoria } from '../auditoria/contexto'

export type Db = ReturnType<typeof getDb>

export type ResultadoEnlace =
  | { estado: 'valido'; desde: string; hasta: string; venceEn: string }
  | { estado: 'vencido'; venceEn: string }
  | { estado: 'revocado' }
  | { estado: 'inexistente' }

const DESPLAZAMIENTO_ART_MS = 3 * 60 * 60 * 1000

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Fin del día civil ART de `ahora` (23:59:59.999 ART) en ISO UTC. */
export function venceEnFinDelDiaArt(ahora: Date): string {
  const medianocheUtc = Date.parse(`${fechaArt(ahora)}T23:59:59.999Z`)
  return new Date(medianocheUtc + DESPLAZAMIENTO_ART_MS).toISOString()
}

export async function crearEnlace(
  db: Db,
  params: { desde: string; hasta: string; creadoPor: string; ahora?: Date },
): Promise<{ token: string; venceEn: string; id: string }> {
  const ahora = params.ahora ?? new Date()
  const token = randomBytes(32).toString('base64url')
  const venceEn = venceEnFinDelDiaArt(ahora)
  const id = randomUUID()
  await db.insert(infraVeredictoEnlace).values({
    id,
    tokenHash: hashToken(token),
    fechaDesde: params.desde,
    fechaHasta: params.hasta,
    creadoPor: params.creadoPor,
    creadoEn: ahora.toISOString(),
    venceEn,
    revocadoEn: null,
    revocadoPor: null,
  })
  return { token, venceEn, id }
}

export async function resolverEnlace(
  db: Db,
  token: string,
  ahora: Date = new Date(),
): Promise<ResultadoEnlace> {
  const [fila] = await db
    .select()
    .from(infraVeredictoEnlace)
    .where(eq(infraVeredictoEnlace.tokenHash, hashToken(token)))
    .limit(1)
  if (!fila) return { estado: 'inexistente' }
  describirAuditoria({ objetoTipo: 'enlace', objetoId: fila.id, metadatos: { enlaceId: fila.id } })
  if (fila.revocadoEn) return { estado: 'revocado' }
  const venceEn = fila.venceEn ?? ''
  // Fail-closed: un vencimiento ausente o ilegible cuenta como vencido.
  const venceMs = Date.parse(venceEn)
  if (!Number.isFinite(venceMs) || ahora.getTime() > venceMs) return { estado: 'vencido', venceEn }
  actorAuditoria({ actorTipo: 'enlace', actorId: fila.id, actorRol: null, viaAcceso: 'enlace_veredicto' })
  return {
    estado: 'valido',
    desde: fila.fechaDesde ?? '',
    hasta: fila.fechaHasta ?? '',
    venceEn,
  }
}

/** Revoca los enlaces vigentes que vencen al fin del día ART de `ahora`. */
export async function revocarEnlacesDelDia(
  db: Db,
  params: { revocadoPor: string; ahora?: Date },
): Promise<number> {
  const ahora = params.ahora ?? new Date()
  const filas = await db
    .update(infraVeredictoEnlace)
    .set({ revocadoEn: ahora.toISOString(), revocadoPor: params.revocadoPor })
    .where(
      and(
        eq(infraVeredictoEnlace.venceEn, venceEnFinDelDiaArt(ahora)),
        isNull(infraVeredictoEnlace.revocadoEn),
      ),
    )
    .returning({ id: infraVeredictoEnlace.id })
  return filas.length
}
