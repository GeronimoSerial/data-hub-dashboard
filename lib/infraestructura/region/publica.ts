import { regionActiva } from './activa'
import { marcaPublica, regionPublica, type MarcaRegion, type RegionPublica } from './esquema'
import { cargarRegion } from './registro'

// Client-safe access to the active region. No env reads on the browser side:
// the server layout hands the browser its region through RegionProvider.
let publicaCliente: RegionPublica | undefined

export function regionPublicaActual(): RegionPublica {
  if (typeof window === 'undefined') return regionPublica(regionActiva())
  return publicaCliente ?? regionPublica(cargarRegion('corrientes'))
}

// Mirrors regionTienePrefectura (hidrometria/estaciones-prefectura.ts) without its server-side imports.
export function regionTienePrefecturaPublica(region: Pick<RegionPublica, 'fuentesRio'> = regionPublicaActual()): boolean {
  return region.fuentesRio.includes('prefectura')
}

export function fijarRegionPublicaCliente(r: RegionPublica): void {
  publicaCliente = r
}

// Brand lines and logo for the shell header and footers. Client default is Corrientes, like the region.
let marcaCliente: MarcaRegion | undefined

export function marcaActual(): MarcaRegion {
  if (typeof window === 'undefined') return marcaPublica(regionActiva())
  return marcaCliente ?? marcaPublica(cargarRegion('corrientes'))
}

export function fijarMarcaRegionCliente(m: MarcaRegion | undefined): void {
  marcaCliente = m
}

export function __reiniciarRegionPublicaClienteParaPruebas(): void {
  publicaCliente = undefined
  marcaCliente = undefined
}

// Short jurisdiction label for text such as "Capital, Corrientes": the first jurisdiction
// line of the brand without its "Provincia de " prefix (Corrientes -> "Corrientes", Manaos -> "Amazonas").
export function jurisdiccionCorta(): string {
  return (marcaActual().jurisdiccionLineas[0] ?? '').replace(/^Provincia de /, '')
}
