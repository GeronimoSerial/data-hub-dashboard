import { createHash, randomUUID } from 'node:crypto'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import type { SessionUser } from '@/lib/acl'
import {
  bookletAssignmentConflict,
  bookletAssignmentSourceRevision,
  bookletMembership,
  bookletSchoolAssignment,
  user,
} from '@/lib/db/schema'
import { isBookletAdmin } from './permissions'
import { validateAssignments } from './assignment-import'
import type { AssignmentConfirmation } from './assignment-import'
import type { AssignmentAccepted, AssignmentSourceRow, AssignmentValidationResult } from './types'

const stableValue = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, stableValue(item)]))
  }
  return value
}

const sha256 = (value: unknown): string => createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex')

export const hashAssignmentSourceRow = (row: unknown): string => sha256(row)
export const hashAssignmentSourceContent = (value: unknown): string => sha256(value)
export const hashConfirmedAssignment = (facts: {
  cueAnexo: string
  schoolName: string
  relationship: string
  supervisorName: string
  supervisorUserId: string
  cabeceraCue: string
  cabeceraUserId: string
  sourceRevisionId: string | null
  sourceRowHash: string | null
  provenance: unknown
  confirmedByUserId: string
  confirmedAt: Date | string
}): string => sha256(facts)
export const hashAssignmentSourceRevision = (sourceId: string, rows: AssignmentSourceRow[], preview: AssignmentValidationResult): string =>
  sha256({ sourceId, sourceRows: rows, preview })

export const verifyAssignmentSourceRevision = (
  sourceId: string,
  sourceHash: string,
  previewHash: string,
  sourceRows: AssignmentSourceRow[],
  preview: AssignmentValidationResult,
): boolean => {
  const recomputed = validateAssignments(sourceRows)
  return hashAssignmentSourceContent(sourceRows) === sourceHash
    && hashAssignmentSourceRevision(sourceId, sourceRows, recomputed) === previewHash
    && JSON.stringify(stableValue(recomputed)) === JSON.stringify(stableValue(preview))
}

type Db = ReturnType<typeof getDb>

export type StagedAssignmentSource = {
  revisionId: string
  sourceHash: string
  previewHash: string
  preview: AssignmentValidationResult
  sourceRowHashes: Record<string, string>
}

export type StagedAssignmentConfirmation = AssignmentConfirmation & { sourceRowHash: string }
export type AssignmentSourceConfirmationResult = {
  persistedCueAnexos: string[]
  retainedConflictCueAnexos: string[]
  blockedCueAnexos: string[]
}

export class AssignmentSourceError extends Error {
  readonly code: string
  readonly status: number
  constructor(code: string, status: number) {
    super(code)
    this.name = 'AssignmentSourceError'
    this.code = code
    this.status = status
  }
}

const loadAccountStatus = (db: Db) => async (userId: string) => {
  const [account] = await db.select({ emailVerified: user.emailVerified, banned: user.banned })
    .from(user).where(eq(user.id, userId)).limit(1).for('update')
  return account ? { emailVerified: account.emailVerified, banned: account.banned === true } : null
}

/** A global admin (see isBookletAdmin) acts without planning membership or email verification. */
const ensurePlanningActor = async (actor: SessionUser | null, db: Db): Promise<string> => {
  if (!actor?.id) throw new AssignmentSourceError('unauthorized', 401)
  if (await isBookletAdmin(actor, { getAccountStatus: loadAccountStatus(db) })) return actor.id
  const [account] = await db.select({ emailVerified: user.emailVerified, banned: user.banned })
    .from(user).where(eq(user.id, actor.id)).limit(1).for('update')
  const [membership] = await db.select({ id: bookletMembership.id }).from(bookletMembership)
    .where(and(eq(bookletMembership.userId, actor.id), eq(bookletMembership.capability, 'planning'), isNull(bookletMembership.revokedAt))).limit(1).for('update')
  if (!account || !account.emailVerified || account.banned || !membership) throw new AssignmentSourceError('forbidden', 403)
  return actor.id
}

