// Registro de proveedores de río del punto de armado con ana y sgb (Manaos).
import { describe, expect, it } from 'vitest'
import { PROVEEDORES_RIO } from './compartido-riesgo'

describe('proveedores de río en el punto de armado: ana y sgb', () => {
  it('ana y sgb se arman como un único proveedor combinado', () => {
    expect(PROVEEDORES_RIO.seleccionar(['ana', 'sgb'])?.id).toBe('ana+sgb')
  })

  it('ana sola queda con id ana', () => {
    expect(PROVEEDORES_RIO.seleccionar(['ana'])?.id).toBe('ana')
  })

  it('Corrientes (prefectura, ina) sigue usando prefectura sin combinar', () => {
    expect(PROVEEDORES_RIO.seleccionar(['prefectura', 'ina'])?.id).toBe('prefectura')
  })

  it('prefectura con ana se combina sin lanzar', () => {
    expect(PROVEEDORES_RIO.seleccionar(['prefectura', 'ana'])?.id).toBe('prefectura+ana')
  })

  it('un id desconocido sigue lanzando', () => {
    expect(() => PROVEEDORES_RIO.seleccionar(['desconocida'])).toThrow('proveedor de río desconocido: desconocida')
  })
})
