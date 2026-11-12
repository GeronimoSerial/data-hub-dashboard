// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Map as MapaMaplibre } from 'maplibre-gl'
import { instalarGanchoE2E } from './e2e-hook'

const CAJA_CANVAS = { left: 40, top: 60, right: 1040, bottom: 760, width: 1000, height: 700, x: 40, y: 60, toJSON: () => ({}) }

// Capas presentes en el estilo: estaciones visible, departamentos (bordes) oculto,
// etiquetas de departamentos visible, lluvia visible. Ruta y riesgo no montadas.
const CAPAS_EN_ESTILO: Record<string, string | undefined> = {
  'estaciones-rio-simbolos': undefined,
  'lluvia-observada-hit': undefined,
  'infra-departamentos-borde': 'none',
  'infra-departamentos-etiqueta': 'visible',
}

const FEATURES_POR_CAPA: Record<string, unknown[]> = {
  'estaciones-rio-simbolos': [{}, {}, {}, {}],
  'lluvia-observada-hit': Array.from({ length: 12 }, () => ({})),
}

function mapaFalso() {
  const map = {
    getLayer: vi.fn((id: string) => (id in CAPAS_EN_ESTILO ? { id } : undefined)),
    getLayoutProperty: vi.fn((id: string) => CAPAS_EN_ESTILO[id]),
    queryRenderedFeatures: vi.fn((_geometria: unknown, opciones: { layers: string[] }) => FEATURES_POR_CAPA[opciones.layers[0]] ?? []),
    project: vi.fn((_lnglat: [number, number]) => ({ x: 120.5, y: 340.25 })),
    getCanvas: vi.fn(() => ({ getBoundingClientRect: () => CAJA_CANVAS })),
  }
  return map
}

describe('instalarGanchoE2E', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    delete window.__mapaE2E
  })

  it('no instala nada cuando NEXT_PUBLIC_E2E no está definido', () => {
    const original = process.env.NEXT_PUBLIC_E2E
    delete process.env.NEXT_PUBLIC_E2E
    try {
      instalarGanchoE2E(mapaFalso() as unknown as MapaMaplibre)
      expect(window.__mapaE2E).toBeUndefined()
    } finally {
      if (original !== undefined) process.env.NEXT_PUBLIC_E2E = original
    }
  })

  it('no instala nada cuando NEXT_PUBLIC_E2E es "false"', () => {
    vi.stubEnv('NEXT_PUBLIC_E2E', 'false')
    instalarGanchoE2E(mapaFalso() as unknown as MapaMaplibre)
    expect(window.__mapaE2E).toBeUndefined()
  })

  it('instala un objeto con las tres funciones cuando NEXT_PUBLIC_E2E es "true"', () => {
    vi.stubEnv('NEXT_PUBLIC_E2E', 'true')
    instalarGanchoE2E(mapaFalso() as unknown as MapaMaplibre)
    expect(window.__mapaE2E).toBeDefined()
    expect(typeof window.__mapaE2E?.capasVisibles).toBe('function')
    expect(typeof window.__mapaE2E?.featuresRenderizadas).toBe('function')
    expect(typeof window.__mapaE2E?.proyectar).toBe('function')
  })

  it('capasVisibles lista solo las claves con capa montada y no oculta', () => {
    vi.stubEnv('NEXT_PUBLIC_E2E', 'true')
    instalarGanchoE2E(mapaFalso() as unknown as MapaMaplibre)
    expect(window.__mapaE2E?.capasVisibles()).toEqual(['estacionesRio', 'lluviaObservada', 'nombresDepartamentos'])
  })

  it('featuresRenderizadas cuenta las features de la capa de cada clave', () => {
    vi.stubEnv('NEXT_PUBLIC_E2E', 'true')
    instalarGanchoE2E(mapaFalso() as unknown as MapaMaplibre)
    expect(window.__mapaE2E?.featuresRenderizadas('estacionesRio')).toBe(4)
    expect(window.__mapaE2E?.featuresRenderizadas('lluviaObservada')).toBe(12)
    expect(window.__mapaE2E?.featuresRenderizadas('rutaAcceso')).toBe(0)
  })

  it('featuresRenderizadas falla ante una clave desconocida', () => {
    vi.stubEnv('NEXT_PUBLIC_E2E', 'true')
    instalarGanchoE2E(mapaFalso() as unknown as MapaMaplibre)
    expect(() => window.__mapaE2E?.featuresRenderizadas('capaInexistente')).toThrow('capaInexistente')
  })

  it('proyectar suma el desplazamiento del canvas a la proyección del mapa', () => {
    vi.stubEnv('NEXT_PUBLIC_E2E', 'true')
    const map = mapaFalso()
    instalarGanchoE2E(map as unknown as MapaMaplibre)
    expect(window.__mapaE2E?.proyectar(-58.5, -27.5)).toEqual({ x: 160.5, y: 400.25 })
    expect(map.project).toHaveBeenCalledWith([-58.5, -27.5])
  })
})
