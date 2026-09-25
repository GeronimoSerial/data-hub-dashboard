import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '@/lib/db'
import { infraAfectacion, infraAfectacionAlumno, infraAfectacionSeccion, infraParte, recursoAudienciaNiveles } from '@/lib/db/schema'
import { ensureGeSchema, openGeDb } from '@/lib/infraestructura/ge-db'
import { getSessionUser } from '@/lib/session'

vi.mock('@/lib/session', () => ({
  getSessionUser: vi.fn(),
}))

const CUE = '1801605-60'

let dir: string
let prevDataDir: string | undefined

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'mapa-parte-route-'))
  prevDataDir = process.env.DATA_DIR
  process.env.DATA_DIR = dir

  const ge = openGeDb()
  try {
    await ensureGeSchema(ge)
    await ge.execute(
      "INSERT INTO ge_corte (id, ciclo_lectivo, fetched_at, estado) VALUES (1, 2025, '2025-01-01T00:00:00Z', 'vigente')",
    )
    await ge.execute(
      `INSERT INTO ge_localizacion (cue_anexo, cui, nombre, departamento, localidad) VALUES ('${CUE}', NULL, 'Escuela', 'ER', 'Parana')`,
    )
    await ge.execute(
      `INSERT INTO ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, 6010, '${CUE}', '1', 'A', 'PRIMARIA', 'MAÑANA')`,
    )
    await ge.execute({
      sql: 'INSERT INTO ge_alumno_seccion (corte_id, ge_section_id, ge_person_id) VALUES (1, 6010, ?)',
      args: [501],
    })
  } finally {
    ge.close()
  }

  const { ensureSeeded } = await import('@/lib/db/seed')
  await ensureSeeded()

  const { PERIODO_ENOS_2026_2027_ID } = await import('@/lib/db/seed')
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
  const afectacionId = crypto.randomUUID()
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
  await db.insert(infraAfectacionSeccion).values({ afectacionId, geSectionId: 6010 })
  await db.insert(infraAfectacionAlumno).values({ afectacionId, gePersonId: 501 })
})

afterAll(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  rmSync(dir, { recursive: true, force: true })
})

beforeEach(() => {
  vi.mocked(getSessionUser).mockReset()
})

function req(): Request {
  return new Request(`http://localhost/api/mapas/infraestructura/parte?cue=${encodeURIComponent(CUE)}`)
}

describe('GET /api/mapas/infraestructura/parte', () => {
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

  it('un usuario con acceso obtiene la ficha con totales, sin nombres ni ids de alumno', async () => {
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
    expect(body.parte).not.toBeNull()
    expect(body.afectaciones).toHaveLength(1)
    expect(body.afectaciones[0].totales).toEqual({ secciones: 1, alumnos: 1 })

    // El diseño obligatorio (F3.2) prohíbe nombres e ids de alumno DENTRO de
    // cada afectación: sólo `totales` agregados. No se revisa el payload
    // completo porque `periodo.nombre` es un campo legítimo no relacionado.
    for (const afectacion of body.afectaciones) {
      expect(afectacion).not.toHaveProperty('nombre')
      expect(afectacion).not.toHaveProperty('apellido')
      expect(afectacion).not.toHaveProperty('secciones')
      expect(afectacion).not.toHaveProperty('alumnos')
      expect(Object.keys(afectacion).sort()).toEqual(
        ['categoria', 'descripcion', 'id', 'motivo', 'rigeDesde', 'severidad', 'totales'].sort(),
      )
    }
  })
})
