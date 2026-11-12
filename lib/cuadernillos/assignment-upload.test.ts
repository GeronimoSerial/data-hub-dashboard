import { describe, expect, it } from 'vitest'
import { hashAssignmentSourceRow } from './assignment-source'
import {
  AssignmentUploadError,
  MAX_ASSIGNMENT_UPLOAD_BYTES,
  assignmentSourceIdFor,
  expandAccountConfirmations,
  parseAssignmentCsv,
  parseCsvRecords,
} from './assignment-upload'
import { validateAssignments } from './assignment-import'
import type { AssignmentAccepted } from './types'

const HEADER = 'cue_anexo,nombre,departamento,supervisor,relationship,cabecera_cue,source,status'

describe('parseCsvRecords (RFC 4180)', () => {
  it('keeps commas, doubled quotes and quoted line breaks inside fields', () => {
    const records = parseCsvRecords('a,"b, c","d ""e"""\r\n"x\ny",z,\n')

    expect(records).toEqual([['a', 'b, c', 'd "e"'], ['x\ny', 'z', '']])
  })

  it('rejects an unterminated quoted field', () => {
    expect(() => parseCsvRecords('a,"b\n')).toThrow(AssignmentUploadError)
  })
})

describe('parseAssignmentCsv', () => {
  it('maps the consejo export columns to source rows with provenance', () => {
    const csv = [
      HEADER,
      '180017000,"ESCUELA Nº 87 ""JOSE DANIEL BIANCHI""",MERCEDES,MILAGROS GONZALEZ,cabecera,180017000,DATOS.xlsx:Hoja1:4,ok',
      '180013600,"ESCUELA DE ADOLESCENTES, Nº 32",MERCEDES,MILAGROS GONZALEZ,dependiente,180017000,DATOS.xlsx:Hoja1:6,ok',
    ].join('\n')

    const rows = parseAssignmentCsv(csv, 'fuente-1')

    expect(rows).toEqual([
      {
        cue: '180017000',
        schoolName: 'ESCUELA Nº 87 "JOSE DANIEL BIANCHI"',
        relationship: 'cabecera',
        supervisorName: 'MILAGROS GONZALEZ',
        cabeceraCue: '180017000',
        provenance: { sourceId: 'fuente-1', location: 'DATOS.xlsx:Hoja1:4' },
      },
      {
        cue: '180013600',
        schoolName: 'ESCUELA DE ADOLESCENTES, Nº 32',
        relationship: 'dependiente',
        supervisorName: 'MILAGROS GONZALEZ',
        cabeceraCue: '180017000',
        provenance: { sourceId: 'fuente-1', location: 'DATOS.xlsx:Hoja1:6' },
      },
    ])
  })

  it('never invents a relationship: an empty relationship stays unresolved, even with a cabecera cue', () => {
    const csv = [
      HEADER,
      '180000100,ESCUELA,BELLA VISTA,SILVIA ZABALA,,180000999,Planilla.xlsx:BELLA VISTA:15,sin_cabecera',
      '180000200,ESCUELA 2,BELLA VISTA,,,,Planilla.xlsx:BELLA VISTA:23,sin_supervisor',
    ].join('\n')

    const rows = parseAssignmentCsv(csv, 'fuente-1')
    const result = validateAssignments(rows)

    expect(result.accepted).toEqual([])
    expect(result.unresolved.map((item) => [item.cue, item.reason])).toEqual([
      ['180000100', 'missing_cabecera'],
      ['180000200', 'missing_supervisor'],
    ])
  })

  it('rejects a file without the required columns', () => {
    expect(() => parseAssignmentCsv('cue_anexo,nombre\n180000100,ESCUELA', 'fuente-1'))
      .toThrowError(new AssignmentUploadError('invalid_csv_header', 400))
  })

  it('rejects a file without data rows', () => {
    expect(() => parseAssignmentCsv(`${HEADER}\n`, 'fuente-1'))
      .toThrowError(new AssignmentUploadError('empty_csv', 400))
  })
})

