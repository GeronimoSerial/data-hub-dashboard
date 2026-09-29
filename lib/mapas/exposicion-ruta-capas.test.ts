import { describe, expect, it } from 'vitest'
import type { ExposicionRutaRespuesta } from '@/lib/infraestructura/exposicion-ruta'
import { construirCeldasExposicion } from './exposicion-ruta-capas'

const exposicion = (overrides: Partial<ExposicionRutaRespuesta> = {}): ExposicionRutaRespuesta => ({
  cueAnexo: 'cue', disponible: true, versionJob: '1',
  resumen: { celdasTotal: 1, celdasConDato: 1, celdasConProfundidad: 1, profundidadMaxM: 0.8, cobertura: 1 },
  celdasAfectadas: [{ lon: -58, lat: -27, profundidadM: 0.8 }], resolucionArcsec: 30,
  periodoRetornoAnios: 100, escenario: 'historico', fuente: null, licencia: null, fechaCorrida: null,
  aviso: '', ...overrides,
})

describe('construirCeldasExposicion', () => {
  it('construye cuadrados de tamaño de celda, cerrados y con profundidad', () => {
    const resultado = construirCeldasExposicion(exposicion())!
    const anillo = resultado.features[0].geometry.coordinates[0]
    expect(anillo).toHaveLength(5)
    expect(anillo[0]).toEqual(anillo[4])
    expect(anillo[1][0] - anillo[0][0]).toBeCloseTo(30 / 3600)
    expect(anillo[2][1] - anillo[1][1]).toBeCloseTo(30 / 3600)
    expect(resultado.features[0].properties).toEqual({ profundidadM: 0.8 })
  })
  it.each([
    null,
    exposicion({ disponible: false }),
    exposicion({ celdasAfectadas: [] }),
    exposicion({ celdasAfectadas: [{ lon: 1, lat: 2, profundidadM: 0 }] }),
    exposicion({ resolucionArcsec: null }),
  ])('devuelve null si no hay exposición dibujable', (entrada) => {
    expect(construirCeldasExposicion(entrada)).toBeNull()
  })
  it('no inventa celdas ni incluye profundidades no positivas', () => {
    expect(construirCeldasExposicion(exposicion({ celdasAfectadas: [
      { lon: 1, lat: 2, profundidadM: 0 }, { lon: 3, lat: 4, profundidadM: 1 },
    ] }))?.features).toHaveLength(1)
  })
})
