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

// El rol 'admin' accede al alcance nominal sin grant previo. Decisión
// explícita del titular del dato, que revierte el criterio original de B7: un
// admin ya podía otorgarse el permiso a sí mismo (otorgarPermisoNominal no
// impide el auto-otorgamiento), de modo que el grant no era una barrera para
// ese rol sino un trámite previo. Lo que sostiene el control sigue en pie y no
// depende de esta función: cada consulta efectiva queda registrada en
// infra_acceso_nominal_log dentro de la misma transacción que sirve los
// nombres (ver consultarYRegistrarAfectados en identidad.ts).
//
// 'editor' NO entra acá: lib/acl.ts:23 le da true incondicional en puedeAbrir(),
// y extender ese criterio al dato nominal sí vaciaría infra_permiso_nominal de
// sentido. Para cualquier rol distinto de 'admin' el grant vigente y no vencido
// sigue siendo la única puerta. Ver B7 en docs/alertas-infraestructura-batches.md.
export async function puedeVerNominal(
  user: SessionUser | null,
  ahora: Date,
): Promise<boolean> {
  if (!user || user.banned) return false
  if (user.role === 'admin') return true

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
