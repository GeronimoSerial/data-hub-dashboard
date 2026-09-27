import { describe, expect, it } from 'vitest'
import { crearAdapterAislamientoNoDisponible } from './aislamiento'

describe('crearAdapterAislamientoNoDisponible', () => {
  it('devuelve null (no sin_datos_red)', async () => {
    const adapter = crearAdapterAislamientoNoDisponible()
    const indice = await adapter.obtenerIndice('CUE-1')

    expect(indice).toBeNull()
  })
})
