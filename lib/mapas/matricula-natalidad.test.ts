import { describe, expect, it } from 'vitest'
import { construirMatriculaNatalidad, type FilaMatricula } from './matricula-natalidad'

const fila = (extra: Partial<FilaMatricula> = {}): FilaMatricula => ({
  cueAnexo: '1800746-00', departamento: 'Concepción', nivel: 'Inicial',
  curso: 'Sala de 4', anio: 2025, matricula: 89, secciones: 4, ...extra,
})

describe('matrícula CGE para natalidad', () => {
  it('agrega todos los establecimientos sin depender de coordenadas y conserva cursos y ciclos', () => {
    const datos = construirMatriculaNatalidad([
      fila(), fila({ cueAnexo: '1800001-01', departamento: 'CONCEPCION', matricula: 11 }),
      fila({ curso: 'Sala de 5', matricula: 20 }), fila({ anio: 2026, matricula: 0 }),
      fila({ nivel: 'Primario', curso: '1º', matricula: 30 }),
    ], new Set(['1800746-00']))
    expect(datos.provincia['2025']).toEqual({ matricula: 150, secciones: 16, escuelas: 2, porNivel: { Inicial: 120, Primario: 30 } })
    expect(datos.departamentos.CONCEPCION['2025']).toEqual(datos.provincia['2025'])
    expect(datos.escuelas['1800746-00']['2025'].cursos).toHaveLength(3)
    expect(datos.escuelas['1800746-00']['2026'].matricula).toBe(0)
    expect(datos.escuelas['1800001-01']['2026']).toBeUndefined()
    expect(datos.meta.cueSinCoincidencia).toEqual(['1800001-01'])
    expect(datos.meta.anios).toEqual([2025, 2026])
  })

  it('rechaza duplicados de CUE completo, nivel, curso y año antes de sumar', () => {
    expect(() => construirMatriculaNatalidad([fila(), fila()])).toThrow(/duplicada/i)
  })

  it.each([-1, 1.5, NaN])('rechaza matrícula inválida %s', (matricula) => {
    expect(() => construirMatriculaNatalidad([fila({ matricula })])).toThrow(/matrícula/i)
  })

  it('rechaza identificadores incompletos sin fusionar anexos', () => {
    expect(() => construirMatriculaNatalidad([fila({ cueAnexo: '1800746' })])).toThrow(/CUE/i)
  })
})

// Import through the public CLI; all fixture output stays outside the worktree.
it('importa el Excel sin publicar CUD y conserva totales y cobertura', async () => {
  const { mkdtemp, readFile } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { spawnSync } = await import('node:child_process')
  const ExcelJS = (await import('exceljs')).default
  const scratch = await mkdtemp(join(tmpdir(), 'matricula-import-test-'))
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Hoja1')
  sheet.addRow(['Departamento', 'Localidad', 'Nivel Jurisdiccional', 'Cue-Anexo', 'Establecimiento', 'Nivel de Enseñanza', 'Curso', 'Ciclo Lectivo', 'Secciones con Alumnos', 'Matrícula', 'Alumnos con CUD'])
  sheet.addRow(['CONCEPCION', 'CONCEPCION', 'Consejo General de Educacion', '1800746-00', 'Test', 'Inicial', 'Sala de 4', 2025, 4, 89, 8])
  const input = join(scratch, 'input.xlsx')
  await workbook.xlsx.writeFile(input)
  const output = join(scratch, 'matricula.json')
  const snapshot = join(scratch, 'snapshot.json')
  const result = spawnSync(process.execPath, ['scripts/import-matricula-natalidad.mjs', input, '--output', output, '--snapshot', snapshot], { encoding: 'utf8' })
  expect(result.status, result.stderr).toBe(0)
  const publicText = await readFile(output, 'utf8')
  const sourceText = await readFile(snapshot, 'utf8')
  expect(JSON.parse(publicText).provincia['2025'].matricula).toBe(89)
  expect(publicText).not.toMatch(/CUD/)
  expect(sourceText).not.toMatch(/CUD/)
  expect(JSON.parse(sourceText).meta.sha256).toMatch(/^[a-f0-9]{64}$/)
})

it('reconcilia el snapshot completo con los seis totales del reporte y conserva los 17 CUE no espaciales', async () => {
  const { readFile } = await import('node:fs/promises')
  const snapshot = JSON.parse(await readFile('data/natalidad/matricula-cge-2021-2026.json', 'utf8')) as { filas: [string, string, 'Inicial' | 'Primario', string, number, number, number][] }
  const escuelas = JSON.parse(await readFile('public/data/natalidad/escuelas.geojson', 'utf8')) as { features: { properties: { cueAnexo: string } }[] }
  const rows = snapshot.filas.map(([cueAnexo, departamento, nivel, curso, anio, secciones, matricula]) => ({ cueAnexo, departamento, nivel, curso, anio, secciones, matricula }))
  const built = construirMatriculaNatalidad(rows, new Set(escuelas.features.map((f) => f.properties.cueAnexo)))
  const published = JSON.parse(await readFile('public/data/natalidad/matricula.json', 'utf8'))
  expect(built).toEqual(published)
  expect(built.meta.registros).toBe(37754)
  expect(built.meta.establecimientos).toBe(1181)
  expect(built.meta.cueSinCoincidencia).toHaveLength(17)
  expect(Object.keys(built.departamentos)).toHaveLength(25)
  expect(Object.values(built.provincia).map((r) => r.matricula)).toEqual([127019, 126157, 124680, 123778, 122777, 122593])
})
