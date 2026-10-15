import { eq, inArray } from 'drizzle-orm'
import type { Role, SessionUser } from '@/lib/acl'
import { getDb } from '@/lib/db'
import {
  nivelesJurisdiccionales,
  recursos,
  user,
  userNivelesJur,
  userRecursos,
} from '@/lib/db/schema'

export const LAST_ADMIN_ERROR = 'No se puede quitar el último administrador'
export const UNKNOWN_RECURSOS_ERROR = 'Hay recursos seleccionados que no existen'
export const UNKNOWN_NIVELES_JUR_ERROR =
  'Hay niveles jurisdiccionales seleccionados que no existen'

const ROLES: Role[] = ['admin', 'editor', 'consulta']
const MIN_PASSWORD = 8

export type AccesoRecursos = 'todos' | 'seleccionados'
const ACCESOS_RECURSOS: AccesoRecursos[] = ['todos', 'seleccionados']

export type HubUser = {
  id: string
  name: string
  email: string
  role: Role
  banned: boolean
  nivelJurIds: number[]
  accesoRecursos: AccesoRecursos
  recursoIds: string[]
}

export type CreateUserBody = {
  email: string
  name: string
  password: string
  role: Role
  nivelJurIds: number[]
  accesoRecursos: AccesoRecursos
  recursoIds: string[]
}

export type PatchUserBody = {
  name?: string
  role?: Role
  banned?: boolean
  password?: string
  nivelJurIds?: number[]
  accesoRecursos?: AccesoRecursos
  recursoIds?: string[]
}

export function listUsuariosDenied(user: SessionUser | null) {
  if (!user) return { status: 401 as const, error: 'No autenticado' }
  if (user.banned || user.role === 'consulta')
    return { status: 403 as const, error: 'No tiene acceso a este recurso' }
  return null
}

export function mutateUsuariosDenied(user: SessionUser | null) {
  if (!user) return { status: 401 as const, error: 'No autenticado' }
  if (user.banned || user.role !== 'admin')
    return { status: 403 as const, error: 'No tiene acceso a este recurso' }
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

function asAccesoRecursos(value: unknown): AccesoRecursos | null {
  if (typeof value !== 'string') return null
  return ACCESOS_RECURSOS.includes(value as AccesoRecursos)
    ? (value as AccesoRecursos)
    : null
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0)
}

// Ids de nivel jurisdiccional (enteros positivos, según ge_nivel_jurisdiccional).
// Los valores que no son enteros se descartan; la existencia en el catálogo se
// valida aparte con unknownNivelJurIds.
function asIntArray(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (item): item is number => Number.isInteger(item) && item > 0,
  )
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
  let accesoRecursos: AccesoRecursos = 'todos'
  if ('accesoRecursos' in b) {
    const parsed = asAccesoRecursos(b.accesoRecursos)
    if (!parsed) return null
    accesoRecursos = parsed
  }
  return {
    email: b.email.trim().toLowerCase(),
    name: b.name.trim(),
    password: b.password,
    role,
    nivelJurIds: asIntArray(b.nivelJurIds),
    accesoRecursos,
    recursoIds: asStringArray(b.recursoIds),
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
  if ('nivelJurIds' in b) {
    if (!Array.isArray(b.nivelJurIds)) return null
    patch.nivelJurIds = asIntArray(b.nivelJurIds)
  }
  if ('accesoRecursos' in b) {
    const accesoRecursos = asAccesoRecursos(b.accesoRecursos)
    if (!accesoRecursos) return null
    patch.accesoRecursos = accesoRecursos
  }
  if ('recursoIds' in b) {
    if (!Array.isArray(b.recursoIds)) return null
    patch.recursoIds = asStringArray(b.recursoIds)
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
    return { status, error: fromBody || fromMessage || 'No se pudo guardar el usuario' }
  }
  return { status: 400, error: 'No se pudo guardar el usuario' }
}

