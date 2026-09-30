import { describe, expect, it } from 'vitest'
import { antesDelRaster, CAPAS_RADAR } from './capas'

describe('orden de capas del radar', () => {
  it('coloca la máscara encima del raster y debajo del borde y las etiquetas', () => {
    expect(antesDelRaster(true)).toBe(CAPAS_RADAR.mascara)
    expect(CAPAS_RADAR.mascara).not.toBe(CAPAS_RADAR.borde)
    expect(CAPAS_RADAR.etiqueta).toBe('infra-departamentos-etiqueta')
  })
})
