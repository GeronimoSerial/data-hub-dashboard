import { describe, expect, it } from 'vitest'
import { crearAdapterSusceptibilidadNoDisponible } from './susceptibilidad'

describe('crearAdapterSusceptibilidadNoDisponible', () => {
  it('devuelve null (no hay indicadores calculados)', async () => {
    const adapter = crearAdapterSusceptibilidadNoDisponible()
    const indicadores = await adapter.obtenerIndicadores('CUE-1')

    expect(indicadores).toBeNull()
  })
})
