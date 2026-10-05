import { describe, expect, it } from 'vitest'
import {
  ICONOS_CLUSTER_MAPA,
  ID_IMAGEN_ESCUELA_SOLUCIONADA,
  SVG_ICONO_ESCUELA_SOLUCIONADA,
} from './iconos-mapa'
import { COLOR_SIN_AFECTACION } from './construir-escuelas-mapa-feature-collection'

describe('icono de escuela solucionada recientemente', () => {
  it('usa el fondo neutro y el check blanco, y queda registrado con un id único', () => {
    expect(SVG_ICONO_ESCUELA_SOLUCIONADA).toContain(`fill="${COLOR_SIN_AFECTACION}"`)
    expect(SVG_ICONO_ESCUELA_SOLUCIONADA).toContain('stroke="#ffffff"')
    expect(SVG_ICONO_ESCUELA_SOLUCIONADA).toContain('<path d="M20 6 9 17l-5-5" />')
    expect(ICONOS_CLUSTER_MAPA.filter(({ id }) => id === ID_IMAGEN_ESCUELA_SOLUCIONADA)).toHaveLength(1)
    expect(new Set(ICONOS_CLUSTER_MAPA.map(({ id }) => id)).size).toBe(ICONOS_CLUSTER_MAPA.length)
  })
})