export async function listHubUsers(): Promise<HubUser[]> {
  const db = getDb()
  const [users, nivelRows, recursoRows] = await Promise.all([
    db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        banned: user.banned,
        accesoRecursos: user.accesoRecursos,
      })
      .from(user),
    db.select().from(userNivelesJur),
    db.select().from(userRecursos),
  ])
  const nivelJurIdsByUser = new Map<string, number[]>()
  for (const row of nivelRows) {
    const list = nivelJurIdsByUser.get(row.userId)
    if (list) list.push(row.nivelJurisdiccionalId)
    else nivelJurIdsByUser.set(row.userId, [row.nivelJurisdiccionalId])
  }
  const recursoIdsByUser = new Map<string, string[]>()
  for (const row of recursoRows) {
    const list = recursoIdsByUser.get(row.userId)
    if (list) list.push(row.recursoId)
    else recursoIdsByUser.set(row.userId, [row.recursoId])
  }
  return users.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    role: (row.role as Role | null) ?? 'consulta',
    banned: Boolean(row.banned),
    nivelJurIds: nivelJurIdsByUser.get(row.id) ?? [],
    accesoRecursos:
      row.accesoRecursos === 'seleccionados' ? 'seleccionados' : 'todos',
    recursoIds: recursoIdsByUser.get(row.id) ?? [],
  }))
}

export async function unbannedAdminIds() {
  const rows = await getDb()
    .select({ id: user.id, role: user.role, banned: user.banned })
    .from(user)
    .where(eq(user.role, 'admin'))
  return rows.filter((row) => !row.banned).map((row) => row.id)
}

/** Ids de nivel jurisdiccional en `nivelJurIds` que no existen en el catálogo
 *  `niveles_jurisdiccionales`. Vacío si todos son válidos. */
export async function unknownNivelJurIds(nivelJurIds: number[]): Promise<number[]> {
  const unique = [...new Set(nivelJurIds)]
  if (unique.length === 0) return []
  const rows = await getDb()
    .select({ id: nivelesJurisdiccionales.id })
    .from(nivelesJurisdiccionales)
    .where(inArray(nivelesJurisdiccionales.id, unique))
  const found = new Set(rows.map((r) => r.id))
  return unique.filter((id) => !found.has(id))
}

export async function replaceUserNivelesJur(userId: string, nivelJurIds: number[]) {
  const db = getDb()
  await db.delete(userNivelesJur).where(eq(userNivelesJur.userId, userId))
  const unique = [...new Set(nivelJurIds)]
  if (unique.length === 0) return
  await db
    .insert(userNivelesJur)
    .values(unique.map((nivelJurisdiccionalId) => ({ userId, nivelJurisdiccionalId })))
}

/** Recurso ids en `recursoIds` que no existen en `recursos`. Vacío si todos
 *  son válidos (incluye el caso trivial de una lista vacía). */
export async function unknownRecursoIds(recursoIds: string[]): Promise<string[]> {
  const unique = [...new Set(recursoIds.filter(Boolean))]
  if (unique.length === 0) return []
  const rows = await getDb()
    .select({ id: recursos.id })
    .from(recursos)
    .where(inArray(recursos.id, unique))
  const found = new Set(rows.map((r) => r.id))
  return unique.filter((id) => !found.has(id))
}

export async function replaceUserRecursos(userId: string, recursoIds: string[]) {
  const db = getDb()
  await db.delete(userRecursos).where(eq(userRecursos.userId, userId))
  const unique = [...new Set(recursoIds.filter(Boolean))]
  if (unique.length === 0) return
  await db.insert(userRecursos).values(unique.map((recursoId) => ({ userId, recursoId })))
}

export async function setAccesoRecursos(userId: string, accesoRecursos: AccesoRecursos) {
  await getDb().update(user).set({ accesoRecursos }).where(eq(user.id, userId))
}
