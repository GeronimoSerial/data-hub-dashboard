import { describe, expect, it } from 'vitest'
import type { SessionUser } from '@/lib/acl'
import { bookletAssignmentSourceRevision, bookletMembership, user } from '@/lib/db/schema'
import {
  confirmStagedAssignmentSource, listAssignmentSourceRevisions, loadStagedAssignmentAccepted, hashAssignmentSourceContent, hashAssignmentSourceRow, hashAssignmentSourceRevision, hashConfirmedAssignment,
  stageAssignmentSourceManifest, verifyAssignmentSourceRevision,
} from './assignment-source'
import { validateAssignments } from './assignment-import'
import type { AssignmentSourceRow, AssignmentValidationResult } from './types'

type Account = { emailVerified: boolean; banned: boolean }
type FakeState = { accounts: Account[]; membership: boolean; revision: Record<string, unknown> | null; revisions?: Record<string, unknown>[]; writes: unknown[] }

/** Table-dispatch fake: account reads consume `accounts` in call order (last entry repeats). */
const fakeDb = (state: FakeState) => {
  const rowsFor = (table: unknown): unknown[] => {
    if (table === user) {
      const next = state.accounts.length > 1 ? state.accounts.shift() : state.accounts[0]
      return next ? [next] : []
    }
    if (table === bookletMembership) return state.membership ? [{ id: 'membership-1' }] : []
    if (table === bookletAssignmentSourceRevision) return state.revisions ?? (state.revision ? [state.revision] : [])
    return []
  }
  const db = {
    select() {
      let table: unknown
      const query = {
        from(target: unknown) { table = target; return query },
        where() { return query },
        orderBy() { return query },
        limit() { return query },
        for() { return Promise.resolve(rowsFor(table)) },
        then(resolve: (rows: unknown[]) => unknown, reject?: (error: unknown) => unknown) { return Promise.resolve(rowsFor(table)).then(resolve, reject) },
      }
      return query
    },
    insert: (table: unknown) => ({
      values: (value: unknown) => { state.writes.push({ table, value }); return Promise.resolve() },
    }),
    update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
    transaction: async (operation: (tx: unknown) => Promise<unknown>) => operation(db),
  }
  return db as unknown as Parameters<typeof stageAssignmentSourceManifest>[3]
}

const actorWithRole = (role: SessionUser['role'], id = 'actor-1'): SessionUser => ({
  id, role, banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [],
})

const stagingRow: AssignmentSourceRow = {
  cue: '180123456', schoolName: 'Escuela de prueba', relationship: 'cabecera',
  supervisorName: 'Supervisión de prueba', cabeceraCue: null, provenance: { sourceId: 'fixture', location: 'Sheet1!A1' },
}

const sourceRow: AssignmentSourceRow = {
  cue: '180123456',
  schoolName: 'Escuela de prueba',
  relationship: 'cabecera',
  supervisorName: 'Supervisión de prueba',
  cabeceraCue: null,
  provenance: { sourceId: 'fixture', location: 'Sheet1!A1' },
}
const preview: AssignmentValidationResult = { accepted: [], conflicts: [], unresolved: [] }

describe('assignment source revision hashes', () => {
  it('produces stable row hashes for identical normalized facts', () => {
    expect(hashAssignmentSourceRow(sourceRow)).toBe(hashAssignmentSourceRow({ ...sourceRow }))
  })

  it('changes the row hash when source provenance or identity facts change', () => {
    expect(hashAssignmentSourceRow(sourceRow)).not.toBe(hashAssignmentSourceRow({ ...sourceRow, supervisorName: 'Other' }))
  })

  it('binds a preview hash to both source bytes and the validation projection', () => {
    expect(hashAssignmentSourceRevision('fixture', [sourceRow], preview)).toBe(hashAssignmentSourceRevision('fixture', [sourceRow], preview))
    expect(hashAssignmentSourceRevision('fixture', [sourceRow], preview)).not.toBe(hashAssignmentSourceRevision('fixture', [{ ...sourceRow, schoolName: 'Other' }], preview))
    expect(hashAssignmentSourceRevision('fixture', [sourceRow], preview)).not.toBe(hashAssignmentSourceRevision('fixture', [sourceRow], { ...preview, unresolved: [{ ...sourceRow, reason: 'missing_supervisor' }] }))
    expect(hashAssignmentSourceRevision('fixture', [sourceRow], preview)).not.toBe(hashAssignmentSourceRevision('other', [sourceRow], preview))
  })

  it('rejects a staged revision whose source or preview content changed', () => {
    const sourceRows = [sourceRow]
    const sourcePreview = validateAssignments(sourceRows)
    const sourceHash = hashAssignmentSourceContent(sourceRows)
    const previewHash = hashAssignmentSourceRevision('fixture', sourceRows, sourcePreview)
    expect(verifyAssignmentSourceRevision('fixture', sourceHash, previewHash, sourceRows, sourcePreview)).toBe(true)
    expect(verifyAssignmentSourceRevision('fixture', sourceHash, previewHash, [{ ...sourceRow, schoolName: 'Changed' }], sourcePreview)).toBe(false)
    expect(verifyAssignmentSourceRevision('fixture', sourceHash, previewHash, sourceRows, { ...sourcePreview, unresolved: [{ ...sourceRow, reason: 'missing_supervisor' }] })).toBe(false)
  })

  it('binds the explicit confirmation hash to persisted scope and account choices', () => {
    const confirmed = {
      cueAnexo: '180123456', schoolName: 'School', relationship: 'dependiente', supervisorName: 'Supervisor',
      supervisorUserId: 'supervisor-1', cabeceraCue: '180123455', cabeceraUserId: 'cabecera-1',
      sourceRevisionId: 'revision-1', sourceRowHash: 'a'.repeat(64), provenance: [{ sourceId: 'fixture', location: 'Sheet1!A1' }],
      confirmedByUserId: 'planner-1', confirmedAt: new Date('2026-11-10T12:00:00.000Z'),
    }
    const hash = hashConfirmedAssignment(confirmed)
    expect(hashConfirmedAssignment(confirmed)).toBe(hash)
    expect(hashConfirmedAssignment({ ...confirmed, cabeceraCue: '180123454' })).not.toBe(hash)
    expect(hashConfirmedAssignment({ ...confirmed, cabeceraUserId: 'cabecera-2' })).not.toBe(hash)
  })
})

