import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/acl'
import { getDb } from '@/lib/db'
import { infraEpisodioDerivado, infraEpisodioMiembro } from '@/lib/db/schema'
import type { AccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { EPISODIOS_REGLA_VERSION } from '@/lib/infraestructura/episodios-derivados/regla'

// Factory puro (sin importOriginal) para no arrastrar @/lib/session -> @/lib/db
// antes de que el beforeAll fije DATA_DIR.
vi.mock('@/lib/infraestructura/acceso-lectura', () => ({
  verificarAccesoLectura: vi.fn(),
}))

const USER: SessionUser = { id: 'u1', role: 'consulta', banned: false, nivelIds: [], accesoRecursos: 'todos' as const, recursoIds: [] }

function mockAcceso(acceso: AccesoLectura) {
  vi.mocked(verificarAccesoLectura).mockResolvedValue(acceso)
}

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

  await db.insert(infraEpisodioDerivado).values([
    {
      id: 'ep-parana-abierto',
      reglaVersion: 'episodios-v0.1',
      parametros: { umbral: 0.5 },
      unidadTipo: 'departamento',
      unidadId: 'PARANA',
      inicioEn: '2026-03-10T00:00:00Z',
      finEn: null,
      estado: 'abierto',
      escuelasAfectadas: 2,
      calculadoEn: '2026-03-10T01:00:00Z',
    },
    {
      id: 'ep-concordia-cerrado',
      reglaVersion: 'episodios-v0.1',
      parametros: { umbral: 0.5 },
      unidadTipo: 'departamento',
      unidadId: 'CONCORDIA',
      inicioEn: '2026-03-12T00:00:00Z',
      finEn: '2026-03-13T00:00:00Z',
      estado: 'cerrado',
      escuelasAfectadas: 1,
      calculadoEn: '2026-03-13T01:00:00Z',
    },
    {
      id: 'ep-parana-cerrado',
      reglaVersion: 'episodios-v0.1',
      parametros: { umbral: 0.5 },
      unidadTipo: 'departamento',
      unidadId: 'PARANA',
      inicioEn: '2026-03-11T00:00:00Z',
      finEn: '2026-03-12T00:00:00Z',
      estado: 'cerrado',
      escuelasAfectadas: 3,
      calculadoEn: '2026-03-12T01:00:00Z',
    },
  ])

  await db.insert(infraEpisodioMiembro).values([
    {
      id: 'm1',
      episodioDerivadoId: 'ep-parana-abierto',
      cueAnexo: '1000000-01',
      movimientoId: null,
      primeraAfectacionEn: '2026-03-10T00:00:00Z',
      recuperadoEn: null,
    },
    {
      id: 'm2',
      episodioDerivadoId: 'ep-concordia-cerrado',
      cueAnexo: '1000000-03',
      movimientoId: null,
      primeraAfectacionEn: '2026-03-12T00:00:00Z',
      recuperadoEn: '2026-03-13T00:00:00Z',
    },
  ])
}

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'episodios-route-'))
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

function req(qs = '') {
  return new Request(
    `http://localhost/api/infraestructura/episodios-derivados${qs}`,
  )
}

