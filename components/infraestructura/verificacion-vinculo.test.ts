// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CLAVE_VINCULO_VERIFICACION,
  limpiarVinculoVerificacion,
  leerVinculoVerificacion,
} from './verificacion-vinculo'

describe('vínculo de verificación', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    sessionStorage.clear()
  })

  it('lee un vínculo válido', () => {
    sessionStorage.setItem(CLAVE_VINCULO_VERIFICACION, JSON.stringify({ id: 'v1', token: 'secreto' }))
    expect(leerVinculoVerificacion()).toEqual({ id: 'v1', token: 'secreto' })
  })

  it('devuelve null para JSON malformado o campos faltantes', () => {
    sessionStorage.setItem(CLAVE_VINCULO_VERIFICACION, '{malformado')
    expect(leerVinculoVerificacion()).toBeNull()
    sessionStorage.setItem(CLAVE_VINCULO_VERIFICACION, JSON.stringify({ id: 'v1' }))
    expect(leerVinculoVerificacion()).toBeNull()
  })

  it('devuelve null si el acceso al almacenamiento lanza', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable')
    })
    expect(leerVinculoVerificacion()).toBeNull()
  })

  it('limpia sin propagar errores del almacenamiento', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('storage unavailable')
    })
    expect(() => limpiarVinculoVerificacion()).not.toThrow()
  })
})
