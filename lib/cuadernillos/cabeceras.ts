import { randomUUID } from 'node:crypto'
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { getDb } from '@/lib/db'
import type { SessionUser } from '@/lib/acl'
import { bookletCabecera, bookletMembership, bookletSchoolAssignment, user } from '@/lib/db/schema'
import {
  AssignmentSourceError,
  confirmStagedAssignmentSource,
  stageAssignmentSourceManifest,
} from './assignment-source'
import { grant } from './memberships'
import { isBookletAdmin } from './permissions'
import type { AssignmentSourceRow } from './types'

export const CABECERA_PROVENANCE_SOURCE_ID = 'booklet_cabecera'

export type CabeceraRecord = {
  cue: string
  nombre: string
  departamento: string
  supervisorName: string
  evidencia: string
}

export type CabeceraAccount = { id: string; name: string; email: string }

export type BoundCabecera = {
  cueAnexo: string
  supervisor: CabeceraAccount
  cabecera: CabeceraAccount
}

export type CabeceraView = CabeceraRecord & {
  status: 'confirmada' | 'pendiente'
  supervisor: CabeceraAccount | null
  cabecera: CabeceraAccount | null
}

export type CabeceraRepository = {
  getAccountStatus(userId: string): Promise<{ emailVerified: boolean; banned: boolean } | null>
  hasPlanningMembership(userId: string): Promise<boolean>
  listCabeceraRows(): Promise<CabeceraRecord[]>
  listBoundAssignments(cues: string[]): Promise<BoundCabecera[]>
}

export type CabeceraMapping = Record<string, { supervisorUserId: string; cabeceraUserId: string }>

export type CabeceraConfirmation = {
  confirmed: string[]
  unchanged: string[]
  blocked: string[]
}

const databaseRepository: CabeceraRepository = {
  async getAccountStatus(userId) {
    const [account] = await getDb()
      .select({ emailVerified: user.emailVerified, banned: user.banned })
      .from(user).where(eq(user.id, userId)).limit(1)
    return account ? { emailVerified: account.emailVerified, banned: account.banned === true } : null
  },

  async hasPlanningMembership(userId) {
    const [row] = await getDb().select({ id: bookletMembership.id }).from(bookletMembership)
      .where(and(eq(bookletMembership.userId, userId), eq(bookletMembership.capability, 'planning'), isNull(bookletMembership.revokedAt)))
      .limit(1)
    return Boolean(row)
  },

  async listCabeceraRows() {
    const rows = await getDb().select({
      cue: bookletCabecera.cueAnexo,
      nombre: bookletCabecera.nombre,
      departamento: bookletCabecera.departamento,
      supervisorName: bookletCabecera.supervisorName,
      evidencia: bookletCabecera.evidencia,
    }).from(bookletCabecera)
      .where(eq(bookletCabecera.active, true))
      .orderBy(asc(bookletCabecera.cueAnexo))
    return rows
  },

  async listBoundAssignments(cues) {
    if (cues.length === 0) return []
    const supervisorAccount = alias(user, 'supervisor_account')
    const cabeceraAccount = alias(user, 'cabecera_account')
    const rows = await getDb().select({
      cueAnexo: bookletSchoolAssignment.cueAnexo,
      supervisorId: supervisorAccount.id,
      supervisorName: supervisorAccount.name,
      supervisorEmail: supervisorAccount.email,
      cabeceraId: cabeceraAccount.id,
      cabeceraName: cabeceraAccount.name,
      cabeceraEmail: cabeceraAccount.email,
    }).from(bookletSchoolAssignment)
      .innerJoin(supervisorAccount, eq(supervisorAccount.id, bookletSchoolAssignment.supervisorUserId))
      .innerJoin(cabeceraAccount, eq(cabeceraAccount.id, bookletSchoolAssignment.cabeceraUserId))
      .where(inArray(bookletSchoolAssignment.cueAnexo, cues))
    return rows.map((row) => ({
      cueAnexo: row.cueAnexo,
      supervisor: { id: row.supervisorId, name: row.supervisorName, email: row.supervisorEmail },
      cabecera: { id: row.cabeceraId, name: row.cabeceraName, email: row.cabeceraEmail },
    }))
  },
}

type AccessLevel = 'admin' | 'planning'