describe('planning actor authority (S3)', () => {
  it('lets an unverified, unbanned admin stage without membership', async () => {
    const state: FakeState = { accounts: [{ emailVerified: false, banned: false }], membership: false, revision: null, writes: [] }
    const staged = await stageAssignmentSourceManifest(actorWithRole('admin'), 'fixture', [stagingRow], fakeDb(state))
    expect(staged.revisionId).toEqual(expect.any(String))
    expect(state.writes).toHaveLength(1)
  })

  it('denies a non-admin without planning membership with 403', async () => {
    const state: FakeState = { accounts: [{ emailVerified: true, banned: false }], membership: false, revision: null, writes: [] }
    await expect(stageAssignmentSourceManifest(actorWithRole('consulta'), 'fixture', [stagingRow], fakeDb(state)))
      .rejects.toMatchObject({ code: 'forbidden', status: 403 })
    expect(state.writes).toHaveLength(0)
  })

  it('denies a banned admin with 403, even though the role is admin', async () => {
    const state: FakeState = { accounts: [{ emailVerified: true, banned: true }], membership: true, revision: null, writes: [] }
    await expect(stageAssignmentSourceManifest(actorWithRole('admin'), 'fixture', [stagingRow], fakeDb(state)))
      .rejects.toMatchObject({ code: 'forbidden', status: 403 })
  })

  it('keeps 401 for a missing actor', async () => {
    const state: FakeState = { accounts: [], membership: false, revision: null, writes: [] }
    await expect(stageAssignmentSourceManifest(null, 'fixture', [stagingRow], fakeDb(state)))
      .rejects.toMatchObject({ code: 'unauthorized', status: 401 })
  })
})

describe('confirmation responsible accounts (S3, S7)', () => {
  const rows = [stagingRow]
  const preview = validateAssignments(rows)
  const sourceHash = hashAssignmentSourceContent(rows)
  const previewHash = hashAssignmentSourceRevision('fixture', rows, preview)
  const revision = { id: 'revision-1', sourceId: 'fixture', sourceHash, previewHash, sourceRows: rows, preview, status: 'staged' }
  const confirmations = [{
    cueAnexo: '180123456', supervisorUserId: 'sup-1', cabeceraUserId: 'cab-1',
    sourceRowHash: hashAssignmentSourceRow(preview.accepted[0]),
  }]

  it('persists when an admin confirms and responsible supervisor/cabecera accounts are unverified members', async () => {
    const state: FakeState = {
      accounts: [{ emailVerified: false, banned: false }, { emailVerified: false, banned: false }, { emailVerified: false, banned: false }],
      membership: true, revision, writes: [],
    }
    const result = await confirmStagedAssignmentSource(actorWithRole('admin'), previewHash, confirmations, fakeDb(state))
    expect(result.persistedCueAnexos).toEqual(['180123456'])
  })

  it('denies confirmation when a responsible account has no active membership', async () => {
    const state: FakeState = { accounts: [{ emailVerified: true, banned: false }], membership: false, revision, writes: [] }
    await expect(confirmStagedAssignmentSource(actorWithRole('admin'), previewHash, confirmations, fakeDb(state)))
      .rejects.toMatchObject({ code: 'responsible_account_unavailable', status: 409 })
    expect(state.writes).toHaveLength(0)
  })

  it('denies confirmation when a responsible account is banned', async () => {
    const state: FakeState = {
      accounts: [{ emailVerified: true, banned: false }, { emailVerified: true, banned: true }, { emailVerified: true, banned: false }],
      membership: true, revision, writes: [],
    }
    await expect(confirmStagedAssignmentSource(actorWithRole('admin'), previewHash, confirmations, fakeDb(state)))
      .rejects.toMatchObject({ code: 'responsible_account_unavailable', status: 409 })
    expect(state.writes).toHaveLength(0)
  })
})

