import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { SessionUser } from '@/lib/acl'
import { confirmStagedAssignmentSource, stageAssignmentSourceManifest } from './assignment-source'
import { grant } from './memberships'
import {
  confirmCabeceras,
  listCabeceras,
  type CabeceraRecord,
  type CabeceraRepository,
} from './cabeceras'

vi.mock('./memberships', () => ({ grant: vi.fn() }))
vi.mock('./assignment-source', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./assignment-source')>()),
  stageAssignmentSourceManifest: vi.fn(),
  confirmStagedAssignmentSource: vi.fn(),
}))

const CUE_38 = '180032400'
const CUE_87 = '180017000'

const cabeceras: CabeceraRecord[] = [
  { cue: CUE_38, nombre: 'ESCUELA Nº 38 "JOSE MARIA PAZ"', departamento: 'CURUZU CUATIA', supervisorName: 'EDID LEYES', evidencia: 'DATOS.xlsx: "Escuelas a cargo"' },
  { cue: CUE_87, nombre: 'ESCUELA Nº 87 "JOSE DANIEL BIANCHI"', departamento: 'MERCEDES', supervisorName: 'MILAGROS GONZALEZ', evidencia: 'DATOS 87.xlsx: "ESCUELA CABECERA Nº 87"' },
]

const user = (role: string, id: string) => ({ id, role, banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [] }) as unknown as SessionUser
const admin = user('admin', 'admin-1')
const planner = user('user', 'planner-1')
const outsider = user('user', 'user-9')

const repo = (overrides: Partial<CabeceraRepository> = {}): CabeceraRepository => ({
  getAccountStatus: vi.fn(async () => ({ emailVerified: false, banned: false })),
  hasPlanningMembership: vi.fn(async () => false),
  listCabeceraRows: vi.fn(async () => cabeceras),
  listBoundAssignments: vi.fn(async () => []),
  ...overrides,
})

