// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { colapsarAtribucion } from './atribucion'

describe('colapsarAtribucion', () => {
  it('quita el estado abierto del control compacto', () => {
    const contenedor = document.createElement('div')
    contenedor.innerHTML = '<details class="maplibregl-ctrl maplibregl-ctrl-attrib maplibregl-compact maplibregl-compact-show" open></details>'

    colapsarAtribucion(contenedor)

    const control = contenedor.querySelector('.maplibregl-ctrl-attrib')
    expect(control).not.toHaveAttribute('open')
    expect(control).not.toHaveClass('maplibregl-compact-show')
  })

  it('no hace nada si no encuentra el control', () => {
    const contenedor = document.createElement('div')

    expect(() => colapsarAtribucion(contenedor)).not.toThrow()
  })
})
