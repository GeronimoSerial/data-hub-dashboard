import { beforeEach, describe, expect, it } from 'vitest'
import { getRawClient } from '../db'
import { crearEjecutorSql, ensureGeSchema } from './ge-db'
import { listarNivelesJurisdiccionales, nivelJurisdiccionalDeCue } from './nivel-jurisdiccional'

// Usa el schema `ge` de la PGlite compartida por el archivo; cada test limpia
// sus tablas para conservar el aislamiento (mismo patrón que ge-db.test.ts).
const client = () => crearEjecutorSql(getRawClient())

describe('ge_nivel_jurisdiccional / ge_escuela_nivel_jur (DDL)', () => {
  beforeEach(async () => {
    await ensureGeSchema(client())
    await client().execute('DELETE FROM ge.ge_escuela_nivel_jur')
    await client().execute('DELETE FROM ge.ge_nivel_jurisdiccional')
  })

  it('ensureGeSchema es idempotente sobre las tablas nuevas', async () => {
    await ensureGeSchema(client())
    await ensureGeSchema(client())
    const res = await client().execute(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'ge' AND table_name IN ('ge_nivel_jurisdiccional','ge_escuela_nivel_jur') ORDER BY table_name",
    )
    expect(res.rows.map((r) => r.table_name)).toEqual(['ge_escuela_nivel_jur', 'ge_nivel_jurisdiccional'])
  })

  it('rechaza una asignación a un nivel inexistente en el catálogo', async () => {
    await expect(
      client().execute({
        sql: 'INSERT INTO ge.ge_escuela_nivel_jur (cue_anexo, nivel_jurisdiccional_id, ciclo_lectivo) VALUES (?,?,?)',
        args: ['1800001-00', 99, 2026],
      }),
    ).rejects.toThrow()
  })
})

describe('listarNivelesJurisdiccionales y nivelJurisdiccionalDeCue', () => {
  beforeEach(async () => {
    await ensureGeSchema(client())
    await client().execute('DELETE FROM ge.ge_escuela_nivel_jur')
    await client().execute('DELETE FROM ge.ge_nivel_jurisdiccional')
    await client().execute({
      sql: 'INSERT INTO ge.ge_nivel_jurisdiccional (id, nombre) VALUES (?,?), (?,?)',
      args: [9, 'Consejo General', 1, 'Secundario'],
    })
    await client().execute({
      sql: 'INSERT INTO ge.ge_escuela_nivel_jur (cue_anexo, nivel_jurisdiccional_id, ciclo_lectivo) VALUES (?,?,?)',
      args: ['1800001-00', 1, 2026],
    })
  })

  it('lista el catálogo ordenado por id', async () => {
    const niveles = await listarNivelesJurisdiccionales(client())
    expect(niveles).toEqual([
      { id: 1, nombre: 'Secundario' },
      { id: 9, nombre: 'Consejo General' },
    ])
  })

  it('devuelve el nivel asignado al CUE con su ciclo', async () => {
    const nivel = await nivelJurisdiccionalDeCue(client(), '1800001-00')
    expect(nivel).toEqual({ id: 1, nombre: 'Secundario', cicloLectivo: 2026 })
  })

  it('devuelve null para un CUE sin nivel cargado', async () => {
    expect(await nivelJurisdiccionalDeCue(client(), '9999999-99')).toBeNull()
  })
})
