import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  EstructuraPrefecturaCambiadaError,
  parsearAlturasPrefectura,
} from './prefectura-parser'

const fixture = readFileSync(
  new URL('./__fixtures__/prefectura-index.html', import.meta.url),
  'utf8',
)

const ENCABEZADOS = [
  'Puerto',
  'Río',
  'Ult. registro',
  'Variación',
  'Periodo',
  'Fecha Hora',
  'Estado',
  '',
  'Registro Anterior',
  'Fecha Anterior',
  'Alerta',
  'Evacuación',
  'Hist.',
]

function celda(valor: string, etiqueta?: string): string {
  return etiqueta ? `<td data-label="${etiqueta}">${valor}</td>` : `<td>${valor}</td>`
}

function fila(puerto: string, valores: string[]): string {
  return `<tr><th data-label="Puerto:">${puerto}</th>${valores.map((v) => celda(v)).join('')}</tr>`
}

function htmlConFilas(filas: string[], encabezados: string[] = ENCABEZADOS): string {
  const cabecera = encabezados.map((h) => `<th>${h}</th>`).join('')
  return `<html><body><table class="table table-hover fpTable"><thead><tr>${cabecera}</tr></thead><tbody>${filas.join('')}</tbody></table></body></html>`
}

// Valores posicionales después del Puerto: Río, Ult., Var., Periodo, Fecha, Estado,
// icono, Reg. anterior, Fecha anterior, Alerta, Evacuación, Hist.
function filaValida(
  puerto: string,
  overrides: Partial<{
    rio: string
    ultimo: string
    variacion: string
    periodo: string
    fecha: string
    estado: string
    anterior: string
    fechaAnterior: string
    alerta: string
    evacuacion: string
    hist: string
  }> = {},
): string {
  const v = {
    rio: 'URUGUAY',
    ultimo: '9.33',
    variacion: '0.02',
    periodo: '2',
    fecha: '13/OCT/26 - 1400',
    estado: 'CRECE',
    anterior: '9.31',
    fechaAnterior: '13/OCT/26 - 1200',
    alerta: '7.50',
    evacuacion: '8.50',
    hist: '/alturas/?page=historico&tiempo=7&id=610',
    ...overrides,
  }
  return fila(puerto, [
    v.rio,
    v.ultimo,
    v.variacion,
    v.periodo,
    `<b>${v.fecha}</b>`,
    v.estado,
    '<img src="img/arriba.svg" width="40" />',
    v.anterior,
    v.fechaAnterior,
    v.alerta,
    v.evacuacion,
    `<a href="${v.hist}" target="_blank">icono</a>`,
  ])
}

describe('parsearAlturasPrefectura (fixture real recortado)', () => {
  const filas = parsearAlturasPrefectura(fixture)

  it('excluye estaciones de caudal en m³/s (Caxia, Capanema, Guayra, Itaipú)', () => {
    const puertos = filas.map((f) => f.puerto)
    expect(puertos).not.toContain('CAXIA (BRASIL)')
    expect(puertos).not.toContain('REPRESA CAPANEMA (BRASIL)')
    expect(puertos).not.toContain('GUAYRA (BRASIL)')
    expect(puertos).not.toContain('REPRESA ITAIPU (BRASIL)')
    expect(filas).toHaveLength(7)
  })

  it('parsea Paso de los Libres con fechas en UTC y umbrales', () => {
    const paso = filas.find((f) => f.puerto === 'PASO DE LOS LIBRES')
    expect(paso).toEqual({
      puerto: 'PASO DE LOS LIBRES',
      rio: 'URUGUAY',
      lecturaM: 9.33,
      variacionM: 0.02,
      periodoHoras: 2,
      medidaEn: '2026-10-13T17:00:00.000Z',
      estadoPublicado: 'EVACUACION CRECE',
      lecturaAnteriorM: 9.31,
      medidaAnteriorEn: '2026-10-13T15:00:00.000Z',
      alertaM: 7.5,
      evacuacionM: 8.5,
      idHistorico: 610,
      inconsistente: false,
      motivosInconsistencia: [],
    })
  })

  it('convierte S/E y guiones a null y conserva el estado literal', () => {
    const bouvier = filas.find((f) => f.puerto === 'BOUVIER')
    expect(bouvier).toMatchObject({
      lecturaM: null,
      variacionM: null,
      estadoPublicado: 'S/E.',
      lecturaAnteriorM: null,
      alertaM: 6,
      evacuacionM: 6.4,
      inconsistente: false,
    })
  })

  it('lee el id histórico de cada enlace', () => {
    expect(filas.find((f) => f.puerto === 'ANDRESITO')?.idHistorico).toBe(10)
    expect(filas.find((f) => f.puerto === 'IGUAZU')?.idHistorico).toBe(20)
  })

  it('no marca como inconsistente ninguna fila real del extracto', () => {
    expect(filas.every((f) => !f.inconsistente)).toBe(true)
  })
})

