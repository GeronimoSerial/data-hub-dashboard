import { describe, expect, it } from 'vitest'
import { CONFIG_INICIAL, configSchema, leerConfig } from './config'

const enlace = {
  id: 'e1',
  titulo: 'Hub de Datos',
  descripcion: 'Reportes, tableros y mapas',
  url: 'https://hub.sistemas.mec.gob.ar',
  icono: null,
  visible: true,
}

function conEnlace(parche: Record<string, unknown>) {
  return {
    ...CONFIG_INICIAL,
    grupos: [{ id: 'g1', titulo: 'Datos', enlaces: [{ ...enlace, ...parche }] }],
  }
}

describe('configSchema', () => {
  it('acepta la configuración inicial', () => {
    expect(configSchema.safeParse(CONFIG_INICIAL).success).toBe(true)
  })

  it.each([
    'https://hub.sistemas.mec.gob.ar/mapas',
    'http://intranet.mec.gob.ar',
    '/explorar',
  ])('acepta la url %s', (url) => {
    expect(configSchema.safeParse(conEnlace({ url })).success).toBe(true)
  })

  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    '//evil.example',
    '/\\evil.example',
    'mailto:alguien@mec.gob.ar',
    'hub.sistemas.mec.gob.ar',
  ])('rechaza la url %s', (url) => {
    expect(configSchema.safeParse(conEnlace({ url })).success).toBe(false)
  })

  it('recorta espacios y exige título no vacío', () => {
    const ok = configSchema.parse(conEnlace({ titulo: '  Hub  ' }))
    expect(ok.grupos[0].enlaces[0].titulo).toBe('Hub')
    expect(configSchema.safeParse(conEnlace({ titulo: '   ' })).success).toBe(false)
  })

  it('rechaza un acento fuera de la paleta oficial', () => {
    expect(configSchema.safeParse({ ...CONFIG_INICIAL, acento: '#ff00ff' }).success).toBe(false)
  })

  it('rechaza un ícono fuera del catálogo', () => {
    expect(configSchema.safeParse(conEnlace({ icono: 'sparkles' })).success).toBe(false)
  })

  it('limita la cantidad de grupos', () => {
    const grupos = Array.from({ length: 21 }, (_, i) => ({ id: `g${i}`, titulo: `G${i}`, enlaces: [] }))
    expect(configSchema.safeParse({ ...CONFIG_INICIAL, grupos }).success).toBe(false)
  })
})

describe('leerConfig', () => {
  it('devuelve la configuración inicial ante datos inválidos o ausentes', () => {
    expect(leerConfig(null)).toEqual(CONFIG_INICIAL)
    expect(leerConfig({ version: 99 })).toEqual(CONFIG_INICIAL)
  })

  it('devuelve el documento cuando es válido', () => {
    const doc = conEnlace({})
    expect(leerConfig(doc)).toEqual(doc)
  })
})
