// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { LeyendaMapa } from '@/components/mapas/leyenda-mapa'
import { colorNivelPlan, ETIQUETA_NIVEL_PLAN, TITULO_LEYENDA_VISTA, VISTAS_PLANIFICACION } from '@/lib/infraestructura/mapa/planificacion'
import { colorRiesgo } from '@/lib/infraestructura/mapa/radar'

function colorCss(color: string): string {
  const muestra = document.createElement('span')
  muestra.style.backgroundColor = color
  return muestra.style.backgroundColor
}

describe('LeyendaMapa', () => {
  it('muestra dos filas de referencias en Situación actual', () => {
    const { container } = render(<LeyendaMapa pestana="actual" />)
    const filas = container.querySelectorAll('ul')

    expect(filas).toHaveLength(2)
    expect(Array.from(filas[0].querySelectorAll('li')).map((item) => item.textContent)).toEqual([
      'Crítica', 'Alta', 'Media', 'Baja', 'Sin situaciones',
    ])
    const sinReporte = filas[0].querySelector('li:last-child .map-leyenda__muestra')
    expect(sinReporte).toHaveClass('map-leyenda__muestra--neutra')
    expect((sinReporte as HTMLElement).style.backgroundColor).toBe('')
    expect(Array.from(filas[1].querySelectorAll('li')).map((item) => item.textContent)).toEqual([
      'Funcionamiento interrumpido', 'Funcionamiento parcialmente interrumpido', 'Evacuado', 'Usado como centro de evacuados', 'Sin actualizar',
    ])
    expect(container.querySelector('p')).toBeNull()
  })

  it('muestra título y escala de riesgo para el horizonte del Radar', () => {
    const { container, rerender } = render(<LeyendaMapa pestana="radar" horizonte={72} />)

    expect(container.querySelector('aside')).toHaveAttribute('aria-label', 'Referencias del mapa')
    expect(container.querySelector('.map-leyenda__titulo')).toHaveTextContent('Riesgo de afectación · 72 h')
    expect(Array.from(container.querySelectorAll('.map-leyenda__fila li')).map((item) => item.textContent)).toEqual([
      'Muy alto', 'Alto', 'Moderado', 'Bajo',
    ])
    expect(container.querySelector('p')).toBeNull()

    rerender(<LeyendaMapa pestana="radar" horizonte={240} />)
    expect(container.querySelector('.map-leyenda__titulo')).toHaveTextContent('Riesgo de afectación · 10 días')
    expect(Array.from(container.querySelectorAll('.map-leyenda__muestra')).map((muestra) => (muestra as HTMLElement).style.backgroundColor)).toEqual([
      colorCss(colorRiesgo('muy_alto')), colorCss(colorRiesgo('alto')),
      colorCss(colorRiesgo('moderado')), '',
    ])
    expect(container.querySelectorAll('.map-leyenda__muestra--neutra')).toHaveLength(1)
  })

  it('muestra título y escala de cada vista de Planificación', () => {
    for (const vista of VISTAS_PLANIFICACION) {
      const { container, unmount } = render(<LeyendaMapa pestana="planificacion" vista={vista} />)
      const muestras = Array.from(container.querySelectorAll('.map-leyenda__muestra')) as HTMLElement[]

      expect(container.querySelector('.map-leyenda__titulo')).toHaveTextContent(TITULO_LEYENDA_VISTA[vista])
      expect(Array.from(container.querySelectorAll('.map-leyenda__fila li')).map((item) => item.textContent)).toEqual([
        ETIQUETA_NIVEL_PLAN[3], ETIQUETA_NIVEL_PLAN[2], ETIQUETA_NIVEL_PLAN[1], ETIQUETA_NIVEL_PLAN[0],
      ])
      expect(muestras.map((muestra) => muestra.style.backgroundColor)).toEqual([
        colorCss(colorNivelPlan(3)), colorCss(colorNivelPlan(2)),
        colorCss(colorNivelPlan(1)), '',
      ])
      expect(muestras[3]).toHaveClass('map-leyenda__muestra--neutra')
      expect(container.querySelector('p')).toBeNull()
      unmount()
    }
  })

  it('no muestra referencias en Estadísticas', () => {
    const { container } = render(<LeyendaMapa pestana="estadisticas" />)
    expect(container).toBeEmptyDOMElement()
  })
})
