import { and, desc, eq, gt, isNull } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { infraPermisoNominal } from '@/lib/db/schema'
import type { SessionUser } from '@/lib/acl'

export interface PermisoNominal {
  id: string
  userId: string
  otorgadoPor: string
  otorgadoEn: string
  venceEn: string
  revocadoEn: string | null
}

// Admin and SSO management roles have nominal access without a separate grant.
// Callers must still enforce section/resource and jurisdiction scope; actual
// identity reads remain transactionally audited by consultarYRegistrarAfectados.
// Editors and consulta users still require a valid, unrevoked grant.
export async function puedeVerNominal(
  user: SessionUser | null,
  ahora: Date,
): Promise<boolean> {
  if (!user || user.banned) return false
  // operador_establecimiento nunca ve nombres de alumnos, ni con grant vigente.
  if (user.role === 'operador_establecimiento') return false
  if (user.role === 'admin' || user.role === 'admin_ge' || user.role === 'director_nivel') return true

  const db = getDb()
  const [grant] = await db
    .select({ id: infraPermisoNominal.id })
    .from(infraPermisoNominal)
    .where(
      and(
        eq(infraPermisoNominal.userId, user.id),
        isNull(infraPermisoNominal.revocadoEn),
        gt(infraPermisoNominal.venceEn, ahora.toISOString()),
      ),
    )
    .limit(1)

  return Boolean(grant)
}

// Sólo se llama desde una ruta ya protegida con adminPageGate/staffGuard +
// role === 'admin'. `venceEn` es obligatorio: no existen grants permanentes.
// Un admin puede otorgárselo a sí mismo; queda registrado igual en
// otorgado_por, que nunca es opcional.
export async function otorgarPermisoNominal(params: {
  userId: string
  otorgadoPor: string
  venceEn: Date
}): Promise<PermisoNominal> {
  const db = getDb()
  const row: PermisoNominal = {
    id: crypto.randomUUID(),
    userId: params.userId,
    otorgadoPor: params.otorgadoPor,
    otorgadoEn: new Date().toISOString(),
    venceEn: params.venceEn.toISOString(),
    revocadoEn: null,
  }
  await db.insert(infraPermisoNominal).values(row)
  return row
}

export async function revocarPermisoNominal(id: string): Promise<void> {
  const db = getDb()
  await db
    .update(infraPermisoNominal)
    .set({ revocadoEn: new Date().toISOString() })
    .where(eq(infraPermisoNominal.id, id))
}

export async function listarPermisosNominales(): Promise<PermisoNominal[]> {
  const db = getDb()
  return db
    .select()
    .from(infraPermisoNominal)
    .orderBy(desc(infraPermisoNominal.otorgadoEn))
}
