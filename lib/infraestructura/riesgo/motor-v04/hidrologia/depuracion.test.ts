import { describe, expect, it } from 'vitest'
import { depurarSerieDiaria, INICIO_HISTORIA_ESTACION_V04 } from './depuracion'

const dias = (desde: string, valores: number[]) =>
  valores.map((valorM, i) => ({ fecha: new Date(Date.parse(`${desde}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10), valorM }))

describe('depurarSerieDiaria', () => {
  it('descarta el pico aislado de Ituzaingó (9,72 m el 2024-08-17)', () => {
    const filas = dias('2024-08-12', [0.35, 0.6, 0.8, 0.7, 0.8, 9.72, 0.3, 0.2, 0.9, 0.5, 0.8, 1.1])
    const { filas: limpias, descartadas } = depurarSerieDiaria(filas, 'pna-ituzaingo')
    expect(descartadas.map((d) => d.fecha)).toEqual(['2024-08-17'])
    expect(limpias).toHaveLength(11)
  })

  it('descarta los picos dobles y simples de Empedrado (12,33/12,44/12,89 m)', () => {
    const filas = dias('2026-09-24', [4.23, 4.28, 4.18, 12.33, 12.44, 4.06, 5.74, 4, 12.89, 3.8, 3.85, 4, 4.48, 4.1])
    const { descartadas } = depurarSerieDiaria(filas, 'pna-empedrado')
    expect(descartadas.map((d) => d.fecha)).toEqual(['2026-09-27', '2026-09-28', '2026-10-02'])
  })

  it('descarta valores no físicos (Santo Tomé 1e12 el 2017-11-26)', () => {
    const filas = dias('2017-11-22', [3.78, 3.58, 3.5, 3.34, 1e12, 3.62, 3.33, 3.3])
    const { descartadas } = depurarSerieDiaria(filas, 'pna-santo-tome')
    expect(descartadas.map((d) => d.fecha)).toEqual(['2017-11-26'])
  })

  it('conserva un pico real de crecida (subida y bajada de 2 m/día)', () => {
    const filas = dias('2023-11-01', [4, 6, 8, 10, 12, 10, 8, 6, 4])
    expect(depurarSerieDiaria(filas, 'pna-santo-tome').descartadas).toEqual([])
  })

  it('Ituzaingó sólo usa historia desde 1995 (regulación de Yacyretá)', () => {
    expect(INICIO_HISTORIA_ESTACION_V04['pna-ituzaingo']).toBe('1995-01-01')
    const filas = [...dias('1994-12-30', [3, 3, 3, 3, 3])]
    const { filas: limpias } = depurarSerieDiaria(filas, 'pna-ituzaingo')
    expect(limpias.map((f) => f.fecha)).toEqual(['1995-01-01', '1995-01-02', '1995-01-03'])
    expect(depurarSerieDiaria(filas, 'pna-corrientes').filas).toHaveLength(5)
  })
})
