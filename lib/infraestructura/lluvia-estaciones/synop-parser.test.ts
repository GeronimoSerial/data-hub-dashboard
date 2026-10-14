import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parsearLineaOgimet, parsearRespuestaOgimet } from './synop-parser'

const fixture20261013 = readFileSync(
  new URL('./__fixtures__/ogimet-87166-20261013.txt', import.meta.url),
  'utf8',
)
const fixture20261012 = readFileSync(
  new URL('./__fixtures__/ogimet-87166-20261012.txt', import.meta.url),
  'utf8',
)

const lineaDe = (hora: string, fecha: string, mensaje: string) =>
  `87166,${fecha},${hora},00,${mensaje}=`

describe('parsearLineaOgimet', () => {
  it('decodifica 06Z del 13/10 (69961) como 0.6 mm en 6 h, sección 1', () => {
    const registros = parsearLineaOgimet(
      '87166,2026,10,13,06,00,AAXX 13063 87166 11260 81405 10172 20169 30005 40078 57025 69961 70252 886// 333 56299 88706=',
    )
    expect(registros).toEqual([{
      estacionWmo: '87166',
      observadoEn: '2026-10-13T06:00:00.000Z',
      periodoHoras: 6,
      precipitacionMm: 0.6,
      traza: false,
      seccion: 1,
    }])
  })

  it('decodifica 12Z del 13/10 como dos registros: sección 1 (60164, 16 mm 24 h) y sección 3 (60031, 3 mm 6 h)', () => {
    const registros = parsearLineaOgimet(
      '87166,2026,10,13,12,00,AAXX 13123 87166 01260 81608 10163 20155 30026 40101 53011 60164 72052 886// 333 10172 20146 56399 60031 87705 88615=',
    )
    expect(registros).toEqual([
      {
        estacionWmo: '87166',
        observadoEn: '2026-10-13T12:00:00.000Z',
        periodoHoras: 24,
        precipitacionMm: 16,
        traza: false,
        seccion: 1,
      },
      {
        estacionWmo: '87166',
        observadoEn: '2026-10-13T12:00:00.000Z',
        periodoHoras: 6,
        precipitacionMm: 3,
        traza: false,
        seccion: 3,
      },
    ])
  })

  it('decodifica 18Z del 13/10 (69921) como 0.2 mm en 6 h', () => {
    const registros = parsearLineaOgimet(
      '87166,2026,10,13,18,00,AAXX 13183 87166 11360 81405 10201 20175 30018 40092 57016 69921 70252 886// 333 56399 85708 88616=',
    )
    expect(registros).toEqual([
      {
        estacionWmo: '87166',
        observadoEn: '2026-10-13T18:00:00.000Z',
        periodoHoras: 6,
        precipitacionMm: 0.2,
        traza: false,
        seccion: 1,
      },
    ])
  })

  it('decodifica 00Z del 14/10 (60011) como 1 mm en 6 h', () => {
    const registros = parsearLineaOgimet(
      '87166,2026,10,14,00,00,AAXX 14003 87166 11460 81602 10185 20179 30041 40114 53019 60011 70252 885// 333 10202 20163 56499 88615=',
    )
    expect(registros).toEqual([
      {
        estacionWmo: '87166',
        observadoEn: '2026-10-14T00:00:00.000Z',
        periodoHoras: 6,
        precipitacionMm: 1,
        traza: false,
        seccion: 1,
      },
    ])
  })

  it('decodifica 18Z del 12/10 (60131) como 13 mm en 6 h', () => {
    const registros = parsearLineaOgimet(
      '87166,2026,10,12,18,00,AAXX 12183 87166 11209 81608 10157 20152 30016 40089 58016 60131 75596 887// 333 56499 86704 88706=',
    )
    expect(registros).toEqual([
      {
        estacionWmo: '87166',
        observadoEn: '2026-10-12T18:00:00.000Z',
        periodoHoras: 6,
        precipitacionMm: 13,
        traza: false,
        seccion: 1,
      },
    ])
  })

  it('decodifica 990 como traza: 0 mm con traza true', () => {
    const registros = parsearLineaOgimet(
      lineaDe('06', '2026,10,13', 'AAXX 13063 87166 11260 81405 10172 20169 30005 40078 57025 69901 70252 886// 333 56299 88706'),
    )
    expect(registros).toEqual([
      {
        estacionWmo: '87166',
        observadoEn: '2026-10-13T06:00:00.000Z',
        periodoHoras: 6,
        precipitacionMm: 0,
        traza: true,
        seccion: 1,
      },
    ])
  })

  it('con iR=3 y sin grupo 6 a las 12Z emite un registro de 0 mm en 6 h', () => {
    const registros = parsearLineaOgimet(
      '87166,2026,10,13,12,00,AAXX 13123 87166 31260 81608 10163 20155 30026 40101 53011 75152 886// 333 56399 88615=',
    )
    expect(registros).toEqual([
      {
        estacionWmo: '87166',
        observadoEn: '2026-10-13T12:00:00.000Z',
        periodoHoras: 6,
        precipitacionMm: 0,
        traza: false,
        seccion: 1,
      },
    ])
  })

  it('con iR=3 a una hora no sinóptica no emite registro', () => {
    expect(
      parsearLineaOgimet(
        '87166,2026,10,13,07,00,AAXX 13074 87166 31260 81405 10169 20167 30010 40083 55015 886// 333 56300 88704=',
      ),
    ).toEqual([])
  })

  it('con iR=4 (hora 07Z del 13/10) no emite registros', () => {
    expect(
      parsearLineaOgimet(
        '87166,2026,10,13,07,00,AAXX 13074 87166 42260 81405 10169 20167 30010 40083 55015 886// 333 56300 88704=',
      ),
    ).toEqual([])
  })

  it('una línea NIL no emite registros', () => {
    expect(parsearLineaOgimet('87166,2026,10,13,05,00,AAXX 13014 87289 NIL=')).toEqual([])
  })

  it('una línea vacía o mal formada no emite registros', () => {
    expect(parsearLineaOgimet('')).toEqual([])
    expect(parsearLineaOgimet('basura sin formato')).toEqual([])
  })
})