describe('parsearAlturasPrefectura (casos sintéticos)', () => {
  it('marca lectura 0 con estado CRECE sin descartar la fila', () => {
    const html = htmlConFilas([filaValida('SANTA FE', { ultimo: '0.00', estado: 'CRECE' })])
    const [fila] = parsearAlturasPrefectura(html)
    expect(fila).toBeDefined()
    expect(fila?.inconsistente).toBe(true)
    expect(fila?.motivosInconsistencia).toContain('lectura_cero_con_crece')
  })

  it('marca lectura nula con estado distinto de S/E', () => {
    const html = htmlConFilas([filaValida('BOUVIER', { ultimo: 'S/E', estado: 'BAJA' })])
    const [fila] = parsearAlturasPrefectura(html)
    expect(fila?.inconsistente).toBe(true)
    expect(fila?.motivosInconsistencia).toContain('sin_lectura_con_estado')
  })

  it('marca fecha no interpretable con medidaEn nula', () => {
    const html = htmlConFilas([filaValida('ITATI', { fecha: '32/FOO/26 - 9999' })])
    const [fila] = parsearAlturasPrefectura(html)
    expect(fila?.medidaEn).toBeNull()
    expect(fila?.inconsistente).toBe(true)
    expect(fila?.motivosInconsistencia).toContain('fecha_no_interpretable:medidaEn')
  })

  it('interpreta meses en español y hora de Argentina (UTC-3)', () => {
    const html = htmlConFilas([filaValida('CORRIENTES', { fecha: '01/DIC/26 - 0030' })])
    const [fila] = parsearAlturasPrefectura(html)
    expect(fila?.medidaEn).toBe('2026-12-01T03:30:00.000Z')
  })

  it('excluye Itaipú con acento y mayúsculas distintas', () => {
    const html = htmlConFilas([
      fila('REPRESA ITAIPÚ (BRASIL)', ['PARANA', '204.26', '31.08', '24', '<b>13/OCT/26 - 0900</b>', 'CRECE', '', '173.18', '12/OCT/26 - 0900', '-', '-', '<a href="/alturas/?page=historico&tiempo=7&id=9">x</a>']),
      filaValida('CORRIENTES'),
    ])
    expect(parsearAlturasPrefectura(html).map((f) => f.puerto)).toEqual(['CORRIENTES'])
  })

  it('convierte umbrales con guion a null', () => {
    const html = htmlConFilas([filaValida('ITATI', { alerta: '-', evacuacion: '-' })])
    const [fila] = parsearAlturasPrefectura(html)
    expect(fila?.alertaM).toBeNull()
    expect(fila?.evacuacionM).toBeNull()
    expect(fila?.inconsistente).toBe(false)
  })

  it('deja idHistorico en null cuando el enlace no tiene id', () => {
    const html = htmlConFilas([filaValida('ITATI', { hist: '/alturas/' })])
    expect(parsearAlturasPrefectura(html)[0]?.idHistorico).toBeNull()
  })

  it('lanza EstructuraPrefecturaCambiadaError si falta la tabla fpTable', () => {
    const html = '<html><body><table class="otra"><tr><td>x</td></tr></table></body></html>'
    expect(() => parsearAlturasPrefectura(html)).toThrow(EstructuraPrefecturaCambiadaError)
  })

  it('lanza EstructuraPrefecturaCambiadaError si cambian las etiquetas de encabezado', () => {
    const cambiados = ENCABEZADOS.map((h) => (h === 'Alerta' ? 'Alarma' : h))
    const html = htmlConFilas([filaValida('ITATI')], cambiados)
    expect(() => parsearAlturasPrefectura(html)).toThrow(EstructuraPrefecturaCambiadaError)
  })
})
