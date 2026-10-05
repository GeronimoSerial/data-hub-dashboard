import { describe, expect, it } from 'vitest'
import { compararRelevancia } from '@/lib/infraestructura/relevancia'
import { SEVERIDADES } from '@/lib/infraestructura/validacion'
import { gravedadDeSeveridad, severidadDeGravedad } from './gravedad'

describe('gravedad', () => {
  it('convierte los cuatro niveles a gravedad y de vuelta', () => {
    SEVERIDADES.forEach((severidad, indice) => {
      const gravedad = (indice + 1) as 1 | 2 | 3 | 4
      expect(gravedadDeSeveridad(severidad)).toBe(gravedad)
      expect(severidadDeGravedad(gravedad)).toBe(severidad)
    })
  })

  it('convierte gravedad 0 en ausencia de severidad', () => {
    expect(severidadDeGravedad(0)).toBeNull()
  })

  it('mantiene el orden de compararRelevancia para cada par de severidades', () => {
    for (const a of SEVERIDADES) {
      for (const b of SEVERIDADES) {
        const comparacion = compararRelevancia(
          { severidad: a, estadoEstablecimiento: 'habitual', rigeDesde: '2026-01-01', creadaEn: '2026-01-01' },
          { severidad: b, estadoEstablecimiento: 'habitual', rigeDesde: '2026-01-01', creadaEn: '2026-01-01' },
        )
        const gravedadA = gravedadDeSeveridad(a)
        const gravedadB = gravedadDeSeveridad(b)
        const ordenPorGravedad = gravedadA === gravedadB ? 0 : gravedadA > gravedadB ? -1 : 1
        expect(Math.sign(comparacion)).toBe(ordenPorGravedad)
      }
    }
  })
})
