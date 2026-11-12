'use client'

import type { ReactNode } from 'react'
import { fijarRegionPublicaCliente, regionPublicaActual } from './publica'
import type { RegionPublica } from './esquema'

export function RegionProvider({
  region,
  children,
}: {
  region: RegionPublica
  children: ReactNode
}) {
  fijarRegionPublicaCliente(region)
  return children
}

export function useRegion(): RegionPublica {
  return regionPublicaActual()
}
