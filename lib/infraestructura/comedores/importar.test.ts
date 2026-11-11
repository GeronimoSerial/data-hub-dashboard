import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { agregarComedores, leerPlanillaComedores } from './importar'
import { estadoComedor } from './estado'

const ENCABEZADO = [
  'Jurisdicción', 'Departamento', 'Localidad', 'Zona', 'Cue-Anexo', 'Establecimiento Dependiente',
  'Direccion', 'Establecimiento Cabecera', 'Proveedor', 'Raciones Desayuno', 'Desayuno Excedente',
  'Desayuno Cobertura (%)', 'Raciones Almuerzo', 'Almuerzo Excedente', 'Almuerzo Cobertura (%)', 'Matricula',
]

function libro(filas: Array<{ cue: unknown; proveedor?: unknown; desayuno?: unknown; almuerzo?: unknown }>, hoja = 'PlanillaServicioComedor') {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(hoja)
  ws.addRow([null, null, null, 'Planilla de Servicios de Comidas'])
  ws.addRow([])
  // Encabezado desplazado una columna, como en la planilla real (columna A vacía).
  ws.addRow([null, ...ENCABEZADO])
  for (const f of filas) {
    const fila = Array(ENCABEZADO.length).fill(null)
    fila[ENCABEZADO.indexOf('Cue-Anexo')] = f.cue
    fila[ENCABEZADO.indexOf('Proveedor')] = f.proveedor ?? null
    fila[ENCABEZADO.indexOf('Raciones Desayuno')] = f.desayuno ?? 0
    fila[ENCABEZADO.indexOf('Raciones Almuerzo')] = f.almuerzo ?? 0
    ws.addRow([null, ...fila])
  }
  return wb
}

describe('leerPlanillaComedores', () => {
  it('lee por nombre de columna desde la fila 4 y normaliza el CUE', () => {
    const { filas, rechazadas } = leerPlanillaComedores(
      libro([{ cue: ' 1800487-00 ', proveedor: 'Soluciones y Servicios', desayuno: 41, almuerzo: 0 }]),
      'a.xlsx',
    )
    expect(rechazadas).toEqual([])
    expect(filas).toEqual([
      { cueAnexo: '1800487-00', proveedor: 'Soluciones y Servicios', racionesDesayuno: 41, racionesAlmuerzo: 0, fuente: 'a.xlsx' },
    ])
  })

  it('acepta raciones decimales y textos numéricos; vacío cuenta como 0', () => {
    const { filas } = leerPlanillaComedores(
      libro([{ cue: '1800415-00', desayuno: 242.5, almuerzo: '30' }, { cue: '1800416-00', desayuno: null, almuerzo: null }]),
      'a.xlsx',
    )
    expect(filas.map((f) => [f.racionesDesayuno, f.racionesAlmuerzo])).toEqual([[242.5, 30], [0, 0]])
  })

  it('rechaza CUE inválidos o sólo base, informando la fila, sin corregirlos', () => {
    const { filas, rechazadas } = leerPlanillaComedores(
      libro([{ cue: '1800487' }, { cue: 'abc' }, { cue: null, proveedor: 'X', desayuno: 4 }, { cue: null }, { cue: '1800001-00', desayuno: 5 }]),
      'a.xlsx',
    )
    expect(filas.map((f) => f.cueAnexo)).toEqual(['1800001-00'])
    expect(rechazadas).toEqual([
      { fila: 4, fuente: 'a.xlsx', cue: '1800487', motivo: 'cue_invalido' },
      { fila: 5, fuente: 'a.xlsx', cue: 'abc', motivo: 'cue_invalido' },
      { fila: 6, fuente: 'a.xlsx', cue: null, motivo: 'cue_vacio' },
    ])
  })

  it('falla si falta la hoja o una columna obligatoria', () => {
    expect(() => leerPlanillaComedores(libro([], 'Otra'), 'a.xlsx')).toThrow('PlanillaServicioComedor')
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('PlanillaServicioComedor')
    ws.addRow([]); ws.addRow([]); ws.addRow(['Cue-Anexo', 'Proveedor'])
    expect(() => leerPlanillaComedores(wb, 'a.xlsx')).toThrow('Raciones Desayuno')
  })
})

describe('agregarComedores', () => {
  const fila = (cueAnexo: string, d: number, a: number, fuente: string, proveedor: string | null = 'P') =>
    ({ cueAnexo, proveedor, racionesDesayuno: d, racionesAlmuerzo: a, fuente })

  it('suma raciones por CUE repetido y cuenta repetidos dentro de un archivo', () => {
    const { comedores, estadisticas } = agregarComedores([
      fila('1800001-00', 10, 0, 'a'), fila('1800001-00', 0, 5, 'a'), fila('1800002-00', 3, 0, 'a'),
    ])
    expect(comedores.find((c) => c.cueAnexo === '1800001-00')).toMatchObject({ desayuno: true, almuerzo: true })
    expect(estadisticas.repetidosPorFuente).toEqual({ a: 1 })
    expect(estadisticas.cuesUnicos).toBe(2)
  })

  it('fusiona CUE presentes en ambos archivos y une proveedores distintos de forma determinista', () => {
    const { comedores, estadisticas } = agregarComedores([
      fila('1800001-00', 10, 0, 'a', 'Zeta'), fila('1800001-00', 0, 7, 'b', 'Alfa'), fila('1800001-00', 1, 0, 'b', 'Alfa'),
    ])
    expect(comedores).toEqual([
      { cueAnexo: '1800001-00', desayuno: true, almuerzo: true, proveedor: 'Alfa / Zeta', fuentes: ['a', 'b'] },
    ])
    expect(estadisticas.solapadosEntreFuentes).toBe(1)
  })

  it('descarta CUE sin raciones y marca desayuno/almuerzo por separado', () => {
    const { comedores, estadisticas } = agregarComedores([
      fila('1800001-00', 0, 0, 'a'), fila('1800002-00', 0, 9, 'a', null),
    ])
    expect(comedores).toEqual([
      { cueAnexo: '1800002-00', desayuno: false, almuerzo: true, proveedor: null, fuentes: ['a'] },
    ])
    expect(estadisticas.sinRaciones).toBe(1)
  })
})

describe('estadoComedor', () => {
  it.each([
    [{ desayuno: true, almuerzo: true }, 'desayuno_almuerzo', 'Comedor: desayuno y almuerzo'],
    [{ desayuno: true, almuerzo: false }, 'solo_desayuno', 'Comedor: solo desayuno'],
    [{ desayuno: false, almuerzo: true }, 'solo_almuerzo', 'Comedor: solo almuerzo'],
    [null, 'sin_servicio', 'Comedor: sin servicio registrado'],
  ] as const)('%j', (entrada, estado, etiqueta) => {
    expect(estadoComedor(entrada).estado).toBe(estado)
    expect(estadoComedor(entrada).etiqueta).toBe(etiqueta)
  })
})
