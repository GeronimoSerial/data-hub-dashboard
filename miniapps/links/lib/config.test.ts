import { describe, expect, it } from 'vitest'
import { CONFIG_INICIAL, LIMITES, configSchema, leerConfig, urlSegura } from './config'

describe('urlSegura', () => {
  it.each(['https://www.argentina.gob.ar', 'http://ejemplo.com/ruta?x=1'])('acepta %s', (url) => {
    expect(urlSegura(url)).toBe(true)
  })

  it.each(['javascript:alert(1)', 'data:text/html,x', '//evil.com', '/explorar', 'ftp://x.com', 'https:\\\\evil.com', 'no es url', ''])(
    'rechaza %j',
    (url) => expect(urlSegura(url)).toBe(false),
  )
})

describe('configSchema', () => {
  const enlace = { id: 'e1', titulo: 'Portal', descripcion: 'Del Estado', url: 'https://www.argentina.gob.ar' }

  it('acepta un documento válido y recorta espacios', () => {
    const r = configSchema.parse({ ...CONFIG_INICIAL, titulo: '  Accesos  ', enlaces: [enlace] })
    expect(r.titulo).toBe('Accesos')
  })

  it('exige título de página y de enlace, y respeta los límites', () => {
    expect(configSchema.safeParse({ ...CONFIG_INICIAL, titulo: ' ' }).success).toBe(false)
    expect(configSchema.safeParse({ ...CONFIG_INICIAL, enlaces: [{ ...enlace, titulo: '' }] }).success).toBe(false)
    expect(configSchema.safeParse({ ...CONFIG_INICIAL, enlaces: [{ ...enlace, descripcion: 'x'.repeat(LIMITES.descripcion + 1) }] }).success).toBe(false)
  })

  it('rechaza enlaces que no son http(s) absolutos', () => {
    expect(configSchema.safeParse({ ...CONFIG_INICIAL, enlaces: [{ ...enlace, url: '/explorar' }] }).success).toBe(false)
  })

  it('permite la descripción vacía', () => {
    expect(configSchema.safeParse({ ...CONFIG_INICIAL, enlaces: [{ ...enlace, descripcion: '' }] }).success).toBe(true)
  })
})

describe('leerConfig', () => {
  it('cae a los valores por defecto ante un documento inválido', () => {
    expect(leerConfig({ cualquier: 'cosa' })).toEqual(CONFIG_INICIAL)
    expect(leerConfig(null)).toEqual(CONFIG_INICIAL)
  })
})

it('rechaza ids repetidos', () => {
  const enlace = { id: 'igual', titulo: 'Uno', descripcion: '', url: 'https://example.org' }
  expect(configSchema.safeParse({ ...CONFIG_INICIAL, enlaces: [enlace, enlace] }).success).toBe(false)
})
