import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import ExcelJS from 'exceljs'
import { cuentaPorClave } from '../cuentas-qa'
import type { Page } from '@playwright/test'
import { expect, test } from '../fixtures/base'
import { ESPERADOS } from '../seed/esperados'

// Plan B3c.4: contenido de la pestaña Estadísticas, de la pestaña Metodología y del Excel que
// descarga la pestaña Exportar. La forma del XLSX por API ya la fija contratos/hidro-exportar.spec.ts;
// acá se prueba la descarga real desde la interfaz.

const RUTA_MAPA = '/mapas/infraestructura'
const BOTON_DESCARGA = 'Descargar Excel'
const ENCABEZADO_CUE = 'CUE anexo'
const ENCABEZADOS_EXPORTACION = [
  'CUE anexo',
  'Escuela',
  'Departamento',
  'Localidad',
  'Dirección',
  'Niveles',
  'Matrícula',
  'Gravedad',
  'Estado de clases',
  'Asistencia pedagógica',
]
// Escuelas sin coordenadas del seed: el Excel no las lista.
const CUES_SIN_COORDENADAS = ['1801176-01', '1801018-00']

type FilaExportada = Record<string, string>
type Exportacion = { nombre: string; encabezados: string[]; filas: FilaExportada[] }

// Filas de la tabla "Agrupar por: Departamento" indexadas por nombre de departamento.
// Cada valor son las celdas posteriores al nombre: Escuelas, Con situaciones abiertas, %, Alumnos sin clases.
async function tablaPorDepartamento(page: Page): Promise<Record<string, string[]>> {
  const resultado: Record<string, string[]> = {}
  for (const fila of await page.getByTestId('map-est-tabla').locator('tbody tr').all()) {
    const [departamento, ...celdas] = (await fila.locator('th,td').allTextContents()).map((texto) => texto.trim())
    resultado[departamento] = celdas
  }
  return resultado
}

// Lee la hoja de un .xlsx descargado. Los datos van desde la fila debajo del encabezado hasta la primera fila sin CUE.
function leerHoja(libro: ExcelJS.Workbook): Omit<Exportacion, 'nombre'> {
  const hoja = libro.worksheets[0]
  let fila = 1
  while (fila <= hoja.rowCount && hoja.getCell(fila, 1).text !== ENCABEZADO_CUE) fila++
  const encabezados: string[] = []
  for (let columna = 1; columna <= hoja.columnCount; columna++) {
    const texto = hoja.getCell(fila, columna).text
    if (texto !== '') encabezados.push(texto)
  }
  const filas: FilaExportada[] = []
  for (let actual = fila + 1; hoja.getCell(actual, 1).text !== ''; actual++) {
    const registro: FilaExportada = {}
    encabezados.forEach((encabezado, indice) => {
      registro[encabezado] = hoja.getCell(actual, indice + 1).text
    })
    filas.push(registro)
  }
  return { encabezados, filas }
}

// Descarga el Excel desde la pestaña Exportar y lo guarda en un directorio temporal fuera del repositorio.
async function descargarExcel(page: Page): Promise<Exportacion> {
  const directorio = await mkdtemp(path.join(tmpdir(), 'mapa-enos-exportar-'))
  try {
    const [descarga] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: BOTON_DESCARGA }).click(),
    ])
    const nombre = descarga.suggestedFilename()
    const destino = path.join(directorio, nombre)
    await descarga.saveAs(destino)
    const libro = new ExcelJS.Workbook()
    await libro.xlsx.readFile(destino)
    return { nombre, ...leerHoja(libro) }
  } finally {
    await rm(directorio, { recursive: true, force: true })
  }
}