describe('GET /api/infraestructura/episodios-derivados', () => {
  it('rechaza sin sesión con 401', async () => {
    mockAcceso({ ok: false, status: 401 })
    const { GET } = await import('./route')
    const res = await GET(req())
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('No autenticado')
    expect(body.items).toBeUndefined()
  })

  it('rechaza con sesión pero sin acceso al recurso con 403', async () => {
    mockAcceso({ ok: false, status: 403 })
    const { GET } = await import('./route')
    const res = await GET(req())
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('No tiene acceso a este recurso')
  })

  it('con ACL ok y sin filtros devuelve items ordenados por inicioEn desc', async () => {
    mockAcceso({ ok: true, user: USER })
    const { GET } = await import('./route')
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')

    const body = await res.json()
    expect(body.total).toBe(3)
    expect(body.totalPages).toBe(1)
    expect(body.page).toBe(1)
    expect(body.pageSize).toBe(50)
    expect(
      body.items.map((i: { id: string }) => i.id),
    ).toEqual(['ep-concordia-cerrado', 'ep-parana-cerrado', 'ep-parana-abierto'])

    const primero = body.items[0]
    expect(primero).toMatchObject({
      id: 'ep-concordia-cerrado',
      reglaVersion: 'episodios-v0.1',
      unidadTipo: 'departamento',
      departamento: 'CONCORDIA',
      inicioEn: '2026-03-12T00:00:00Z',
      finEn: '2026-03-13T00:00:00Z',
      estado: 'cerrado',
      escuelasAfectadas: 1,
      calculadoEn: '2026-03-13T01:00:00Z',
    })
    // La lista no incluye miembros.
    expect(primero.miembros).toBeUndefined()
  })

  it('filtra por estado', async () => {
    mockAcceso({ ok: true, user: USER })
    const { GET } = await import('./route')
    const res = await GET(req('?estado=abierto'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.total).toBe(1)
    expect(body.items.map((i: { id: string }) => i.id)).toEqual([
      'ep-parana-abierto',
    ])
  })

  it('filtra por departamento (comparación exacta, dato normalizado)', async () => {
    mockAcceso({ ok: true, user: USER })
    const { GET } = await import('./route')
    const res = await GET(req('?departamento=PARANA'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.total).toBe(2)
    expect(body.items.map((i: { id: string }) => i.id)).toEqual([
      'ep-parana-cerrado',
      'ep-parana-abierto',
    ])
    expect(
      body.items.every((i: { departamento: string }) => i.departamento === 'PARANA'),
    ).toBe(true)
  })

  it('filtra por rango inicioEn con desde y hasta', async () => {
    mockAcceso({ ok: true, user: USER })
    const { GET } = await import('./route')

    const desde = await (
      await GET(req('?desde=2026-03-11T00:00:00Z'))
    ).json()
    expect(desde.total).toBe(2)
    expect(desde.items.map((i: { id: string }) => i.id)).toEqual([
      'ep-concordia-cerrado',
      'ep-parana-cerrado',
    ])

    const hasta = await (
      await GET(req('?hasta=2026-03-10T00:00:00Z'))
    ).json()
    expect(hasta.total).toBe(1)
    expect(hasta.items.map((i: { id: string }) => i.id)).toEqual([
      'ep-parana-abierto',
    ])
  })

  it('pagina con total y totalPages correctos', async () => {
    mockAcceso({ ok: true, user: USER })
    const { GET } = await import('./route')

    const primera = await (await GET(req('?page=1&pageSize=2'))).json()
    expect(primera.items.map((i: { id: string }) => i.id)).toEqual([
      'ep-concordia-cerrado',
      'ep-parana-cerrado',
    ])
    expect(primera.total).toBe(3)
    expect(primera.totalPages).toBe(2)
    expect(primera.page).toBe(1)
    expect(primera.pageSize).toBe(2)

    const segunda = await (await GET(req('?page=2&pageSize=2'))).json()
    expect(segunda.items.map((i: { id: string }) => i.id)).toEqual([
      'ep-parana-abierto',
    ])
    expect(segunda.total).toBe(3)
    expect(segunda.totalPages).toBe(2)
  })

  it('rechaza estado inválido con 400', async () => {
    mockAcceso({ ok: true, user: USER })
    const { GET } = await import('./route')
    const res = await GET(req('?estado=lo_que_sea'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('estado')
    expect(body.items).toBeUndefined()
  })

  it('rechaza desde inválido con 400', async () => {
    mockAcceso({ ok: true, user: USER })
    const { GET } = await import('./route')
    const res = await GET(req('?desde=no-es-fecha'))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('desde')
  })

  it('rechaza page inválido con 400', async () => {
    mockAcceso({ ok: true, user: USER })
    const { GET } = await import('./route')
    const res = await GET(req('?page=0'))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('page')
  })

  it('rechaza pageSize fuera de rango con 400', async () => {
    mockAcceso({ ok: true, user: USER })
    const { GET } = await import('./route')
    const res = await GET(req('?pageSize=500'))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('pageSize')
  })

  it('sólo lista episodios de la versión de regla vigente', async () => {
    mockAcceso({ ok: true, user: USER })
    const db = getDb()
    await limpiarEpisodios()
    await db.insert(infraEpisodioDerivado).values([
      {
        id: 'ep-vigente-parana-abierto',
        reglaVersion: EPISODIOS_REGLA_VERSION,
        parametros: { umbral: 0.5 },
        unidadTipo: 'departamento',
        unidadId: 'PARANA',
        inicioEn: '2026-03-10T00:00:00Z',
        finEn: null,
        estado: 'abierto',
        escuelasAfectadas: 2,
        calculadoEn: '2026-03-10T01:00:00Z',
      },
      {
        id: 'ep-vigente-concordia-cerrado',
        reglaVersion: EPISODIOS_REGLA_VERSION,
        parametros: { umbral: 0.5 },
        unidadTipo: 'departamento',
        unidadId: 'CONCORDIA',
        inicioEn: '2026-03-12T00:00:00Z',
        finEn: '2026-03-13T00:00:00Z',
        estado: 'cerrado',
        escuelasAfectadas: 1,
        calculadoEn: '2026-03-13T01:00:00Z',
      },
      {
        id: 'ep-vieja-parana-abierto',
        reglaVersion: 'episodios-v0.0-vieja',
        parametros: { umbral: 0.9 },
        unidadTipo: 'departamento',
        unidadId: 'PARANA',
        inicioEn: '2026-03-15T00:00:00Z',
        finEn: null,
        estado: 'abierto',
        escuelasAfectadas: 99,
        calculadoEn: '2026-03-15T01:00:00Z',
      },
    ])

    const { GET } = await import('./route')

    const sinFiltros = await (await GET(req())).json()
    expect(sinFiltros.total).toBe(2)
    expect(sinFiltros.items.map((i: { id: string }) => i.id)).toEqual([
      'ep-vigente-concordia-cerrado',
      'ep-vigente-parana-abierto',
    ])
    expect(
      sinFiltros.items.every(
        (i: { id: string }) => i.id !== 'ep-vieja-parana-abierto',
      ),
    ).toBe(true)

    const porEstado = await (await GET(req('?estado=abierto'))).json()
    expect(porEstado.items.map((i: { id: string }) => i.id)).toEqual([
      'ep-vigente-parana-abierto',
    ])

    const porDepartamento = await (
      await GET(req('?departamento=PARANA'))
    ).json()
    expect(porDepartamento.total).toBe(1)
    expect(porDepartamento.items.map((i: { id: string }) => i.id)).toEqual([
      'ep-vigente-parana-abierto',
    ])
  })
})
