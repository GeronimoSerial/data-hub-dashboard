import { and, eq, gte } from 'drizzle-orm'
import { getDb } from '../db'
import { infraProblematica } from '../db/schema'

// Ventanas y techos deliberadamente conservadores: el endpoint es público
// (contrato de solo-CUE, sin autenticación) y estos límites son la única
// contención contra abuso. Ver riesgos de B3 en el plan de batches.
export const IP_WINDOW_MS = 60_000
export const IP_MAX_REQUESTS = 10

export const CUE_WINDOW_MS = 24 * 60 * 60 * 1000
export const CUE_MAX_ALERTAS_ACTIVAS = 5

interface Bucket {
  count: number
  windowStart: number
}

const ipBuckets = new Map<string, Bucket>()

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  const real = request.headers.get('x-real-ip')
  if (real) return real.trim()
  return 'unknown'
}

// true = excede el límite y la request debe rechazarse.
export function ipExcedeLimite(ip: string, now: number = Date.now()): boolean {
  const bucket = ipBuckets.get(ip)
  if (!bucket || now - bucket.windowStart > IP_WINDOW_MS) {
    ipBuckets.set(ip, { count: 1, windowStart: now })
    return false
  }
  bucket.count += 1
  return bucket.count > IP_MAX_REQUESTS
}

export function _resetLimitesParaTests(): void {
  ipBuckets.clear()
}

export async function contarAlertasActivasPorCue(
  cueAnexo: string,
  now: number = Date.now(),
): Promise<number> {
  const db = getDb()
  const desde = new Date(now - CUE_WINDOW_MS).toISOString()
  const rows = await db
    .select({ id: infraProblematica.id })
    .from(infraProblematica)
    .where(and(eq(infraProblematica.cueAnexo, cueAnexo), gte(infraProblematica.creadaEn, desde)))
  return rows.length
}
