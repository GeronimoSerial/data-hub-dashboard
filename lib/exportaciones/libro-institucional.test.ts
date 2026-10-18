import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { crearLibroInstitucional } from './libro-institucional'

const generadoEn = new Date('2026-10-18T15:30:00Z')

const columnas = [
  { clave: 'nombre', encabezado: 'Escuela', ancho: 30 },
  { clave: 'departamento', encabezado: 'Departamento', ancho: 18 },
  { clave: 'alumnos', encabezado: 'Alumnos', ancho: 12, formato: 'entero' as const },
  { clave: 'fecha', encabezado: 'Fecha', ancho: 14, formato: 'fecha' as const },
]

const filas = [
  { nombre: 'Escuela A', departamento: 'Paraná', alumnos: 120, fecha: new Date('2026-03-02T12:00:00Z') },
  { nombre: 'Escuela B', departamento: 'Concordia', alumnos: 80, fecha: new Date('2026-04-10T12:00:00Z') },
  { nombre: 'Escuela C', departamento: 'Paraná', alumnos: null, fecha: null },
]

async function leer(buffer: ArrayBuffer) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  return wb
}

describe('crearLibroInstitucional', () => {
  it('genera un libro con titulo, filtros aplicados y total', async () => {
    const buffer = await crearLibroInstitucional({
      titulo: 'Escuelas afectadas',
      subtitulo: 'Infraestructura',
      filtros: [{ etiqueta: 'Departamento', valor: 'Paraná' }],
      columnas,
      filas,
      generadoEn,
      unidad: 'escuelas',
    })
    const wb = await leer(buffer)
    const ws = wb.getWorksheet(1)!
    const textos = ws.getSheetValues().flat().filter((v) => typeof v === 'string')

    expect(textos).toContain('Escuelas afectadas')
    expect(textos).toContain('Infraestructura')
    expect(textos).toContain('Departamento: Paraná')
    expect(textos).toContain('Generado: 18/10/2026 12:30')
    expect(textos).toContain('Total: 3 escuelas')
  })

  it('usa Arial en negrita con fondo institucional en el encabezado', async () => {
    const buffer = await crearLibroInstitucional({
      titulo: 'Escuelas',
      filtros: [],
      columnas,
      filas,
      generadoEn,
    })
    const ws = (await leer(buffer)).getWorksheet(1)!
    const encabezado = ws.getRows(1, ws.rowCount)!.find((r) => r.getCell(1).value === 'Escuela')!
    const celda = encabezado.getCell(1)

    expect(celda.font?.name).toBe('Arial')
    expect(celda.font?.bold).toBe(true)
    expect(celda.font?.color?.argb).toBe('FFFFFFFF')
    expect(celda.fill).toMatchObject({ type: 'pattern', fgColor: { argb: 'FF1F5D9B' } })
    expect(encabezado.getCell(2).value).toBe('Departamento')
    expect(encabezado.getCell(4).value).toBe('Fecha')
  })

  it('escribe una fila por registro con fechas dd/mm/yyyy', async () => {
    const buffer = await crearLibroInstitucional({
      titulo: 'Escuelas',
      filtros: [],
      columnas,
      filas,
      generadoEn,
    })
    const ws = (await leer(buffer)).getWorksheet(1)!
    const encabezado = ws.getRows(1, ws.rowCount)!.find((r) => r.getCell(1).value === 'Escuela')!
    const primera = encabezado.number + 1
    const datos = [primera, primera + 1, primera + 2].map((n) => ws.getRow(n))

    expect(datos.map((r) => r.getCell(1).value)).toEqual(['Escuela A', 'Escuela B', 'Escuela C'])
    expect(datos[0].getCell(4).numFmt).toBe('dd/mm/yyyy')
    expect(datos[0].getCell(4).value).toEqual(new Date('2026-03-02T12:00:00Z'))
    expect(ws.views?.[0]).toMatchObject({ state: 'frozen', ySplit: encabezado.number })
    expect(ws.autoFilter).toBeTruthy()
  })

  it('incluye exactamente una imagen (escudo) y configura impresion', async () => {
    const buffer = await crearLibroInstitucional({
      titulo: 'Escuelas',
      filtros: [],
      columnas,
      filas,
      generadoEn,
    })
    const ws = (await leer(buffer)).getWorksheet(1)!

    expect(ws.getImages()).toHaveLength(1)
    expect(ws.pageSetup.orientation).toBe('landscape')
    expect(ws.pageSetup.fitToPage).toBe(true)
    expect(ws.pageSetup.printTitlesRow).toMatch(/^\d+:\d+$/)
  })

  it('usa "registros" como unidad por defecto', async () => {
    const buffer = await crearLibroInstitucional({
      titulo: 'Listado',
      filtros: [],
      columnas,
      filas,
      generadoEn,
    })
    const ws = (await leer(buffer)).getWorksheet(1)!
    const textos = ws.getSheetValues().flat()

    expect(textos).toContain('Total: 3 registros')
  })
})
