import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb, getRawClient } from '@/lib/db'
import { infraAfectacion, infraAfectacionAlumno, infraAfectacionSeccion, infraParte } from '@/lib/db/schema'
import { crearEjecutorSql, ensureGeSchema } from '@/lib/infraestructura/ge-db'
import { importarIdentidad } from '@/lib/infraestructura/identidad'
import { otorgarPermisoNominal } from '@/lib/infraestructura/permiso-nominal'
import { getSessionUser } from '@/lib/session'

vi.mock('@/lib/session', () => ({
  getSessionUser: vi.fn(),
}))

const CUE = '1801605-04'

let dir: string
let prevDataDir: string | undefined
let prevKey: string | undefined
let afectacionId: string
let afectacionParcialId: string

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'mapas-infraestructura-nominal-route-'))
  prevDataDir = process.env.DATA_DIR
  process.env.DATA_DIR = dir
  prevKey = process.env.NOMINAL_ENCRYPTION_KEY
  process.env.NOMINAL_ENCRYPTION_KEY = randomBytes(32).toString('base64')

  const client = crearEjecutorSql(getRawClient())
  await ensureGeSchema(client)
  await client.execute(
    "INSERT INTO ge.ge_corte (id, ciclo_lectivo, fetched_at, estado) OVERRIDING SYSTEM VALUE VALUES (1, 2025, '2025-01-01T00:00:00Z', 'vigente')",
  )
  await client.execute(
    `INSERT INTO ge.ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, 10, '${CUE}', '1', 'A', 'PRIMARIA', 'MAÑANA')`,
  )
  await client.execute({
    sql: 'INSERT INTO ge.ge_alumno_seccion (corte_id, ge_section_id, ge_person_id) VALUES (1, 10, ?)',
    args: [7],
  })
  await importarIdentidad(client, 7, 'Facundo', 'Quiroga')
  await client.execute('INSERT INTO ge.ge_alumno_seccion (corte_id, ge_section_id, ge_person_id) VALUES (1, 10, 8)')
  await importarIdentidad(client, 8, 'Manuela', 'Rosas')

  const { ensureSeeded, PERIODO_ENOS_2026_2027_ID } = await import('@/lib/db/seed')
  await ensureSeeded()

  // Modelo de parte (F3.3): parte + afectación.
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

  afectacionId = crypto.randomUUID()
  await db.insert(infraAfectacion).values({
    id: afectacionId,
    parteId,
    motivo: 'Inundación',
    categoria: 'establecimiento',
    severidad: 'Alta',
    descripcion: null,
    rigeDesde: ahora,
    creadaEn: ahora,
    retiradaEn: null,
  })
  await db.insert(infraAfectacionSeccion).values({ afectacionId, geSectionId: 10 })
  afectacionParcialId = crypto.randomUUID()
  await db.insert(infraAfectacion).values({
    id: afectacionParcialId, parteId, motivo: 'Anegamiento', categoria: 'alumnos',
    severidad: 'Alta', rigeDesde: ahora, creadaEn: ahora,
  })
  await db.insert(infraAfectacionSeccion).values({ afectacionId: afectacionParcialId, geSectionId: 10 })
  await db.insert(infraAfectacionAlumno).values({ afectacionId: afectacionParcialId, gePersonId: 7 })
})

afterAll(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  if (prevKey === undefined) delete process.env.NOMINAL_ENCRYPTION_KEY
  else process.env.NOMINAL_ENCRYPTION_KEY = prevKey
  rmSync(dir, { recursive: true, force: true })
})

beforeEach(() => {
  vi.mocked(getSessionUser).mockReset()
})

function req(afectacion = afectacionId) {
  return new Request(`http://localhost/api/mapas/infraestructura/nominal?afectacionId=${afectacion}`)
}

async function contarLogsDe(userId: string): Promise<number> {
  const res = await crearEjecutorSql(getRawClient()).execute({
    sql: 'SELECT id FROM infra_acceso_nominal_log WHERE user_id = ?',
    args: [userId],
  })
  return res.rows.length
}

