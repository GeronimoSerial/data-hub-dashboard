import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '@/lib/db'
import { recursoAudienciaNiveles } from '@/lib/db/schema'
import { ensureGeSchema, openGeDb } from '@/lib/infraestructura/ge-db'
import { getSessionUser } from '@/lib/session'

vi.mock('@/lib/session', () => ({
  getSessionUser: vi.fn(),
}))

const CUE_ER = '1801605-04'
const CUE_GCHU = '1801605-05'

let dir: string
let prevDataDir: string | undefined

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'infraestructura-totales-route-'))
  prevDataDir = process.env.DATA_DIR
  process.env.DATA_DIR = dir

  const ge = openGeDb()
  try {
    await ensureGeSchema(ge)
    await ge.execute(
      "INSERT INTO ge_corte (id, ciclo_lectivo, fetched_at, estado) VALUES (1, 2025, '2025-01-01T00:00:00Z', 'vigente')",
    )
    // Dos escuelas en dos departamentos distintos: permite probar que el
    // filtro ?territorio= acota los totales a un solo departamento.
    await ge.execute(
      `INSERT INTO ge_localizacion (cue_anexo, cui, nombre, departamento, localidad, lat, lon) VALUES ('${CUE_ER}', NULL, 'Escuela ER', 'ER', 'Parana', -31.7, -60.5)`,
    )
    await ge.execute(
      `INSERT INTO ge_localizacion (cue_anexo, cui, nombre, departamento, localidad, lat, lon) VALUES ('${CUE_GCHU}', NULL, 'Escuela GCHU', 'GUALEGUAYCHU', 'Gualeguaychu', -33.0, -58.5)`,
    )
  } finally {
    ge.close()
  }

  // ensureSeeded() (llamado por el route handler) da de alta el recurso
  // 'recurso-infraestructura' en '/mapas/infraestructura', el mismo que reusa
  // verificarAccesoLectura(). Alcanza con sembrar acá para poder ejercitar
  // puedeAbrir() con audiencias distintas sobre ese recurso.
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
  return new Request(`http://localhost/api/mapas/infraestructura/totales${qs}`)
}

describe('GET /api/mapas/infraestructura/totales', () => {
  it('rechaza sin sesión y no entrega ningún agregado', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    const { GET } = await import('./route')
    const res = await GET(req())
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.departamentos).toBeUndefined()
    expect(body.provincia).toBeUndefined()
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
    expect(body.departamentos).toBeUndefined()

    await db.delete(recursoAudienciaNiveles)
  })

  it('un usuario permitido obtiene los totales agregados', async () => {
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
    expect(Array.isArray(body.departamentos)).toBe(true)
    expect(typeof body.provincia.totalEscuelas).toBe('number')
    expect(typeof body.provincia.escuelasAfectadas).toBe('number')
    expect(typeof body.provincia.porcentajeAfectadas).toBe('number')
    expect(body.provincia.totalEscuelas).toBe(2)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('acota los totales al departamento pedido en ?territorio=', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({
      id: 'u3',
      role: 'consulta',
      banned: false,
      nivelIds: [],
    })
    const { GET } = await import('./route')
    const res = await GET(req('?territorio=ER'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.departamentos).toHaveLength(1)
    expect(body.departamentos[0].departamento).toBe('ER')
    expect(body.provincia.totalEscuelas).toBe(1)
  })

  it('no filtra nada nominal en el payload', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({
      id: 'u4',
      role: 'consulta',
      banned: false,
      nivelIds: [],
    })
    const { GET } = await import('./route')
    const res = await GET(req())
    const raw = await res.text()
    expect(raw).not.toMatch(/gePersonId|ge_person_id|alumnosAlcanzados/i)
  })
})
