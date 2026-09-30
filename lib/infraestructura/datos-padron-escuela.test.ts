import { beforeAll, describe, expect, it } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getRawClient } from '../db'
import { crearEjecutorSql, ensureGeSchema } from './ge-db'
import { asegurarGeAdjuntada } from './impacto'
import { obtenerDatosPadronEscuela } from './datos-padron-escuela'

const CUE = '1801605-70'
const CUE_SIN_ALUMNOS = '1801605-71'
const CUE_SIN_SECCIONES = '1801605-72'
const CUE_AJENO = '1801605-73'

usarDbTemporal('datos-padron-', { seed: false })

beforeAll(async () => {
  const client = crearEjecutorSql(getRawClient())
  await ensureGeSchema(client)

  // CUE principal: dos niveles, dos turnos, y un alumno (3) compartido entre
  // dos secciones — la matrícula total debe deduplicarlo.
  const secciones: Array<[number, string, string, string]> = [
    [1, CUE, 'PRIMARIA', 'MAÑANA'],
    [2, CUE, 'PRIMARIA', 'TARDE'],
    [3, CUE, 'SECUNDARIA', 'MAÑANA'],
    [10, CUE_SIN_ALUMNOS, 'INICIAL', 'MAÑANA'],
    [20, CUE_AJENO, 'PRIMARIA', 'MAÑANA'],
  ]
  for (const [id, cue, nivel, turno] of secciones) {
    await client.execute({
      sql: `INSERT INTO ge.ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno)
            VALUES (1, ?, ?, '1', 'A', ?, ?)`,
      args: [id, cue, nivel, turno],
    })
  }

  const alumnos: Array<[number, number]> = [
    [1, 1],
    [1, 2],
    [1, 3],
    [2, 3],
    [2, 4],
    [3, 5],
    [20, 99],
  ]
  for (const [sectionId, personId] of alumnos) {
    await client.execute({
      sql: 'INSERT INTO ge.ge_alumno_seccion (corte_id, ge_section_id, ge_person_id) VALUES (1, ?, ?)',
      args: [sectionId, personId],
    })
  }
})

describe('obtenerDatosPadronEscuela', () => {
  it('agrega niveles, turnos, secciones y matrícula distinta sólo del CUE pedido', async () => {
    const client = crearEjecutorSql(getRawClient())
    await asegurarGeAdjuntada(client)

    const datos = await obtenerDatosPadronEscuela(client, 1, CUE)

    expect(datos).not.toBeNull()
    expect(datos!.niveles).toEqual(['PRIMARIA', 'SECUNDARIA'])
    expect(datos!.turnos).toEqual(['MAÑANA', 'TARDE'])
    expect(datos!.secciones).toBe(3)
    // Alumnos 1,2,3,4,5; el 3 está en dos secciones y cuenta una sola vez.
    // El alumno 99 (otro CUE) no entra.
    expect(datos!.matriculaTotal).toBe(5)
  })

  it('devuelve null cuando el CUE no tiene ninguna sección en el corte', async () => {
    const client = crearEjecutorSql(getRawClient())
    await asegurarGeAdjuntada(client)

    expect(await obtenerDatosPadronEscuela(client, 1, CUE_SIN_SECCIONES)).toBeNull()
    // Un corte distinto al de las secciones tampoco tiene datos.
    expect(await obtenerDatosPadronEscuela(client, 2, CUE)).toBeNull()
  })

  it('una escuela con secciones pero sin alumnos devuelve matrícula 0 (dato real), no null', async () => {
    const client = crearEjecutorSql(getRawClient())
    await asegurarGeAdjuntada(client)

    const datos = await obtenerDatosPadronEscuela(client, 1, CUE_SIN_ALUMNOS)
    expect(datos).not.toBeNull()
    expect(datos).toEqual({
      niveles: ['INICIAL'],
      turnos: ['MAÑANA'],
      secciones: 1,
      matriculaTotal: 0,
    })
  })

  it('sólo expone claves agregadas, nunca identidad de alumno', async () => {
    const client = crearEjecutorSql(getRawClient())
    await asegurarGeAdjuntada(client)

    const datos = await obtenerDatosPadronEscuela(client, 1, CUE)
    expect(Object.keys(datos!).sort()).toEqual(
      ['matriculaTotal', 'niveles', 'secciones', 'turnos'].sort(),
    )
  })
})
