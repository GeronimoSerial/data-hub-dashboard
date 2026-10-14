import { describe, expect, it } from 'vitest'
import {
  elegirUmbralesClimatologia,
  esVersionImerg,
  type FilaUmbralClimatologia,
} from './fuente-climatologia'

const VERSION_IMERG = 'climatologia-imerg-v1'
const VERSION_ERA5 = 'climatologia-era5-v1'

function fila(
  percentil: string,
  valor: number,
  version: string,
): FilaUmbralClimatologia {
  return { percentil, valor, version }
}

describe('esVersionImerg', () => {
  it('reconoce las versiones de la climatología IMERG', () => {
    expect(esVersionImerg(VERSION_IMERG)).toBe(true)
    expect(esVersionImerg('climatologia-imerg-v2')).toBe(true)
  })

  it('rechaza otras fuentes y versiones de caudal', () => {
    expect(esVersionImerg(VERSION_ERA5)).toBe(false)
    expect(esVersionImerg('climatologia-caudal-v1')).toBe(false)
  })
})

describe('elegirUmbralesClimatologia', () => {
  it('usa IMERG completo aunque las filas ERA5 aparezcan primero', () => {
    const filas = [
      fila('p90', 1, VERSION_ERA5),
      fila('p95', 2, VERSION_ERA5),
      fila('p99', 3, VERSION_ERA5),
      fila('p90', 10, VERSION_IMERG),
      fila('p95', 20, VERSION_IMERG),
      fila('p99', 30, VERSION_IMERG),
    ]

    expect(elegirUmbralesClimatologia(filas)).toEqual({
      p90: 10,
      p95: 20,
      p99: 30,
    })
  })

  it('si IMERG está incompleto usa ERA5 y no toma nada de IMERG', () => {
    const filas = [
      fila('p90', 10, VERSION_IMERG),
      fila('p95', 20, VERSION_IMERG),
      fila('p90', 1, VERSION_ERA5),
      fila('p95', 2, VERSION_ERA5),
      fila('p99', 3, VERSION_ERA5),
    ]

    expect(elegirUmbralesClimatologia(filas)).toEqual({
      p90: 1,
      p95: 2,
      p99: 3,
    })
  })

  it('con solo ERA5 toma la primera fila por percentil', () => {
    const filas = [
      fila('p90', 5, VERSION_ERA5),
      fila('p90', 4, VERSION_ERA5),
      fila('p95', 6, VERSION_ERA5),
      fila('p99', 8, VERSION_ERA5),
      fila('p99', 7, VERSION_ERA5),
    ]

    expect(elegirUmbralesClimatologia(filas)).toEqual({
      p90: 5,
      p95: 6,
      p99: 8,
    })
  })

  it('devuelve null cuando ninguna fuente está completa', () => {
    const filas = [
      fila('p90', 10, VERSION_IMERG),
      fila('p95', 20, VERSION_IMERG),
      fila('p90', 1, VERSION_ERA5),
      fila('p99', 3, VERSION_ERA5),
    ]

    expect(elegirUmbralesClimatologia(filas)).toBeNull()
  })

  it('devuelve null con lista vacía', () => {
    expect(elegirUmbralesClimatologia([])).toBeNull()
  })
})
