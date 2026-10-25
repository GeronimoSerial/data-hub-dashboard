import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Ruta from './route'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getRawClient, migrarDb } from '@/lib/db'
import { crearEjecutorSql, ensureGeSchema } from '@/lib/infraestructura/ge-db'
import { crearAfectacion, crearParte } from '@/lib/infraestructura/test-utils/parte-fixtures'
import { getSessionUser } from '@/lib/session'

vi.mock('@/lib/session', () => ({
  getSessionUser: vi.fn(),
}))

// Mapa para un instituto superior: la ficha expone totales por afectación
// (carreras y alumnos) y ningún nombre ni id de alumno.

const CUE = '1801605-70'

usarDbTemporal('mapa-parte-instituto-route-', { seed: false })

let GET: typeof Ruta.GET

beforeAll(async () => {
  await migrarDb()
  const client = crearEjecutorSql(getRawClient())
  await ensureGeSchema(client)
  await client.execute(
    "INSERT INTO ge.ge_corte (id, ciclo_lectivo, fetched_at, estado) OVERRIDING SYSTEM VALUE VALUES (1, 2025, '2025-01-01T00:00:00Z', 'vigente')",
  )
  await client.execute(`INSERT INTO ge.ge_nivel_jurisdiccional (id, nombre) VALUES (4, 'Dirección de Nivel Superior')
    ON CONFLICT DO NOTHING`)
  await client.execute(`INSERT INTO ge.ge_escuela_nivel_jur (cue_anexo, nivel_jurisdiccional_id, ciclo_lectivo)
    VALUES ('${CUE}', 4, 2026)`)
  await client.execute(
    `INSERT INTO ge.ge_localizacion (cue_anexo, cui, nombre, departamento, localidad) VALUES ('${CUE}', NULL, 'Instituto', 'ER', 'Parana')`,
  )
  const [corte] = (await client.execute(`INSERT INTO matricula_corte (fuente, ciclo_lectivo, estado, creado_en)
    VALUES ('test-mapa-route', 2026, 'vigente', '2026-10-01') RETURNING id`)).rows
  const corteId = Number(corte!.id)
  const carrera = await client.execute({
    sql: `INSERT INTO matricula_carrera (corte_id, cue_anexo, instituto, nombre, rm, tipo, estado, sector)
          VALUES (?, ?, 'Instituto Mapa', 'Tecnicatura Mapa', 'RM-MAPA', 'Tecnicatura', 'ABIERTA', 'estatal') RETURNING id`,
    args: [corteId, CUE],
  })
  const carreraId = Number(carrera.rows[0]!.id)
  const alumnos = await client.execute({
    sql: `INSERT INTO matricula_alumno (corte_id, carrera_id, apellidos, nombres, nombre_busqueda, dni_hash) VALUES
      (?, ?, 'Secreto', 'Ana', 'secreto ana', 'h-mapa-1'),
      (?, ?, 'Oculto', 'Luis', 'oculto luis', 'h-mapa-2') RETURNING id`,
    args: [corteId, carreraId, corteId, carreraId],
  })
  const alumnoElegido = Number(alumnos.rows[0]!.id)

  const { ensureSeeded } = await import('@/lib/db/seed')
  await ensureSeeded()

  const parteId = await crearParte(CUE, 1)
  const afectacionId = await crearAfectacion({ parteId, motivo: 'Inundación', secciones: [] })
  await client.execute({
    sql: 'INSERT INTO infra_afectacion_carrera (afectacion_id, matricula_corte_id, carrera_id) VALUES (?, ?, ?)',
    args: [afectacionId, corteId, carreraId],
  })
  await client.execute({
    sql: 'INSERT INTO infra_afectacion_matricula_alumno (afectacion_id, matricula_corte_id, alumno_id) VALUES (?, ?, ?)',
    args: [afectacionId, corteId, alumnoElegido],
  })

  GET = (await import('./route')).GET
})

beforeEach(() => {
  vi.mocked(getSessionUser).mockReset()
  vi.mocked(getSessionUser).mockResolvedValue({
    id: 'u-mapa',
    role: 'consulta',
    banned: false,
    nivelJurIds: [],
    accesoRecursos: 'todos',
    recursoIds: [],
  })
})

function req(cue: string = CUE): Request {
  return new Request(`http://localhost/api/mapas/infraestructura/parte?cue=${encodeURIComponent(cue)}`)
}

// Claves que sólo podrían llevar identidad de un alumno. `periodo` queda fuera:
// su `nombre` es el del período, no de una persona.
const CLAVES_IDENTIDAD_ALUMNO = ['gePersonId', 'ge_person_id', 'apellido', 'apellidos', 'nombre', 'nombres', 'dni', 'documento', 'personaId', 'id_alumno']

function contieneClaveDeAlumno(valor: unknown): boolean {
  if (Array.isArray(valor)) return valor.some(contieneClaveDeAlumno)
  if (valor !== null && typeof valor === 'object') {
    const obj = valor as Record<string, unknown>
    if (CLAVES_IDENTIDAD_ALUMNO.some((clave) => clave in obj)) return true
    return Object.values(obj).some(contieneClaveDeAlumno)
  }
  return false
}

describe('GET /api/mapas/infraestructura/parte para un instituto superior', () => {
  it('expone totales de carreras y alumnos por afectación, sin nombres ni ids de alumno', async () => {
    const res = await GET(req())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.afectaciones).toHaveLength(1)
    expect(body.afectaciones[0].totales).toEqual({ secciones: 0, carreras: 1, alumnos: 1 })
    expect(body.afectaciones[0]).not.toHaveProperty('carreras')
    expect(body.afectaciones[0]).not.toHaveProperty('alumnos')
    // Todo el cuerpo, salvo el período: ninguna clave de identidad ni arreglos de alumnos.
    const { periodo: _periodo, ...resto } = body
    expect(contieneClaveDeAlumno(resto)).toBe(false)
    expect(JSON.stringify(resto)).not.toMatch(/Secreto|Oculto|Ana|Luis/)
    expect(JSON.stringify(resto)).not.toMatch(/"alumnos":\s*\[/)
  })
})
