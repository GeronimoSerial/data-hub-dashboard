import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import type { SessionUser } from '@/lib/acl'
import { bookletMembership, user } from '@/lib/db/schema'
import { isBookletAdmin } from './permissions'
import { BookletServiceError } from './inventory'
import type { BookletCapability } from './types'

export type MembershipView = {
  id: string
  userId: string
  userName: string
  userEmail: string
  capability: BookletCapability
  grantedByUserId: string
  grantedAt: string
  revokedAt: string | null
}

export type MembershipRecord = Omit<MembershipView, 'grantedAt' | 'revokedAt'> & {
  grantedAt: Date
  revokedAt: Date | null
}

export type MembershipUser = { id: string; name: string; email: string }

export type MembershipRepository = {
  getAccountStatus(userId: string): Promise<{ emailVerified: boolean; banned: boolean } | null>
  getActiveMembership(userId: string, capability: BookletCapability): Promise<MembershipRecord | null>
  // Must ignore a conflict with the partial unique index on active rows.
  insertMembership(record: Pick<MembershipRecord, 'id' | 'userId' | 'capability' | 'grantedByUserId' | 'grantedAt'>): Promise<void>
  listActiveMemberships(): Promise<MembershipRecord[]>
  getMembership(id: string): Promise<MembershipRecord | null>
  // Returns false when no active row matched.
  revokeMembership(id: string, revokedAt: Date): Promise<boolean>
  searchUsers(query: string, limit: number): Promise<MembershipUser[]>
}

export const USER_SEARCH_LIMIT = 20

const toView = (record: MembershipRecord): MembershipView => ({
  id: record.id,
  userId: record.userId,
  userName: record.userName,
  userEmail: record.userEmail,
  capability: record.capability,
  grantedByUserId: record.grantedByUserId,
  grantedAt: record.grantedAt.toISOString(),
  revokedAt: record.revokedAt ? record.revokedAt.toISOString() : null,
})

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`)

const membershipColumns = {
  id: bookletMembership.id,
  userId: bookletMembership.userId,
  userName: user.name,
  userEmail: user.email,
  // The column is text constrained by a CHECK; narrow it to the service type.
  capability: sql<BookletCapability>`${bookletMembership.capability}`,
  grantedByUserId: bookletMembership.grantedByUserId,
  grantedAt: bookletMembership.grantedAt,
  revokedAt: bookletMembership.revokedAt,
}

export const databaseRepository: MembershipRepository = {
  async getAccountStatus(userId) {
    const [account] = await getDb()
      .select({ emailVerified: user.emailVerified, banned: user.banned })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1)
    return account ? { emailVerified: account.emailVerified, banned: account.banned === true } : null
  },

  async getActiveMembership(userId, capability) {
    const [row] = await getDb()
      .select(membershipColumns)
      .from(bookletMembership)
      .innerJoin(user, eq(user.id, bookletMembership.userId))
      .where(and(
        eq(bookletMembership.userId, userId),
        eq(bookletMembership.capability, capability),
        isNull(bookletMembership.revokedAt),
      ))
      .limit(1)
    return row ?? null
  },

  async insertMembership(record) {
    await getDb().insert(bookletMembership).values(record).onConflictDoNothing()
  },

  async listActiveMemberships() {
    return getDb()
      .select(membershipColumns)
      .from(bookletMembership)
      .innerJoin(user, eq(user.id, bookletMembership.userId))
      .where(isNull(bookletMembership.revokedAt))
      .orderBy(asc(user.name), desc(bookletMembership.grantedAt))
  },

  async getMembership(id) {
    const [row] = await getDb()
      .select(membershipColumns)
      .from(bookletMembership)
      .innerJoin(user, eq(user.id, bookletMembership.userId))
      .where(eq(bookletMembership.id, id))
      .limit(1)
    return row ?? null
  },

  async revokeMembership(id, revokedAt) {
    const updated = await getDb()
      .update(bookletMembership)
      .set({ revokedAt })
      .where(and(eq(bookletMembership.id, id), isNull(bookletMembership.revokedAt)))
      .returning({ id: bookletMembership.id })
    return updated.length > 0
  },

  async searchUsers(query, limit) {
    const pattern = `%${escapeLike(query)}%`
    return getDb()
      .select({ id: user.id, name: user.name, email: user.email })
      .from(user)
      .where(and(
        or(isNull(user.banned), eq(user.banned, false)),
        or(ilike(user.name, pattern), ilike(user.email, pattern)),
      ))
      .orderBy(asc(user.name))
      .limit(limit)
  },
}

async function requireAdmin(actor: SessionUser, repository: MembershipRepository) {
  if (!await isBookletAdmin(actor, repository)) throw new BookletServiceError('forbidden', 403)
}

export async function listMemberships(actor: SessionUser, repository: MembershipRepository = databaseRepository): Promise<MembershipView[]> {
  await requireAdmin(actor, repository)
  return (await repository.listActiveMemberships()).map(toView)
}

export async function searchUsers(actor: SessionUser, query: string, repository: MembershipRepository = databaseRepository): Promise<MembershipUser[]> {
  await requireAdmin(actor, repository)
  const trimmed = query.trim()
  if (trimmed === '') return []
  return repository.searchUsers(trimmed, USER_SEARCH_LIMIT)
}

// Idempotent: an active row for the same user and capability is returned as is.
// grantedByUserId always comes from the session actor, never from the request.
export async function grant(
  actor: SessionUser,
  userId: string,
  capability: BookletCapability,
  repository: MembershipRepository = databaseRepository,
): Promise<MembershipView> {
  await requireAdmin(actor, repository)
  const account = await repository.getAccountStatus(userId)
  if (!account) throw new BookletServiceError('user_not_found', 404)
  if (account.banned) throw new BookletServiceError('user_banned', 409)

  const existing = await repository.getActiveMembership(userId, capability)
  if (existing) return toView(existing)

  await repository.insertMembership({
    id: randomUUID(),
    userId,
    capability,
    grantedByUserId: actor.id,
    grantedAt: new Date(),
  })
  const granted = await repository.getActiveMembership(userId, capability)
  if (!granted) throw new BookletServiceError('membership_grant_failed', 503)
  return toView(granted)
}

export async function revoke(
  actor: SessionUser,
  membershipId: string,
  repository: MembershipRepository = databaseRepository,
): Promise<MembershipView> {
  await requireAdmin(actor, repository)
  const revoked = await repository.revokeMembership(membershipId, new Date())
  if (!revoked) throw new BookletServiceError('membership_not_found', 404)
  const membership = await repository.getMembership(membershipId)
  if (!membership) throw new BookletServiceError('membership_not_found', 404)
  return toView(membership)
}
