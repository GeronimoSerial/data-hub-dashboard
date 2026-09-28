import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb, getRawClient } from '@/lib/db'
import { infraMovimiento, infraParte, recursoAudienciaNiveles } from '@/lib/db/schema'
import { crearEjecutorSql, ensureGeSchema } from '@/lib/infraestructura/ge-db'
import { getSessionUser } from '@/lib/session'

vi.mock('@/lib/session', () => ({
  getSessionUser: vi.fn(),
}))

const CUE = '1801605-61'

let dir: string
let prevDataDir: string | undefined

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'mapa-historial-route-'))
  prevDataDir = process.env.DATA_DIR
  process.env.DATA_DIR = dir

  const client = crearEjecutorSql(getRawClient())
  await ensureGeSchema(client)
  await client.execute(
    "INSERT INTO ge.ge_corte (id, ciclo_lectivo, fetched_at, estado) OVERRIDING SYSTEM VALUE VALUES (1, 2025, '2025-01-01T00:00:00Z', 'vigente')",
  )
  await client.execute(
    `INSERT INTO ge.ge_localizacion (cue_anexo, cui, nombre, departamento, localidad) VALUES ('${CUE}', NULL, 'Escuela', 'ER', 'Parana')`,
  )
  await client.execute(
    `INSERT INTO ge.ge_localizacion (cue_anexo, cui, nombre, departamento, localidad) VALUES ('1801605-62', NULL, 'Escuela sin parte', 'ER', 'Parana')`,
  )

  const { ensureSeeded, PERIODO_ENOS_2026_2027_ID } = await import('@/lib/db/seed')
  await ensureSeeded()

  const db = getDb()
  const ahora = new Date().toISOString()
  const parteId = crypto.randomUUID()
  await db.insert(infraParte).values({
    id: parteId,
    periodoId: PERIODO_ENOS_2026_2027_ID,
    cueAnexo: CUE,
    estadoEstablecimiento: 'habitual',
    estadoEstablecimientoRigeDesde: ahora,
    corteId: 1,
    creadaEn: ahora,
    actualizadaEn: ahora,
  })
  await db.insert(infraMovimiento).values({
    id: crypto.randomUUID(),
    parteId,
    tipo: 'reporte_inicial',
    rol: 'director',
    resumen: {
      serviciosCambiados: [],
      afectacionesAgregadas: [
        { afectacionId: crypto.randomUUID(), motivo: 'Inundación', categoria: 'establecimiento', severidad: 'Alta', secciones: 0, alumnos: 0 },
      ],
      afectacionesRetiradas: [],
      severidadesCambiadas: [],
      alcancesCambiados: [],
      establecimientoCambiado: null,
    },
    rigeDesde: ahora,
    creadaEn: ahora,
  })
})

afterAll(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  rmSync(dir, { recursive: true, force: true })
})

beforeEach(() => {
  vi.mocked(getSessionUser).mockReset()
})

function req(cue = CUE): Request {
  return new Request(`http://localhost/api/mapas/infraestructura/historial?cue=${encodeURIComponent(cue)}`)
}

describe('GET /api/mapas/infraestructura/historial', () => {
  it('rechaza sin sesión', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    const { GET } = await import('./route')
    const res = await GET(req())
    expect(res.status).toBe(401)
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
      accesoRecursos: 'todos',
      recursoIds: [],
    })
    const { GET } = await import('./route')
    const res = await GET(req())
    expect(res.status).toBe(403)

    await db.delete(recursoAudienciaNiveles)
  })

  it('un usuario con acceso obtiene los movimientos con la forma esperada', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({
      id: 'u2',
      role: 'consulta',
      banned: false,
      nivelIds: [],
      accesoRecursos: 'todos',
      recursoIds: [],
    })
    const { GET } = await import('./route')
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')

    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.movimientos).toHaveLength(1)
    expect(body.movimientos[0]).toMatchObject({ tipo: 'reporte_inicial', rol: 'director' })
    expect(body.movimientos[0].cambios.length).toBeGreaterThan(0)
  })

  it('sin parte para el CUE, responde movimientos vacío', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({
      id: 'u3',
      role: 'consulta',
      banned: false,
      nivelIds: [],
      accesoRecursos: 'todos',
      recursoIds: [],
    })
    const { GET } = await import('./route')
    const res = await GET(req('1801605-62'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.movimientos).toEqual([])
  })
})
