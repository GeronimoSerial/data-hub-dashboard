import { beforeEach, describe, expect, it } from 'vitest'
import { getRawClient, migrarDb } from '../db'
import { crearEjecutorSql, ensureGeSchema } from './ge-db'
import { ensureLocalizacionesSeeded } from './localizaciones-seed'
import { guardarVersion } from './datasets/repositorio'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'

usarDbTemporal('localizaciones-db', { seed: false })
let revision = 0
beforeEach(async () => {
  await migrarDb()
  const client = crearEjecutorSql(getRawClient())
  await ensureGeSchema(client)
  await guardarVersion({ datasetId: 'localizaciones', nombre: 'Padrón', formato: 'array', clave: 'cueAnexo',
    revision: String(++revision), fuente: 'fixture', datos: [{ cueAnexo: '1800001-00', nombre: 'Escuela', departamento: 'Capital',
      localidad: 'Corrientes', lat: -27.47, lon: -58.83, geoCalidad: null }] })
  await client.execute('DELETE FROM ge.ge_localizacion')
})

describe('ensureLocalizacionesSeeded', () => {
  it('reconstruye la proyección desde la versión publicada', async () => {
    await ensureLocalizacionesSeeded()
    const resultado = await crearEjecutorSql(getRawClient()).execute('SELECT cue_anexo,nombre FROM ge.ge_localizacion')
    expect(resultado.rows).toEqual([{ cue_anexo: '1800001-00', nombre: 'Escuela' }])
  })
  it('no duplica ni pisa una proyección ya existente', async () => {
    await ensureLocalizacionesSeeded()
    const client = crearEjecutorSql(getRawClient())
    await client.execute("UPDATE ge.ge_localizacion SET nombre='Nombre operativo'")
    await ensureLocalizacionesSeeded()
    const resultado = await client.execute('SELECT nombre FROM ge.ge_localizacion')
    expect(resultado.rows).toEqual([{ nombre: 'Nombre operativo' }])
  })
  it('no siembra secciones ni identidades nominales', async () => {
    await ensureLocalizacionesSeeded()
    const resultado = await crearEjecutorSql(getRawClient()).execute('SELECT (SELECT count(*) FROM ge.ge_seccion) AS secciones,(SELECT count(*) FROM ge.ge_alumno_identidad) AS identidades')
    expect(Number(resultado.rows[0].secciones)).toBe(0)
    expect(Number(resultado.rows[0].identidades)).toBe(0)
  })
})
