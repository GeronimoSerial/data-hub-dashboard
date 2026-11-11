import { and, eq, isNull } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import type { SessionUser } from '@/lib/acl'
import { bookletAssignmentConflict, bookletMembership, bookletSchoolAssignment, user } from '@/lib/db/schema'
import { hasBookletCapability, type BookletPermissionRepository } from './permissions'
import type {
  AssignmentAccepted,
  AssignmentConflict,
  AssignmentSourceRow,
  AssignmentUnresolved,
  AssignmentValidationResult,
} from './types'

const normalizeCue = (value: string | null): { cue: string | null; reason?: AssignmentUnresolved['reason'] } => {
  if (value === null || value.trim() === '') return { cue: null, reason: 'missing_cue' }

  const normalized = value.replace(/[\s.-]/g, '')
  if (!/^\d+$/.test(normalized)) return { cue: null, reason: 'invalid_cue' }
  if (normalized.length === 7) return { cue: normalized, reason: 'missing_annex' }
  if (normalized.length !== 9) return { cue: null, reason: 'invalid_cue' }
  return { cue: normalized }
}

const normalizedName = (name: string): string => name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es-AR')

const isComplete = (row: AssignmentSourceRow): row is AssignmentSourceRow & { supervisorName: string } =>
  typeof row.supervisorName === 'string' && row.supervisorName.trim() !== ''

const toUnresolved = (row: AssignmentSourceRow, reason: AssignmentUnresolved['reason']): AssignmentUnresolved => ({
  cue: row.cue,
  schoolName: row.schoolName,
  reason,
  provenance: row.provenance,
})

const candidateFor = (row: AssignmentSourceRow, cueAnexo: string): AssignmentAccepted | AssignmentUnresolved => {
  if (!isComplete(row)) return toUnresolved(row, 'missing_supervisor')

  let cabeceraCue: string
  if (row.relationship === 'cabecera') {
    if (row.cabeceraCue !== null && normalizeCue(row.cabeceraCue).cue !== cueAnexo) {
      return toUnresolved(row, 'missing_cabecera')
    }
    cabeceraCue = cueAnexo
  } else {
    const head = normalizeCue(row.cabeceraCue)
    if (head.cue === null || head.reason !== undefined || head.cue === cueAnexo) {
      return toUnresolved(row, 'missing_cabecera')
    }
    cabeceraCue = head.cue
  }

  return {
    cueAnexo,
    schoolName: row.schoolName.trim(),
    relationship: row.relationship,
    supervisorName: row.supervisorName.trim(),
    cabeceraCue,
    provenance: [row.provenance],
  }
}

const sameAssignment = (left: AssignmentAccepted, right: AssignmentAccepted): boolean =>
  normalizedName(left.schoolName) === normalizedName(right.schoolName)
  && left.relationship === right.relationship
  && normalizedName(left.supervisorName) === normalizedName(right.supervisorName)
  && left.cabeceraCue === right.cabeceraCue

/** Produces a review preview only; source assertions never become account permissions. */
export const validateAssignments = (rows: AssignmentSourceRow[]): AssignmentValidationResult => {
  const unresolved: AssignmentUnresolved[] = []
  const byCue = new Map<string, AssignmentAccepted[]>()
  const seenCueAnexos = new Set<string>()

  for (const row of rows) {
    const normalized = normalizeCue(row.cue)
    if (normalized.reason !== undefined || normalized.cue === null) {
      unresolved.push(toUnresolved(row, normalized.reason ?? 'invalid_cue'))
      continue
    }
    seenCueAnexos.add(normalized.cue)

    const candidate = candidateFor(row, normalized.cue)
    if (!('cueAnexo' in candidate)) {
      unresolved.push(candidate)
      continue
    }

    const candidates = byCue.get(normalized.cue) ?? []
    candidates.push(candidate)
    byCue.set(normalized.cue, candidates)
  }

  const accepted: AssignmentAccepted[] = []
  const conflicts: AssignmentConflict[] = []

  for (const [cueAnexo, candidates] of byCue) {
    const first = candidates[0]
    if (candidates.some((candidate) => !sameAssignment(first, candidate))) {
      conflicts.push({
        cueAnexo,
        rows: candidates.map((candidate) => ({
          cue: candidate.cueAnexo,
          schoolName: candidate.schoolName,
          relationship: candidate.relationship,
          supervisorName: candidate.supervisorName,
          cabeceraCue: candidate.cabeceraCue,
          provenance: candidate.provenance[0],
        })),
      })
      continue
    }
    accepted.push({ ...first, provenance: candidates.flatMap((candidate) => candidate.provenance) })
  }

  const confirmedHeadCandidates = new Set(accepted
    .filter((assignment) => assignment.relationship === 'cabecera')
    .map((assignment) => assignment.cueAnexo))
  const conflictCues = new Set(conflicts.map((conflict) => conflict.cueAnexo))
  const validAccepted: AssignmentAccepted[] = []

  for (const assignment of accepted) {
    if (assignment.relationship === 'dependiente' && !confirmedHeadCandidates.has(assignment.cabeceraCue)) {
      unresolved.push({
        cue: assignment.cueAnexo,
        schoolName: assignment.schoolName,
        reason: seenCueAnexos.has(assignment.cabeceraCue) || conflictCues.has(assignment.cabeceraCue)
          ? 'invalid_cabecera'
          : 'missing_cabecera',
        provenance: assignment.provenance[0],
      })
      continue
    }
    validAccepted.push(assignment)
  }

  return { accepted: validAccepted, conflicts, unresolved }
}

