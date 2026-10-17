import { describe, expect, it } from 'vitest'
import {
  ICONOS_CLUSTER_MAPA,
  ID_IMAGEN_ESCUELA_SOLUCIONADA,
  iconosClusterMapa,
} from './iconos-mapa'
import { COLOR_SIN_AFECTACION } from './construir-escuelas-mapa-feature-collection'
import { COLORES_MAPA_CLARO, COLORES_MAPA_OSCURO } from './colores-mapa'

const svgDe = (iconos: ReadonlyArray<{ id: string; svg: string }>, id: string) =>
  iconos.find((icono) => icono.id === id)!.svg

describe('icono de escuela solucionada recientemente', () => {
  it('usa el fondo neutro y el check blanco, y queda registrado con un id único', () => {
    const svg = svgDe(ICONOS_CLUSTER_MAPA, ID_IMAGEN_ESCUELA_SOLUCIONADA)
    expect(svg).toContain(`fill="${COLOR_SIN_AFECTACION}"`)
    expect(svg).toContain('stroke="#ffffff"')
    expect(svg).toContain('<path d="M20 6 9 17l-5-5" />')
    expect(ICONOS_CLUSTER_MAPA.filter(({ id }) => id === ID_IMAGEN_ESCUELA_SOLUCIONADA)).toHaveLength(1)
    expect(new Set(ICONOS_CLUSTER_MAPA.map(({ id }) => id)).size).toBe(ICONOS_CLUSTER_MAPA.length)
  })
})

describe('iconosClusterMapa', () => {
  it('usa un único grosor de trazo y emite el SVG al doble para pixelRatio 2', () => {
    for (const { svg } of ICONOS_CLUSTER_MAPA) {
      expect(svg).toMatch(/<svg [^>]*stroke-width="2"/)
      expect(svg).toMatch(/width="(52|36)"/)
    }
  })

  it('cambia el borde según el tema y conserva los mismos ids', () => {
    const claro = iconosClusterMapa(false)
    const oscuro = iconosClusterMapa(true)
    expect(oscuro.map(({ id }) => id)).toEqual(claro.map(({ id }) => id))
    expect(svgDe(claro, ID_IMAGEN_ESCUELA_SOLUCIONADA)).toContain(`stroke="${COLORES_MAPA_CLARO.tinta}" stroke-width="1"`)
    expect(svgDe(oscuro, ID_IMAGEN_ESCUELA_SOLUCIONADA)).toContain(`stroke="${COLORES_MAPA_OSCURO.tinta}" stroke-width="1"`)
  })
})
