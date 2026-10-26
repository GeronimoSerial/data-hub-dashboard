import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import ExcelJS from 'exceljs'
import { getDb, getRawClient } from '../lib/db'
import { usarDbTemporal } from '../lib/test-utils/db-temporal'
import { matriculaAlumno, matriculaCarrera, matriculaCorte } from '../lib/db/schema'
import { hashDni } from '../lib/infraestructura/matricula/dni'
import { MATRICULA_COLUMNS } from '../lib/infraestructura/matricula/filas'
import { importMatricula, maskDniCell, parseArgs, reportFailure } from './import-matricula.mjs'
import { eq, sql } from 'drizzle-orm'

usarDbTemporal('matricula-import', { env: { MATRICULA_DNI_SECRET: 'secreto-import-test' } })

const CABECERA = [...MATRICULA_COLUMNS]
const buena = (apellidos: string, nombres: string, dni: string, cue = '180176400', carrera = 'Tecnicatura en Sistemas') => [
  'Capital', 'Cordoba', cue, 'Instituto Superior X', carrera, '1234/20', 'Tecnicatura', 'ABIERTA', apellidos, nombres, dni,
]

let tmp = ''
let archivo = ''
let archivoSegundo = ''

beforeAll(async () => {
  tmp = mkdtempSync(path.join(tmpdir(), 'matricula-xlsx-'))
  archivo = path.join(tmp, 'matricula.xlsx')
  archivoSegundo = path.join(tmp, 'matricula-2.xlsx')

  const libro = new ExcelJS.Workbook()
  const estatales = libro.addWorksheet('Matriculados_2026_Estatales')
  estatales.addRow(CABECERA)
  estatales.addRow(buena('PEREZ', 'ANA MARIA', '30.123.456'))
  estatales.addRow(buena('GOMEZ', 'LUIS', '31222333'))
  estatales.addRow(buena('PEREZ', 'ANA MARIA', '30123456'))
  estatales.addRow(['Capital', 'Cordoba', '180176400', 'Instituto', 'Tecnicatura', '1', 'Tecnicatura', 'PEREZ', 'ANA', '30123999', ''])
  estatales.addRow(buena('LOPEZ', 'JUAN', '40111222', '12345'))
  estatales.addRow(buena('RUIZ', 'EVA', '40AB1222'))
  estatales.addRow(['', '', '', '', '', '', '', '', '', '', ' '])
  const privados = libro.addWorksheet('Matriculados_2026_Privados')
  privados.addRow(CABECERA)
  privados.addRow(['Capital', 'Cordoba', '180176500', 'Instituto Privado', 'Profesorado en Z', '9/20', 'Profesorado', 'CERRADA', 'MÉNDEZ', 'JOSÉ', '35987654'])
  await libro.xlsx.writeFile(archivo)

  const segundo = new ExcelJS.Workbook()
  const hoja = segundo.addWorksheet('Matriculados_2026_Estatales')
  hoja.addRow(CABECERA)
  hoja.addRow(buena('SOSA', 'ROSA', '28765432', '180176400', 'Profesorado Nuevo'))
  await segundo.xlsx.writeFile(archivoSegundo)
})

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true })
})

describe('parseArgs and maskDniCell', () => {
  it('lee las opciones', () => {
    expect(parseArgs(['--file', 'a.xlsx', '--ciclo', '2026', '--dry-run', '--excluded', 'x.csv'])).toEqual({
      file: 'a.xlsx', ciclo: '2026', excluded: 'x.csv', dryRun: true,
    })
  })

  it('enmascara el DNI dejando sólo los últimos 3 dígitos', () => {
    expect(maskDniCell('30.123.456')).toBe('*****456')
    expect(maskDniCell('12')).toBe('***')
    expect(maskDniCell('ANA')).toBe('***')
  })
})

