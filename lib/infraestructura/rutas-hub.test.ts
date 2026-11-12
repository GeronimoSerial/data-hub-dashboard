import { describe, expect, it } from 'vitest'
import { RECURSO_ENOS_MANAOS_ID, RUTA_MAPA_INFRAESTRUCTURA } from './rutas-hub'

describe('rutas-hub', () => {
  it('exposes the infrastructure map route as a single constant', () => {
    expect(RUTA_MAPA_INFRAESTRUCTURA).toBe('/mapas/infraestructura')
  })

  it('exposes the stable id of the Manaos card', () => {
    expect(RECURSO_ENOS_MANAOS_ID).toBe('recurso-enos-manaos')
  })
})