test.describe('admin: estadísticas, metodología y exportación', () => {
  test.use({ storageState: cuentaPorClave('admin').storageStatePath })

  test('la tabla por departamento muestra las escuelas, afectadas, porcentaje y alumnos de cada departamento sembrado', async ({ page }) => {
    await page.goto(`${RUTA_MAPA}#estadisticas`)
    await expect(page.getByTestId('map-est-tabla')).toBeVisible()
    // Escuelas: las 30 con coordenadas (porDepartamentoConCoordenadas). Afectadas: las 17 con parte visible,
    // todas con coordenadas (evolucion.rankingDepartamentos). Porcentaje: afectadas / escuelas redondeado.
    await expect.poll(() => tablaPorDepartamento(page)).toEqual({
      Capital: ['10', '7', '70%', '0'],
      Goya: ['8', '4', '50%', '0'],
      'Paso de los Libres': ['6', '3', '50%', '0'],
      'Santo Tomé': ['6', '3', '50%', '0'],
    })
  })

  test('el resumen cuenta 17 escuelas con situaciones abiertas, igual a la suma de la tabla', async ({ page }) => {
    await page.goto(`${RUTA_MAPA}#estadisticas`)
    await expect(page.getByTestId('map-est-tabla')).toBeVisible()
    const kpi = page.locator('.map-est__kpis .map-sitact__kpi').filter({ hasText: 'Escuelas con situaciones abiertas' }).locator('strong')
    await expect(kpi).toHaveText('17')
    await expect.poll(async () => {
      const filas = await tablaPorDepartamento(page)
      return Object.values(filas).reduce((suma, [escuelas]) => suma + Number(escuelas), 0)
    }).toBe(ESPERADOS.escuelas.conCoordenadas)
  })

  test('la pestaña Metodología muestra sus secciones', async ({ page }) => {
    await page.goto(`${RUTA_MAPA}#metodologia`)
    await expect(page.getByTestId('metodologia-mapa')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Trazabilidad de los datos', level: 2 })).toBeVisible()
  })

  test('exportar descarga un Excel con 10 columnas, 30 escuelas con coordenadas y valores del roster', async ({ page }) => {
    await page.goto(`${RUTA_MAPA}#exportar`)
    const exportacion = await descargarExcel(page)

    expect(exportacion.nombre).toMatch(/^escuelas-\d{4}-\d{2}-\d{2}\.xlsx$/)
    expect(exportacion.encabezados).toEqual(ENCABEZADOS_EXPORTACION)
    expect(exportacion.filas).toHaveLength(ESPERADOS.escuelas.conCoordenadas)
    expect(exportacion.filas.find((f) => f['CUE anexo'] === '1801855-00')).toMatchObject({
      Escuela: 'COLEGIO SECUNDARIO DEL Bº APIPE',
      Departamento: 'Capital',
      Localidad: 'CORRIENTES',
    })
    expect(exportacion.filas.find((f) => f['CUE anexo'] === '1800405-00')).toMatchObject({
      Escuela: 'COLEGIO SECUNDARIO "PRESIDENTE ARTURO FRONDIZI"',
      Departamento: 'Paso de los Libres',
      Localidad: 'PASO DE LOS LIBRES',
    })
    expect(exportacion.filas.find((f) => f['CUE anexo'] === '1800893-00')).toMatchObject({
      Escuela: 'ESCUELA Nº 678',
      Departamento: 'Goya',
      Localidad: 'PARAJE SAN ANTONIO',
    })
    for (const cue of CUES_SIN_COORDENADAS) {
      expect(exportacion.filas.map((f) => f['CUE anexo'])).not.toContain(cue)
    }
  })
})

test.describe('consulta de infraestructura: exportación', () => {
  test.use({ storageState: cuentaPorClave('consulta-infra').storageStatePath })

  test('exportar descarga el mismo listado de 10 columnas y 30 escuelas que admin', async ({ page }) => {
    await page.goto(`${RUTA_MAPA}#exportar`)
    const exportacion = await descargarExcel(page)

    expect(exportacion.nombre).toMatch(/^escuelas-\d{4}-\d{2}-\d{2}\.xlsx$/)
    expect(exportacion.encabezados).toEqual(ENCABEZADOS_EXPORTACION)
    expect(exportacion.filas).toHaveLength(ESPERADOS.escuelas.conCoordenadas)
  })
})