export type AssignmentConfirmation = {
  cueAnexo: string
  supervisorUserId: string
  cabeceraUserId: string
}

export type ConfirmedAssignmentRecord = AssignmentAccepted & AssignmentConfirmation & {
  confirmedByUserId: string
  confirmedAt: Date
}

export type AssignmentImportStore = BookletPermissionRepository & {
  transaction<T>(operation: (transaction: AssignmentImportStore) => Promise<T>): Promise<T>
  sourceReconciliationReady(): Promise<boolean>
  getAssignment(cueAnexo: string): Promise<ConfirmedAssignmentRecord | null>
  insertAssignment(assignment: ConfirmedAssignmentRecord): Promise<boolean>
  getConflict(cueAnexo: string): Promise<AssignmentConflict | null>
  saveConflict(conflict: AssignmentConflict): Promise<void>
}

export class AssignmentImportError extends Error {
  readonly code: string
  readonly status: number
  constructor(code: string, status: number) {
    super(code)
    this.name = 'AssignmentImportError'
    this.code = code
    this.status = status
  }
}

export type AssignmentImportResult = {
  persistedCueAnexos: string[]
  retainedConflictCueAnexos: string[]
  blockedCueAnexos: string[]
}

type Db = ReturnType<typeof getDb>

const createDatabaseImportStore = (db: Db): AssignmentImportStore => ({
  transaction: (operation) => db.transaction((transaction) =>
    operation(createDatabaseImportStore(transaction as unknown as Db))),
  async sourceReconciliationReady() { return false },
  async getAccountStatus(userId) {
    const [account] = await db.select({ emailVerified: user.emailVerified, banned: user.banned })
      .from(user).where(eq(user.id, userId)).limit(1)
    return account ? { emailVerified: account.emailVerified, banned: account.banned === true } : null
  },
  async hasActiveMembership(userId, capability) {
    const [membership] = await db.select({ id: bookletMembership.id }).from(bookletMembership)
      .where(and(
        eq(bookletMembership.userId, userId),
        eq(bookletMembership.capability, capability),
        isNull(bookletMembership.revokedAt),
      )).limit(1)
    return membership !== undefined
  },
  async hasSchoolAssignment(userId, cueAnexo, capability) {
    const responsibleUserId = capability === 'cabecera'
      ? bookletSchoolAssignment.cabeceraUserId
      : bookletSchoolAssignment.supervisorUserId
    const [assignment] = await db.select({ cueAnexo: bookletSchoolAssignment.cueAnexo })
      .from(bookletSchoolAssignment)
      .where(and(eq(bookletSchoolAssignment.cueAnexo, cueAnexo), eq(responsibleUserId, userId)))
      .limit(1)
    return assignment !== undefined
  },
  async getAssignment(cueAnexo) {
    const [assignment] = await db.select().from(bookletSchoolAssignment)
      .where(eq(bookletSchoolAssignment.cueAnexo, cueAnexo)).limit(1)
    return assignment ? assignment as unknown as ConfirmedAssignmentRecord : null
  },
  async insertAssignment(assignment) {
    const inserted = await db.insert(bookletSchoolAssignment).values({
      cueAnexo: assignment.cueAnexo,
      schoolName: assignment.schoolName,
      relationship: assignment.relationship,
      supervisorName: assignment.supervisorName,
      supervisorUserId: assignment.supervisorUserId,
      cabeceraCue: assignment.cabeceraCue,
      cabeceraUserId: assignment.cabeceraUserId,
      provenance: assignment.provenance,
      confirmedByUserId: assignment.confirmedByUserId,
      confirmedAt: assignment.confirmedAt,
    }).onConflictDoNothing().returning({ cueAnexo: bookletSchoolAssignment.cueAnexo })
    return inserted.length > 0
  },
  async getConflict(cueAnexo) {
    const [conflict] = await db.select().from(bookletAssignmentConflict)
      .where(eq(bookletAssignmentConflict.cueAnexo, cueAnexo)).limit(1)
    return conflict ? conflict as unknown as AssignmentConflict : null
  },
  async saveConflict(conflict) {
    await db.insert(bookletAssignmentConflict).values(conflict)
      .onConflictDoUpdate({ target: bookletAssignmentConflict.cueAnexo, set: { rows: conflict.rows } })
  },
})

