import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  EstructuraHistoricoCambiadaError,
  estadisticasNivel,
  parsearHistoricoPrefectura,
} from './historico-parser'

const fixture = readFileSync(
  new URL('./__fixtures__/prefectura-historico-610.html', import.meta.url),
  'utf8',
)

function filaHtml(fecha: string, hora: string, registro: string): string {
  return `<tr><th scope="row">1</th><td><i class="fa fa-calendar"></i> ${fecha} <i class="fa fa-clock-o"></i> ${hora}</td><td>${registro}</td></tr>`
}

function paginaConFilas(filas: string): string {
  return `<html><body><table><thead><tr><th>#</th><th>Fecha</th><th>Registro (Mts)</th></tr></thead><tbody>${filas}</tbody></table></body></html>`
}

describe('parsearHistoricoPrefectura', () => {
  it('parsea las 40 lecturas del fixture', () => {
    const lecturas = parsearHistoricoPrefectura(fixture)

    expect(lecturas).toHaveLength(40)
  })

  it('ordena ascendente: la primera es la más antigua (5.53 a las 2025-10-13 12:00 local)', () => {
    const lecturas = parsearHistoricoPrefectura(fixture)

    expect(lecturas[0]).toEqual({
      medidaEn: '2025-10-13T15:00:00.000Z',
      lecturaM: 5.53,
    })
  })

  it('la última es la más reciente (9.29 a las 2026-10-13 06:00 local)', () => {
    const lecturas = parsearHistoricoPrefectura(fixture)

    expect(lecturas.at(-1)).toEqual({
      medidaEn: '2026-10-13T09:00:00.000Z',
      lecturaM: 9.29,
    })
  })

  it('acepta valores negativos y decimales con coma', () => {
    const html = paginaConFilas(
      filaHtml('2026-01-02', '00:00', '-0.31 Mts') +
        filaHtml('2026-01-01', '00:00', '1,25 Mts'),
    )

    const lecturas = parsearHistoricoPrefectura(html)

    expect(lecturas).toEqual([
      { medidaEn: '2026-01-01T03:00:00.000Z', lecturaM: 1.25 },
      { medidaEn: '2026-01-02T03:00:00.000Z', lecturaM: -0.31 },
    ])
  })

  it('omite filas sin valor numérico y deduplica por medidaEn', () => {
    const html = paginaConFilas(
      filaHtml('2026-01-01', '06:00', '2.00 Mts') +
        filaHtml('2026-01-01', '06:00', '2.00 Mts') +
        filaHtml('2026-01-01', '09:00', 'S/D'),
    )

    const lecturas = parsearHistoricoPrefectura(html)

    expect(lecturas).toEqual([{ medidaEn: '2026-01-01T09:00:00.000Z', lecturaM: 2 }])
  })

  it('lanza EstructuraHistoricoCambiadaError si falta la cabecera "Registro"', () => {
    const html = fixture.replace('Registro (Mts)', 'Altura')

    expect(() => parsearHistoricoPrefectura(html)).toThrow(
      EstructuraHistoricoCambiadaError,
    )
  })

  it('lanza EstructuraHistoricoCambiadaError si no hay tbody', () => {
    expect(() =>
      parsearHistoricoPrefectura('<html><table><tr><td>x</td></tr></table></html>'),
    ).toThrow(EstructuraHistoricoCambiadaError)
  })

  it('devuelve [] para una tabla con tbody vacío', () => {
    expect(parsearHistoricoPrefectura(paginaConFilas(''))).toEqual([])
  })
})

describe('estadisticasNivel', () => {
  it('devuelve null sin lecturas', () => {
    expect(estadisticasNivel([])).toBeNull()
  })

  it('calcula n, mediana y percentiles del fixture', () => {
    const lecturas = parsearHistoricoPrefectura(fixture)

    const stats = estadisticasNivel(lecturas)

    // Valores ordenados: 20 de la mitad antigua (4.98 .. 6.26), 9 x 9.20,
    // 9.22, 9.23, 9.25, 6 x 9.26, 9.28, 9.29. Mediana = (6.26 + 9.20) / 2.
    // p10: índice 3.9 -> 5.19 + 0.9 * (5.22 - 5.19) = 5.217.
    // p90: índice 35.1 -> 9.26.
    expect(stats).not.toBeNull()
    expect(stats!.n).toBe(40)
    expect(stats!.mediana).toBeCloseTo(7.73, 10)
    expect(stats!.p10).toBeCloseTo(5.217, 10)
    expect(stats!.p90).toBeCloseTo(9.26, 10)
    expect(stats!.desde).toBe('2025-10-13T15:00:00.000Z')
    expect(stats!.hasta).toBe('2026-10-13T09:00:00.000Z')
  })
})
