// Known data providers and their implementation status, used by the region
// contract (contrato-regiones.test.ts) to validate fuentesRio / fuentesAlertas.
// Declarative only: runtime registries decide what actually runs. 'ina' feeds
// non-river jobs (sync-ina-*), so it is not in the motor river registry.
// 'pendiente' means the id is planned and must not be configured for a
// region that runs in production yet.
export const PROVEEDORES_RIO_CONOCIDOS = {
  prefectura: 'implementado',
  ina: 'implementado',
  ana: 'pendiente',
  sgb: 'pendiente',
} as const

export const PROVEEDORES_ALERTAS_CONOCIDOS = {
  smn: 'implementado',
  inmet: 'pendiente',
} as const
