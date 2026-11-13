'use client'

import type { ReactNode } from 'react'
import { fijarMarcaRegionCliente, fijarRegionPublicaCliente, regionPublicaActual } from './publica'
import type { MarcaRegion, RegionPublica } from './esquema'

export function RegionProvider({
  region,
  marca,
  children,
}: {
  region: RegionPublica
  marca?: MarcaRegion
  children: ReactNode
}) {
  fijarRegionPublicaCliente(region)
  fijarMarcaRegionCliente(marca)
  return children
}

export function useRegion(): RegionPublica {
  return regionPublicaActual()
}
