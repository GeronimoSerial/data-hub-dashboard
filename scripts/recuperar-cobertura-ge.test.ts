import { randomBytes } from 'node:crypto'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { getDb, getRawClient, migrarDb } from '@/lib/db'
import { crearEjecutorSql, ensureGeSchema } from '@/lib/infraestructura/ge-db'
import { guardarVersion, leerVersion } from '@/lib/infraestructura/datasets/repositorio'
import { crearAcumulador } from './import-padron.mjs'
import { aplicarRecuperacion } from './recuperar-cobertura-ge.mjs'

const ge = { cue_anexo: '1801936-00', establecimiento_nombre: 'Jardín 56', departamento: 'CAPITAL', localidad: 'CORRIENTES' }
const client = () => crearEjecutorSql(getRawClient())
function padron() {
  const a = crearAcumulador()
  a.agregar([{ cueAnexo: '1801936-00', curso: 'Sala de 3', division: 'A', turno: 'Mañana', nivel: 'Inicial', dni: '12345678', nombre: 'Ana', apellido: 'Prueba' }])
  return a
}
beforeAll(async () => {
  await migrarDb()
  await ensureGeSchema(client())
})
beforeEach(async () => {
  for (const tabla of ['ge_alumno_seccion', 'ge_seccion', 'ge_corte', 'ge_alumno_identidad', 'ge_localizacion']) await client().execute(`DELETE FROM ge.${tabla}`)
  await client().execute("INSERT INTO ge.ge_corte(id,ciclo_lectivo,fetched_at,estado) OVERRIDING SYSTEM VALUE VALUES(1,2026,'2026-09-17','vigente')")
  await guardarVersion({ datasetId: 'localizaciones', nombre: 'Escuelas', revision: 'fixture', fuente: 'test', formato: 'array', clave: 'cueAnexo', datos: [{ cueAnexo: '1800001-00', nombre: 'Existente', departamento: 'CAPITAL', localidad: 'CORRIENTES', lat: -27, lon: -58 }] })
  await client().execute("INSERT INTO ge.ge_seccion(corte_id,ge_section_id,cue_anexo,curso,division,nivel,turno) VALUES(1,99,'1800001-00','1','A','Primario','Tarde')")
})
describe('recuperación transaccional de cobertura', () => {
  it('publica catálogo y recupera matrícula sin reemplazar el corte ni sus secciones', async () => {
    const resultado = await aplicarRecuperacion(getDb(), [ge], padron(), randomBytes(32))
    expect(resultado).toMatchObject({ corteId: 1, cues: ['1801936-00'], secciones: 1, membresias: 1 })
    expect((await client().execute('SELECT COUNT(*) n FROM ge.ge_seccion')).rows[0].n).toBe(2)
    expect((await client().execute('SELECT COUNT(*) n FROM ge.ge_corte')).rows[0].n).toBe(1)
    const catalogo = await leerVersion('localizaciones')
    expect(catalogo!.documento).toContainEqual(expect.objectContaining({ cueAnexo: '1800001-00', lat: -27, lon: -58 }))
    expect(catalogo!.documento).toContainEqual(expect.objectContaining({ cueAnexo: '1801936-00', lat: null, lon: null }))
    const identidad = (await client().execute('SELECT payload_cifrado FROM ge.ge_alumno_identidad')).rows[0].payload_cifrado as string
    expect(identidad).not.toContain('Ana')
    expect((await aplicarRecuperacion(getDb(), [ge], padron(), randomBytes(32))).cues).toEqual([])
    expect((await client().execute('SELECT COUNT(*) n FROM ge.ge_alumno_seccion')).rows[0].n).toBe(1)
  })
  it('revierte también la publicación del catálogo si hay colisión con una sección existente', async () => {
    const a = padron()
    const id = [...a.secciones.keys()][0]
    await client().execute({ sql: 'UPDATE ge.ge_seccion SET ge_section_id=? WHERE ge_section_id=99', args: [id] })
    const previa = (await leerVersion('localizaciones'))!.version.id
    await expect(aplicarRecuperacion(getDb(), [ge], a, randomBytes(32))).rejects.toThrow(/Colisión/)
    expect((await leerVersion('localizaciones'))!.version.id).toBe(previa)
    expect((await client().execute("SELECT COUNT(*) n FROM ge.ge_localizacion WHERE cue_anexo='1801936-00'")).rows[0].n).toBe(0)
  })
  it('recupera secciones aunque el catálogo ya incluya la escuela', async () => {
    const { publicarLocalizacionesGe } = await import('./localizaciones-ge.mjs')
    await publicarLocalizacionesGe(getDb(), [ge])
    expect((await aplicarRecuperacion(getDb(), [ge], padron(), randomBytes(32))).cues).toEqual(['1801936-00'])
    expect((await client().execute('SELECT COUNT(*) n FROM ge.ge_seccion')).rows[0].n).toBe(2)
  })
  it('rechaza un corte distinto al que se usó para leer GE', async () => {
    await expect(aplicarRecuperacion(getDb(), [ge], padron(), randomBytes(32), undefined, { id: 2, ciclo_lectivo: 2026 })).rejects.toThrow(/cambió/)
    await expect(aplicarRecuperacion(getDb(), [ge], padron(), randomBytes(32), undefined, { id: 1, ciclo_lectivo: 2025 })).rejects.toThrow(/cambió/)
    expect((await client().execute('SELECT COUNT(*) n FROM ge.ge_seccion')).rows[0].n).toBe(1)
  })
  it('no publica escuelas sin las secciones necesarias para completar su formulario', async () => {
    const previa = (await leerVersion('localizaciones'))!.version.id
    await expect(aplicarRecuperacion(getDb(), [ge], crearAcumulador(), randomBytes(32))).rejects.toThrow(/no coinciden/)
    expect((await leerVersion('localizaciones'))!.version.id).toBe(previa)
  })
})
