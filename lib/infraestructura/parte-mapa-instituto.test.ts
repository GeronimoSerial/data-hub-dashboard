import { beforeAll, describe, expect, it } from 'vitest'
import { getRawClient } from '@/lib/db'
import { ensureSeeded } from '@/lib/db/seed'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { crearEjecutorSql, ensureGeSchema, type EjecutorSql } from './ge-db'
import { listarPartesVigentes } from './parte-mapa'
import { crearAfectacion, crearParte } from './test-utils/parte-fixtures'

// Lote del mapa con un CUE GE y dos institutos superiores en la misma consulta:
// los totales de instituto salen de matrícula (corte guardado) y el estado
// general cuenta las carreras suspendidas; GE queda como estaba.

usarDbTemporal('parte-mapa-instituto', { seed: false, env: { ADMIN_EMAIL: undefined, ADMIN_PASSWORD: undefined } })

const CUE_GE = 'CUE-MI-GE'
const CUE_SUP = 'CUE-MI-SUP'
const CUE_EVA = 'CUE-MI-EVA'
const id: Record<string, number> = {}

async function insertarCarrera(client: EjecutorSql, cue: string, nombre: string, tipo: string): Promise<number> {
  const res = await client.execute({
    sql: `INSERT INTO matricula_carrera (corte_id, cue_anexo, instituto, nombre, rm, tipo, estado, sector)
          VALUES (?, ?, 'Instituto Mapa', ?, ?, ?, 'ABIERTA', 'estatal') RETURNING id`,
    args: [id.corte, cue, nombre, `RM-${nombre}`, tipo],
  })
  return Number(res.rows[0]!.id)
}

