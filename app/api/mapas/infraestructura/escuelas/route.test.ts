import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb, getRawClient } from '@/lib/db'
import { recursoAudienciaNiveles } from '@/lib/db/schema'
import { crearEjecutorSql, ensureGeSchema } from '@/lib/infraestructura/ge-db'
import { getSessionUser } from '@/lib/session'

vi.mock('@/lib/session', () => ({
  getSessionUser: vi.fn(),
}))

const CUE_ER = '1801605-04'
const CUE_GCHU = '1801605-05'

usarDbTemporal('infraestructura-escuelas-route-', { seed: false })

beforeAll(async () => {
  const client = crearEjecutorSql(getRawClient())
  await ensureGeSchema(client)
  await client.execute(
    "INSERT INTO ge.ge_corte (id, ciclo_lectivo, fetched_at, estado) OVERRIDING SYSTEM VALUE VALUES (1, 2025, '2025-01-01T00:00:00Z', 'vigente')",
  )
  // Dos escuelas en dos departamentos distintos: permite probar que el
  // filtro ?territorio= acota el padrón a un solo departamento/localidad.
  // A propósito NO se carga ningún infra_parte/infra_afectacion: el test
  // central del batch verifica que el mapa siga mostrando todo el padrón
  // aunque no haya ningún parte reportado.
  await client.execute(
    `INSERT INTO ge.ge_localizacion (cue_anexo, cui, nombre, departamento, localidad, lat, lon) VALUES ('${CUE_ER}', NULL, 'Escuela ER', 'ER', 'Parana', -31.7, -60.5)`,
  )
  await client.execute(
    `INSERT INTO ge.ge_localizacion (cue_anexo, cui, nombre, departamento, localidad, lat, lon) VALUES ('${CUE_GCHU}', NULL, 'Escuela GCHU', 'GUALEGUAYCHU', 'Gualeguaychu', -33.0, -58.5)`,
  )

  // ensureSeeded() (llamado por el route handler) da de alta el recurso
  // 'recurso-infraestructura' en '/mapas/infraestructura', el mismo que reusa
  // verificarAccesoLectura(). Alcanza con sembrar acá para poder ejercitar
  // puedeAbrir() con audiencias distintas sobre ese recurso.
  const { ensureSeeded } = await import('@/lib/db/seed')
  await ensureSeeded()
})

beforeEach(() => {
  vi.mocked(getSessionUser).mockReset()
})

function req(qs = '') {
  return new Request(`http://localhost/api/mapas/infraestructura/escuelas${qs}`)
}

describe('GET /api/mapas/infraestructura/escuelas', () => {
  it('rechaza sin sesión y no entrega el padrón', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    const { GET } = await import('./route')
    const res = await GET(req())
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.escuelas).toBeUndefined()
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
      accesoRecursos: 'todos' as const,
      recursoIds: [],
    })
    const { GET } = await import('./route')
    const res = await GET(req())
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.escuelas).toBeUndefined()

    await db.delete(recursoAudienciaNiveles)
  })

  it('con 0 partes cargados igual devuelve todo el padrón, sin afectación reportada', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({
      id: 'u2',
      role: 'consulta',
      banned: false,
      nivelIds: [],
      accesoRecursos: 'todos' as const,
      recursoIds: [],
    })
    const { GET } = await import('./route')
    const res = await GET(req())
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(Array.isArray(body.escuelas)).toBe(true)
    expect(body.escuelas).toHaveLength(2)
    expect(body.totalPadron).toBe(2)

    const cues = body.escuelas.map((e: { cueAnexo: string }) => e.cueAnexo).sort()
    expect(cues).toEqual([CUE_ER, CUE_GCHU].sort())

    for (const escuela of body.escuelas) {
      expect(escuela.estado).toBe('sin_afectacion_reportada')
      expect(escuela.parte).toBeUndefined()
    }

    expect(res.headers.get('Cache-Control')).toBe('private, no-cache')
  })

  it('acota el padrón al departamento pedido en ?territorio=', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({
      id: 'u3',
      role: 'consulta',
      banned: false,
      nivelIds: [],
      accesoRecursos: 'todos' as const,
      recursoIds: [],
    })
    const { GET } = await import('./route')
    const res = await GET(req('?territorio=ER'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.escuelas).toHaveLength(1)
    expect(body.escuelas[0].cueAnexo).toBe(CUE_ER)
    expect(body.escuelas[0].departamento).toBe('ER')
    expect(body.totalPadron).toBe(1)
  })
})
