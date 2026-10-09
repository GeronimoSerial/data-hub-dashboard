import { describe, expect, it } from 'vitest'
import { filtroAnilloLaguna, paintAnilloLaguna, paintPuntosNivel } from './capa-puntos-nivel'
import { colorBordeSinReporte, colorEscuelaSinReporte, radioPunto, radioPuntoNivel } from '@/lib/infraestructura/mapa/punto'
import { COLOR_JUNTO_LAGUNA } from '@/lib/infraestructura/mapa/planificacion'

describe('paintPuntosNivel', () => {
  it('usa el punto neutro para escuelas sin dato y el estilo de nivel para el resto', () => {
    const paint = paintPuntosNivel(false)
    if (!paint) throw new Error('paintPuntosNivel debe devolver paint')

    expect(paint['circle-color']).toEqual([
      'case', ['get', 'conDato'], ['get', 'color'], ['get', 'juntoLaguna'], COLOR_JUNTO_LAGUNA, colorEscuelaSinReporte(false),
    ])
    expect(paint['circle-stroke-color']).toEqual([
      'case', ['get', 'conDato'], '#1c1c1c', colorBordeSinReporte(false),
    ])
    expect(paint['circle-stroke-width']).toEqual([
      'case', ['get', 'conDato'], 1, 1.5,
    ])
    expect(paint['circle-radius']).toEqual(radioPuntoNivel())
    expect(paint['circle-radius']).toContainEqual(['case', ['get', 'conDato'], radioPunto(1), 3])
  })

  it('el anillo de laguna sólo marca escuelas con nivel de río y junto a laguna', () => {
    expect(filtroAnilloLaguna()).toEqual(['all', ['get', 'conDato'], ['==', ['get', 'juntoLaguna'], true]])
    const anillo = paintAnilloLaguna()
    expect(anillo?.['circle-stroke-color']).toBe(COLOR_JUNTO_LAGUNA)
    expect(anillo?.['circle-color']).toBe('rgba(0, 0, 0, 0)')
    expect(anillo?.['circle-radius']).toBe(radioPunto(1) + 3)
  })
})
