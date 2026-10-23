import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { extraerCatalogoSuperior } from './importar-carreras-superior.mjs'

function crearWorkbook() {
  const workbook = new ExcelJS.Workbook()
  const estatales = workbook.addWorksheet('Matriculados_2026_Estatales')
  estatales.addRow(['CUE', 'Carrrera', 'Carrera Estado'])
  estatales.addRow(['123456789', 'Tecnicatura A', 'ABIERTA'])
  estatales.addRow(['123456789', 'Tecnicatura A', 'ABIERTA'])
  estatales.addRow(['123456789', 'Tecnicatura B', 'CERRADA'])

  const privados = workbook.addWorksheet('Matriculados_2026_Privados')
  privados.addRow(['CUE', 'Carrrera', 'Carrera Estado'])
  privados.addRow(['987654321', 'Profesorado C', 'CERRADA'])
  return workbook
}

describe('extraerCatalogoSuperior', () => {
  it('normaliza CUE de nueve dígitos, deduplica y conserva carreras ABIERTA y CERRADA', () => {
    expect(extraerCatalogoSuperior(crearWorkbook())).toEqual({
      '1234567-89': ['Tecnicatura A', 'Tecnicatura B'],
      '9876543-21': ['Profesorado C'],
    })
  })

  it('ignora hojas ajenas y falla si falta una hoja institucional requerida', () => {
    const workbook = crearWorkbook()
    workbook.addWorksheet('Resumen').addRow(['CUE', 'Carrrera'])
    expect(extraerCatalogoSuperior(workbook)['1234567-89']).toHaveLength(2)

    const incompleto = new ExcelJS.Workbook()
    incompleto.addWorksheet('Matriculados_2026_Estatales').addRow(['CUE', 'Carrrera'])
    expect(() => extraerCatalogoSuperior(incompleto)).toThrow('Missing institutional sheet')
  })

  it('rechaza CUE inválido o carrera faltante sin imprimir el contenido de la fila', () => {
    const workbook = crearWorkbook()
    workbook.getWorksheet('Matriculados_2026_Estatales').getRow(2).getCell(1).value = '1234'
    expect(() => extraerCatalogoSuperior(workbook)).toThrow('Invalid CUE')

    const sinCarrera = crearWorkbook()
    sinCarrera.getWorksheet('Matriculados_2026_Estatales').getRow(2).getCell(2).value = ''
    expect(() => extraerCatalogoSuperior(sinCarrera)).toThrow('Missing career')
  })
})
