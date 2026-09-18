import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '@/lib/db'
import { infraProblematica, infraProblematicaSeccion } from '@/lib/db/schema'
import { ensureGeSchema, openGeDb } from '@/lib/infraestructura/ge-db'
import { importarIdentidad } from '@/lib/infraestructura/identidad'
import { otorgarPermisoNominal } from '@/lib/infraestructura/permiso-nominal'
import { getSessionUser } from '@/lib/session'

vi.mock('@/lib/session', () => ({
  getSessionUser: vi.fn(),
}))

const CUE = '1801605-04'
const PROBLEMATICA_ID = 'prob-nominal-1'

let dir: string
let prevDataDir: string | undefined
let prevKey: string | undefined

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'nominal-route-'))
  prevDataDir = process.env.DATA_DIR
  process.env.DATA_DIR = dir
  prevKey = process.env.NOMINAL_ENCRYPTION_KEY
  process.env.NOMINAL_ENCRYPTION_KEY = randomBytes(32).toString('base64')

  const ge = openGeDb()
  try {
    await ensureGeSchema(ge)
    await ge.execute(
      "INSERT INTO ge_corte (id, ciclo_lectivo, fetched_at, estado) VALUES (1, 2025, '2025-01-01T00:00:00Z', 'vigente')",
    )
    await ge.execute(
      `INSERT INTO ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, 10, '${CUE}', '1', 'A', 'PRIMARIA', 'MAÑANA')`,
    )
    await ge.execute({
      sql: 'INSERT INTO ge_alumno_seccion (corte_id, ge_section_id, ge_person_id) VALUES (1, 10, ?)',
      args: [7],
    })
    await importarIdentidad(ge, 7, 'Facundo', 'Quiroga')
  } finally {
    ge.close()
  }

  const { ensureSeeded } = await import('@/lib/db/seed')
  await ensureSeeded()

  const db = getDb()
  await db.insert(infraProblematica).values({
    id: PROBLEMATICA_ID,
    cueAnexo: CUE,
    motivo: 'Inundación',
    categoria: 'establecimiento',
    severidad: 'Alta',
    corteId: 1,
    creadaEn: '2026-01-01T00:00:00Z',
    idempotencyKey: 'idem-nominal-1',
    origen: 'test',
  })
  await db.insert(infraProblematicaSeccion).values({
    problematicaId: PROBLEMATICA_ID,
    geSectionId: 10,
  })
})

afterAll(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  if (prevKey === undefined) delete process.env.NOMINAL_ENCRYPTION_KEY
  else process.env.NOMINAL_ENCRYPTION_KEY = prevKey
  rmSync(dir, { recursive: true, force: true })
})

beforeEach(() => {
  vi.mocked(getSessionUser).mockReset()
})

function req() {
  return new Request(`http://localhost/api/infraestructura/nominal?problematica=${PROBLEMATICA_ID}`)
}

describe('GET /api/infraestructura/nominal', () => {
  it('rechaza sin sesión con 401', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    const { GET } = await import('./route')
    const res = await GET(req())
    expect(res.status).toBe(401)
  })

  it('rechaza a consulta sin grant con 403', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({
      id: 'consulta-sin-grant',
      role: 'consulta',
      banned: false,
      nivelIds: [],
    })
    const { GET } = await import('./route')
    const res = await GET(req())
    expect(res.status).toBe(403)
  })

  it('rechaza a editor sin grant con 403', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({
      id: 'editor-sin-grant',
      role: 'editor',
      banned: false,
      nivelIds: [],
    })
    const { GET } = await import('./route')
    const res = await GET(req())
    expect(res.status).toBe(403)
  })

  // El admin entra sin grant, pero no entra sin dejar rastro: la fila en
  // infra_acceso_nominal_log es lo que sostiene el control ahora que el rol
  // abre la puerta por sí solo.
  it('admite a admin sin grant y registra igual el acceso en el log', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({
      id: 'admin-sin-grant',
      role: 'admin',
      banned: false,
      nivelIds: [],
    })
    const { GET } = await import('./route')
    const res = await GET(req())
    expect(res.status).toBe(200)

    const db = getDb()
    const logs = await db.$client.execute({
      sql: 'SELECT problematica_id, cantidad FROM infra_acceso_nominal_log WHERE user_id = ?',
      args: ['admin-sin-grant'],
    })
    expect(logs.rows).toHaveLength(1)
    expect(logs.rows[0].problematica_id).toBe(PROBLEMATICA_ID)
  })

  it('rechaza a un admin baneado con 403 pese al rol', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({
      id: 'admin-baneado',
      role: 'admin',
      banned: true,
      nivelIds: [],
    })
    const { GET } = await import('./route')
    const res = await GET(req())
    expect(res.status).toBe(403)
  })

  it('un grant vencido no da acceso', async () => {
    await otorgarPermisoNominal({
      userId: 'usuario-vencido',
      otorgadoPor: 'admin-x',
      venceEn: new Date(Date.now() - 1000),
    })
    vi.mocked(getSessionUser).mockResolvedValue({
      id: 'usuario-vencido',
      role: 'consulta',
      banned: false,
      nivelIds: [],
    })
    const { GET } = await import('./route')
    const res = await GET(req())
    expect(res.status).toBe(403)
  })

  it('con grant vigente entrega los nombres y registra el acceso en el log', async () => {
    await otorgarPermisoNominal({
      userId: 'usuario-con-grant',
      otorgadoPor: 'admin-x',
      venceEn: new Date(Date.now() + 60_000),
    })
    vi.mocked(getSessionUser).mockResolvedValue({
      id: 'usuario-con-grant',
      role: 'consulta',
      banned: false,
      nivelIds: [],
    })
    const { GET } = await import('./route')
    const res = await GET(req())
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.cantidad).toBe(1)
    expect(body.secciones[0].alumnos).toEqual(
      expect.arrayContaining([{ nombre: 'Facundo', apellido: 'Quiroga' }]),
    )

    const db = getDb()
    const logs = await db.$client.execute({
      sql: 'SELECT user_id, problematica_id, cantidad FROM infra_acceso_nominal_log WHERE user_id = ?',
      args: ['usuario-con-grant'],
    })
    expect(logs.rows).toHaveLength(1)
    expect(logs.rows[0].problematica_id).toBe(PROBLEMATICA_ID)
    expect(Number(logs.rows[0].cantidad)).toBe(1)
  })
})
