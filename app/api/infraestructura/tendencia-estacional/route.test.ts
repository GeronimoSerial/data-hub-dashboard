import { randomUUID } from 'node:crypto'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getSessionUser } from '@/lib/session'

// Mismo motivo que operacion/salud/route.test.ts: reimplementar staffGuard
// acá evita arrastrar @/lib/auth -> @/lib/db antes de fijar DATA_DIR.
vi.mock('@/lib/session', () => ({
  getSessionUser: vi.fn(),
  staffGuard: (user: { banned: boolean; role: string } | null) => {
    if (!user) return { status: 401 as const, error: 'No autenticado' }
    if (user.banned || (user.role !== 'admin' && user.role !== 'editor')) {
      return { status: 403 as const, error: 'No tiene acceso a este recurso' }
    }
    return null
  },
}))

usarDbTemporal('tendencia-estacional-route-')

beforeAll(async () => {
  const { getDb } = await import('@/lib/db')
  const { hazardSeasonalTrend } = await import('@/lib/db/schema')
  const db = getDb()

  const filaBase = {
    provider: 'open-meteo-seasonal',
    model: 'ecmwf_seasonal_seamless',
    variable: 'precipitacion_acumulada',
    horizonteDesdeDias: 30,
    horizonteHastaDias: 90,
    miembrosTotal: 51,
    miembrosValidos: 51,
    mediaMm: 120.5,
    medianaMm: 118,
    dispersionMm: 12.3,
    probabilidadSobreNormal: 0.42,
    version: 'seasonal-v0.1',
  }

  await db.insert(hazardSeasonalTrend).values([
    {
      ...filaBase,
      id: randomUUID(),
      departamento: 'CAPITAL',
      emisionEn: '2026-09-20',
      validoDesde: '2026-10-20',
      validoHasta: '2026-12-19',
      ingeridoEn: '2026-09-20T09:00:00.000Z',
    },
    {
      ...filaBase,
      id: randomUUID(),
      departamento: 'CAPITAL',
      emisionEn: '2026-09-27',
      validoDesde: '2026-10-27',
      validoHasta: '2026-12-26',
      ingeridoEn: '2026-09-27T09:00:00.000Z',
    },
    {
      ...filaBase,
      id: randomUUID(),
      departamento: 'GOYA',
      emisionEn: '2026-09-27',
      validoDesde: '2026-10-27',
      validoHasta: '2026-12-26',
      ingeridoEn: '2026-09-27T09:00:00.000Z',
    },
  ])
})

beforeEach(() => {
  vi.mocked(getSessionUser).mockReset()
})

function editor() {
  return { id: 'editor-1', role: 'editor' as const, banned: false, nivelIds: [], accesoRecursos: 'todos' as const, recursoIds: [] }
}
function consulta() {
  return { id: 'consulta-1', role: 'consulta' as const, banned: false, nivelIds: [], accesoRecursos: 'todos' as const, recursoIds: [] }
}

describe('GET /api/infraestructura/tendencia-estacional', () => {
  it.each([
    ['rechaza sin sesión con 401', null, 401],
    ['rechaza a consulta (no staff) con 403', consulta(), 403],
  ] as const)('%s', async (_titulo, user, status) => {
    vi.mocked(getSessionUser).mockResolvedValue(user)
    const { GET } = await import('./route')
    const res = await GET(new Request('http://localhost/api/infraestructura/tendencia-estacional'))
    expect(res.status).toBe(status)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('admite a editor (staff) y devuelve sólo la emisión MÁS RECIENTE por departamento', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    const { GET } = await import('./route')
    const res = await GET(new Request('http://localhost/api/infraestructura/tendencia-estacional'))
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    const data = await res.json()
    expect(Array.isArray(data.items)).toBe(true)
    expect(data.items).toHaveLength(2) // CAPITAL + GOYA, una fila cada uno

    const capital = data.items.find((i: { departamento: string }) => i.departamento === 'CAPITAL')
    expect(capital.emisionEn).toBe('2026-09-27') // la más reciente, no la del 09-20
  })

  it('filtra por departamento (case/tilde-insensitive vía normalización)', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    const { GET } = await import('./route')
    const res = await GET(
      new Request('http://localhost/api/infraestructura/tendencia-estacional?departamento=capital'),
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.items).toHaveLength(1)
    expect(data.items[0].departamento).toBe('CAPITAL')
  })

  it('un departamento sin datos devuelve items vacío, no error', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    const { GET } = await import('./route')
    const res = await GET(
      new Request(
        'http://localhost/api/infraestructura/tendencia-estacional?departamento=Sauce',
      ),
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.items).toEqual([])
  })
})
