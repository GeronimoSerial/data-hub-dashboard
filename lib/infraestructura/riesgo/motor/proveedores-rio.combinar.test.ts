// Registro de proveedores de río con combinación de varios proveedores de motor.
import { describe, expect, it, vi } from 'vitest'
import type { PuertoNivelRio } from './puertos'
import { crearRegistroProveedoresRio, type ProveedorRio } from './proveedores-rio'

type Deps = { marca: string }

const puertoFalso: PuertoNivelRio = { obtenerEvidencia: vi.fn(async () => null) }
const puertoCombinado: PuertoNivelRio = { obtenerEvidencia: vi.fn(async () => null) }

const alfa: ProveedorRio<Deps> = { id: 'alfa', crearPuerto: () => puertoFalso }
const beta: ProveedorRio<Deps> = { id: 'beta', crearPuerto: () => puertoFalso }
const alfaBeta: ProveedorRio<Deps> = { id: 'alfa+beta', crearPuerto: () => puertoCombinado }

describe('registro de proveedores de río con combinar', () => {
  it('combina dos proveedores de motor cuando se pasa combinar', () => {
    const combinar = vi.fn(() => alfaBeta)
    const registro = crearRegistroProveedoresRio<Deps>([alfa, beta], { combinar })

    expect(registro.seleccionar(['alfa', 'beta'])?.id).toBe('alfa+beta')
    expect(combinar).toHaveBeenCalledWith([alfa, beta])
  })

  it('sin combinar, dos proveedores de motor siguen lanzando el error de siempre', () => {
    const registro = crearRegistroProveedoresRio<Deps>([alfa, beta])

    expect(() => registro.seleccionar(['alfa', 'beta'])).toThrow('varios proveedores de río no soportados todavía')
  })

  it('un solo proveedor de motor no se combina aunque haya combinar (ina queda fuera)', () => {
    const combinar = vi.fn(() => alfaBeta)
    const registro = crearRegistroProveedoresRio<Deps>([alfa, beta], { combinar })

    expect(registro.seleccionar(['alfa', 'ina'])?.id).toBe('alfa')
    expect(combinar).not.toHaveBeenCalled()
  })
})