describe('parsearRespuestaOgimet', () => {
  it('decodifica el fixture del 13/10 en 6 registros verificados a mano', () => {
    const registros = parsearRespuestaOgimet(fixture20261013)
    expect(registros).toHaveLength(6)
    expect(registros).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ observadoEn: '2026-10-13T00:00:00.000Z', precipitacionMm: 0.1, periodoHoras: 6, seccion: 1 }),
        expect.objectContaining({ observadoEn: '2026-10-13T06:00:00.000Z', precipitacionMm: 0.6, periodoHoras: 6, seccion: 1 }),
        expect.objectContaining({ observadoEn: '2026-10-13T12:00:00.000Z', precipitacionMm: 16, periodoHoras: 24, seccion: 1 }),
        expect.objectContaining({ observadoEn: '2026-10-13T12:00:00.000Z', precipitacionMm: 3, periodoHoras: 6, seccion: 3 }),
        expect.objectContaining({ observadoEn: '2026-10-13T18:00:00.000Z', precipitacionMm: 0.2, periodoHoras: 6, seccion: 1 }),
        expect.objectContaining({ observadoEn: '2026-10-14T00:00:00.000Z', precipitacionMm: 1, periodoHoras: 6, seccion: 1 }),
      ]),
    )
  })

  it('decodifica el fixture del 12/10 en 3 registros verificados a mano', () => {
    const registros = parsearRespuestaOgimet(fixture20261012)
    expect(registros).toHaveLength(3)
    expect(registros).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ observadoEn: '2026-10-12T12:00:00.000Z', precipitacionMm: 1, periodoHoras: 24, seccion: 1 }),
        expect.objectContaining({ observadoEn: '2026-10-12T12:00:00.000Z', precipitacionMm: 0.9, periodoHoras: 6, seccion: 3 }),
        expect.objectContaining({ observadoEn: '2026-10-12T18:00:00.000Z', precipitacionMm: 13, periodoHoras: 6, seccion: 1 }),
      ]),
    )
  })

  it('omite líneas vacías, NIL y mal formadas', () => {
    const texto = [
      '',
      '87166,2026,10,13,05,00,AAXX 13014 87289 NIL=',
      'linea mal formada',
      '87166,2026,10,13,06,00,AAXX 13063 87166 11260 81405 10172 20169 30005 40078 57025 69961 70252 886// 333 56299 88706=',
      '',
    ].join('\n')
    expect(parsearRespuestaOgimet(texto)).toHaveLength(1)
  })
})
