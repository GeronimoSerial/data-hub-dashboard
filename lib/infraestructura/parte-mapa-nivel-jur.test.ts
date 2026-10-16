import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { getRawClient } from '@/lib/db'
import { ensureSeeded } from '@/lib/db/seed'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { crearEjecutorSql, ensureGeSchema } from './ge-db'
import { listarEscuelasMapa } from './parte-mapa'

usarDbTemporal('parte-mapa-nivel-jur', { seed: false, env: { ADMIN_EMAIL: undefined, ADMIN_PASSWORD: undefined } })

// Alcance director_nivel sobre el padrón: el EXISTS contra ge_escuela_nivel_jur
// tiene que devolver sólo las escuelas cuyo nivel está en la lista.
const client = () => crearEjecutorSql(getRawClient())

describe('listarEscuelasMapa con alcance por nivelesJurIds (EXISTS sobre ge_escuela_nivel_jur)', () => {
  beforeAll(async () => {
    await ensureSeeded()
    await ensureGeSchema(client())
  })

  beforeEach(async () => {
    await client().execute('DELETE FROM ge.ge_escuela_nivel_jur')
    await client().execute('DELETE FROM ge.ge_nivel_jurisdiccional')
    await client().execute('DELETE FROM ge.ge_localizacion')
    await client().execute({
      sql: 'INSERT INTO ge.ge_nivel_jurisdiccional (id, nombre) VALUES (?,?), (?,?)',
      args: [1, 'Secundario', 2, 'Primario'],
    })
    for (const [cue, nombre] of [
      ['1800001-00', 'Escuela con nivel 1'],
      ['1800002-00', 'Escuela con nivel 2'],
      ['1800003-00', 'Escuela sin nivel'],
    ] as const) {
      await client().execute({
        sql: 'INSERT INTO ge.ge_localizacion (cue_anexo, cui, nombre, departamento, localidad, lat, lon) VALUES (?, NULL, ?, ?, ?, ?, ?)',
        // Coordenadas dentro de Corrientes: fuera de la provincia no se listan en el mapa.
        args: [cue, nombre, 'Capital', 'Corrientes', -27.47, -58.83],
      })
    }
    await client().execute({
      sql: 'INSERT INTO ge.ge_escuela_nivel_jur (cue_anexo, nivel_jurisdiccional_id, ciclo_lectivo) VALUES (?,?,?), (?,?,?)',
      args: ['1800001-00', 1, 2026, '1800002-00', 2, 2026],
    })
  })

  it('con nivelesJurIds [1] devuelve sólo la escuela de ese nivel', async () => {
    const { escuelas } = await listarEscuelasMapa({ nivelesJurIds: [1] })
    expect(escuelas.map((e) => e.cueAnexo)).toEqual(['1800001-00'])
  })

  it('con varios niveles devuelve las escuelas de cualquiera de ellos, sin la que no tiene nivel', async () => {
    const { escuelas } = await listarEscuelasMapa({ nivelesJurIds: [1, 2] })
    expect(escuelas.map((e) => e.cueAnexo).sort()).toEqual(['1800001-00', '1800002-00'])
  })

  it('con nivelesJurIds vacío no matchea ninguna escuela', async () => {
    const { escuelas } = await listarEscuelasMapa({ nivelesJurIds: [] })
    expect(escuelas).toEqual([])
  })

  it('sin nivelesJurIds el padrón completo sigue visible, incluida la escuela sin nivel', async () => {
    const { escuelas } = await listarEscuelasMapa({})
    expect(escuelas.map((e) => e.cueAnexo).sort()).toEqual(['1800001-00', '1800002-00', '1800003-00'])
  })
})
