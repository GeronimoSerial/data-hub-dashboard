import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import type { Role, SessionUser } from '@/lib/acl'
import { user } from '@/lib/db/schema'
import { listMemberships, type MembershipRepository } from './memberships'
import { isBookletAdmin } from './permissions'

const MAX_TARGET_ID_LENGTH = 128

export type ViewAsAccount = { id: string; name: string; role: Role | null; banned: boolean }
export type ViewAsRepository = { findAccount(userId: string): Promise<ViewAsAccount | null> }

export type ViewAsResolution =
  | { status: 'self'; actor: SessionUser | null }
  | { status: 'viewing'; actor: SessionUser; target: { userId: string; name: string } }
  | { status: 'unavailable' }

export type ViewAsCandidate = {
  userId: string
  name: string
  email: string
  capabilities: Array<'cabecera' | 'supervisor'>
}

const databaseRepository: ViewAsRepository = {
  async findAccount(userId) {
    const [account] = await getDb()
      .select({ id: user.id, name: user.name, role: user.role, banned: user.banned })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1)
    return account ? { id: account.id, name: account.name, role: (account.role as Role | null) ?? null, banned: account.banned === true } : null
  },
}

/**
 * Resolves the read-only actor for "ver como". Only a real admin (isBookletAdmin) may
 * read as another account; for everyone else the parameter is ignored. The target
 * must exist and be unbanned. Callers use the returned actor for GET reads only;
 * mutations always keep the session actor.
 */
export async function resolveViewAsActor(
  actor: SessionUser | null,
  viewAsUserId: string | null | undefined,
  repository: ViewAsRepository = databaseRepository,
  isAdmin: (actor: SessionUser | null) => Promise<boolean> = isBookletAdmin,
): Promise<ViewAsResolution> {
  const requested = viewAsUserId?.trim()
  if (!requested) return { status: 'self', actor }
  if (!await isAdmin(actor)) return { status: 'self', actor }
  if (requested.length > MAX_TARGET_ID_LENGTH) return { status: 'unavailable' }
  if (requested === actor?.id) return { status: 'self', actor }

  let account: ViewAsAccount | null
  try {
    account = await repository.findAccount(requested)
  } catch {
    return { status: 'unavailable' }
  }
  if (!account || account.banned) return { status: 'unavailable' }

  // Read-only identity: no hub policy, no school scope. Booklet capabilities are
  // resolved from the target's own memberships and assignments by the callers.
  const target: SessionUser = {
    id: account.id,
    role: account.role ?? 'consulta',
    banned: false,
    nivelJurIds: [],
    accesoRecursos: 'seleccionados',
    recursoIds: [],
  }
  return { status: 'viewing', actor: target, target: { userId: account.id, name: account.name } }
}

/** Lists accounts an admin can view as: active supervisor or cabecera holders, one row per account. */
export async function listViewAsCandidates(actor: SessionUser, repository?: MembershipRepository): Promise<ViewAsCandidate[]> {
  const memberships = await listMemberships(actor, repository)
  const byUser = new Map<string, ViewAsCandidate>()
  for (const membership of memberships) {
    if (membership.capability !== 'supervisor' && membership.capability !== 'cabecera') continue
    const current = byUser.get(membership.userId) ?? {
      userId: membership.userId, name: membership.userName, email: membership.userEmail, capabilities: [],
    }
    if (!current.capabilities.includes(membership.capability)) current.capabilities.push(membership.capability)
    byUser.set(membership.userId, current)
  }
  return [...byUser.values()].sort((a, b) => a.name.localeCompare(b.name))
}
