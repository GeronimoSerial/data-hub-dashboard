import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { DatasetV29 } from './tipos'

const dataset = JSON.parse(
  readFileSync(join(__dirname, 'data', 'v29.json'), 'utf8'),
) as DatasetV29

describe('corte V29 normalizado', () => {
  it('conserva los totales del corte', () => {
    const { escuelas, cobertura } = dataset
    expect(escuelas).toHaveLength(265)
    expect(new Set(escuelas.map((e) => e.cue)).size).toBe(265)
    expect(escuelas.reduce((suma, e) => suma + e.matricula, 0)).toBe(1376)
    expect(cobertura.alumnos).toBe(1376)
    expect(escuelas.every((e) => e.matricula >= 1 && e.matricula <= 10)).toBe(true)
    expect(escuelas.every((e) => Number.isFinite(e.lat) && Number.isFinite(e.lon))).toBe(true)
  })

  it('conserva importes, POF vacía y la ausencia de importe como null', () => {
    const { escuelas } = dataset
    expect(escuelas.filter((e) => (e.sueldosTotal ?? 0) > 0)).toHaveLength(262)
    expect(escuelas.filter((e) => e.sueldosTotal === null).map((e) => e.cue).sort()).toEqual([
      '1800027-00',
      '1800521-00',
      '1801048-00',
    ])
    expect(escuelas.filter((e) => Object.keys(e.pof).length > 0)).toHaveLength(0)
  })

  it('conserva 64 centros únicos, 62 zonas ocupadas y 89 aislados', () => {
    const { escuelas, centros } = dataset
    expect(centros).toHaveLength(64)
    expect(new Set(centros.map((c) => c.id)).size).toBe(64)
    const zonas = new Set(escuelas.map((e) => e.zona).filter((z) => z.startsWith('Zona ')))
    expect(zonas.size).toBe(62)
    expect(escuelas.filter((e) => e.zona === 'Aislado')).toHaveLength(89)
  })

  it('no convierte la historia faltante en cero', () => {
    const { escuelas, cobertura } = dataset
    expect(cobertura.historiaPorAnio).toMatchObject({ '2023': 224, '2024': 234, '2025': 244, '2026': 265 })
    const sin2023 = escuelas.filter((e) => !('2023' in e.historia))
    expect(sin2023).toHaveLength(265 - 224)
  })

  it('informa referencias y la diferencia con las claves de oferta', () => {
    const { referencias, ofertaPorCue } = dataset
    expect(referencias).toHaveLength(1166)
    expect(referencias.filter((r) => r.primaria)).toHaveLength(888)
    expect(referencias.filter((r) => r.secundaria)).toHaveLength(339)
    expect(Object.keys(ofertaPorCue)).toHaveLength(1167)
    // El plan esperaba 1 clave de diferencia; el cruce real deja 4 referencias sin
    // oferta y 5 claves de oferta sin referencia (1166 - 4 + 5 = 1167).
    const cues = new Set(referencias.map((r) => r.cue))
    expect(referencias.filter((r) => !(r.cue in ofertaPorCue))).toHaveLength(4)
    expect(Object.keys(ofertaPorCue).filter((cue) => !cues.has(cue))).toHaveLength(5)
  })
})
