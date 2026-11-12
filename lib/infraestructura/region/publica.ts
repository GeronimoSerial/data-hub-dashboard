import { regionActiva } from './activa'
import { regionPublica, type RegionPublica } from './esquema'
import { cargarRegion } from './registro'

// Client-safe access to the active region. No env reads on the browser side:
// the server layout hands the browser its region through RegionProvider.
let publicaCliente: RegionPublica | undefined

export function regionPublicaActual(): RegionPublica {
  if (typeof window === 'undefined') return regionPublica(regionActiva())
  return publicaCliente ?? regionPublica(cargarRegion('corrientes'))
}

export function fijarRegionPublicaCliente(r: RegionPublica): void {
  publicaCliente = r
}

export function __reiniciarRegionPublicaClienteParaPruebas(): void {
  publicaCliente = undefined
}
