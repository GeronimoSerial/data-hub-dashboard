import { eq, inArray } from 'drizzle-orm'
import { isStaff, type Role, type SessionUser } from '@/lib/acl'
import { getDb } from '@/lib/db'
import {
  nivelesJurisdiccionales,
  recursos,
  user,
  userNivelesJur,
  userRecursos,
} from '@/lib/db/schema'
import { canUseLanding, isHubSection, normalizeSectionPolicy, safeDestination, type HubSection, type SectionPolicy } from '@/lib/hub-sections'

export const LAST_ADMIN_ERROR = 'No se puede quitar el último administrador'
export const UNKNOWN_RECURSOS_ERROR = 'Hay recursos seleccionados que no existen'
export const UNKNOWN_NIVELES_JUR_ERROR =
  'Hay niveles jurisdiccionales seleccionados que no existen'

const ROLES: Role[] = ['admin', 'editor', 'consulta', 'director_nivel', 'operador_establecimiento', 'admin_ge']
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
  hubPolicy: SectionPolicy
  hubDestination: string | null
}

export type HubAccessSettings = { hubPolicy: SectionPolicy; hubDestination: string | null }

export type CreateUserBody = {
  email: string
  name: string
  password: string
  role: Role
  nivelJurIds: number[]
  accesoRecursos: AccesoRecursos
  recursoIds: string[]
  hubPolicy: SectionPolicy
  hubDestination: string | null
}

export type PatchUserBody = {
  name?: string
  role?: Role
  banned?: boolean
  password?: string
  nivelJurIds?: number[]
  accesoRecursos?: AccesoRecursos
  recursoIds?: string[]
  hubPolicy?: SectionPolicy
  hubDestination?: string | null
}

function parseHubAccessSettings(value: unknown): HubAccessSettings | null {
  if (!value || typeof value !== 'object') return null
  const input = value as Record<string, unknown>
  if (!('enabledSections' in input) || !Array.isArray(input.enabledSections) || !input.enabledSections.every(isHubSection)) return null
  if (typeof input.landing !== 'boolean') return null
  if (input.destination !== null && typeof input.destination !== 'string') return null
  const hubPolicy: SectionPolicy = { enabledSections: [...new Set(input.enabledSections as HubSection[])], landing: input.landing }
  const hubDestination = input.destination as string | null
  if (hubDestination !== null && !safeDestination({ policy: hubPolicy, destination: hubDestination, allowedByExistingAcl: () => true })) return null
  return { hubPolicy, hubDestination }
}

/** T5 must pass the target user's existing resource/role/scope destination ACL. */
export async function validateHubAccessSettings(settings: HubAccessSettings, allowedByExistingAcl: (path: string) => boolean | Promise<boolean>): Promise<boolean> {
  if (settings.hubDestination === null)
    return Boolean(canUseLanding(settings.hubPolicy) && await allowedByExistingAcl('/'))
  const destination = safeDestination({ policy: settings.hubPolicy, destination: settings.hubDestination, allowedByExistingAcl: () => true })
  return Boolean(destination && await allowedByExistingAcl(destination.path))
}

function persistHubAccessSettings(settings: HubAccessSettings) {
  return { hubSecciones: settings.hubPolicy.enabledSections ? [...settings.hubPolicy.enabledSections] : null, hubLanding: settings.hubPolicy.landing ?? null, hubDestino: settings.hubDestination }
}

export function listUsuariosDenied(user: SessionUser | null) {
  if (!user) return { status: 401 as const, error: 'No autenticado' }
  if (user.banned || !isStaff(user.role))
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
  const hubAccess = b.hubAccess === undefined ? { hubPolicy: {}, hubDestination: null } : parseHubAccessSettings(b.hubAccess)
  if (!hubAccess) return null
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
    ...hubAccess,
  }
}

export function parsePatchUserBody(body: unknown): PatchUserBody | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  const patch: PatchUserBody = {}

  if ('hubAccess' in b) {
    const hubAccess = parseHubAccessSettings(b.hubAccess)
    if (!hubAccess) return null
    Object.assign(patch, hubAccess)
  }

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
        hubSecciones: user.hubSecciones,
        hubLanding: user.hubLanding,
        hubDestino: user.hubDestino,
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
    hubPolicy: normalizeSectionPolicy({ enabledSections: row.hubSecciones, landing: row.hubLanding }),
    hubDestination: row.hubDestino,
  }))
}

export async function getHubUserSession(id: string): Promise<SessionUser | null> {
  const db = getDb()
  const [rows, nivelRows, recursoRows] = await Promise.all([
    db.select().from(user).where(eq(user.id, id)).limit(1),
    db.select().from(userNivelesJur).where(eq(userNivelesJur.userId, id)),
    db.select().from(userRecursos).where(eq(userRecursos.userId, id)),
  ])
  const row = rows[0]
  if (!row) return null
  return {
    id, role: (row.role as Role | null) ?? 'consulta', banned: Boolean(row.banned),
    nivelJurIds: nivelRows.map((item) => item.nivelJurisdiccionalId),
    accesoRecursos: row.accesoRecursos === 'seleccionados' ? 'seleccionados' : 'todos',
    recursoIds: recursoRows.map((item) => item.recursoId), cueAnexo: row.geCueAnexo,
    hubPolicy: normalizeSectionPolicy({ enabledSections: row.hubSecciones, landing: row.hubLanding }),
    hubDestination: row.hubDestino,
  }
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

/** Persistence primitive for the later admin API wiring (T5). */
export async function setHubAccessSettings(userId: string, settings: HubAccessSettings) {
  await getDb().update(user).set(persistHubAccessSettings(settings)).where(eq(user.id, userId))
}

export async function persistUserAccessConfiguration(
  userId: string,
  configuration: {
    nivelJurIds?: number[]
    accesoRecursos?: AccesoRecursos
    recursoIds?: string[]
    hubAccess?: HubAccessSettings
    activateProvisionedUser?: boolean
  },
) {
  const db = getDb()
  await db.transaction(async (tx) => {
    if (configuration.nivelJurIds !== undefined) {
      await tx.delete(userNivelesJur).where(eq(userNivelesJur.userId, userId))
      const ids = [...new Set(configuration.nivelJurIds)]
      if (ids.length) await tx.insert(userNivelesJur).values(ids.map((nivelJurisdiccionalId) => ({ userId, nivelJurisdiccionalId })))
    }
    if (configuration.recursoIds !== undefined) {
      await tx.delete(userRecursos).where(eq(userRecursos.userId, userId))
      const ids = [...new Set(configuration.recursoIds.filter(Boolean))]
      if (ids.length) await tx.insert(userRecursos).values(ids.map((recursoId) => ({ userId, recursoId })))
    }
    const userChanges = {
      ...(configuration.accesoRecursos !== undefined ? { accesoRecursos: configuration.accesoRecursos } : {}),
      ...(configuration.hubAccess ? persistHubAccessSettings(configuration.hubAccess) : {}),
      ...(configuration.activateProvisionedUser ? { banned: false, banReason: null, banExpires: null } : {}),
    }
    if (Object.keys(userChanges).length) {
      const updated = await tx.update(user).set(userChanges).where(eq(user.id, userId)).returning({ id: user.id })
      if (configuration.activateProvisionedUser && updated.length !== 1) {
        throw new Error('No se pudo activar el usuario provisionado')
      }
    }
  })
}
