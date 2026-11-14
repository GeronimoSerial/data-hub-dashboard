import { describe, expect, it } from 'vitest'
import { construirSnapshotRenaper, extraerSerieRenaper, DEPARTAMENTOS_ESPERADOS_CORRIENTES } from './renaper-natalidad'

const series = (value = 100) => [{ data: Array.from({ length: 14 }, (_, i) => ({ x: 2012 + i, y: value + i })) }]
const departamentos = (cantidad: number) =>
  Object.fromEntries(Array.from({ length: cantidad }, (_, i) => [`DEPT ${i}`, extraerSerieRenaper(series(1))]))
const EXTRAIDO_EN = '2026-11-04T00:00:00.000Z'

describe('construirSnapshotRenaper department count', () => {
  it('uses 25 as the Corrientes default', () => {
    expect(DEPARTAMENTOS_ESPERADOS_CORRIENTES).toBe(25)
  })

  it('rejects 24 Corrientes departments with the exact message', () => {
    expect(() => construirSnapshotRenaper(departamentos(24), extraerSerieRenaper(series(100)), EXTRAIDO_EN))
      .toThrow(/^Expected all 25 Corrientes departments$/)
  })

  it('accepts 25 Corrientes departments', () => {
    expect(() => construirSnapshotRenaper(departamentos(25), extraerSerieRenaper(series(100)), EXTRAIDO_EN)).not.toThrow()
  })

  it('accepts an explicit expected count and names it in the error', () => {
    expect(() => construirSnapshotRenaper(departamentos(3), extraerSerieRenaper(series(100)), EXTRAIDO_EN, 3)).not.toThrow()
    expect(() => construirSnapshotRenaper(departamentos(2), extraerSerieRenaper(series(100)), EXTRAIDO_EN, 3))
      .toThrow(/^Expected all 3 Corrientes departments$/)
  })
})
