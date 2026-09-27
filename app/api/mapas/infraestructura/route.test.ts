import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb, getRawClient } from '@/lib/db'
import { recursoAudienciaNiveles } from '@/lib/db/schema'
import { crearEjecutorSql, ensureGeSchema } from '@/lib/infraestructura/ge-db'
import { getSessionUser } from '@/lib/session'

vi.mock('@/lib/session', () => ({
  getSessionUser: vi.fn(),
}))

const CUE = '1801605-04'

let dir: string
let prevDataDir: string | undefined

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'infraestructura-route-'))
  prevDataDir = process.env.DATA_DIR
  process.env.DATA_DIR = dir

  const client = crearEjecutorSql(getRawClient())
  await ensureGeSchema(client)
  await client.execute(
    "INSERT INTO ge.ge_corte (id, ciclo_lectivo, fetched_at, estado) OVERRIDING SYSTEM VALUE VALUES (1, 2025, '2025-01-01T00:00:00Z', 'vigente')",
  )
  await client.execute(
    `INSERT INTO ge.ge_localizacion (cue_anexo, cui, nombre, departamento, localidad, lat, lon) VALUES ('${CUE}', NULL, 'Escuela', 'ER', 'Parana', -31.7, -60.5)`,
  )
  await client.execute(
    `INSERT INTO ge.ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, 10, '${CUE}', '1', 'A', 'PRIMARIA', 'MAÑANA')`,
  )
  await client.execute({
    sql: 'INSERT INTO ge.ge_alumno_seccion (corte_id, ge_section_id, ge_person_id) VALUES (1, 10, ?)',
    args: [1],
  })

  // ensureSeeded() (llamado por el route handler) da de alta el recurso
  // 'recurso-infraestructura' en '/mapas/infraestructura' (B6, ver
  // lib/infraestructura/recurso-seed.ts). Alcanza con sembrar acá para poder
  // ejercitar puedeAbrir() con audiencias distintas sobre ese mismo recurso.
  const { ensureSeeded } = await import('@/lib/db/seed')
  await ensureSeeded()
})

afterAll(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  rmSync(dir, { recursive: true, force: true })
})

beforeEach(() => {
  vi.mocked(getSessionUser).mockReset()
})

function req(qs = '') {
  return new Request(`http://localhost/api/mapas/infraestructura${qs}`)
}

describe('GET /api/mapas/infraestructura', () => {
  it('rechaza sin sesión y no entrega el conjunto del mapa', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    const { GET } = await import('./route')
    const res = await GET(req())
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.partes).toBeUndefined()
    expect(body.indicadores).toBeUndefined()
  })

  it('rechaza a un usuario sin audiencia permitida', async () => {
    const db = getDb()
    await db
      .insert(recursoAudienciaNiveles)
      .values({ recursoId: 'recurso-infraestructura', nivelId: 'secundario' })
      .onConflictDoNothing()

    vi.mocked(getSessionUser).mockResolvedValue({
      id: 'u1',
      role: 'consulta',
      banned: false,
      nivelIds: ['inicial'],
    })
    const { GET } = await import('./route')
    const res = await GET(req())
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.partes).toBeUndefined()

    await db.delete(recursoAudienciaNiveles)
  })

  it('un usuario permitido obtiene el mismo total en lista e indicadores', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({
      id: 'u2',
      role: 'consulta',
      banned: false,
      nivelIds: [],
    })
    const { GET } = await import('./route')
    const res = await GET(req())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.indicadores.escuelas).toBe(body.partes.length)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('no filtra nada nominal en el payload', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({
      id: 'u3',
      role: 'consulta',
      banned: false,
      nivelIds: [],
    })
    const { GET } = await import('./route')
    const res = await GET(req())
    const raw = await res.text()
    expect(raw).not.toMatch(/gePersonId|ge_person_id/i)
  })
})
