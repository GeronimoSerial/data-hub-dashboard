import { randomBytes } from 'node:crypto'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { getRawClient, migrarDb } from '@/lib/db'
import { crearEjecutorSql, ensureGeSchema } from '@/lib/infraestructura/ge-db'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { alcanceParaCue, esNivelSuperior } from './index'
import { crearAlcanceMatricula } from './matricula'

const CUE_SUP = '1800001-1'
const CUE_SEC = '1800002-1'
const NIVEL_SUPERIOR = 4
const NIVEL_SECUNDARIO = 1

usarDbTemporal('alcance-matricula-', {
  seed: false,
  env: { NOMINAL_ENCRYPTION_KEY: randomBytes(32).toString('base64') },
})

const ids: Record<string, number> = {}
const alumnos: Record<string, number> = {}

async function insertarAlumno(
  client: ReturnType<typeof crearEjecutorSql>,
  corteId: number,
  carreraId: number,
  apellidos: string,
  nombres: string,
  dniHash: string,
  clave: string,
) {
  const res = await client.execute({
    sql: `INSERT INTO matricula_alumno (corte_id, carrera_id, apellidos, nombres, nombre_busqueda, dni_hash)
          VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
    args: [corteId, carreraId, apellidos, nombres, `${apellidos} ${nombres}`.toLowerCase(), dniHash],
  })
  alumnos[clave] = Number(res.rows[0].id)
}

beforeAll(async () => {
  await migrarDb()
  const client = crearEjecutorSql(getRawClient())
  await ensureGeSchema(client)
  await client.execute(`INSERT INTO ge.ge_nivel_jurisdiccional (id, nombre) VALUES
    (${NIVEL_SUPERIOR}, 'Dirección de Nivel Superior'), (${NIVEL_SECUNDARIO}, 'Dirección de Nivel Secundario')`)
  await client.execute(`INSERT INTO ge.ge_escuela_nivel_jur (cue_anexo, nivel_jurisdiccional_id, ciclo_lectivo) VALUES
    ('${CUE_SUP}', ${NIVEL_SUPERIOR}, 2026), ('${CUE_SEC}', ${NIVEL_SECUNDARIO}, 2026)`)

  const cortes = await client.execute(`INSERT INTO matricula_corte (fuente, ciclo_lectivo, estado, creado_en)
    VALUES ('test-vigente', 2026, 'vigente', '2026-10-01'), ('test-anterior', 2025, 'reemplazado', '2025-10-01') RETURNING id`)
  const corteVigente = Number(cortes.rows[0].id)
  const corteAnterior = Number(cortes.rows[1].id)
  ids.corteVigente = corteVigente
  ids.corteAnterior = corteAnterior

  const carreras = await client.execute({
    sql: `INSERT INTO matricula_carrera (corte_id, cue_anexo, instituto, nombre, rm, tipo, estado, sector) VALUES
      (?, ?, 'Instituto Test', 'Tecnicatura en Sistemas', 'RM-1', 'Tecnicatura', 'ABIERTA', 'estatal'),
      (?, ?, 'Instituto Test', 'Profesorado de Historia', 'RM-2', 'Profesorado', 'ABIERTA', 'estatal'),
      (?, ?, 'Otro Instituto', 'Otra Carrera', 'RM-3', 'Profesorado', 'ABIERTA', 'estatal'),
      (?, ?, 'Instituto Test', 'Carrera Anterior', 'RM-4', 'Tecnicatura', 'CERRADA', 'estatal')
      RETURNING id`,
    args: [corteVigente, CUE_SUP, corteVigente, CUE_SUP, corteVigente, CUE_SEC, corteAnterior, CUE_SUP],
  })
  ids.tecnicatura = Number(carreras.rows[0].id)
  ids.profesorado = Number(carreras.rows[1].id)
  ids.otraCarrera = Number(carreras.rows[2].id)
  ids.carreraAnterior = Number(carreras.rows[3].id)

  await insertarAlumno(client, corteVigente, ids.tecnicatura, 'Azurduy', 'Juana', 'h-juana', 'juana')
  await insertarAlumno(client, corteVigente, ids.tecnicatura, 'Belgrano', 'Manuel', 'h-manuel', 'manuel')
  await insertarAlumno(client, corteVigente, ids.profesorado, 'Moreno', 'Mariano', 'h-mariano', 'mariano')
  await insertarAlumno(client, corteVigente, ids.otraCarrera, 'Sarmiento', 'Domingo', 'h-domingo', 'domingo')
  await insertarAlumno(client, corteAnterior, ids.carreraAnterior, 'Güemes', 'Martín', 'h-martin', 'martin')
})

function adaptador() {
  return crearAlcanceMatricula(crearEjecutorSql(getRawClient()), ids.corteVigente, CUE_SUP)
}

describe('adaptador de matrícula', () => {
  it('expone las carreras del CUE en el corte vigente como unidades (id, nombre, tipo como grupo, sin turno)', async () => {
    const unidades = await adaptador().listUnits()
    expect(unidades).toEqual([
      { id: ids.profesorado, etiqueta: 'Profesorado de Historia', turno: null, grupo: 'Profesorado' },
      { id: ids.tecnicatura, etiqueta: 'Tecnicatura en Sistemas', turno: null, grupo: 'Tecnicatura' },
    ])
  })

  it('cuenta los alumnos de cada carrera, excluyendo carreras de otro CUE o de cortes anteriores', async () => {
    const carreras = await adaptador().listarCarreras()
    expect(carreras.map((c) => [c.nombre, c.totalAlumnos])).toEqual([
      ['Profesorado de Historia', 1],
      ['Tecnicatura en Sistemas', 2],
    ])
  })

  it('devuelve los alumnos de cada carrera como miembros y omite unidades sin alumnos', async () => {
    const miembros = await adaptador().listMembers([ids.tecnicatura, ids.profesorado, 999999])
    expect([...(miembros.get(ids.tecnicatura) ?? [])].sort((a, b) => a - b)).toEqual(
      [alumnos.juana, alumnos.manuel].sort((a, b) => a - b),
    )
    expect([...(miembros.get(ids.profesorado) ?? [])]).toEqual([alumnos.mariano])
    expect(miembros.has(999999)).toBe(false)
  })

  it('devuelve un mapa vacío cuando no se pide ninguna carrera', async () => {
    expect((await adaptador().listMembers([])).size).toBe(0)
  })

  it('resuelve identidades por id de alumno aunque el alumno pertenezca a un corte anterior', async () => {
    const identidades = await adaptador().resolveIdentities([alumnos.juana, alumnos.martin])
    expect(identidades).toEqual(
      expect.arrayContaining([
        { miembroId: alumnos.juana, nombre: 'Juana', apellido: 'Azurduy' },
        { miembroId: alumnos.martin, nombre: 'Martín', apellido: 'Güemes' },
      ]),
    )
    expect(await adaptador().resolveIdentities([])).toEqual([])
  })

  it('lee las carreras una sola vez por instancia', async () => {
    const client = crearEjecutorSql(getRawClient())
    const alcance = crearAlcanceMatricula(client, ids.corteVigente, CUE_SUP)
    const execute = vi.spyOn(client, 'execute')
    await alcance.listUnits()
    await alcance.listarCarreras()
    await alcance.listUnits()
    expect(execute).toHaveBeenCalledTimes(1)
    execute.mockRestore()
  })
})

describe('alcanceParaCue (selección por nivel jurisdiccional)', () => {
  it('usa matrícula para un CUE de nivel Superior cuando hay un corte vigente', async () => {
    const alcance = await alcanceParaCue(crearEjecutorSql(getRawClient()), 1, CUE_SUP)
    expect(alcance.sistema).toBe('matricula')
    expect((await alcance.listUnits()).map((u) => u.id).sort((a, b) => a - b)).toEqual(
      [ids.profesorado, ids.tecnicatura].sort((a, b) => a - b),
    )
  })

  it('usa el padrón GE para un CUE que no es de nivel Superior', async () => {
    const alcance = await alcanceParaCue(crearEjecutorSql(getRawClient()), 1, CUE_SEC)
    expect(alcance.sistema).toBe('ge')
  })

  it('usa el padrón GE para un CUE Superior cuando no hay corte de matrícula vigente', async () => {
    const client = crearEjecutorSql(getRawClient())
    await client.execute(`UPDATE matricula_corte SET estado = 'reemplazado' WHERE id = ${ids.corteVigente}`)
    try {
      const alcance = await alcanceParaCue(client, 1, CUE_SUP)
      expect(alcance.sistema).toBe('ge')
    } finally {
      await client.execute(`UPDATE matricula_corte SET estado = 'vigente' WHERE id = ${ids.corteVigente}`)
    }
  })

  it('reconoce el nivel Superior sin importar acentos ni mayúsculas', () => {
    expect(esNivelSuperior('Dirección de Nivel Superior')).toBe(true)
    expect(esNivelSuperior('DIRECCION DE NIVEL SUPERIOR')).toBe(true)
    expect(esNivelSuperior('Dirección de Nivel Secundario')).toBe(false)
  })
})
