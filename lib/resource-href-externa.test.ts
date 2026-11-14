import { describe, expect, it } from 'vitest'
import { resourceCardTarget } from './resource-href'

const URL_MANAOS = 'https://manaos.example/mapas/infraestructura'

describe('resourceCardTarget external allowlist', () => {
  it('returns the external URL only for the Manaos card id', () => {
    expect(resourceCardTarget({ id: 'recurso-enos-manaos', ruta: URL_MANAOS })).toBe(URL_MANAOS)
  })

  it('keeps a generic external URL as null for any other resource', () => {
    expect(resourceCardTarget({ id: 'r1', ruta: 'https://evil.example' })).toBeNull()
  })

  it('rejects javascript:, data: and protocol-relative rutas for every id', () => {
    for (const id of ['recurso-enos-manaos', 'r1']) {
      expect(resourceCardTarget({ id, ruta: 'javascript:alert(1)' })).toBeNull()
      expect(resourceCardTarget({ id, ruta: 'data:text/html,hola' })).toBeNull()
      expect(resourceCardTarget({ id, ruta: '//evil.example' })).toBeNull()
    }
  })
})