const acceptedHashMap = (preview: AssignmentValidationResult): Record<string, string> =>
  Object.fromEntries(preview.accepted.map((candidate) => [candidate.cueAnexo, hashAssignmentSourceRow(candidate)]))

/**
 * Stages an immutable revision of an assignment source. The rows must come from
 * a CSV uploaded by an admin or planning member and parsed server-side
 * (lib/cuadernillos/assignment-upload.ts); the upload route is the only HTTP
 * caller. The rows are not trusted as account permissions: confirmation still
 * requires explicit account choices and responsible-account checks.
 */
export async function stageAssignmentSourceManifest(
  actor: SessionUser | null,
  sourceId: string,
  sourceRows: AssignmentSourceRow[],
  db: Db = getDb(),
): Promise<StagedAssignmentSource> {
  const stagedByUserId = await ensurePlanningActor(actor, db)
  if (!sourceId.trim() || sourceRows.length === 0) throw new AssignmentSourceError('invalid_source_manifest', 400)
  const copiedRows = structuredClone(sourceRows)
  const preview = validateAssignments(copiedRows)
  const sourceHash = hashAssignmentSourceContent(copiedRows)
  const previewHash = hashAssignmentSourceRevision(sourceId, copiedRows, preview)
  const revisionId = randomUUID()
  await db.insert(bookletAssignmentSourceRevision).values({
    id: revisionId,
    sourceId,
    sourceHash,
    previewHash,
    sourceRows: copiedRows,
    preview,
    status: 'staged',
    stagedByUserId,
  })
  return { revisionId, sourceHash, previewHash, preview, sourceRowHashes: acceptedHashMap(preview) }
}

const identicalAssignment = (stored: typeof bookletSchoolAssignment.$inferSelect, candidate: AssignmentAccepted, confirmation: StagedAssignmentConfirmation, revisionId: string) =>
  stored.cueAnexo === candidate.cueAnexo
  && stored.schoolName === candidate.schoolName
  && stored.relationship === candidate.relationship
  && stored.supervisorName === candidate.supervisorName
  && stored.supervisorUserId === confirmation.supervisorUserId
  && stored.cabeceraCue === candidate.cabeceraCue
  && stored.cabeceraUserId === confirmation.cabeceraUserId
  && stored.sourceRevisionId === revisionId
  && stored.sourceRowHash === confirmation.sourceRowHash
  && JSON.stringify(stored.provenance) === JSON.stringify(candidate.provenance)

export type StagedAssignmentAccepted = {
  revisionId: string
  status: string
  accepted: AssignmentAccepted[]
}

export type AssignmentSourceRevisionSummary = {
  revisionId: string
  sourceId: string
  status: string
  createdAt: string
  counts: { accepted: number; conflicts: number; unresolved: number }
}

/**
 * Reads a staged revision's accepted schools by preview hash so the upload
 * flow can expand the admin's account choices. The revision is verified against
 * its hashes before its accepted rows are returned.
 */
export async function loadStagedAssignmentAccepted(
  actor: SessionUser | null,
  previewHash: string,
  db: Db = getDb(),
): Promise<StagedAssignmentAccepted> {
  if (!/^[a-f0-9]{64}$/.test(previewHash)) throw new AssignmentSourceError('invalid_preview_hash', 400)
  await ensurePlanningActor(actor, db)
  const [revision] = await db.select().from(bookletAssignmentSourceRevision)
    .where(eq(bookletAssignmentSourceRevision.previewHash, previewHash)).limit(1)
  if (!revision) throw new AssignmentSourceError('staged_revision_not_found', 404)
  const sourceRows = revision.sourceRows as AssignmentSourceRow[]
  if (!verifyAssignmentSourceRevision(revision.sourceId, revision.sourceHash, revision.previewHash, sourceRows, revision.preview as AssignmentValidationResult)) {
    throw new AssignmentSourceError('staged_revision_integrity_failure', 409)
  }
  return {
    revisionId: revision.id,
    status: revision.status,
    accepted: validateAssignments(sourceRows).accepted,
  }
}

