import { regionPublicaActual } from './publica'

// Modules built for Corrientes only (see M2 in docs/propuestas/plan-batches-enos.md).
// Other regions do not offer them: pages answer notFound and the shell hides the link.
// Client-safe: no server imports.
const RUTAS_SOLO_CORRIENTES = [
  '/cuadernillos',
  '/api/cuadernillos',
  '/links',
  '/mapas/matricula',
  '/mapas/natalidad',
  '/mapas/reorganizacion',
] as const

export function moduloDeRutaHabilitado(ruta: string, regionId: string = regionPublicaActual().id): boolean {
  if (regionId === 'corrientes') return true
  return !RUTAS_SOLO_CORRIENTES.some((base) => ruta === base || ruta.startsWith(`${base}/`))
}
