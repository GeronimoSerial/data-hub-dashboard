import { describe, expect, it } from 'vitest'
import { confirmAndPersistAssignments, persistConfirmedAssignments, validateAssignments } from './assignment-import'
import type { AssignmentImportStore, ConfirmedAssignmentRecord } from './assignment-import'
import type { AssignmentConflict } from './types'
import type { AssignmentSourceRow } from './types'
import type { SessionUser } from '@/lib/acl'

const row = (overrides: Partial<AssignmentSourceRow>): AssignmentSourceRow => ({
  cue: '180123456',
  schoolName: 'Escuela de prueba',
  relationship: 'cabecera',
  supervisorName: 'Supervisión de prueba',
  cabeceraCue: null,
  provenance: { sourceId: 'fixture-1', location: 'Sheet1!A1' },
  ...overrides,
})

describe('validateAssignments', () => {
  it('does not invent an annex for a seven-digit base CUE', () => {
    const result = validateAssignments([row({ cue: '0123456' })])

    expect(result.accepted).toEqual([])
    expect(result.unresolved).toHaveLength(1)
    expect(result.unresolved[0].reason).toBe('missing_annex')
    expect(result.unresolved[0].provenance).toEqual({ sourceId: 'fixture-1', location: 'Sheet1!A1' })
  })

  it('preserves leading zeroes in a complete nine-digit CUE', () => {
    const result = validateAssignments([row({ cue: '012345607' })])

    expect(result.accepted).toHaveLength(1)
    expect(result.accepted[0].cueAnexo).toBe('012345607')
  })

  it('keeps an exact CUE with conflicting supervisors out of accepted assignments', () => {
    const result = validateAssignments([
      row({ supervisorName: 'Supervisión A' }),
      row({ supervisorName: 'Supervisión B', provenance: { sourceId: 'fixture-2', location: 'Sheet2!B7' } }),
    ])

    expect(result.accepted).toEqual([])
    expect(result.conflicts).toHaveLength(1)
    expect(result.conflicts[0].cueAnexo).toBe('180123456')
    expect(result.conflicts[0].rows.map((entry) => entry.supervisorName)).toEqual(['Supervisión A', 'Supervisión B'])
  })

  it('leaves a head school without a supervisor unresolved', () => {
    const result = validateAssignments([row({ supervisorName: null })])

    expect(result.accepted).toEqual([])
    expect(result.unresolved[0].reason).toBe('missing_supervisor')
  })

  it('does not accept a dependent school when its head is absent', () => {
    const result = validateAssignments([row({
      cue: '180123457',
      relationship: 'dependiente',
      cabeceraCue: '180123456',
    })])

    expect(result.accepted).toEqual([])
    expect(result.unresolved).toHaveLength(1)
    expect(result.unresolved[0].reason).toBe('missing_cabecera')
  })

  it('does not accept a dependent school when its head is conflicted', () => {
    const result = validateAssignments([
      row({ cue: '180123456', supervisorName: 'Supervisión A' }),
      row({ cue: '180123456', supervisorName: 'Supervisión B', provenance: { sourceId: 'fixture-2', location: 'Sheet2!B7' } }),
      row({ cue: '180123457', relationship: 'dependiente', cabeceraCue: '180123456' }),
    ])

    expect(result.accepted).toEqual([])
    expect(result.conflicts).toHaveLength(1)
    expect(result.unresolved).toHaveLength(1)
    expect(result.unresolved[0].reason).toBe('invalid_cabecera')
  })

  it('does not accept a dependent school when its head is unresolved', () => {
    const result = validateAssignments([
      row({ cue: '180123456', relationship: 'cabecera', supervisorName: null }),
      row({ cue: '180123457', relationship: 'dependiente', cabeceraCue: '180123456' }),
    ])

    expect(result.accepted).toEqual([])
    expect(result.unresolved.map((entry) => entry.reason)).toEqual(['missing_supervisor', 'invalid_cabecera'])
  })

  it('accepts a dependent school only when its head is a valid source candidate', () => {
    const result = validateAssignments([
      row({ cue: '180123456', relationship: 'cabecera' }),
      row({ cue: '180123457', relationship: 'dependiente', cabeceraCue: '180123456' }),
    ])

    expect(result.accepted.map((assignment) => assignment.cueAnexo)).toEqual(['180123456', '180123457'])
    expect(result.unresolved).toEqual([])
  })

  it('omits contact details and raw source fields from the preview payload', () => {
    const unsafeRow = {
      ...row({}),
      email: 'private@example.invalid',
      phone: '+54 000 0000',
      sourceContacts: ['private contact'],
    } as AssignmentSourceRow

    const result = validateAssignments([unsafeRow])

    expect(JSON.stringify(result)).not.toMatch(/private@example|0000|sourceContacts|private contact/)
  })
})

