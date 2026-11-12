import type { RegionConfig } from './esquema'
import { cargarRegion } from './registro'

const REGION_POR_DEFECTO = 'corrientes'

let cache: RegionConfig | undefined

// Reads process.env.REGION once per process. Blank or unset means the default region.
export function regionActiva(): RegionConfig {
  if (cache) return cache
  const solicitada = process.env.REGION?.trim()
  cache = cargarRegion(solicitada ? solicitada : REGION_POR_DEFECTO)
  return cache
}

export function __reiniciarRegionActivaParaPruebas(): void {
  cache = undefined
}
