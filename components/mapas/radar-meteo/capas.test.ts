import { describe, expect, it } from 'vitest'
import { beforeIdSiExiste, CAPAS_RADAR } from './capas'

describe('orden de capas del radar', () => {
  it('mantiene las capas de máscara y etiqueta esperadas', () => {
    expect(CAPAS_RADAR.mascara).not.toBe(CAPAS_RADAR.borde)
    expect(CAPAS_RADAR.etiqueta).toBe('infra-departamentos-etiqueta')
  })

  it('sólo devuelve beforeId cuando la capa de destino existe', () => {
    const map = { getLayer: (id: string) => id === CAPAS_RADAR.borde ? { id } : undefined }

    expect(beforeIdSiExiste(map, CAPAS_RADAR.borde)).toBe(CAPAS_RADAR.borde)
    expect(beforeIdSiExiste(map, CAPAS_RADAR.etiqueta)).toBeUndefined()
  })
})
