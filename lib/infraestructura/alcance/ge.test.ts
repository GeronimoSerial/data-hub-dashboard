import { randomBytes } from 'node:crypto'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { getRawClient } from '@/lib/db'
import { crearEjecutorSql, ensureGeSchema } from '@/lib/infraestructura/ge-db'
import { importarIdentidad } from '@/lib/infraestructura/identidad'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { alcanceGeParaCue, alcanceParaCue } from './index'

const CUE = '1801605-21'
const OTRO_CUE = '1801605-22'
const CORTE = 1

usarDbTemporal('alcance-ge-', {
  seed: false,
  env: { NOMINAL_ENCRYPTION_KEY: randomBytes(32).toString('base64') },
})

beforeAll(async () => {
  const client = crearEjecutorSql(getRawClient())
  await ensureGeSchema(client)
  await client.execute(
    `INSERT INTO ge.ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES
      (${CORTE}, 2101, '${CUE}', '1', 'A', 'PRIMARIA', 'MAÑANA'),
      (${CORTE}, 2102, '${CUE}', '2', 'B', 'PRIMARIA', 'TARDE'),
      (${CORTE}, 2103, '${OTRO_CUE}', '1', 'A', 'PRIMARIA', 'MAÑANA'),
      (${CORTE}, 2104, '${CUE}', '3', 'C', 'PRIMARIA', 'MAÑANA')`,
  )
  for (const [seccion, persona] of [
    [2101, 21001],
    [2101, 21002],
    [2102, 21003],
    [2103, 21004],
  ] as const) {
    await client.execute({
      sql: 'INSERT INTO ge.ge_alumno_seccion (corte_id, ge_section_id, ge_person_id) VALUES (?, ?, ?)',
      args: [CORTE, seccion, persona],
    })
  }
  await importarIdentidad(client, 21001, 'Juana', 'Azurduy')
  await importarIdentidad(client, 21003, 'Manuel', 'Belgrano')
})

describe('alcanceParaCue (adaptador GE)', () => {
  it('mapea las secciones del CUE a unidades genéricas (id, etiqueta, turno, grupo), sin las de otro CUE', async () => {
    const client = crearEjecutorSql(getRawClient())
    const unidades = await alcanceParaCue(client, CORTE, CUE).listUnits()
    expect(unidades).toEqual(
      expect.arrayContaining([
        { id: 2101, etiqueta: '1 A', turno: 'MAÑANA', grupo: 'PRIMARIA' },
        { id: 2102, etiqueta: '2 B', turno: 'TARDE', grupo: 'PRIMARIA' },
        { id: 2104, etiqueta: '3 C', turno: 'MAÑANA', grupo: 'PRIMARIA' },
      ]),
    )
    expect(unidades).toHaveLength(3)
    expect(unidades.some((u) => u.id === 2103)).toBe(false)
  })

  it('devuelve la matrícula por sección y omite las secciones sin alumnos', async () => {
    const client = crearEjecutorSql(getRawClient())
    const miembros = await alcanceParaCue(client, CORTE, CUE).listMembers([2101, 2102, 2104])
    expect([...(miembros.get(2101) ?? [])].sort((a, b) => a - b)).toEqual([21001, 21002])
    expect([...(miembros.get(2102) ?? [])]).toEqual([21003])
    expect(miembros.get(2104)).toBeUndefined()
    expect(miembros.has(2103)).toBe(false)
  })

  it('lee ge_seccion una sola vez por instancia: listUnits y listarSeccionesGe comparten la lectura', async () => {
    const client = crearEjecutorSql(getRawClient())
    const execute = vi.spyOn(client, 'execute')
    const alcance = alcanceGeParaCue(client, CORTE, CUE)
    const unidades = await alcance.listUnits()
    const filas = await alcance.listarSeccionesGe()
    await alcance.listUnits()
    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute.mock.calls[0][0]).toEqual(expect.objectContaining({ sql: expect.stringContaining('ge.ge_seccion') }))
    expect(filas).toHaveLength(unidades.length)
    expect(filas.map((f) => f.geSectionId).sort((a, b) => a - b)).toEqual([2101, 2102, 2104])
    execute.mockRestore()
  })

  it('devuelve un mapa vacío cuando no se pide ninguna sección', async () => {
    const client = crearEjecutorSql(getRawClient())
    const miembros = await alcanceParaCue(client, CORTE, CUE).listMembers([])
    expect(miembros.size).toBe(0)
  })

  it('resuelve identidades sólo para los alumnos con nombre cargado', async () => {
    const client = crearEjecutorSql(getRawClient())
    const identidades = await alcanceParaCue(client, CORTE, CUE).resolveIdentities([21001, 21002, 21003])
    expect(identidades).toEqual(
      expect.arrayContaining([
        { miembroId: 21001, nombre: 'Juana', apellido: 'Azurduy' },
        { miembroId: 21003, nombre: 'Manuel', apellido: 'Belgrano' },
      ]),
    )
    expect(identidades).toHaveLength(2)
  })

  it('devuelve una lista vacía cuando no se pide ninguna identidad', async () => {
    const client = crearEjecutorSql(getRawClient())
    expect(await alcanceParaCue(client, CORTE, CUE).resolveIdentities([])).toEqual([])
  })
})