describe('persistConfirmedAssignments', () => {
  const planner: SessionUser = {
    id: 'planner-1', role: 'consulta', banned: false, nivelJurIds: [],
    accesoRecursos: 'todos', recursoIds: [],
  }

  const preview = validateAssignments([
    row({ cue: '180123456', relationship: 'cabecera' }),
    row({ cue: '180123457', relationship: 'dependiente', cabeceraCue: '180123456' }),
    row({ cue: '180123458', supervisorName: 'Supervisión A', provenance: { sourceId: 'fixture-3', location: 'Sheet3!A1' } }),
    row({ cue: '180123458', supervisorName: 'Supervisión B', provenance: { sourceId: 'fixture-4', location: 'Sheet4!A1' } }),
  ])

  const makeStore = (planningMembership: boolean, sourceReady = true): AssignmentImportStore & {
    assignments: Map<string, ConfirmedAssignmentRecord>
    conflicts: Map<string, AssignmentConflict>
  } => {
    const store: AssignmentImportStore & {
      assignments: Map<string, ConfirmedAssignmentRecord>
      conflicts: Map<string, AssignmentConflict>
    } = {
      assignments: new Map(),
      conflicts: new Map(),
      async transaction<T>(operation: (transaction: AssignmentImportStore) => Promise<T>): Promise<T> {
        return operation(store)
      },
      async getAccountStatus(userId) {
        if (userId === 'planner-1') return { emailVerified: true, banned: false }
        if (userId === 'cabecera-1' || userId === 'supervisor-1') return { emailVerified: true, banned: false }
        return null
      },
      async hasActiveMembership(userId, capability) {
        return (planningMembership && userId === 'planner-1' && capability === 'planning')
          || (userId === 'supervisor-1' && capability === 'supervisor')
          || (userId === 'cabecera-1' && capability === 'cabecera')
      },
      async sourceReconciliationReady() { return sourceReady },
      async hasSchoolAssignment() { return false },
      async getAssignment(cueAnexo) { return store.assignments.get(cueAnexo) ?? null },
      async insertAssignment(assignment) {
        if (store.assignments.has(assignment.cueAnexo)) return false
        store.assignments.set(assignment.cueAnexo, assignment)
        return true
      },
      async getConflict(cueAnexo) { return store.conflicts.get(cueAnexo) ?? null },
      async saveConflict(conflict) { store.conflicts.set(conflict.cueAnexo, conflict) },
    }
    return store
  }

  const confirmations = [
    { cueAnexo: '180123456', supervisorUserId: 'supervisor-1', cabeceraUserId: 'cabecera-1' },
    { cueAnexo: '180123457', supervisorUserId: 'supervisor-1', cabeceraUserId: 'cabecera-1' },
  ]

  it('does not persist any row unless the authenticated account has planning membership', async () => {
    const store = makeStore(false)

    await expect(persistConfirmedAssignments(planner, preview, confirmations, store)).rejects.toThrow('No autorizado')
    expect(store.assignments.size).toBe(0)
    expect(store.conflicts.size).toBe(0)
  })

  it('fails closed before any persistence when no trusted reconciliation source is configured', async () => {
    const store = makeStore(true, false)
    const sourceRows = [
      row({ cue: '180123456', relationship: 'cabecera' }),
      row({ cue: '180123457', relationship: 'dependiente', cabeceraCue: '180123456' }),
    ]

    await expect(confirmAndPersistAssignments(planner, sourceRows, confirmations, store)).rejects.toMatchObject({
      code: 'source_reconciliation_unavailable', status: 503,
    })
    expect(store.assignments.size).toBe(0)
    expect(store.conflicts.size).toBe(0)
  })

  it('persists only explicitly confirmed rows, retains conflicts, and is idempotent', async () => {
    const store = makeStore(true)

    const first = await persistConfirmedAssignments(planner, preview, confirmations, store)
    const second = await persistConfirmedAssignments(planner, preview, confirmations, store)

    expect(first).toEqual(second)
    expect(first.persistedCueAnexos).toEqual(['180123456', '180123457'])
    expect(first.retainedConflictCueAnexos).toEqual(['180123458'])
    expect(store.assignments.size).toBe(2)
    expect(store.conflicts.size).toBe(1)
    expect(store.assignments.get('180123457')).toMatchObject({
      supervisorUserId: 'supervisor-1',
      cabeceraUserId: 'cabecera-1',
      confirmedByUserId: 'planner-1',
    })
  })

  it('recomputes the preview from submitted source rows before persistence', async () => {
    const store = makeStore(true)
    const sourceRows = [
      row({ cue: '180123456', relationship: 'cabecera' }),
      row({ cue: '180123457', relationship: 'dependiente', cabeceraCue: '180123456' }),
      row({ cue: '180123458', relationship: 'dependiente', cabeceraCue: '180000000' }),
    ]

    const result = await confirmAndPersistAssignments(planner, sourceRows, confirmations, store)

    expect(result.preview.accepted.map((assignment) => assignment.cueAnexo)).toEqual(['180123456', '180123457'])
    expect(result.preview.unresolved.map((entry) => entry.cue)).toEqual(['180123458'])
    expect(result.persistence.persistedCueAnexos).toEqual(['180123456', '180123457'])
    expect(store.assignments.has('180123458')).toBe(false)
  })
})