const databaseImportStore: AssignmentImportStore = {
  transaction: (operation) => getDb().transaction((transaction) =>
    operation(createDatabaseImportStore(transaction as unknown as Db))),
  async sourceReconciliationReady() { return false },
  getAccountStatus: (userId) => createDatabaseImportStore(getDb()).getAccountStatus(userId),
  hasActiveMembership: (userId, capability) => createDatabaseImportStore(getDb()).hasActiveMembership(userId, capability),
  hasSchoolAssignment: (userId, cueAnexo, capability) =>
    createDatabaseImportStore(getDb()).hasSchoolAssignment(userId, cueAnexo, capability),
  getAssignment: (cueAnexo) => createDatabaseImportStore(getDb()).getAssignment(cueAnexo),
  insertAssignment: (assignment) => createDatabaseImportStore(getDb()).insertAssignment(assignment),
  getConflict: (cueAnexo) => createDatabaseImportStore(getDb()).getConflict(cueAnexo),
  saveConflict: (conflict) => createDatabaseImportStore(getDb()).saveConflict(conflict),
}

const samePersistedFacts = (stored: ConfirmedAssignmentRecord, candidate: ConfirmedAssignmentRecord): boolean =>
  stored.cueAnexo === candidate.cueAnexo
  && stored.schoolName === candidate.schoolName
  && stored.relationship === candidate.relationship
  && stored.supervisorName === candidate.supervisorName
  && stored.supervisorUserId === candidate.supervisorUserId
  && stored.cabeceraCue === candidate.cabeceraCue
  && stored.cabeceraUserId === candidate.cabeceraUserId
  && JSON.stringify(stored.provenance) === JSON.stringify(candidate.provenance)

const mergeConflictRows = (previous: AssignmentConflict | null, next: AssignmentConflict): AssignmentConflict => {
  if (!previous) return next
  const rows = new Map<string, AssignmentSourceRow>()
  for (const row of [...previous.rows, ...next.rows]) {
    const key = `${row.provenance.sourceId}:${row.provenance.location}:${row.schoolName}:${row.supervisorName ?? ''}:${row.cabeceraCue ?? ''}`
    rows.set(key, row)
  }
  return { cueAnexo: next.cueAnexo, rows: [...rows.values()] }
}

