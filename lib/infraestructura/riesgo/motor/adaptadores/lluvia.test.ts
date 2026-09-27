import { describe, expect, it } from 'vitest'
import { crearAdapterLluviaNoDisponible } from './lluvia'

describe('crearAdapterLluviaNoDisponible', () => {
  it('devuelve acumulados null (no 0) y observadoEn null', async () => {
    const adapter = crearAdapterLluviaNoDisponible()
    const celda = await adapter.obtenerAcumulado({
      geometryRef: 'geom-1',
      asOf: '2026-09-26T12:00:00.000Z',
    })

    expect(celda).toEqual({
      geometryRef: 'geom-1',
      acumuladoMm24h: null,
      acumuladoMm72h: null,
      observadoEn: null,
    })
  })
})
