// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { LeyendaMapa } from '@/components/mapas/leyenda-mapa'

describe('LeyendaMapa', () => {
  it('muestra dos filas de referencias en Situación actual y ninguna en Radar', () => {
    const { container, rerender } = render(<LeyendaMapa pestana="actual" />)
    const filas = container.querySelectorAll('ul')

    expect(filas).toHaveLength(2)
    expect(Array.from(filas[0].querySelectorAll('li')).map((item) => item.textContent)).toEqual([
      'Crítica', 'Alta', 'Media', 'Baja', 'Sin reporte',
    ])
    expect(Array.from(filas[1].querySelectorAll('li')).map((item) => item.textContent)).toEqual([
      'Sin clases', 'Clases parciales', 'Evacuado', 'Centro de evacuados', 'Sin actualizar',
    ])
    expect(container.querySelector('p')).toBeNull()

    rerender(<LeyendaMapa pestana="radar" />)
    expect(container).toBeEmptyDOMElement()
  })
})