describe('staged revision reads for the upload flow (S4)', () => {
  const stagedRows: AssignmentSourceRow[] = [
    { ...stagingRow, cue: '180017000', relationship: 'cabecera', cabeceraCue: '180017000', supervisorName: 'Supervisor A' },
    { ...stagingRow, cue: '180013600', relationship: 'dependiente', cabeceraCue: '180017000', supervisorName: 'Supervisor A' },
    { ...stagingRow, cue: '180000100', relationship: 'dependiente', cabeceraCue: null, supervisorName: 'Supervisor B' },
  ]

  async function stagedRevisionFor(rows: AssignmentSourceRow[]) {
    const state: FakeState = { accounts: [{ emailVerified: false, banned: false }], membership: false, revision: null, writes: [] }
    const staged = await stageAssignmentSourceManifest(actorWithRole('admin'), 'fixture', rows, fakeDb(state))
    const persisted = state.writes[0] as { value: Record<string, unknown> }
    return { staged, persisted: persisted.value }
  }

  it('loads the accepted rows of a staged revision by preview hash for an admin', async () => {
    const { staged, persisted } = await stagedRevisionFor(stagedRows)
    const state: FakeState = { accounts: [{ emailVerified: false, banned: false }], membership: false, revision: persisted, writes: [] }

    const loaded = await loadStagedAssignmentAccepted(actorWithRole('admin'), staged.previewHash, fakeDb(state))

    expect(loaded.revisionId).toBe(staged.revisionId)
    expect(loaded.accepted).toEqual(validateAssignments(stagedRows).accepted)
    expect(loaded.accepted.map((item) => item.cueAnexo).sort()).toEqual(['180013600', '180017000'])
  })

  it('denies a non-planning actor with 403 before reading the revision', async () => {
    const { staged, persisted } = await stagedRevisionFor(stagedRows)
    const state: FakeState = { accounts: [{ emailVerified: true, banned: false }], membership: false, revision: persisted, writes: [] }

    await expect(loadStagedAssignmentAccepted(actorWithRole('consulta'), staged.previewHash, fakeDb(state)))
      .rejects.toMatchObject({ code: 'forbidden', status: 403 })
  })

  it('refuses a revision whose stored rows no longer match its hashes', async () => {
    const { staged, persisted } = await stagedRevisionFor(stagedRows)
    const tampered = { ...persisted, sourceRows: [{ ...stagedRows[0], schoolName: 'Changed' }, ...stagedRows.slice(1)] }
    const state: FakeState = { accounts: [{ emailVerified: false, banned: false }], membership: false, revision: tampered, writes: [] }

    await expect(loadStagedAssignmentAccepted(actorWithRole('admin'), staged.previewHash, fakeDb(state)))
      .rejects.toMatchObject({ code: 'staged_revision_integrity_failure', status: 409 })
  })

  it('reports an unknown preview hash as not found', async () => {
    const state: FakeState = { accounts: [{ emailVerified: false, banned: false }], membership: false, revision: null, writes: [] }

    await expect(loadStagedAssignmentAccepted(actorWithRole('admin'), 'b'.repeat(64), fakeDb(state)))
      .rejects.toMatchObject({ code: 'staged_revision_not_found', status: 404 })
  })

  it('lists recent revisions with their preview counts for a planning actor', async () => {
    const { persisted } = await stagedRevisionFor(stagedRows)
    const stagedAt = new Date('2026-11-11T10:00:00.000Z')
    const state: FakeState = {
      accounts: [{ emailVerified: false, banned: false }], membership: false, revision: null,
      revisions: [{ id: 'revision-1', sourceId: persisted.sourceId, status: 'staged', stagedAt, preview: persisted.preview }],
      writes: [],
    }

    const listed = await listAssignmentSourceRevisions(actorWithRole('admin'), fakeDb(state))

    expect(listed).toEqual([{
      revisionId: 'revision-1', sourceId: 'fixture', status: 'staged', createdAt: '2026-11-11T10:00:00.000Z',
      counts: { accepted: 2, conflicts: 0, unresolved: 1 },
    }])
  })

  it('denies listing revisions to a non-planning actor with 403', async () => {
    const state: FakeState = { accounts: [{ emailVerified: true, banned: false }], membership: false, revision: null, writes: [] }

    await expect(listAssignmentSourceRevisions(actorWithRole('consulta'), fakeDb(state)))
      .rejects.toMatchObject({ code: 'forbidden', status: 403 })
  })
})