/** Admins, and unbanned verified planning members, may manage cabeceras. */
async function accessLevel(actor: SessionUser | null, repository: CabeceraRepository): Promise<AccessLevel | null> {
  if (!actor?.id) return null
  if (await isBookletAdmin(actor, repository)) return 'admin'
  const account = await repository.getAccountStatus(actor.id)
  if (!account || !account.emailVerified || account.banned) return null
  return (await repository.hasPlanningMembership(actor.id)) ? 'planning' : null
}

async function requireAccess(actor: SessionUser | null, repository: CabeceraRepository): Promise<AccessLevel> {
  const level = await accessLevel(actor, repository)
  if (!level) throw new AssignmentSourceError('forbidden', 403)
  return level
}

/** Cabecera rows from the database merged with the current account assignment for each cue. */
export async function listCabeceras(
  actor: SessionUser | null,
  options: { repository?: CabeceraRepository } = {},
): Promise<{ cabeceras: CabeceraView[] }> {
  const repository = options.repository ?? databaseRepository
  await requireAccess(actor, repository)
  const rows = await repository.listCabeceraRows()
  const bound = await repository.listBoundAssignments(rows.map((row) => row.cue))
  const boundByCue = new Map(bound.map((item) => [item.cueAnexo, item]))
  return {
    cabeceras: rows.map((row) => {
      const assignment = boundByCue.get(row.cue)
      return {
        ...row,
        status: assignment ? 'confirmada' : 'pendiente',
        supervisor: assignment?.supervisor ?? null,
        cabecera: assignment?.cabecera ?? null,
      }
    }),
  }
}

/**
 * Confirms the chosen accounts for cabecera rows through the existing staged
 * source flow. Bound assignment rows are immutable (drizzle 0052), so an already
 * bound cabecera is only accepted when its accounts are unchanged; a changed
 * account is refused rather than rewritten.
 */
export async function confirmCabeceras(
  actor: SessionUser | null,
  mapping: CabeceraMapping,
  options: { repository?: CabeceraRepository } = {},
): Promise<CabeceraConfirmation> {
  const repository = options.repository ?? databaseRepository
  const level = await requireAccess(actor, repository)

  const rows = await repository.listCabeceraRows()
  const rowByCue = new Map(rows.map((row) => [row.cue, row]))
  const cues = Object.keys(mapping).sort()
  for (const cue of cues) {
    if (!rowByCue.has(cue)) throw new AssignmentSourceError('unknown_cabecera', 400)
  }

  const bound = new Map((await repository.listBoundAssignments(cues)).map((item) => [item.cueAnexo, item]))
  const unchanged: string[] = []
  const pending: string[] = []
  for (const cue of cues) {
    const existing = bound.get(cue)
    if (!existing) {
      pending.push(cue)
      continue
    }
    if (existing.supervisor.id !== mapping[cue].supervisorUserId || existing.cabecera.id !== mapping[cue].cabeceraUserId) {
      throw new AssignmentSourceError('assignment_conflicts_with_existing_record', 409)
    }
    unchanged.push(cue)
  }
  if (pending.length === 0) return { confirmed: [], unchanged, blocked: [] }

  if (level === 'admin') {
    for (const cue of pending) {
      await grant(actor!, mapping[cue].supervisorUserId, 'supervisor')
      await grant(actor!, mapping[cue].cabeceraUserId, 'cabecera')
    }
  }

  const sourceRows: AssignmentSourceRow[] = pending.map((cue) => {
    const row = rowByCue.get(cue)!
    return {
      cue,
      schoolName: row.nombre,
      relationship: 'cabecera',
      supervisorName: row.supervisorName,
      cabeceraCue: cue,
      provenance: { sourceId: CABECERA_PROVENANCE_SOURCE_ID, location: row.evidencia },
    }
  })
  // A fresh revision id per attempt: a retry after a failed confirmation must not collide on preview hash.
  const staged = await stageAssignmentSourceManifest(actor, `${CABECERA_PROVENANCE_SOURCE_ID}:${randomUUID()}`, sourceRows)
  const confirmations = pending
    .filter((cue) => staged.sourceRowHashes[cue])
    .map((cue) => ({
      cueAnexo: cue,
      supervisorUserId: mapping[cue].supervisorUserId,
      cabeceraUserId: mapping[cue].cabeceraUserId,
      sourceRowHash: staged.sourceRowHashes[cue],
    }))
  const result = await confirmStagedAssignmentSource(actor, staged.previewHash, confirmations)
  return {
    confirmed: result.persistedCueAnexos,
    unchanged,
    blocked: pending.filter((cue) => !result.persistedCueAnexos.includes(cue)),
  }
}
