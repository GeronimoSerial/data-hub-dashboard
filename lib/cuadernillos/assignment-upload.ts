import { createHash } from 'node:crypto'
import { hashAssignmentSourceRow } from './assignment-source'
import type { AssignmentAccepted, AssignmentSourceRow } from './types'

export const MAX_ASSIGNMENT_UPLOAD_BYTES = 2 * 1024 * 1024

const REQUIRED_COLUMNS = ['cue_anexo', 'nombre', 'supervisor', 'relationship', 'cabecera_cue', 'source'] as const
const SOURCE_ID_MAX_LENGTH = 128
const SOURCE_NAME_MAX_LENGTH = SOURCE_ID_MAX_LENGTH - 65

export class AssignmentUploadError extends Error {
  readonly code: string
  readonly status: number
  constructor(code: string, status: number) {
    super(code)
    this.name = 'AssignmentUploadError'
    this.code = code
    this.status = status
  }
}

/** RFC 4180 records: quoted fields may contain commas, doubled quotes and line breaks. */
export function parseCsvRecords(text: string): string[][] {
  const records: string[][] = []
  let record: string[] = []
  let field = ''
  let quoted = false
  let fieldStarted = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          quoted = false
        }
      } else {
        field += char
      }
      continue
    }
    if (char === '"' && !fieldStarted) {
      quoted = true
      fieldStarted = true
    } else if (char === ',') {
      record.push(field)
      field = ''
      fieldStarted = false
    } else if (char === '\r' || char === '\n') {
      if (char === '\r' && text[index + 1] === '\n') index += 1
      record.push(field)
      records.push(record)
      record = []
      field = ''
      fieldStarted = false
    } else {
      field += char
      fieldStarted = true
    }
  }

  if (quoted) throw new AssignmentUploadError('invalid_csv', 400)
  if (fieldStarted || field !== '' || record.length > 0) {
    record.push(field)
    records.push(record)
  }
  return records.filter((item) => item.some((value) => value.trim() !== ''))
}

/**
 * Parses the consejo export into server-side source rows. Only the six
 * relevant columns are read; status and departamento are ignored.
 *
 * An empty or unknown relationship is never trusted: it becomes a dependiente
 * row without a cabecera cue, so validateAssignments reports it as unresolved.
 */
export function parseAssignmentCsv(text: string, sourceId: string): AssignmentSourceRow[] {
  const [rawHeader, ...dataRecords] = parseCsvRecords(text.replace(/^﻿/, ''))
  if (!rawHeader) throw new AssignmentUploadError('empty_csv', 400)
  const header = rawHeader.map((column) => column.trim().toLowerCase())
  const index = Object.fromEntries(REQUIRED_COLUMNS.map((column) => [column, header.indexOf(column)]))
  if (REQUIRED_COLUMNS.some((column) => index[column] === -1)) {
    throw new AssignmentUploadError('invalid_csv_header', 400)
  }
  if (dataRecords.length === 0) throw new AssignmentUploadError('empty_csv', 400)

  return dataRecords.map((record, offset) => {
    const value = (column: (typeof REQUIRED_COLUMNS)[number]) => (record[index[column]] ?? '').trim()
    const cabeceraCue = value('cabecera_cue') || null
    const relationship = value('relationship')
    const known = relationship === 'cabecera' || relationship === 'dependiente'
    return {
      cue: value('cue_anexo') || null,
      schoolName: value('nombre'),
      relationship: relationship === 'cabecera' ? 'cabecera' : 'dependiente',
      supervisorName: value('supervisor') || null,
      cabeceraCue: known ? cabeceraCue : null,
      provenance: { sourceId, location: value('source') || `fila-${offset + 2}` },
    }
  })
}

/** Stable revision source id: the uploaded file name (bounded) plus the sha256 of its bytes. */
export function assignmentSourceIdFor(fileName: string, bytes: Uint8Array): string {
  const digest = createHash('sha256').update(bytes).digest('hex')
  const name = fileName.trim().replace(/[^\w.-]+/g, '_').slice(0, SOURCE_NAME_MAX_LENGTH) || 'upload'
  return `${name}:${digest}`
}

export type AccountMapping = {
  supervisorAccounts: Record<string, string>
  cabeceraAccounts: Record<string, string>
}

export type AccountConfirmation = {
  cueAnexo: string
  supervisorUserId: string
  cabeceraUserId: string
  sourceRowHash: string
}

export type ExpandedAccountConfirmations = {
  confirmations: AccountConfirmation[]
  skipped: { cueAnexo: string; reason: 'supervisor_unmapped' | 'cabecera_unmapped' }[]
}

/**
 * Expands the admin's name-to-account choices into per-school confirmations.
 * A school is confirmed only when its supervisor name and its cabecera cue both
 * map to a non-empty account; accounts are never inferred from names.
 */
export function expandAccountConfirmations(accepted: AssignmentAccepted[], mapping: AccountMapping): ExpandedAccountConfirmations {
  const confirmations: AccountConfirmation[] = []
  const skipped: ExpandedAccountConfirmations['skipped'] = []
  const present = (accounts: Record<string, string>, key: string) => {
    const userId = accounts[key]?.trim()
    return userId ? userId : null
  }

  for (const assignment of accepted) {
    const supervisorUserId = present(mapping.supervisorAccounts, assignment.supervisorName)
    if (!supervisorUserId) {
      skipped.push({ cueAnexo: assignment.cueAnexo, reason: 'supervisor_unmapped' })
      continue
    }
    const cabeceraUserId = present(mapping.cabeceraAccounts, assignment.cabeceraCue)
    if (!cabeceraUserId) {
      skipped.push({ cueAnexo: assignment.cueAnexo, reason: 'cabecera_unmapped' })
      continue
    }
    confirmations.push({
      cueAnexo: assignment.cueAnexo,
      supervisorUserId,
      cabeceraUserId,
      sourceRowHash: hashAssignmentSourceRow(assignment),
    })
  }

  return { confirmations, skipped }
}
