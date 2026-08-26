import { eq } from 'drizzle-orm'
import type { Role, SessionUser } from '@/lib/acl'
import { getDb } from '@/lib/db'
import { user, userNiveles } from '@/lib/db/schema'

export const LAST_ADMIN_ERROR = 'No se puede quitar el último administrador'

const ROLES: Role[] = ['admin', 'editor', 'consulta']
const MIN_PASSWORD = 8

export type HubUser = {
  id: string
  name: string
  email: string
  role: Role
  banned: boolean
  nivelIds: string[]
}

export type CreateUserBody = {
  email: string
  name: string
  password: string
  role: Role
  nivelIds: string[]
}

export type PatchUserBody = {
  name?: string
  role?: Role
  banned?: boolean
  password?: string
  nivelIds?: string[]
}

export function listUsuariosDenied(user: SessionUser | null) {
  if (!user) return { status: 401 as const, error: 'No autenticado' }
  if (user.banned || user.role === 'consulta')
    return { status: 403 as const, error: 'No tenés acceso a este recurso' }
  return null
}

export function mutateUsuariosDenied(user: SessionUser | null) {
  if (!user) return { status: 401 as const, error: 'No autenticado' }
  if (user.banned || user.role !== 'admin')
    return { status: 403 as const, error: 'No tenés acceso a este recurso' }
  return null
}

export function emailHasTld(email: string) {
  const trimmed = email.trim().toLowerCase()
  const at = trimmed.lastIndexOf('@')
  if (at < 1) return false
  const domain = trimmed.slice(at + 1)
  return (
    domain.includes('.') &&
    !domain.startsWith('.') &&
    !domain.endsWith('.') &&
    !domain.includes(' ')
  )
}

function asRole(value: unknown): Role | null {
  if (typeof value !== 'string') return null
  return ROLES.includes(value as Role) ? (value as Role) : null
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0)
}

export function parseCreateUserBody(body: unknown): CreateUserBody | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  if (typeof b.email !== 'string' || !emailHasTld(b.email)) return null
  if (typeof b.name !== 'string' || !b.name.trim()) return null
  if (typeof b.password !== 'string' || b.password.length < MIN_PASSWORD)
    return null
  const role = asRole(b.role)
  if (!role) return null
  return {
    email: b.email.trim().toLowerCase(),
    name: b.name.trim(),
    password: b.password,
    role,
    nivelIds: asStringArray(b.nivelIds),
  }
}

export function parsePatchUserBody(body: unknown): PatchUserBody | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  const patch: PatchUserBody = {}

  if ('name' in b) {
    if (typeof b.name !== 'string' || !b.name.trim()) return null
    patch.name = b.name.trim()
  }
  if ('role' in b) {
    const role = asRole(b.role)
    if (!role) return null
    patch.role = role
  }
  if ('banned' in b) {
    if (typeof b.banned !== 'boolean') return null
    patch.banned = b.banned
  }
  if ('password' in b) {
    if (typeof b.password !== 'string') return null
    const password = b.password.trim()
    if (password.length === 0) {
      // omit — empty reset field means leave password unchanged
    } else if (password.length < MIN_PASSWORD) {
      return null
    } else {
      patch.password = password
    }
  }
  if ('nivelIds' in b) {
    if (!Array.isArray(b.nivelIds)) return null
    patch.nivelIds = asStringArray(b.nivelIds)
  }

  return patch
}

export function wouldRemoveLastAdmin(opts: {
  targetId: string
  unbannedAdminIds: string[]
  nextRole?: Role
  nextBanned?: boolean
}) {
  const isLast =
    opts.unbannedAdminIds.length === 1 &&
    opts.unbannedAdminIds[0] === opts.targetId
  if (!isLast) return false
  const downgrade = opts.nextRole !== undefined && opts.nextRole !== 'admin'
  const ban = opts.nextBanned === true
  return downgrade || ban
}

export function authApiError(err: unknown): { status: number; error: string } {
  if (err && typeof err === 'object') {
    const e = err as {
      status?: unknown
      statusCode?: unknown
      message?: unknown
      body?: { message?: unknown }
    }
    const raw = Number(e.statusCode ?? e.status)
    const status = raw >= 400 && raw < 600 ? raw : 400
    const fromBody =
      typeof e.body?.message === 'string' ? e.body.message : undefined
    const fromMessage = typeof e.message === 'string' ? e.message : undefined
    return { status, error: fromBody || fromMessage || 'No se pudo guardar' }
  }
  return { status: 400, error: 'No se pudo guardar' }
}

export async function listHubUsers(): Promise<HubUser[]> {
  const db = getDb()
  const [users, nivelRows] = await Promise.all([
    db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        banned: user.banned,
      })
      .from(user),
    db.select().from(userNiveles),
  ])
  const nivelIdsByUser = new Map<string, string[]>()
  for (const row of nivelRows) {
    const list = nivelIdsByUser.get(row.userId)
    if (list) list.push(row.nivelId)
    else nivelIdsByUser.set(row.userId, [row.nivelId])
  }
  return users.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    role: (row.role as Role | null) ?? 'consulta',
    banned: Boolean(row.banned),
    nivelIds: nivelIdsByUser.get(row.id) ?? [],
  }))
}

export async function unbannedAdminIds() {
  const rows = await getDb()
    .select({ id: user.id, role: user.role, banned: user.banned })
    .from(user)
    .where(eq(user.role, 'admin'))
  return rows.filter((row) => !row.banned).map((row) => row.id)
}

export async function replaceUserNiveles(userId: string, nivelIds: string[]) {
  const db = getDb()
  await db.delete(userNiveles).where(eq(userNiveles.userId, userId))
  const unique = [...new Set(nivelIds.filter(Boolean))]
  if (unique.length === 0) return
  await db.insert(userNiveles).values(unique.map((nivelId) => ({ userId, nivelId })))
}