/** Lists the most recent source revisions with their preview counts for a planning actor. */
export async function listAssignmentSourceRevisions(
  actor: SessionUser | null,
  db: Db = getDb(),
  limit = 20,
): Promise<AssignmentSourceRevisionSummary[]> {
  await ensurePlanningActor(actor, db)
  const rows = await db.select({
    id: bookletAssignmentSourceRevision.id,
    sourceId: bookletAssignmentSourceRevision.sourceId,
    status: bookletAssignmentSourceRevision.status,
    stagedAt: bookletAssignmentSourceRevision.stagedAt,
    preview: bookletAssignmentSourceRevision.preview,
  }).from(bookletAssignmentSourceRevision)
    .orderBy(desc(bookletAssignmentSourceRevision.stagedAt))
    .limit(limit)
  return rows.map((row) => {
    const preview = row.preview as AssignmentValidationResult
    return {
      revisionId: row.id,
      sourceId: row.sourceId,
      status: row.status,
      createdAt: new Date(row.stagedAt).toISOString(),
      counts: {
        accepted: preview.accepted.length,
        conflicts: preview.conflicts.length,
        unresolved: preview.unresolved.length,
      },
    }
  })
}

export async function confirmStagedAssignmentSource(
  actor: SessionUser | null,
  previewHash: string,
  confirmations: StagedAssignmentConfirmation[],
  db: Db = getDb(),
): Promise<AssignmentSourceConfirmationResult> {
  if (!/^[a-f0-9]{64}$/.test(previewHash)) throw new AssignmentSourceError('invalid_preview_hash', 400)
  return db.transaction(async (tx) => {
    const actorId = await ensurePlanningActor(actor, tx as unknown as Db)
    const [revision] = await tx.select().from(bookletAssignmentSourceRevision)
      .where(eq(bookletAssignmentSourceRevision.previewHash, previewHash)).limit(1).for('update')
    if (!revision) throw new AssignmentSourceError('staged_revision_not_found', 404)
    if (revision.status !== 'staged') throw new AssignmentSourceError('staged_revision_already_confirmed', 409)
    const sourceRows = revision.sourceRows as AssignmentSourceRow[]
    const recomputed = validateAssignments(sourceRows)
    if (!verifyAssignmentSourceRevision(revision.sourceId, revision.sourceHash, revision.previewHash, sourceRows, revision.preview as AssignmentValidationResult)) {
      throw new AssignmentSourceError('staged_revision_integrity_failure', 409)
    }
    const candidateByCue = new Map(recomputed.accepted.map((item) => [item.cueAnexo, item]))
    const confirmationByCue = new Map<string, StagedAssignmentConfirmation>()
    for (const confirmation of confirmations) {
      const candidate = candidateByCue.get(confirmation.cueAnexo)
      if (!candidate || confirmationByCue.has(confirmation.cueAnexo)
        || confirmation.sourceRowHash !== hashAssignmentSourceRow(candidate)) {
        throw new AssignmentSourceError('confirmation_does_not_match_staged_preview', 409)
      }
      confirmationByCue.set(confirmation.cueAnexo, confirmation)
    }
    const userIds = new Map<string, Set<'supervisor' | 'cabecera'>>()
    for (const confirmation of confirmationByCue.values()) {
      const supervisorCapabilities = userIds.get(confirmation.supervisorUserId) ?? new Set()
      supervisorCapabilities.add('supervisor')
      userIds.set(confirmation.supervisorUserId, supervisorCapabilities)
      const cabeceraCapabilities = userIds.get(confirmation.cabeceraUserId) ?? new Set()
      cabeceraCapabilities.add('cabecera')
      userIds.set(confirmation.cabeceraUserId, cabeceraCapabilities)
    }
    // Responsible supervisor/cabecera accounts can come from GE SSO and stay unverified, so
    // email verification is not required here. The account must exist, must not be banned,
    // and must hold an active membership for the capability it is responsible for.
    for (const [userId, capabilities] of [...userIds].sort(([left], [right]) => left.localeCompare(right))) {
      for (const capability of [...capabilities].sort()) {
        const [account] = await tx.select({ banned: user.banned }).from(user)
          .where(eq(user.id, userId)).limit(1).for('update')
        const [membership] = await tx.select({ id: bookletMembership.id }).from(bookletMembership)
          .where(and(eq(bookletMembership.userId, userId), eq(bookletMembership.capability, capability), isNull(bookletMembership.revokedAt))).limit(1).for('update')
        if (!account || account.banned || !membership) {
          throw new AssignmentSourceError('responsible_account_unavailable', 409)
        }
      }
    }
    const byCue = new Map(recomputed.accepted.map((item) => [item.cueAnexo, item]))
    const persistedCueAnexos: string[] = []
    const blockedCueAnexos: string[] = []
    const ordered = [
      ...recomputed.accepted.filter((item) => item.relationship === 'cabecera'),
      ...recomputed.accepted.filter((item) => item.relationship === 'dependiente'),
    ]
    for (const candidate of ordered) {
      const confirmation = confirmationByCue.get(candidate.cueAnexo)
      if (!confirmation) {
        blockedCueAnexos.push(candidate.cueAnexo)
        continue
      }
      if (candidate.relationship === 'dependiente') {
        const head = byCue.get(candidate.cabeceraCue)
        const headConfirmation = confirmationByCue.get(candidate.cabeceraCue)
        if (!head || head.relationship !== 'cabecera' || !headConfirmation
          || headConfirmation.cabeceraUserId !== confirmation.cabeceraUserId) {
          blockedCueAnexos.push(candidate.cueAnexo)
          continue
        }
      }
      const [existing] = await tx.select().from(bookletSchoolAssignment)
        .where(eq(bookletSchoolAssignment.cueAnexo, candidate.cueAnexo)).limit(1).for('update')
      if (existing) {
        if (!identicalAssignment(existing, candidate, confirmation, revision.id)) {
          throw new AssignmentSourceError('assignment_conflicts_with_existing_record', 409)
        }
        persistedCueAnexos.push(candidate.cueAnexo)
        continue
      }
      const confirmedAt = new Date()
      const trustedFacts = {
        cueAnexo: candidate.cueAnexo,
        schoolName: candidate.schoolName,
        relationship: candidate.relationship,
        supervisorName: candidate.supervisorName,
        supervisorUserId: confirmation.supervisorUserId,
        cabeceraCue: candidate.cabeceraCue,
        cabeceraUserId: confirmation.cabeceraUserId,
        sourceRevisionId: revision.id,
        sourceRowHash: confirmation.sourceRowHash,
        provenance: candidate.provenance,
        confirmedByUserId: actorId,
        confirmedAt,
      }
      await tx.insert(bookletSchoolAssignment).values({
        ...trustedFacts,
        confirmedAssignmentHash: hashConfirmedAssignment({ ...trustedFacts, sourceRevisionId: revision.id }),
      })
      persistedCueAnexos.push(candidate.cueAnexo)
    }
    for (const conflict of recomputed.conflicts) {
      await tx.insert(bookletAssignmentConflict).values(conflict).onConflictDoUpdate({
        target: bookletAssignmentConflict.cueAnexo,
        set: { rows: conflict.rows },
      })
    }
    await tx.update(bookletAssignmentSourceRevision).set({ status: 'confirmed', confirmedByUserId: actorId, confirmedAt: new Date() })
      .where(eq(bookletAssignmentSourceRevision.id, revision.id))
    return {
      persistedCueAnexos: persistedCueAnexos.sort(),
      retainedConflictCueAnexos: recomputed.conflicts.map(({ cueAnexo }) => cueAnexo).sort(),
      blockedCueAnexos: blockedCueAnexos.sort(),
    }
  })
}
