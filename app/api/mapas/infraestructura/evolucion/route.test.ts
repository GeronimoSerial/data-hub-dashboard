import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getRawClient } from '@/lib/db'
import { crearEjecutorSql, ensureGeSchema } from '@/lib/infraestructura/ge-db'
import { getSessionUser } from '@/lib/session'

vi.mock('@/lib/session', () => ({
  getSessionUser: vi.fn(),
}))

const CUE = '1801605-04'

usarDbTemporal('infraestructura-evolucion-route-', { seed: false })

beforeAll(async () => {
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

  const { ensureSeeded } = await import('@/lib/db/seed')
  await ensureSeeded()
})

beforeEach(() => {
  vi.mocked(getSessionUser).mockReset()
})

describe('GET /api/mapas/infraestructura/evolucion', () => {
  it('rechaza sin sesión y no entrega el conjunto de evolución', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    const { GET } = await import('./route')
    const res = await GET(new Request('http://localhost/api/mapas/infraestructura/evolucion'))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.rankingDepartamentos).toBeUndefined()
  })

  it('un usuario permitido obtiene las cuatro vistas', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({
      id: 'u1',
      role: 'consulta',
      banned: false,
      nivelIds: [],
      accesoRecursos: 'todos',
      recursoIds: [],
    })
    const { GET } = await import('./route')
    const res = await GET(new Request('http://localhost/api/mapas/infraestructura/evolucion'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.serieEscuelasServicioCaido)).toBe(true)
    expect(Array.isArray(body.rankingDepartamentos)).toBe(true)
    expect(Array.isArray(body.distribucionMotivo)).toBe(true)
    expect(Array.isArray(body.alumnosAcumulados)).toBe(true)
    expect(res.headers.get('Cache-Control')).toBe('private, no-cache')
  })

  it('no filtra nada nominal en el payload', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({
      id: 'u2',
      role: 'consulta',
      banned: false,
      nivelIds: [],
      accesoRecursos: 'todos',
      recursoIds: [],
    })
    const { GET } = await import('./route')
    const res = await GET(new Request('http://localhost/api/mapas/infraestructura/evolucion'))
    const raw = await res.text()
    expect(raw).not.toMatch(/gePersonId|ge_person_id/i)
  })

  it('aplica filtros de departamento y nivel en las cuatro vistas', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({
      id: 'u3',
      role: 'consulta',
      banned: false,
      nivelIds: [],
      accesoRecursos: 'todos',
      recursoIds: [],
    })
    const { GET } = await import('./route')

    const filtrado = await GET(new Request('http://localhost/api/mapas/infraestructura/evolucion?departamento=ER&nivel=PRIMARIA'))
    expect(filtrado.status).toBe(200)
    const body = await filtrado.json()
    expect(Array.isArray(body.serieEscuelasServicioCaido)).toBe(true)
    expect(Array.isArray(body.rankingDepartamentos)).toBe(true)
    expect(Array.isArray(body.distribucionMotivo)).toBe(true)
    expect(Array.isArray(body.alumnosAcumulados)).toBe(true)

    const sinResultados = await GET(new Request('http://localhost/api/mapas/infraestructura/evolucion?departamento=OTRO'))
    expect(sinResultados.status).toBe(200)
    expect((await sinResultados.json()).rankingDepartamentos).toEqual([])
  })
})
