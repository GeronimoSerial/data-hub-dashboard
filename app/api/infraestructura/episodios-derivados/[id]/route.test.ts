import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/acl'
import { getDb } from '@/lib/db'
import { infraEpisodioDerivado, infraEpisodioMiembro } from '@/lib/db/schema'
import type { AccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'

// Factory puro (sin importOriginal) para no arrastrar @/lib/session -> @/lib/db
// antes de que el beforeAll fije DATA_DIR.
vi.mock('@/lib/infraestructura/acceso-lectura', () => ({
  verificarAccesoLectura: vi.fn(),
}))

const USER: SessionUser = { id: 'u1', role: 'consulta', banned: false, nivelIds: [] }

function mockAcceso(acceso: AccesoLectura) {
  vi.mocked(verificarAccesoLectura).mockResolvedValue(acceso)
}

const EPISODIO = 'ep-1'

let dir: string
let prevDataDir: string | undefined

async function limpiarEpisodios() {
  const db = getDb()
  await db.delete(infraEpisodioMiembro)
  await db.delete(infraEpisodioDerivado)
}

async function sembrarFixture() {
  const db = getDb()
  await limpiarEpisodios()

  await db.insert(infraEpisodioDerivado).values({
    id: EPISODIO,
    reglaVersion: 'episodios-v0.1',
    parametros: { umbral: 0.5, ventanaHoras: 72 },
    unidadTipo: 'departamento',
    unidadId: 'PARANA',
    inicioEn: '2026-03-10T00:00:00Z',
    finEn: null,
    estado: 'abierto',
    escuelasAfectadas: 2,
    calculadoEn: '2026-03-10T01:00:00Z',
  })

  // Se insertan desordenados a propósito: el detalle debe ordenarlos por
  // primeraAfectacionEn ascendente.
  await db.insert(infraEpisodioMiembro).values([
    {
      id: 'mm2',
      episodioDerivadoId: EPISODIO,
      cueAnexo: '1000000-02',
      movimientoId: null,
      primeraAfectacionEn: '2026-03-10T06:00:00Z',
      recuperadoEn: null,
    },
    {
      id: 'mm1',
      episodioDerivadoId: EPISODIO,
      cueAnexo: '1000000-01',
      movimientoId: null,
      primeraAfectacionEn: '2026-03-10T00:00:00Z',
      recuperadoEn: '2026-03-11T00:00:00Z',
    },
  ])
}

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'episodios-detalle-route-'))
  prevDataDir = process.env.DATA_DIR
  process.env.DATA_DIR = dir

  const seed = await import('@/lib/db/seed')
  await seed.ensureSeeded()
})

afterAll(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  rmSync(dir, { recursive: true, force: true })
})

beforeEach(async () => {
  vi.mocked(verificarAccesoLectura).mockReset()
  await sembrarFixture()
})

function ctx(id: string) {
  return { params: Promise.resolve({ id }) }
}

function req() {
  return new Request(
    `http://localhost/api/infraestructura/episodios-derivados/${EPISODIO}`,
  )
}

describe('GET /api/infraestructura/episodios-derivados/[id]', () => {
  it('rechaza sin sesión con 401', async () => {
    mockAcceso({ ok: false, status: 401 })
    const { GET } = await import('./route')
    const res = await GET(req(), ctx(EPISODIO))
    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe('No autenticado')
  })

  it('rechaza con sesión pero sin acceso al recurso con 403', async () => {
    mockAcceso({ ok: false, status: 403 })
    const { GET } = await import('./route')
    const res = await GET(req(), ctx(EPISODIO))
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('No tiene acceso a este recurso')
  })

  it('devuelve 404 si el episodio no existe', async () => {
    mockAcceso({ ok: true, user: USER })
    const { GET } = await import('./route')
    const res = await GET(req(), ctx('ep-inexistente'))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('No encontrado')
    expect(body.miembros).toBeUndefined()
  })

  it('rechaza id vacío con 400', async () => {
    mockAcceso({ ok: true, user: USER })
    const { GET } = await import('./route')
    const res = await GET(req(), ctx(''))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('id inválido')
  })

  it('con acceso devuelve el episodio y sus miembros ordenados', async () => {
    mockAcceso({ ok: true, user: USER })
    const { GET } = await import('./route')
    const res = await GET(req(), ctx(EPISODIO))
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')

    const body = await res.json()
    expect(body).toMatchObject({
      id: EPISODIO,
      reglaVersion: 'episodios-v0.1',
      parametros: { umbral: 0.5, ventanaHoras: 72 },
      unidadTipo: 'departamento',
      departamento: 'PARANA',
      inicioEn: '2026-03-10T00:00:00Z',
      finEn: null,
      estado: 'abierto',
      escuelasAfectadas: 2,
      calculadoEn: '2026-03-10T01:00:00Z',
    })

    expect(body.miembros).toHaveLength(2)
    expect(
      body.miembros.map((m: { cueAnexo: string }) => m.cueAnexo),
    ).toEqual(['1000000-01', '1000000-02'])
    expect(body.miembros[0]).toEqual({
      cueAnexo: '1000000-01',
      movimientoId: null,
      primeraAfectacionEn: '2026-03-10T00:00:00Z',
      recuperadoEn: '2026-03-11T00:00:00Z',
    })
    // No se filtran columnas internas del miembro.
    expect(body.miembros[0].id).toBeUndefined()
    expect(body.miembros[0].episodioDerivadoId).toBeUndefined()
  })
})
