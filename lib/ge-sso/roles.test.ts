import { describe, expect, it } from 'vitest'
import { destinoPostLogin, ROL_HUB_POR_GE, rolGeDesdeHub } from './roles'

describe('mapeo de rol GE a rol hub', () => {
  it('administrador de GE entra como admin_ge, no como admin', () => {
    expect(ROL_HUB_POR_GE.administrador).toBe('admin_ge')
    expect(rolGeDesdeHub('admin_ge')).toBe('administrador')
    expect(rolGeDesdeHub('admin')).toBeNull()
  })

  it('admin_ge aterriza en el mapa de infraestructura', () => {
    expect(destinoPostLogin('admin_ge')).toBe('/mapas/infraestructura')
  })

  it('admin del hub conserva el destino de siempre', () => {
    expect(destinoPostLogin('admin')).toBe('/mapas/infraestructura')
    expect(destinoPostLogin('editor')).toBe('/')
  })
})