/** Persists only explicit, account-confirmed candidates under a planning membership. */
export async function persistConfirmedAssignments(
  actor: SessionUser | null,
  preview: AssignmentValidationResult,
  confirmations: AssignmentConfirmation[],
  store: AssignmentImportStore = databaseImportStore,
): Promise<AssignmentImportResult> {
  return store.transaction(async (transaction) => {
    if (!await transaction.sourceReconciliationReady()) {
      throw new AssignmentImportError('source_reconciliation_unavailable', 503)
    }
    if (!await hasBookletCapability(actor, 'planning', transaction)) throw new Error('No autorizado')

    const candidates = new Map(preview.accepted.map((assignment) => [assignment.cueAnexo, assignment]))
    const confirmationByCue = new Map<string, AssignmentConfirmation>()
    for (const confirmation of confirmations) {
      if (!candidates.has(confirmation.cueAnexo) || confirmationByCue.has(confirmation.cueAnexo)) {
        throw new Error('Confirmación de asignación inválida')
      }
      if (!confirmation.supervisorUserId.trim() || !confirmation.cabeceraUserId.trim()) {
        throw new Error('Se requieren cuentas responsables confirmadas')
      }
      confirmationByCue.set(confirmation.cueAnexo, confirmation)
    }

    const statusByUser = new Map<string, { emailVerified: boolean; banned: boolean } | null>()
    for (const confirmation of confirmationByCue.values()) {
      for (const [userId, capability] of [
        [confirmation.supervisorUserId, 'supervisor'],
        [confirmation.cabeceraUserId, 'cabecera'],
      ] as const) {
        if (!statusByUser.has(userId)) statusByUser.set(userId, await transaction.getAccountStatus(userId))
        const status = statusByUser.get(userId)
        if (!status || !status.emailVerified || status.banned) throw new Error('Cuenta responsable no verificada o bloqueada')
        if (!await transaction.hasActiveMembership(userId, capability)) throw new Error('Cuenta responsable sin permiso de cuadernillos')
      }
    }

    const blocked = new Set<string>()
    const confirmed = new Map<string, ConfirmedAssignmentRecord>()
    const now = new Date()
    for (const candidate of preview.accepted) {
      const confirmation = confirmationByCue.get(candidate.cueAnexo)
      if (!confirmation) {
        blocked.add(candidate.cueAnexo)
        continue
      }
      confirmed.set(candidate.cueAnexo, {
        ...candidate,
        ...confirmation,
        confirmedByUserId: actor!.id,
        confirmedAt: now,
      })
    }

    const ordered = [
      ...[...confirmed.values()].filter((assignment) => assignment.relationship === 'cabecera'),
      ...[...confirmed.values()].filter((assignment) => assignment.relationship === 'dependiente'),
    ]
    const persistedCueAnexos: string[] = []
    for (const candidate of ordered) {
      if (candidate.relationship === 'dependiente') {
        const headCandidate = confirmed.get(candidate.cabeceraCue)
        const head = headCandidate ?? await transaction.getAssignment(candidate.cabeceraCue)
        if (!head || head.relationship !== 'cabecera' || head.cabeceraUserId !== candidate.cabeceraUserId) {
          blocked.add(candidate.cueAnexo)
          continue
        }
      }

      const existing = await transaction.getAssignment(candidate.cueAnexo)
      if (existing) {
        if (!samePersistedFacts(existing, candidate)) throw new Error(`Asignación existente incompatible: ${candidate.cueAnexo}`)
        persistedCueAnexos.push(candidate.cueAnexo)
        continue
      }
      await transaction.insertAssignment(candidate)
      const insertedOrConcurrent = await transaction.getAssignment(candidate.cueAnexo)
      if (!insertedOrConcurrent || !samePersistedFacts(insertedOrConcurrent, candidate)) {
        throw new Error(`No se pudo confirmar la asignación: ${candidate.cueAnexo}`)
      }
      persistedCueAnexos.push(candidate.cueAnexo)
    }

    const retainedConflictCueAnexos: string[] = []
    for (const conflict of preview.conflicts) {
      const stored = await transaction.getConflict(conflict.cueAnexo)
      await transaction.saveConflict(mergeConflictRows(stored, conflict))
      retainedConflictCueAnexos.push(conflict.cueAnexo)
    }

    return {
      persistedCueAnexos: [...new Set(persistedCueAnexos)].sort(),
      retainedConflictCueAnexos: [...new Set(retainedConflictCueAnexos)].sort(),
      blockedCueAnexos: [...blocked].sort(),
    }
  })
}

export type ConfirmAndPersistAssignmentsResult = {
  preview: AssignmentValidationResult
  persistence: AssignmentImportResult
}

/** Recomputes submitted source assertions server-side before the confirmation write. */
export async function confirmAndPersistAssignments(
  actor: SessionUser | null,
  rows: AssignmentSourceRow[],
  confirmations: AssignmentConfirmation[],
  store: AssignmentImportStore = databaseImportStore,
): Promise<ConfirmAndPersistAssignmentsResult> {
  const preview = validateAssignments(rows)
  const persistence = await persistConfirmedAssignments(actor, preview, confirmations, store)
  return { preview, persistence }
}
