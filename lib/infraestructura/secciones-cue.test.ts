import { beforeAll, describe, expect, it } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getRawClient } from '../db'
import { crearEjecutorSql, ensureGeSchema } from './ge-db'
import { asegurarGeAdjuntada } from './impacto'
import { listarSeccionesDelCue } from './secciones-cue'

const CUE = '1801605-11'
const OTRO_CUE = '1801605-12'

usarDbTemporal('secciones-cue-', { seed: false })

beforeAll(async () => {
  const client = crearEjecutorSql(getRawClient())
  await ensureGeSchema(client)
  await client.execute(
    `INSERT INTO ge.ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, 1, '${CUE}', '1', 'A', 'PRIMARIA', 'MAÑANA')`,
  )
  await client.execute(
    `INSERT INTO ge.ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, 2, '${CUE}', '2', 'B', 'PRIMARIA', 'TARDE')`,
  )
  await client.execute(
    `INSERT INTO ge.ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, 3, '${OTRO_CUE}', '1', 'A', 'PRIMARIA', 'MAÑANA')`,
  )
})

describe('listarSeccionesDelCue', () => {
  it('devuelve las secciones del CUE indicado, con su turno', async () => {
    const client = crearEjecutorSql(getRawClient())
    await asegurarGeAdjuntada(client)
    const secciones = await listarSeccionesDelCue(client, 1, CUE)
    expect(secciones).toEqual(
      expect.arrayContaining([
        { geSectionId: 1, turno: 'MAÑANA' },
        { geSectionId: 2, turno: 'TARDE' },
      ]),
    )
    expect(secciones).toHaveLength(2)
  })

  it('no devuelve secciones de otro CUE', async () => {
    const client = crearEjecutorSql(getRawClient())
    await asegurarGeAdjuntada(client)
    const secciones = await listarSeccionesDelCue(client, 1, CUE)
    expect(secciones.some((s) => s.geSectionId === 3)).toBe(false)
  })
})
