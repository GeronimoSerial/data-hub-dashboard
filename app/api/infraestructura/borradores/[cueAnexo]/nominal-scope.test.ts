import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/acl'
import { getDb, getRawClient } from '@/lib/db'
import { infraAccesoNominalLog, infraBorrador } from '@/lib/db/schema'
import { crearEjecutorSql, ensureGeSchema } from '@/lib/infraestructura/ge-db'
import { getSessionUser } from '@/lib/session'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { eq } from 'drizzle-orm'

vi.mock('@/lib/session', () => ({ getSessionUser: vi.fn() }))
usarDbTemporal('draft-nominal-scope', { env: { REPORTES_OFFLINE_MAPA_BORRADORES: 'true' } })

const CUE = '1801605-60'

beforeAll(async () => {
  const client = crearEjecutorSql(getRawClient())
  await ensureGeSchema(client)
  await client.execute("INSERT INTO ge.ge_nivel_jurisdiccional (id, nombre) VALUES (501, 'Test scope')")
  await client.execute(`INSERT INTO ge.ge_escuela_nivel_jur (cue_anexo, nivel_jurisdiccional_id, ciclo_lectivo) VALUES ('${CUE}', 501, 2026)`)
  await getDb().insert(infraBorrador).values({
    id: 'nominal-draft', generacion: 1, cueAnexo: CUE,
    contexto: { version: 1, flujo: 'inicial' }, paso: 'servicios',
    respuestas: { servicio: { agua: 'no' }, afectaciones: [{ alumnos: [101, 102] }] },
    revision: 0, estado: 'open', creadoEn: '2026-10-15T10:00:00Z',
    actividadEn: '2026-10-15T10:00:00Z', sincronizadoEn: '2026-10-15T10:00:00Z',
  })
})

describe('nominal map drafts', () => {
  it.each<{ role: SessionUser['role']; nivelJurIds: number[]; nominal: boolean; status: number }>([
    { role: 'admin', nivelJurIds: [], nominal: true, status: 200 },
    { role: 'admin_ge', nivelJurIds: [], nominal: true, status: 200 },
    { role: 'director_nivel', nivelJurIds: [501], nominal: true, status: 200 },
    { role: 'director_nivel', nivelJurIds: [502], nominal: false, status: 200 },
    { role: 'director_nivel', nivelJurIds: [], nominal: false, status: 403 },
    { role: 'editor', nivelJurIds: [], nominal: false, status: 200 },
  ])('$role with levels $nivelJurIds returns nominal=$nominal without a grant', async ({ role, nivelJurIds, nominal, status }) => {
    const userId = `${role}-${nivelJurIds.join('-')}`
    vi.mocked(getSessionUser).mockResolvedValue({
      id: userId, role, nivelJurIds, banned: false, accesoRecursos: 'todos', recursoIds: [],
    })
    const { GET } = await import('./route')
    const response = await GET(new Request(`http://localhost/api/infraestructura/borradores/${CUE}`), {
      params: Promise.resolve({ cueAnexo: CUE }),
    })
    expect(response.status).toBe(status)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    const body = await response.json()
    if (status === 200) {
      expect(body.items).toHaveLength(1)
      expect(body.items[0].respuestas).toEqual({
        servicio: { agua: 'no' }, afectaciones: [nominal ? { alumnos: [101, 102] } : {}],
      })
    } else {
      expect(body.items).toBeUndefined()
    }
    const logs = await getDb().select().from(infraAccesoNominalLog).where(eq(infraAccesoNominalLog.userId, userId))
    expect(logs).toHaveLength(nominal ? 1 : 0)
  })
})
