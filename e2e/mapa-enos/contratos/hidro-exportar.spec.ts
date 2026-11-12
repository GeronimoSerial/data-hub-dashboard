import type { APIResponse } from '@playwright/test'
import ExcelJS from 'exceljs'
import { compararSnapshot } from './snapshot'
import { expect, test } from './base'
import { ESCUELAS, ESPERADOS, ESPERADOS_RADAR } from '../seed/esperados'
import { ESPERADOS_HIDRO, HORAS_ATRAS_ULTIMA_LECTURA } from '../seed/hidro'
import { CUE_ANEXO_OPERADOR } from '../cuentas-qa'

// Contracts for the hydrometry stations, the school XLSX export and the access index of the
// isolated schools. Values come from the manifest; snapshots pin the full normalized response.

const RUTA_ESTACIONES = '/api/infraestructura/hidrometria/estaciones'
const RUTA_EXPORTAR = '/api/infraestructura/exportar'
const RUTA_ACCESOS = '/api/infraestructura/accesos'

const ETIQUETA_GENERADO = 'Generado: '
const CABECERA_CUE = 'CUE anexo'

type EstacionRespuesta = {
  estacionId: string
  nombre: string
  rio: string
  rol: string
  lat: number
  lon: number
  lectura: Record<string, unknown> | null
  estado: string
  tendencia: string
  lecturaVencida: boolean
  horasDesdeLectura: number | null
  estadoUltimaLectura: unknown
}

// The hours since the last reading grow with the time between seed and test. They are checked
// as a range and replaced by a marker in the snapshot, so the snapshot stays stable.
function sinHorasRelativas(estacion: EstacionRespuesta): Record<string, unknown> {
  return { ...estacion, horasDesdeLectura: '<horas>' }
}

// The API returns the stations in catalog order, which is not the manifest order. Compare by id.
function porEstacion(estaciones: EstacionRespuesta[]): EstacionRespuesta[] {
  return [...estaciones].sort((a, b) => a.estacionId.localeCompare(b.estacionId))
}

test('hidrometría: las tres estaciones, la que está en alerta y los valores de la última lectura', async ({ apiAdmin }) => {
  const respuesta = await apiAdmin.get(RUTA_ESTACIONES)
  expect(respuesta.status()).toBe(200)
  const cuerpo = (await respuesta.json()) as { estaciones: EstacionRespuesta[] }

  expect(porEstacion(cuerpo.estaciones).map((e) => e.estacionId)).toEqual([...ESPERADOS.hidrometria.estaciones.ids].sort())
  expect(cuerpo.estaciones).toHaveLength(ESPERADOS.hidrometria.estaciones.total)

  for (const esperada of ESPERADOS_HIDRO.estaciones) {
    const obtenida = cuerpo.estaciones.find((e) => e.estacionId === esperada.estacionId)
    expect(obtenida, esperada.estacionId).toBeDefined()
    expect(obtenida).toMatchObject({
      nombre: esperada.nombre,
      rio: esperada.rio,
      rol: esperada.rol,
      lat: esperada.lat,
      lon: esperada.lon,
      estado: esperada.estado,
      tendencia: esperada.tendencia,
      lecturaVencida: esperada.lecturaVencida,
    })
    expect(obtenida?.lectura).toMatchObject(esperada.ultimaLectura)
    // Freshness: the seed floors the reading time to the hour, so the age is in [2 h, 3 h).
    expect(obtenida?.horasDesdeLectura).toBeGreaterThanOrEqual(HORAS_ATRAS_ULTIMA_LECTURA)
    expect(obtenida?.horasDesdeLectura).toBeLessThan(HORAS_ATRAS_ULTIMA_LECTURA + 1)
  }

  const enAlerta = cuerpo.estaciones.filter((e) => e.estado === 'alerta').map((e) => e.estacionId)
  expect(enAlerta).toEqual([ESPERADOS.hidrometria.enAlerta])

  compararSnapshot('hidro-exportar-estaciones', porEstacion(cuerpo.estaciones).map(sinHorasRelativas))
})

type FilaExportada = Record<string, unknown>

async function leerLibro(respuesta: APIResponse): Promise<ExcelJS.Workbook> {
  const libro = new ExcelJS.Workbook()
  // ExcelJS types its input with a Node Buffer type from an older @types/node; the bytes are a Buffer at runtime.
  const contenido = (await respuesta.body()) as unknown as Parameters<ExcelJS.Xlsx['load']>[0]
  await libro.xlsx.load(contenido)
  return libro
}

function filaDeEncabezado(hoja: ExcelJS.Worksheet): number {
  for (let fila = 1; fila <= hoja.rowCount; fila++) {
    if (hoja.getCell(fila, 1).value === CABECERA_CUE) return fila
  }
  throw new Error('No se encontró la fila de encabezado del libro')
}

function encabezados(hoja: ExcelJS.Worksheet, fila: number): string[] {
  const valores: string[] = []
  for (let columna = 1; columna <= hoja.columnCount; columna++) {
    const valor = hoja.getCell(fila, columna).value
    if (typeof valor === 'string' && valor !== '') valores.push(valor)
  }
  return valores
}