describe('importMatricula', () => {
  it('dry run valida y escribe el CSV de excluidas sin tocar la base', async () => {
    const excluidas = path.join(tmp, 'dry', 'excluidas.csv')
    const r = await importMatricula({ file: archivo, ciclo: '2026', dryRun: true, excludedPath: excluidas, db: null, raw: null })
    expect(r.importadas).toBe(3)
    expect(r.excluidas).toBe(4)
    expect(r.excluidasPorMotivo).toEqual({
      alumno_duplicado_en_carrera: 1,
      estado_invalido: 1,
      cue_invalido: 1,
      dni_invalido: 1,
    })
    expect(r.vacias).toBe(1)
    expect(r.carreras).toBe(2)
    expect(r.cues).toBe(2)
    const csv = readFileSync(excluidas, 'utf8')
    expect(csv).toContain('hoja,fila,motivo')
    expect(csv).toContain('*****456')
    expect(csv).not.toContain('30123456')
    expect(csv).not.toContain('30.123.456')
    expect(csv).not.toContain('30123999')
  })

  it('importa la matrícula y activa el corte', async () => {
    const db = getDb()
    const excluidas = path.join(tmp, 'real', 'excluidas.csv')
    const r = await importMatricula({ file: archivo, ciclo: '2026', excludedPath: excluidas, db, raw: getRawClient() })
    expect(r.dryRun).toBe(false)
    expect(r.alumnosInsertados).toBe(3)
    const [corte] = await db.select().from(matriculaCorte).where(eq(matriculaCorte.id, r.corteId!))
    expect(corte).toMatchObject({ estado: 'vigente', filasImportadas: 3, filasExcluidas: 4, fuente: 'matricula.xlsx' })

    const carreras = await db.select().from(matriculaCarrera).where(eq(matriculaCarrera.corteId, r.corteId!))
    expect(carreras.map((c) => c.sector).sort()).toEqual(['estatal', 'privado'])

    const alumnos = await db.select().from(matriculaAlumno).where(eq(matriculaAlumno.corteId, r.corteId!))
    expect(alumnos).toHaveLength(3)
    expect(alumnos.find((a) => a.apellidos === 'PEREZ')?.dniHash).toBe(hashDni('30123456'))
    expect(alumnos.find((a) => a.apellidos === 'MÉNDEZ')?.nombreBusqueda).toBe('mendez jose')
  })

  it('nunca guarda el DNI en claro', async () => {
    const db = getDb()
    const alumnos = await db.select().from(matriculaAlumno)
    const volcado = JSON.stringify(alumnos)
    for (const dni of ['30123456', '31222333', '35987654']) {
      expect(volcado).not.toContain(dni)
    }
  })

  it('una nueva importación reemplaza al vigente anterior', async () => {
    const db = getDb()
    const previo = await db.select().from(matriculaCorte).where(eq(matriculaCorte.estado, 'vigente'))
    const r = await importMatricula({
      file: archivoSegundo,
      ciclo: '2026',
      excludedPath: path.join(tmp, 'segundo.csv'),
      db,
      raw: getRawClient(),
    })
    const vigentes = await db.select().from(matriculaCorte).where(eq(matriculaCorte.estado, 'vigente'))
    expect(vigentes.map((c) => c.id)).toEqual([r.corteId])
    const [anterior] = await db.select().from(matriculaCorte).where(eq(matriculaCorte.id, previo[0].id))
    expect(anterior.estado).toBe('reemplazado')
  })

  it('si falla antes de activar no deja corte parcial y conserva el vigente', async () => {
    const db = getDb()
    const antes = await db.select().from(matriculaCorte)
    const vigenteAntes = antes.find((c) => c.estado === 'vigente')
    await expect(
      importMatricula({
        file: archivo,
        ciclo: '2026',
        excludedPath: path.join(tmp, 'fallido.csv'),
        db,
        raw: getRawClient(),
        deps: {
          beforeActivate: async () => {
            throw new Error('falla simulada')
          },
        },
      }),
    ).rejects.toThrow('falla simulada')

    const despues = await db.select().from(matriculaCorte)
    expect(despues.map((c) => c.estado).sort()).toEqual(antes.map((c) => c.estado).sort())
    expect(despues.some((c) => c.estado === 'cargando')).toBe(false)
    expect(despues.find((c) => c.id === vigenteAntes!.id)?.estado).toBe('vigente')
    const existentes = new Set(despues.map((c) => c.id))
    const alumnos = await db.select().from(matriculaAlumno)
    expect(alumnos.every((a) => existentes.has(a.corteId))).toBe(true)
  })

  it('rechaza importar sin el secreto del DNI', async () => {
    const previo = process.env.MATRICULA_DNI_SECRET
    delete process.env.MATRICULA_DNI_SECRET
    try {
      await expect(
        importMatricula({ file: archivo, ciclo: '2026', dryRun: true, excludedPath: path.join(tmp, 'sin-secreto.csv'), db: null, raw: null }),
      ).rejects.toThrow(/MATRICULA_DNI_SECRET/)
    } finally {
      process.env.MATRICULA_DNI_SECRET = previo
    }
  })
  it('si otra importación tiene el lock, sale sin tocar la base', async () => {
    const db = getDb()
    const antes = await db.select().from(matriculaCorte)
    const raw = { query: async () => ({ rows: [{ ok: false }] }) }
    await expect(
      importMatricula({ file: archivo, ciclo: '2026', excludedPath: path.join(tmp, 'ocupado.csv'), db, raw: raw as never }),
    ).rejects.toThrow(/holds the lock/)
    const despues = await db.select().from(matriculaCorte)
    expect(despues).toHaveLength(antes.length)
  })

  it('un error de inserción no imprime nombres ni huellas', async () => {
    const db = getDb()
    await db.execute(
      sql`CREATE OR REPLACE FUNCTION matricula_test_fallar() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'fallo forzado'; END $$ LANGUAGE plpgsql`,
    )
    await db.execute(
      sql`CREATE TRIGGER matricula_test_fallar BEFORE INSERT ON matricula_alumno FOR EACH ROW EXECUTE FUNCTION matricula_test_fallar()`,
    )
    const salida: string[] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      salida.push(args.map(String).join(' '))
    })
    let error: unknown
    try {
      await importMatricula({
        file: archivo,
        ciclo: '2026',
        excludedPath: path.join(tmp, 'error-insert.csv'),
        db,
        raw: getRawClient(),
      })
    } catch (err) {
      error = err
      reportFailure(err)
    } finally {
      spy.mockRestore()
      await db.execute(sql`DROP TRIGGER IF EXISTS matricula_test_fallar ON matricula_alumno`)
      await db.execute(sql`DROP FUNCTION IF EXISTS matricula_test_fallar()`)
    }

    // The raw error does carry the parameters: the redaction is what keeps them out of the log.
    expect(String((error as Error).message)).toContain('PEREZ')
    const texto = salida.join('\n')
    expect(texto).toContain('[import-matricula] failed:')
    expect(texto).not.toContain('PEREZ')
    expect(texto).not.toContain('30123456')
    expect(texto).not.toContain(hashDni('30123456'))
  })
})
