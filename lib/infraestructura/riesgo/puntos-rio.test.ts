import { describe, expect, it } from 'vitest'
import { obtenerPuntosRio, puntoRioPorId } from './puntos-rio'

describe('obtenerPuntosRio()', () => {
  it('tiene al menos un punto por Paraná y por Uruguay', () => {
    expect(obtenerPuntosRio().some((p) => p.rio === 'parana')).toBe(true)
    expect(obtenerPuntosRio().some((p) => p.rio === 'uruguay')).toBe(true)
  })

  it('incluye las localidades mínimas exigidas por el plan', () => {
    const localidades = obtenerPuntosRio().map((p) => p.localidad)
    for (const esperada of ['Ituzaingó', 'Bella Vista', 'Goya', 'Esquina', 'Santo Tomé', 'Paso de los Libres', 'Monte Caseros']) {
      expect(localidades.some((l) => l.includes(esperada))).toBe(true)
    }
  })

  it('cada punto tiene coordenadas dentro del rango geográfico de Corrientes/litoral', () => {
    for (const p of obtenerPuntosRio()) {
      expect(p.lat).toBeLessThan(-26)
      expect(p.lat).toBeGreaterThan(-31)
      expect(p.lon).toBeLessThan(-55)
      expect(p.lon).toBeGreaterThan(-60)
    }
  })

  it('los ids son únicos', () => {
    const ids = obtenerPuntosRio().map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('puntoRioPorId encuentra un punto existente y no encuentra uno inventado', () => {
    expect(puntoRioPorId('parana-goya')?.localidad).toBe('Goya')
    expect(puntoRioPorId('rio-que-no-existe')).toBeUndefined()
  })
})
