import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { fechaArchivo } from './archivo-metadata'
import { formatearFecha } from './model'
import { crearLibroInstitucional } from './exportaciones/libro-institucional'
import { nombreArchivoExportacion } from './exportaciones/solicitud'

// Fixed instants chosen so that the Buenos Aires calendar date differs from the
// date of a zone one hour behind it (America/Manaus, UTC-4), which keeps the
// zone observable in the expected strings.
const antesDeMedianocheVisto = new Date('2026-10-18T03:30:00Z')
const generadoEn = new Date('2026-10-18T15:30:00Z')

describe('formatos de fecha por región (Corrientes)', () => {
  it('fechaArchivo formatea la fecha en la zona y locale de la región', () => {
    expect(fechaArchivo(antesDeMedianocheVisto.toISOString())).toBe('18/10/2026')
  })

  it('formatearFecha usa el locale de la región para el mes corto', () => {
    expect(formatearFecha(antesDeMedianocheVisto.toISOString())).toBe('18 de oct de 2026')
  })

  it('el libro institucional muestra la hora de generación en la zona de la región', async () => {
    const buffer = await crearLibroInstitucional({
      titulo: 'Escuelas',
      filtros: [],
      columnas: [{ clave: 'nombre', encabezado: 'Escuela' }],
      filas: [{ nombre: 'Escuela A' }],
      generadoEn,
    })
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)
    const textos = wb.getWorksheet(1)!.getSheetValues().flat().filter((v) => typeof v === 'string')
    expect(textos).toContain('Generado: 18/10/2026 12:30')
  })

  it('el nombre de archivo de exportación usa la fecha en la zona de la región', () => {
    expect(nombreArchivoExportacion([], antesDeMedianocheVisto)).toBe('escuelas-2026-10-18.xlsx')
  })
})
