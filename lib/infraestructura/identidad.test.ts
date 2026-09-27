import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getDb, getRawClient } from '../db'
import { infraAfectacion, infraAfectacionSeccion, infraParte } from '../db/schema'
import { crearEjecutorSql, ensureGeSchema } from './ge-db'
import {
  cifrarIdentidad,
  consultarYRegistrarAfectados,
  importarIdentidad,
  listarAfectadosNominal,
  listarIdentidadesPorPersonas,
} from './identidad'

let dir: string
let prevDataDir: string | undefined
let prevKey: string | undefined

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'identidad-'))
  prevDataDir = process.env.DATA_DIR
  prevKey = process.env.NOMINAL_ENCRYPTION_KEY
  process.env.DATA_DIR = dir
  process.env.NOMINAL_ENCRYPTION_KEY = randomBytes(32).toString('base64')
})

afterEach(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  if (prevKey === undefined) delete process.env.NOMINAL_ENCRYPTION_KEY
  else process.env.NOMINAL_ENCRYPTION_KEY = prevKey
  rmSync(dir, { recursive: true, force: true })
})

describe('cifrarIdentidad', () => {
  it('requiere la clave de entorno', () => {
    delete process.env.NOMINAL_ENCRYPTION_KEY
    expect(() => cifrarIdentidad('Ana', 'Pérez')).toThrow(/NOMINAL_ENCRYPTION_KEY/)
  })

  it('rechaza una clave que no decodifica a 32 bytes', () => {
    process.env.NOMINAL_ENCRYPTION_KEY = Buffer.from('demasiado-corta').toString('base64')
    expect(() => cifrarIdentidad('Ana', 'Pérez')).toThrow(/32 bytes/)
  })

  it('el mismo texto cifra distinto cada vez (iv aleatorio)', () => {
    const a = cifrarIdentidad('Ana', 'Pérez')
    const b = cifrarIdentidad('Ana', 'Pérez')
    expect(a).not.toBe(b)
  })
})

describe('importarIdentidad / listarIdentidadesPorPersonas', () => {
  it('cifra al importar, descifra al listar, y el payload persistido no revela texto plano', async () => {
    const client = crearEjecutorSql(getRawClient())
    await ensureGeSchema(client)
    await importarIdentidad(client, 42, 'Facundo', 'Quiroga')
    await importarIdentidad(client, 43, 'Manuela', 'Rosas')

    // Inspección directa de la fila persistida, como si fuera un lector
    // externo: ningún nombre en claro puede aparecer en el payload cifrado.
    for (const gePersonId of [42, 43]) {
      const fila = await client.execute({
        sql: 'SELECT payload_cifrado FROM ge.ge_alumno_identidad WHERE ge_person_id = ?',
        args: [gePersonId],
      })
      const payload = String(fila.rows[0].payload_cifrado)
      expect(payload).not.toContain('Facundo')
      expect(payload).not.toContain('Quiroga')
      expect(payload).not.toContain('Manuela')
      expect(payload).not.toContain('Rosas')
    }

    const identidades = await listarIdentidadesPorPersonas(client, [42, 43])
    expect(identidades).toEqual(
      expect.arrayContaining([
        { gePersonId: 42, nombre: 'Facundo', apellido: 'Quiroga' },
        { gePersonId: 43, nombre: 'Manuela', apellido: 'Rosas' },
      ]),
    )
  })

  it('reimportar la misma persona actualiza el payload en vez de duplicar la fila', async () => {
    const client = crearEjecutorSql(getRawClient())
    await ensureGeSchema(client)
    await importarIdentidad(client, 1, 'Nombre Viejo', 'Apellido Viejo')
    await importarIdentidad(client, 1, 'Nombre Nuevo', 'Apellido Nuevo')

    const count = await client.execute(
      'SELECT COUNT(*) AS n FROM ge.ge_alumno_identidad WHERE ge_person_id = 1',
    )
    expect(Number(count.rows[0].n)).toBe(1)

    const [identidad] = await listarIdentidadesPorPersonas(client, [1])
    expect(identidad).toEqual({ gePersonId: 1, nombre: 'Nombre Nuevo', apellido: 'Apellido Nuevo' })
  })

  it('descifrar con la clave equivocada falla en vez de devolver basura', async () => {
    const client = crearEjecutorSql(getRawClient())
    await ensureGeSchema(client)
    await importarIdentidad(client, 1, 'Ana', 'Pérez')

    process.env.NOMINAL_ENCRYPTION_KEY = randomBytes(32).toString('base64')

    await expect(listarIdentidadesPorPersonas(client, [1])).rejects.toThrow()
  })
})

// F3.3: listarAfectadosNominal/consultarYRegistrarAfectados repuntaron de
// problematicaId a afectacionId — ahora resuelven corte/secciones vía
// infra_afectacion + infra_parte (obtenerCorteYSeccionesDeAfectacion), nunca
// vía el modelo deprecado, eliminado en la Fase 4. Este describe usa getDb() (no
// createClient manual) porque necesita las tablas del modelo de parte, que
// sólo ensureSeeded() da de alta.
//
// Ambos escenarios (afectación existente / inexistente) viven en un único
// `it`, no en dos: getDb() memoiza la conexión a nivel de módulo (mismo
// motivo documentado en seed.test.ts y parte-consulta.test.ts), así que un
// segundo test con su propio DATA_DIR fresco (por el beforeEach de este
// archivo) seguiría escribiendo contra el directorio del primero, ya borrado
// por el afterEach.
describe('listarAfectadosNominal / consultarYRegistrarAfectados sobre el modelo nuevo (infra_afectacion)', () => {
  const CUE = '1801605-77'

  it('resuelve corte y secciones vía infra_afectacion + infra_parte, registra el acceso con afectacion_id, y una afectacionId inexistente no registra nada', async () => {
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

    const { ensureSeeded, PERIODO_ENOS_2026_2027_ID } = await import('../db/seed')
    await ensureSeeded()

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
    await db.insert(infraAfectacionSeccion).values({ afectacionId, geSectionId: 10 })

    const afectados = await listarAfectadosNominal(client, afectacionId)
    expect(afectados?.cantidad).toBe(1)
    expect(afectados?.secciones[0]?.alumnos).toEqual(
      expect.arrayContaining([{ nombre: 'Facundo', apellido: 'Quiroga' }]),
    )

    const resultado = await consultarYRegistrarAfectados(
      client,
      'user-afectacion-1',
      afectacionId,
      new Date(),
    )
    expect(resultado?.cantidad).toBe(1)

    const logs = await client.execute({
      sql: 'SELECT afectacion_id, cantidad FROM infra_acceso_nominal_log WHERE user_id = ?',
      args: ['user-afectacion-1'],
    })
    expect(logs.rows).toHaveLength(1)
    expect(logs.rows[0]?.afectacion_id).toBe(afectacionId)
    expect(Number(logs.rows[0]?.cantidad)).toBe(1)

    // Afectación inexistente: null, y sin fila huérfana de auditoría.
    const resultadoInexistente = await consultarYRegistrarAfectados(
      client,
      'user-afectacion-inexistente',
      'afectacion-que-no-existe',
      new Date(),
    )
    expect(resultadoInexistente).toBeNull()

    const logsInexistente = await client.execute({
      sql: 'SELECT id FROM infra_acceso_nominal_log WHERE user_id = ?',
      args: ['user-afectacion-inexistente'],
    })
    expect(logsInexistente.rows).toHaveLength(0)
  })
})