// Data rows run from the row under the header until the first empty CUE cell.
function filasDeDatos(hoja: ExcelJS.Worksheet, encabezado: number, columnas: string[]): FilaExportada[] {
  const filas: FilaExportada[] = []
  for (let fila = encabezado + 1; hoja.getCell(fila, 1).value; fila++) {
    const registro: FilaExportada = {}
    columnas.forEach((columna, indice) => {
      registro[columna] = hoja.getCell(fila, indice + 1).value
    })
    filas.push(registro)
  }
  return filas
}

// Plain, deterministic dump of every sheet. Cell texts that embed the generation time are replaced.
function volcarLibro(libro: ExcelJS.Workbook): unknown {
  return libro.worksheets.map((hoja) => {
    const filas: unknown[][] = []
    for (let fila = 1; fila <= hoja.rowCount; fila++) {
      const celdas: unknown[] = []
      for (let columna = 1; columna <= hoja.columnCount; columna++) {
        const celda = hoja.getCell(fila, columna)
        const valor = celda.value
        if (typeof valor === 'string' && valor.startsWith(ETIQUETA_GENERADO)) {
          celdas.push('<generado>')
        } else if (typeof valor === 'object' && valor !== null && !(valor instanceof Date)) {
          celdas.push(celda.text)
        } else {
          celdas.push(valor)
        }
      }
      filas.push(celdas)
    }
    return { nombre: hoja.name, filas }
  })
}

const CUES_CONOCIDOS = [CUE_ANEXO_OPERADOR, '1800893-00', '1801855-00', '1800405-00'] as const

test('exportar XLSX (admin): una hoja, columnas base, 30 escuelas con coordenadas y valores conocidos del roster', async ({ apiAdmin }) => {
  const respuesta = await apiAdmin.get(RUTA_EXPORTAR)
  expect(respuesta.status()).toBe(200)
  expect(respuesta.headers()['content-type']).toContain('spreadsheetml')

  const libro = await leerLibro(respuesta)
  expect(libro.worksheets.map((h) => h.name)).toEqual(['Listado'])

  const hoja = libro.getWorksheet('Listado')!
  const fila = filaDeEncabezado(hoja)
  const columnas = encabezados(hoja, fila)
  // Without `estado`, the workbook carries the base columns plus the extra columns of the default set.
  expect(columnas).toEqual([
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
  ])

  const filas = filasDeDatos(hoja, fila, columnas)
  // The workbook lists the schools that have coordinates; the two without them are left out.
  expect(filas).toHaveLength(ESPERADOS.escuelas.conCoordenadas)

  for (const cue of CUES_CONOCIDOS) {
    const esperada = ESCUELAS.find((e) => e.cueAnexo === cue)
    expect(esperada, cue).toBeDefined()
    const obtenida = filas.find((f) => f['CUE anexo'] === cue)
    expect(obtenida).toMatchObject({
      'CUE anexo': esperada!.cueAnexo,
      Escuela: esperada!.nombre,
      Departamento: esperada!.departamento,
      Localidad: esperada!.localidad,
    })
  }

  compararSnapshot('hidro-exportar-xlsx', volcarLibro(libro))
})

test('exportar XLSX (consulta-infra): mismas columnas y filas que admin, sin columnas nominales', async ({ apiAdmin, apiConsultaInfra }) => {
  const admin = await apiAdmin.get(RUTA_EXPORTAR)
  const respuesta = await apiConsultaInfra.get(RUTA_EXPORTAR)
  expect(respuesta.status()).toBe(200)

  const libro = await leerLibro(respuesta)
  const hoja = libro.getWorksheet('Listado')!
  const fila = filaDeEncabezado(hoja)
  const columnas = encabezados(hoja, fila)

  const libroAdmin = await leerLibro(admin)
  const hojaAdmin = libroAdmin.getWorksheet('Listado')!
  const filaAdmin = filaDeEncabezado(hojaAdmin)
  expect(columnas).toEqual(encabezados(hojaAdmin, filaAdmin))
  expect(filasDeDatos(hoja, fila, columnas)).toHaveLength(ESPERADOS.escuelas.conCoordenadas)

  compararSnapshot('hidro-exportar-xlsx-consulta-infra', volcarLibro(libro))
})

test('exportar sin sesión: 401 con mensaje de no autenticado', async ({ apiAnonimo }) => {
  const respuesta = await apiAnonimo.get(RUTA_EXPORTAR)
  expect(respuesta.status()).toBe(401)
  const cuerpo = await respuesta.json()
  compararSnapshot('hidro-exportar-xlsx-anonimo', { status: respuesta.status(), cuerpo })
})

for (const aislada of ESPERADOS_RADAR.aisladas) {
  test(`accesos ${aislada.cueAnexo}: índice de aislamiento, cruces de agua y ruta disponible`, async ({ apiAdmin }) => {
    const respuesta = await apiAdmin.get(`${RUTA_ACCESOS}/${aislada.cueAnexo}`)
    expect(respuesta.status()).toBe(200)
    const cuerpo = (await respuesta.json()) as Record<string, unknown>

    expect(cuerpo).toMatchObject({
      cueAnexo: aislada.cueAnexo,
      disponible: true,
      indice: aislada.indiceAislamiento,
      cruces: { total: aislada.crucesAguaCount, conPuente: 0, conVado: aislada.crucesAguaCount },
      atribucion: '© OpenStreetMap contributors',
    })

    compararSnapshot(`hidro-exportar-accesos-${aislada.cueAnexo}`, cuerpo)
  })
}
