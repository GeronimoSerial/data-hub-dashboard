import { describe, expect, it } from 'vitest'
import { paintPuntosNivel } from './capa-puntos-nivel'
import { colorBordeSinReporte, colorEscuelaSinReporte, radioPunto, radioPuntoNivel } from '@/lib/infraestructura/mapa/punto'

describe('paintPuntosNivel', () => {
  it('usa el punto neutro para escuelas sin dato y el estilo de nivel para el resto', () => {
    const paint = paintPuntosNivel(false)
    if (!paint) throw new Error('paintPuntosNivel debe devolver paint')

    expect(paint['circle-color']).toEqual([
      'case', ['get', 'conDato'], ['get', 'color'], colorEscuelaSinReporte(false),
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
})
