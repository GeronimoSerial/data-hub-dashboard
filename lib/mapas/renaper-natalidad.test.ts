import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { extraerSerieRenaper, construirSnapshotRenaper } from './renaper-natalidad'

const series = (value = 100) => [{ data: Array.from({ length: 14 }, (_, i) => ({ x: 2012 + i, y: value + i })) }]
describe('RENAPER births', () => {
  it('reads integer chart values rather than formatted thousands', () => {
    expect(extraerSerieRenaper(series(12064))['2025']).toBe(12077)
  })
  it('rejects incomplete years and invalid counts instead of inventing zeros', () => {
    expect(() => extraerSerieRenaper([{ data: [{ x: 2025, y: 12077 }] }])).toThrow()
    expect(() => extraerSerieRenaper(series(-100))).toThrow()
  })
  it('keeps the extracted 2025 provincial count distinct from departmental coverage', () => {
    const saved = JSON.parse(readFileSync(new URL('../../public/data/natalidad/renaper.json', import.meta.url), 'utf8'))
    expect(saved.provincia.serie['2025']).toBe(12077)
    expect(saved.departamentos.CAPITAL.serie['2025']).toBe(3988)
    expect(saved.departamentos.SAUCE.serie['2025']).toBe(104)
    expect(saved.conciliacion['2025']).toEqual({ sumaDepartamentos: 12076, diferenciaProvincia: 1 })
    expect(Object.values(saved.departamentos as Record<string, { serie: Record<string, number> }>).every((row) => Object.keys(row.serie).length === 14)).toBe(true)
  })
  it('retains province totals and reports differences from department sums', () => {
    const departments = Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`DEPT ${i}`, extraerSerieRenaper(series(1))]))
    const snapshot = construirSnapshotRenaper(departments, extraerSerieRenaper(series(100)), '2026-11-04T00:00:00.000Z')
    expect(snapshot.meta.fuente.nombre).toContain('RENAPER')
    expect(snapshot.provincia.serie['2012']).toBe(100)
    expect(snapshot.conciliacion['2012']).toEqual({ sumaDepartamentos: 25, diferenciaProvincia: 75 })
    expect(Object.keys(snapshot.departamentos)).toHaveLength(25)
  })
})