const mapping = {
  [CUE_38]: { supervisorUserId: 'sup-1', cabeceraUserId: 'cab-1' },
  [CUE_87]: { supervisorUserId: 'sup-2', cabeceraUserId: 'cab-2' },
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('listCabeceras', () => {
  it('merges the active database cabeceras with the current assignment state', async () => {
    const repository = repo({
      listBoundAssignments: vi.fn(async () => [{
        cueAnexo: CUE_38,
        supervisor: { id: 'sup-1', name: 'Edid Leyes', email: 'edid@example.test' },
        cabecera: { id: 'cab-1', name: 'Directora 38', email: 'dir38@example.test' },
      }]),
    })
    const { cabeceras: rows } = await listCabeceras(admin, { repository })
    expect(repository.listCabeceraRows).toHaveBeenCalled()
    expect(rows).toEqual([
      expect.objectContaining({
        cue: CUE_38,
        departamento: 'CURUZU CUATIA',
        supervisorName: 'EDID LEYES',
        status: 'confirmada',
        supervisor: { id: 'sup-1', name: 'Edid Leyes', email: 'edid@example.test' },
        cabecera: { id: 'cab-1', name: 'Directora 38', email: 'dir38@example.test' },
      }),
      expect.objectContaining({ cue: CUE_87, status: 'pendiente', supervisor: null, cabecera: null }),
    ])
  })

  it('rejects actors who are neither admin nor planning members', async () => {
    await expect(listCabeceras(outsider, { repository: repo() }))
      .rejects.toMatchObject({ code: 'forbidden', status: 403 })
  })
})

describe('confirmCabeceras', () => {
  const stagedFor = (cues: string[]) => ({
    revisionId: 'rev-1',
    sourceHash: 'c'.repeat(64),
    previewHash: 'd'.repeat(64),
    preview: { accepted: [], conflicts: [], unresolved: [] },
    sourceRowHashes: Object.fromEntries(cues.map((cue) => [cue, cue.padEnd(64, 'e')])),
  })

  it('grants the mapped memberships, stages cabecera rows and confirms them through the existing source flow', async () => {
    vi.mocked(stageAssignmentSourceManifest).mockResolvedValue(stagedFor([CUE_38, CUE_87]) as never)
    vi.mocked(confirmStagedAssignmentSource).mockResolvedValue({
      persistedCueAnexos: [CUE_38, CUE_87], retainedConflictCueAnexos: [], blockedCueAnexos: [],
    })
    vi.mocked(grant).mockResolvedValue({} as never)

    const result = await confirmCabeceras(admin, mapping, { repository: repo() })

    expect(grant).toHaveBeenCalledWith(admin, 'sup-1', 'supervisor')
    expect(grant).toHaveBeenCalledWith(admin, 'cab-1', 'cabecera')
    expect(grant).toHaveBeenCalledWith(admin, 'sup-2', 'supervisor')
    expect(grant).toHaveBeenCalledWith(admin, 'cab-2', 'cabecera')

    const [, sourceId, rows] = vi.mocked(stageAssignmentSourceManifest).mock.calls[0]
    expect(sourceId).toMatch(/^booklet_cabecera:/)
    // Rows follow the database order (cue ascending), as confirmCabeceras processes them.
    expect(rows).toEqual([
      expect.objectContaining({ cue: CUE_87, cabeceraCue: CUE_87, relationship: 'cabecera' }),
      {
        cue: CUE_38,
        schoolName: 'ESCUELA Nº 38 "JOSE MARIA PAZ"',
        relationship: 'cabecera',
        supervisorName: 'EDID LEYES',
        cabeceraCue: CUE_38,
        provenance: { sourceId: 'booklet_cabecera', location: 'DATOS.xlsx: "Escuelas a cargo"' },
      },
    ])

    const [, previewHash, confirmations] = vi.mocked(confirmStagedAssignmentSource).mock.calls[0]
    expect(previewHash).toBe('d'.repeat(64))
    expect(confirmations).toEqual([
      { cueAnexo: CUE_87, supervisorUserId: 'sup-2', cabeceraUserId: 'cab-2', sourceRowHash: CUE_87.padEnd(64, 'e') },
      { cueAnexo: CUE_38, supervisorUserId: 'sup-1', cabeceraUserId: 'cab-1', sourceRowHash: CUE_38.padEnd(64, 'e') },
    ])
    expect(result.confirmed).toEqual([CUE_38, CUE_87])
  })

  it('leaves identical bound cabeceras untouched and stages nothing when nothing changed', async () => {
    const bound = [CUE_38, CUE_87].map((cueAnexo, index) => ({
      cueAnexo,
      supervisor: { id: `sup-${index + 1}`, name: 'S', email: 's@example.test' },
      cabecera: { id: `cab-${index + 1}`, name: 'C', email: 'c@example.test' },
    }))
    const result = await confirmCabeceras(admin, mapping, { repository: repo({ listBoundAssignments: vi.fn(async () => bound) }) })
    expect(result).toEqual({ confirmed: [], unchanged: [CUE_87, CUE_38], blocked: [] })
    expect(stageAssignmentSourceManifest).not.toHaveBeenCalled()
  })

  it('refuses a changed account on an already bound cabecera instead of rewriting it', async () => {
    const bound = [{
      cueAnexo: CUE_38,
      supervisor: { id: 'sup-old', name: 'S', email: 's@example.test' },
      cabecera: { id: 'cab-1', name: 'C', email: 'c@example.test' },
    }]
    await expect(confirmCabeceras(admin, mapping, { repository: repo({ listBoundAssignments: vi.fn(async () => bound) }) }))
      .rejects.toMatchObject({ code: 'assignment_conflicts_with_existing_record', status: 409 })
    expect(stageAssignmentSourceManifest).not.toHaveBeenCalled()
    expect(grant).not.toHaveBeenCalled()
  })

  it('lets a planning member confirm without granting memberships itself', async () => {
    vi.mocked(stageAssignmentSourceManifest).mockResolvedValue(stagedFor([CUE_38, CUE_87]) as never)
    vi.mocked(confirmStagedAssignmentSource).mockResolvedValue({ persistedCueAnexos: [CUE_38, CUE_87], retainedConflictCueAnexos: [], blockedCueAnexos: [] })
    const repository = repo({ hasPlanningMembership: vi.fn(async () => true), getAccountStatus: vi.fn(async () => ({ emailVerified: true, banned: false })) })
    await confirmCabeceras(planner, mapping, { repository })
    expect(grant).not.toHaveBeenCalled()
    expect(confirmStagedAssignmentSource).toHaveBeenCalled()
  })

  it('rejects actors who are neither admin nor planning members before staging anything', async () => {
    await expect(confirmCabeceras(outsider, mapping, { repository: repo() }))
      .rejects.toMatchObject({ code: 'forbidden', status: 403 })
    expect(stageAssignmentSourceManifest).not.toHaveBeenCalled()
  })

  it('rejects a cue that is not an active database cabecera', async () => {
    await expect(confirmCabeceras(admin, { '180999999': { supervisorUserId: 'sup-1', cabeceraUserId: 'cab-1' } }, { repository: repo() }))
      .rejects.toMatchObject({ code: 'unknown_cabecera', status: 400 })
    expect(stageAssignmentSourceManifest).not.toHaveBeenCalled()
  })
})