async function insertarAlumnos(client: EjecutorSql, carreraId: number, cantidad: number, prefijo: string): Promise<number[]> {
  const ids: number[] = []
  for (let i = 0; i < cantidad; i++) {
    const res = await client.execute({
      sql: `INSERT INTO matricula_alumno (corte_id, carrera_id, apellidos, nombres, nombre_busqueda, dni_hash)
            VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
      args: [id.corte, carreraId, `${prefijo}${i}`, 'Nombre', `${prefijo}${i} nombre`, `h-${prefijo}${i}`],
    })
    ids.push(Number(res.rows[0]!.id))
  }
  return ids
}

async function filaAfectacion(client: EjecutorSql, afectacionId: string, carreraId: number, alumnoIds: number[]) {
  await client.execute({
    sql: 'INSERT INTO infra_afectacion_carrera (afectacion_id, matricula_corte_id, carrera_id) VALUES (?, ?, ?)',
    args: [afectacionId, id.corte, carreraId],
  })
  for (const alumnoId of alumnoIds) {
    await client.execute({
      sql: 'INSERT INTO infra_afectacion_matricula_alumno (afectacion_id, matricula_corte_id, alumno_id) VALUES (?, ?, ?)',
      args: [afectacionId, id.corte, alumnoId],
    })
  }
}

async function suspenderCarrera(client: EjecutorSql, parteId: string, carreraId: number) {
  await client.execute({
    sql: `INSERT INTO infra_servicio_alcance (id, parte_id, tipo, referencia_id, estado, rige_desde, creada_en, retirada_en)
          VALUES (?, ?, 'carrera', ?, 'suspendido', ?, ?, NULL)`,
    args: [crypto.randomUUID(), parteId, String(carreraId), new Date().toISOString(), new Date().toISOString()],
  })
}

beforeAll(async () => {
  await ensureSeeded()
  const client = crearEjecutorSql(getRawClient())
  await ensureGeSchema(client)
  await client.execute(
    "INSERT INTO ge.ge_corte (id, ciclo_lectivo, fetched_at, estado) OVERRIDING SYSTEM VALUE VALUES (1, 2026, '2026-01-01T00:00:00Z', 'vigente')",
  )
  await client.execute(`INSERT INTO ge.ge_nivel_jurisdiccional (id, nombre) VALUES (4, 'Dirección de Nivel Superior')
    ON CONFLICT DO NOTHING`)
  for (const cue of [CUE_GE, CUE_SUP, CUE_EVA]) {
    await client.execute({
      sql: `INSERT INTO ge.ge_localizacion (cue_anexo, cui, nombre, departamento, localidad) VALUES (?, NULL, ?, 'ER', 'Parana')`,
      args: [cue, cue],
    })
  }
  await client.execute(`INSERT INTO ge.ge_escuela_nivel_jur (cue_anexo, nivel_jurisdiccional_id, ciclo_lectivo) VALUES
    ('${CUE_SUP}', 4, 2026), ('${CUE_EVA}', 4, 2026)`)
  await client.execute(`INSERT INTO ge.ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno)
    VALUES (1, 9001, '${CUE_GE}', '1', 'A', 'PRIMARIA', 'MAÑANA')`)
  await client.execute(`INSERT INTO ge.ge_alumno_seccion (corte_id, ge_section_id, ge_person_id) VALUES (1, 9001, 7001), (1, 9001, 7002)`)

  const [corte] = (await client.execute(`INSERT INTO matricula_corte (fuente, ciclo_lectivo, estado, creado_en)
    VALUES ('test-mapa-instituto', 2026, 'vigente', '2026-10-01') RETURNING id`)).rows
  id.corte = Number(corte!.id)

  // CUE_SUP: carrera A (3 alumnos) y carrera B (1 alumno).
  id.carreraA = await insertarCarrera(client, CUE_SUP, 'Carrera Mapa A', 'Tecnicatura')
  id.carreraB = await insertarCarrera(client, CUE_SUP, 'Carrera Mapa B', 'Profesorado')
  const alumnosA = await insertarAlumnos(client, id.carreraA, 3, 'a')
  await insertarAlumnos(client, id.carreraB, 1, 'b')

  // CUE_EVA: carrera C (3 alumnos, evacuado) y carrera D (1 alumno, no interrumpida).
  id.carreraC = await insertarCarrera(client, CUE_EVA, 'Carrera Mapa C', 'Tecnicatura')
  id.carreraD = await insertarCarrera(client, CUE_EVA, 'Carrera Mapa D', 'Profesorado')
  const alumnosC = await insertarAlumnos(client, id.carreraC, 3, 'c')
  await insertarAlumnos(client, id.carreraD, 1, 'd')

  // Parte GE: una sección con dos matriculados, uno alcanzado.
  const parteGe = await crearParte(CUE_GE, 1)
  await crearAfectacion({ parteId: parteGe, secciones: [9001], alumnos: [7001] })

  // Parte instituto: A restringida a un alumno; B completa; B suspendida.
  const parteSup = await crearParte(CUE_SUP, 1)
  const afectacionA = await crearAfectacion({ parteId: parteSup, motivo: 'Inundación', secciones: [] })
  await filaAfectacion(client, afectacionA, id.carreraA, [alumnosA[0]!])
  const afectacionB = await crearAfectacion({ parteId: parteSup, motivo: 'Acceso interrumpido', secciones: [] })
  await filaAfectacion(client, afectacionB, id.carreraB, [])
  await suspenderCarrera(client, parteSup, id.carreraB)

  // Parte instituto evacuado: afectación completa de C restringida a un alumno;
  // sólo C suspendida, así el roster del establecimiento son los 3 de C.
  const parteEva = await crearParte(CUE_EVA, 1)
  await client.execute({ sql: "UPDATE infra_parte SET estado_establecimiento = 'evacuado' WHERE id = ?", args: [parteEva] })
  const afectacionC = await crearAfectacion({ parteId: parteEva, motivo: 'Evacuación', secciones: [] })
  await filaAfectacion(client, afectacionC, id.carreraC, [alumnosC[0]!])
  await suspenderCarrera(client, parteEva, id.carreraC)
})

describe('listarPartesVigentes con GE e institutos en el mismo lote', () => {
  it('GE sigue igual: sin carreras y con sus secciones y alumnos', async () => {
    const { partes } = await listarPartesVigentes()
    const ge = partes.find((p) => p.cueAnexo === CUE_GE)!
    expect(ge.servicio).toBe('normal')
    expect(ge.seccionesAlcanzadas).toBe(1)
    expect(ge.alumnosAlcanzados).toBe(1)
    expect(ge).not.toHaveProperty('carrerasAlcanzadas')
  })

  it('instituto: alumnos y carreras por afectación con su corte, y estado parcial por carrera suspendida', async () => {
    const { partes, indicadores } = await listarPartesVigentes()
    const sup = partes.find((p) => p.cueAnexo === CUE_SUP)!
    // A: alumno elegido restringido (1); B completa (1): unión de 2 alumnos y 2 carreras.
    expect(sup.alumnosAlcanzados).toBe(2)
    expect(sup.carrerasAlcanzadas).toBe(2)
    expect(sup.seccionesAlcanzadas).toBe(0)
    expect(sup.servicio).toBe('parcial')
    expect(indicadores.alumnosAlcanzados).toBe(1 + 2 + 3)
    expect(indicadores.seccionesAlcanzadas).toBe(1)
  })

  it('instituto evacuado: el roster son los alumnos de las carreras suspendidas', async () => {
    const { partes } = await listarPartesVigentes()
    const eva = partes.find((p) => p.cueAnexo === CUE_EVA)!
    expect(eva.estadoEstablecimiento).toBe('evacuado')
    expect(eva.alumnosDelHecho).toBe(1)
    // Carrera C suspendida: 3 alumnos en la interrupción, carrera D no cuenta.
    expect(eva.alumnosAlcanzados).toBe(3)
    expect(eva.servicio).toBe('parcial')
  })
})
