import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

let dir: string
let prevDataDir: string | undefined

const CUE_CON_SECCIONES = '1800001-00'
const CUE_SIN_SECCIONES = '1800999-00'
const AS_OF = '2026-09-01T00:00:00.000Z'

async function setEstadoCorte(estado: 'vigente' | 'historico'): Promise<void> {
  const { getRawClient } = await import('@/lib/db')
  const { crearEjecutorSql } = await import('@/lib/infraestructura/ge-db')
  const client = crearEjecutorSql(getRawClient())
  await client.execute({ sql: 'UPDATE ge.ge_corte SET estado = ? WHERE id = ?', args: [estado, 1] })
}

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'motor-exposicion-'))
  prevDataDir = process.env.DATA_DIR
  process.env.DATA_DIR = dir

  const { getRawClient } = await import('@/lib/db')
  const { crearEjecutorSql, ensureGeSchema } = await import('@/lib/infraestructura/ge-db')
  const client = crearEjecutorSql(getRawClient())
  await ensureGeSchema(client)

  // ge_localizacion con una fila dummy: hace no-op la siembra desde el JSON
  // versionado (ensureLocalizacionesSeeded sólo siembra si la tabla está vacía).
  await client.execute({
    sql: 'INSERT INTO ge.ge_localizacion (cue_anexo, cui, nombre, departamento, localidad, lat, lon, geo_calidad) VALUES (?,?,?,?,?,?,?,?)',
    args: [CUE_CON_SECCIONES, null, 'Escuela Con Secciones', 'CAPITAL', 'CORRIENTES', null, null, null],
  })

  // Corte arranca 'historico': el caso "sin corte vigente -> null" no depende
  // del orden de los tests.
  await client.execute({
    sql: "INSERT INTO ge.ge_corte (id, ciclo_lectivo, fetched_at, estado) OVERRIDING SYSTEM VALUE VALUES (?,?,?,?)",
    args: [1, 2026, '2026-08-01T00:00:00.000Z', 'historico'],
  })

  await client.execute({
    sql: "INSERT INTO ge.ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (?,?,?,?,?,?,?)",
    args: [1, 101, CUE_CON_SECCIONES, '1', 'A', 'primario', 'manana'],
  })
  await client.execute({
    sql: "INSERT INTO ge.ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (?,?,?,?,?,?,?)",
    args: [1, 102, CUE_CON_SECCIONES, '2', 'B', 'primario', 'tarde'],
  })

  // Sección 101: alumnos 1 y 2. Sección 102: alumnos 2 y 3 (2 repetido) ->
  // matrícula distinta = 3.
  for (const [seccion, alumno] of [
    [101, 1],
    [101, 2],
    [102, 2],
    [102, 3],
  ]) {
    await client.execute({
      sql: 'INSERT INTO ge.ge_alumno_seccion (corte_id, ge_section_id, ge_person_id) VALUES (?,?,?)',
      args: [1, seccion, alumno],
    })
  }

  const { ensureSeeded } = await import('@/lib/db/seed')
  await ensureSeeded()
})

afterAll(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  rmSync(dir, { recursive: true, force: true })
})

describe('crearAdapterExposicion', () => {
  it('devuelve null cuando no hay corte vigente', async () => {
    await setEstadoCorte('historico')
    const { crearAdapterExposicion } = await import('./exposicion')
    const resumen = await crearAdapterExposicion().obtenerResumen({
      cueAnexo: CUE_CON_SECCIONES,
      asOf: AS_OF,
    })
    expect(resumen).toBeNull()
  })

  it('cuenta matrícula distinta y secciones del corte vigente', async () => {
    await setEstadoCorte('vigente')
    const { crearAdapterExposicion } = await import('./exposicion')
    const resumen = await crearAdapterExposicion().obtenerResumen({
      cueAnexo: CUE_CON_SECCIONES,
      asOf: AS_OF,
    })

    expect(resumen).toEqual({
      cueAnexo: CUE_CON_SECCIONES,
      matricula: 3,
      secciones: 2,
      corteId: 1,
    })
  })

  it('devuelve cero matrícula y cero secciones para una escuela sin secciones', async () => {
    await setEstadoCorte('vigente')
    const { crearAdapterExposicion } = await import('./exposicion')
    const resumen = await crearAdapterExposicion().obtenerResumen({
      cueAnexo: CUE_SIN_SECCIONES,
      asOf: AS_OF,
    })

    expect(resumen).toEqual({
      cueAnexo: CUE_SIN_SECCIONES,
      matricula: 0,
      secciones: 0,
      corteId: 1,
    })
  })
})
