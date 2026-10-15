import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import type { SessionUser } from '@/lib/acl'
import { getDb } from '@/lib/db'
import { hazardSourceHealth } from '@/lib/db/schema'
import type { AccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'

// Se mockea `verificarAccesoLectura` con un factory puro (sin importOriginal):
// el módulo real importa @/lib/session -> @/lib/auth -> @/lib/db, que cachearía
// la conexión ANTES de que el beforeAll fije DATA_DIR.
vi.mock('@/lib/infraestructura/acceso-lectura', () => ({
  verificarAccesoLectura: vi.fn(),
}))

const USER: SessionUser = { id: 'u1', role: 'consulta', banned: false, nivelJurIds: [], accesoRecursos: 'todos' as const, recursoIds: [] }

function mockAcceso(acceso: AccesoLectura) {
  vi.mocked(verificarAccesoLectura).mockResolvedValue(acceso)
}

usarDbTemporal('fuentes-route-')

beforeAll(async () => {
  await getDb()
    .insert(hazardSourceHealth)
    .values([
      {
        provider: 'open-meteo',
        ultimoExitoEn: EXITO_RECIENTE,
        ultimoIntentoEn: EXITO_RECIENTE,
        estado: 'ok',
        ultimoErrorSaneado: null,
        ttlMinutos: 120,
        licencia: 'CC-BY-4.0',
        actualizadaEn: EXITO_RECIENTE,
      },
      {
        provider: 'inameh',
        ultimoExitoEn: null,
        ultimoIntentoEn: EXITO_RECIENTE,
        estado: 'degradado',
        ultimoErrorSaneado: 'timeout al consultar la fuente',
        ttlMinutos: 360,
        licencia: 'uso institucional',
        actualizadaEn: EXITO_RECIENTE,
      },
    ])
})

const EXITO_RECIENTE = new Date(Date.now() - 10 * 60_000).toISOString()

beforeEach(() => {
  vi.mocked(verificarAccesoLectura).mockReset()
})

describe('GET /api/infraestructura/fuentes', () => {
  it.each([
    ['rechaza sin sesión con 401', 401, 'No autenticado'],
    ['rechaza con sesión pero sin acceso al recurso con 403', 403, 'No tiene acceso a este recurso'],
  ] as const)('%s', async (_titulo, status, error) => {
    mockAcceso({ ok: false, status })
    const { GET } = await import('./route')
    const res = await GET()
    expect(res.status).toBe(status)
    const body = await res.json()
    expect(body.fuentes).toBeUndefined()
    expect(body.error).toBe(error)
  })

  it('con acceso devuelve las fuentes con frescuraMinutos derivada en el handler', async () => {
    mockAcceso({ ok: true, user: USER })
    const { GET } = await import('./route')
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')

    const body = await res.json()
    expect(Array.isArray(body.fuentes)).toBe(true)
    expect(body.fuentes).toHaveLength(2)

    const ok = body.fuentes.find((f: { provider: string }) => f.provider === 'open-meteo')
    expect(ok.estado).toBe('ok')
    expect(ok.ttlMinutos).toBe(120)
    expect(ok.licencia).toBe('CC-BY-4.0')
    expect(ok.ultimoErrorSaneado).toBeNull()
    expect(ok.frescuraMinutos).toBeGreaterThanOrEqual(9)
    expect(ok.frescuraMinutos).toBeLessThanOrEqual(11)

    const sinExito = body.fuentes.find((f: { provider: string }) => f.provider === 'inameh')
    expect(sinExito.frescuraMinutos).toBeNull()
    expect(sinExito.estado).toBe('degradado')
    expect(sinExito.ultimoErrorSaneado).toBe('timeout al consultar la fuente')
  })
})