describe('GET /api/mapas/infraestructura/nominal', () => {
  it('entrega sólo los alumnos seleccionados y audita la cantidad parcial', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({
      id: 'admin-partial', role: 'admin', banned: false, nivelJurIds: [],
      accesoRecursos: 'todos', recursoIds: [],
    })
    const { GET } = await import('./route')
    const res = await GET(req(afectacionParcialId))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.cantidad).toBe(1)
    expect(body.secciones[0].alumnos).toEqual([{ nombre: 'Facundo', apellido: 'Quiroga' }])
    const logs = await crearEjecutorSql(getRawClient()).execute({
      sql: 'SELECT cantidad FROM infra_acceso_nominal_log WHERE user_id = ?', args: ['admin-partial'],
    })
    expect(logs.rows).toHaveLength(1)
    expect(Number(logs.rows[0].cantidad)).toBe(1)
  })
  it('rechaza sin sesión con 401', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    const { GET } = await import('./route')
    const res = await GET(req())
    expect(res.status).toBe(401)
  })

  it('rechaza con 403 cuando puedeVerNominal es false, y no registra ninguna fila en el log', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({
      id: 'consulta-sin-grant',
      role: 'consulta',
      banned: false,
      nivelJurIds: [],
      accesoRecursos: 'todos',
      recursoIds: [],
    })
    const { GET } = await import('./route')
    const res = await GET(req())
    expect(res.status).toBe(403)
    expect(await contarLogsDe('consulta-sin-grant')).toBe(0)
  })

  // Criterio de aceptación de F3.3: un único GET autorizado produce
  // exactamente una fila nueva en infra_acceso_nominal_log — la lectura y su
  // auditoría son la misma transacción, nunca una sin la otra.
  it('con acceso concedido entrega el alcance nominal y registra exactamente una fila en el log', async () => {
    await otorgarPermisoNominal({
      userId: 'usuario-con-grant',
      otorgadoPor: 'admin-x',
      venceEn: new Date(Date.now() + 60_000),
    })
    vi.mocked(getSessionUser).mockResolvedValue({
      id: 'usuario-con-grant',
      role: 'consulta',
      banned: false,
      nivelJurIds: [],
      accesoRecursos: 'todos',
      recursoIds: [],
    })

    const antes = await contarLogsDe('usuario-con-grant')

    const { GET } = await import('./route')
    const res = await GET(req())
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.cantidad).toBe(2)
    expect(body.secciones[0].alumnos).toHaveLength(2)
    expect(body.secciones[0].alumnos).toEqual(
      expect.arrayContaining([{ nombre: 'Facundo', apellido: 'Quiroga' }]),
    )
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')

    const despues = await contarLogsDe('usuario-con-grant')
    expect(despues - antes).toBe(1)
  })

  describe('alcance por nivel jurisdiccional', () => {
    const NIVEL_EN_ALCANCE = 5
    const NIVEL_FUERA_DE_ALCANCE = 6

    beforeAll(async () => {
      const client = crearEjecutorSql(getRawClient())
      await client.execute({
        sql: 'INSERT INTO ge.ge_nivel_jurisdiccional (id, nombre) VALUES (?, ?), (?, ?) ON CONFLICT (id) DO NOTHING',
        args: [NIVEL_EN_ALCANCE, 'Secundario', NIVEL_FUERA_DE_ALCANCE, 'Primario'],
      })
      await client.execute({
        sql: 'INSERT INTO ge.ge_escuela_nivel_jur (cue_anexo, nivel_jurisdiccional_id, ciclo_lectivo) VALUES (?, ?, ?)',
        args: [CUE, NIVEL_EN_ALCANCE, 2025],
      })
    })

    it('un director de nivel con grant ve la afectación de su dirección y registra el acceso', async () => {
      await otorgarPermisoNominal({
        userId: 'director-en-alcance',
        otorgadoPor: 'admin-x',
        venceEn: new Date(Date.now() + 60_000),
      })
      vi.mocked(getSessionUser).mockResolvedValue({
        id: 'director-en-alcance',
        role: 'director_nivel',
        banned: false,
        nivelJurIds: [NIVEL_EN_ALCANCE],
        accesoRecursos: 'todos',
        recursoIds: [],
      })
      const { GET } = await import('./route')
      const res = await GET(req())
      expect(res.status).toBe(200)
      expect(await contarLogsDe('director-en-alcance')).toBe(1)
    })

    it('un director de nivel con grant no ve una afectación de otra dirección, y no deja log', async () => {
      await otorgarPermisoNominal({
        userId: 'director-fuera-alcance',
        otorgadoPor: 'admin-x',
        venceEn: new Date(Date.now() + 60_000),
      })
      vi.mocked(getSessionUser).mockResolvedValue({
        id: 'director-fuera-alcance',
        role: 'director_nivel',
        banned: false,
        nivelJurIds: [NIVEL_FUERA_DE_ALCANCE],
        accesoRecursos: 'todos',
        recursoIds: [],
      })
      const { GET } = await import('./route')
      const res = await GET(req())
      expect(res.status).toBe(403)
      expect(await contarLogsDe('director-fuera-alcance')).toBe(0)
    })

    it('un operador de establecimiento recibe 403 aunque tenga grant vigente', async () => {
      await otorgarPermisoNominal({
        userId: 'operador-con-grant',
        otorgadoPor: 'admin-x',
        venceEn: new Date(Date.now() + 60_000),
      })
      vi.mocked(getSessionUser).mockResolvedValue({
        id: 'operador-con-grant',
        role: 'operador_establecimiento',
        banned: false,
        nivelJurIds: [NIVEL_EN_ALCANCE],
        accesoRecursos: 'todos',
        recursoIds: [],
      })
      const { GET } = await import('./route')
      const res = await GET(req())
      expect(res.status).toBe(403)
      expect(await contarLogsDe('operador-con-grant')).toBe(0)
    })
  })
})
