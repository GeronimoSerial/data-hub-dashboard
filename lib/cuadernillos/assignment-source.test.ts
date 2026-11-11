import { describe, expect, it } from 'vitest'
import { hashAssignmentSourceContent, hashAssignmentSourceRow, hashAssignmentSourceRevision, hashConfirmedAssignment, verifyAssignmentSourceRevision } from './assignment-source'
import { validateAssignments } from './assignment-import'
import type { AssignmentSourceRow, AssignmentValidationResult } from './types'

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
