import { describe, expect, it } from 'vitest'
import { PUNTOS_RIO, puntoRioPorId } from './puntos-rio'

describe('PUNTOS_RIO', () => {
  it('tiene al menos un punto por Paraná y por Uruguay', () => {
    expect(PUNTOS_RIO.some((p) => p.rio === 'parana')).toBe(true)
    expect(PUNTOS_RIO.some((p) => p.rio === 'uruguay')).toBe(true)
  })

  it('incluye las localidades mínimas exigidas por el plan', () => {
    const localidades = PUNTOS_RIO.map((p) => p.localidad)
    for (const esperada of ['Ituzaingó', 'Bella Vista', 'Goya', 'Esquina', 'Santo Tomé', 'Paso de los Libres', 'Monte Caseros']) {
      expect(localidades.some((l) => l.includes(esperada))).toBe(true)
    }
  })

  it('cada punto tiene coordenadas dentro del rango geográfico de Corrientes/litoral', () => {
    for (const p of PUNTOS_RIO) {
      expect(p.lat).toBeLessThan(-26)
      expect(p.lat).toBeGreaterThan(-31)
      expect(p.lon).toBeLessThan(-55)
      expect(p.lon).toBeGreaterThan(-60)
    }
  })

  it('los ids son únicos', () => {
    const ids = PUNTOS_RIO.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('puntoRioPorId encuentra un punto existente y no encuentra uno inventado', () => {
    expect(puntoRioPorId('parana-goya')?.localidad).toBe('Goya')
    expect(puntoRioPorId('rio-que-no-existe')).toBeUndefined()
  })
})