describe('assignmentSourceIdFor', () => {
  it('binds the uploaded file name to its sha256 and stays within the provenance limit', () => {
    const bytes = new TextEncoder().encode(HEADER)
    const longName = `${'planilla-muy-larga-'.repeat(10)}.csv`

    const sourceId = assignmentSourceIdFor(longName, bytes)

    expect(sourceId).toMatch(/:[a-f0-9]{64}$/)
    expect(sourceId.length).toBeLessThanOrEqual(128)
    expect(assignmentSourceIdFor(longName, bytes)).toBe(sourceId)
  })
})

describe('MAX_ASSIGNMENT_UPLOAD_BYTES', () => {
  it('is 2 MB', () => {
    expect(MAX_ASSIGNMENT_UPLOAD_BYTES).toBe(2 * 1024 * 1024)
  })
})

describe('expandAccountConfirmations (name to account mapping)', () => {
  const accepted: AssignmentAccepted[] = [
    {
      cueAnexo: '180017000', schoolName: 'Cabecera', relationship: 'cabecera', supervisorName: 'MILAGROS',
      cabeceraCue: '180017000', provenance: [{ sourceId: 'f', location: 'r1' }],
    },
    {
      cueAnexo: '180013600', schoolName: 'Dependiente', relationship: 'dependiente', supervisorName: 'MILAGROS',
      cabeceraCue: '180017000', provenance: [{ sourceId: 'f', location: 'r2' }],
    },
    {
      cueAnexo: '180016000', schoolName: 'Sin cuenta supervisor', relationship: 'cabecera', supervisorName: 'OTRO',
      cabeceraCue: '180016000', provenance: [{ sourceId: 'f', location: 'r3' }],
    },
    {
      cueAnexo: '180032400', schoolName: 'Sin cuenta cabecera', relationship: 'cabecera', supervisorName: 'MILAGROS',
      cabeceraCue: '180032400', provenance: [{ sourceId: 'f', location: 'r4' }],
    },
  ]

  it('confirms only schools whose supervisor and cabecera are both mapped, bound to their row hash', () => {
    const result = expandAccountConfirmations(accepted, {
      supervisorAccounts: { MILAGROS: 'user-sup' },
      cabeceraAccounts: { '180017000': 'user-cab' },
    })

    expect(result.confirmations).toEqual([
      { cueAnexo: '180017000', supervisorUserId: 'user-sup', cabeceraUserId: 'user-cab', sourceRowHash: hashAssignmentSourceRow(accepted[0]) },
      { cueAnexo: '180013600', supervisorUserId: 'user-sup', cabeceraUserId: 'user-cab', sourceRowHash: hashAssignmentSourceRow(accepted[1]) },
    ])
  })

  it('reports each skipped school with its reason', () => {
    const result = expandAccountConfirmations(accepted, {
      supervisorAccounts: { MILAGROS: 'user-sup' },
      cabeceraAccounts: { '180017000': 'user-cab' },
    })

    expect(result.skipped).toEqual([
      { cueAnexo: '180016000', reason: 'supervisor_unmapped' },
      { cueAnexo: '180032400', reason: 'cabecera_unmapped' },
    ])
  })

  it('skips a school whose supervisor name is mapped to an empty account id', () => {
    const result = expandAccountConfirmations(accepted, {
      supervisorAccounts: { MILAGROS: '  ', OTRO: 'user-otro' },
      cabeceraAccounts: { '180017000': 'user-cab', '180016000': 'user-cab-2', '180032400': 'user-cab-3' },
    })

    expect(result.confirmations.map((item) => item.cueAnexo)).toEqual(['180016000'])
    expect(result.skipped).toEqual([
      { cueAnexo: '180017000', reason: 'supervisor_unmapped' },
      { cueAnexo: '180013600', reason: 'supervisor_unmapped' },
      { cueAnexo: '180032400', reason: 'supervisor_unmapped' },
    ])
  })
})
