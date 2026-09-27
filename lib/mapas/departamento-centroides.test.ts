import { describe, expect, it } from 'vitest'
import { CENTROIDES_DEPARTAMENTOS_CORRIENTES } from './departamento-centroides'
import { LIMITES_CORRIENTES_BBOX } from './departamentos'

describe('CENTROIDES_DEPARTAMENTOS_CORRIENTES', () => {
  it('tiene exactamente los 25 departamentos de Corrientes, sin duplicados', () => {
    expect(CENTROIDES_DEPARTAMENTOS_CORRIENTES).toHaveLength(25)
    const nombres = new Set(CENTROIDES_DEPARTAMENTOS_CORRIENTES.map((c) => c.departamento))
    expect(nombres.size).toBe(25)
  })

  it('cada centroide cae dentro del bbox de la provincia de Corrientes', () => {
    const [oeste, sur, este, norte] = LIMITES_CORRIENTES_BBOX
    for (const centroide of CENTROIDES_DEPARTAMENTOS_CORRIENTES) {
      expect(centroide.lon).toBeGreaterThanOrEqual(oeste)
      expect(centroide.lon).toBeLessThanOrEqual(este)
      expect(centroide.lat).toBeGreaterThanOrEqual(sur)
      expect(centroide.lat).toBeLessThanOrEqual(norte)
    }
  })
})
