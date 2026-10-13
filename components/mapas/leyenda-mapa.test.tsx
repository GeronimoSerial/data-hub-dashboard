// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { fireEvent, render, within } from '@testing-library/react'
import { LeyendaMapa } from '@/components/mapas/leyenda-mapa'
import { COLOR_JUNTO_LAGUNA, colorNivelPlan, ETIQUETA_JUNTO_LAGUNA, ETIQUETA_NIVEL_PLAN, TITULO_LEYENDA_VISTA, VISTAS_PLANIFICACION } from '@/lib/infraestructura/mapa/planificacion'
import { colorRiesgo } from '@/lib/infraestructura/mapa/radar'

describe('LeyendaMapa · altura de ríos', () => {
  it('muestra la escala de altura de ríos en cualquier pestaña cuando la capa está visible', () => {
    const { container } = render(<LeyendaMapa pestana="estadisticas" estacionesRio />)

    const leyenda = within(container)
    expect(leyenda.getByText('Altura de ríos')).toBeTruthy()
    expect(leyenda.getByText('Evacuación')).toBeTruthy()
    expect(leyenda.getByText('Alerta')).toBeTruthy()
    expect(leyenda.getByText('Normal')).toBeTruthy()
    expect(leyenda.getByText('Sin dato')).toBeTruthy()
  })

  it('no muestra la escala de altura de ríos cuando la capa está apagada', () => {
    const { container } = render(<LeyendaMapa pestana="actual" estacionesRio={false} />)

    expect(within(container).queryByText('Altura de ríos')).toBeNull()
  })
})

function colorCss(color: string): string {
  const muestra = document.createElement('span')
  muestra.style.backgroundColor = color
  return muestra.style.backgroundColor
}

describe('LeyendaMapa', () => {
  it('muestra gravedad colapsada y despliega símbolos al activarlo', () => {
    const { container } = render(<LeyendaMapa pestana="actual" />)
    const filas = container.querySelectorAll('.map-leyenda__gravedades')

    expect(filas).toHaveLength(1)
    expect(Array.from(filas[0].querySelectorAll('li')).map((item) => item.textContent)).toEqual([
      'Crítica', 'Alta', 'Media', 'Baja', 'Sin situaciones',
    ])
    const sinReporte = filas[0].querySelector('li:last-child .map-leyenda__muestra')
    expect(sinReporte).toHaveClass('map-leyenda__muestra--neutra')
    expect((sinReporte as HTMLElement).style.backgroundColor).toBe('')
    expect(within(container).getByText('Solucionada recientemente')).not.toBeVisible()
    const boton = within(container).getByRole('button', { name: 'Símbolos' })
    expect(boton).toHaveAttribute('aria-expanded', 'false')
    expect(boton).toHaveAttribute('aria-controls', 'map-leyenda-simbolos')

    fireEvent.click(boton)
    expect(boton).toHaveAttribute('aria-expanded', 'true')
    expect(Array.from(container.querySelectorAll('.map-leyenda__simbolos li')).map((item) => item.textContent)).toEqual([
      'Funcionamiento interrumpido', 'Funcionamiento parcialmente interrumpido', 'Evacuado', 'Usado como centro de evacuados', 'Sin actualizar', 'Solucionada recientemente',
    ])
    expect(container.querySelector('.map-leyenda__simbolos li:last-child svg')).toHaveAttribute('aria-hidden', 'true')

    fireEvent.click(boton)
    expect(boton).toHaveAttribute('aria-expanded', 'false')
    expect(within(container).getByText('Solucionada recientemente')).not.toBeVisible()
    expect(container.querySelector('p')).toBeNull()
  })

  it('cierra los símbolos al cambiar de pestaña', () => {
    const { container, rerender } = render(<LeyendaMapa pestana="actual" />)
    fireEvent.click(within(container).getByRole('button', { name: 'Símbolos' }))
    rerender(<LeyendaMapa pestana="radar" horizonte={72} />)
    rerender(<LeyendaMapa pestana="actual" />)
    expect(within(container).getByRole('button', { name: 'Símbolos' })).toHaveAttribute('aria-expanded', 'false')
    expect(within(container).getByText('Solucionada recientemente')).not.toBeVisible()
  })

  it('ancla la leyenda al lado del sidebar en escritorio', async () => {
    const fs = await import('node:fs')
    const css = fs.readFileSync('app/globals.css', 'utf8')
    const regla = css.match(/\.map-leyenda\s*\{([^}]+)\}/)?.[1]
    expect(regla).toMatch(/left:\s*calc\(55px\s*\+\s*var\(--map-sidebar-ancho\)\s*\+\s*var\(--s-3\)\)/)
    expect(regla).not.toMatch(/transform:\s*translateX\(-50%\)/)
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
      // Inundación no lista Nulo (sí "Junto a laguna"); Aisladas sólo lista Alto y Medio; Historial lista los cuatro.
      const niveles = vista === 'inundacion' ? [3, 2, 1] as const : vista === 'aisladas' ? [3, 2] as const : [3, 2, 1, 0] as const
      const etiquetas = niveles.map((nivel) => ETIQUETA_NIVEL_PLAN[nivel])
      expect(Array.from(container.querySelectorAll('.map-leyenda__fila li')).map((item) => item.textContent)).toEqual(
        vista === 'inundacion' ? [...etiquetas, ETIQUETA_JUNTO_LAGUNA] : etiquetas,
      )
      expect(muestras.map((muestra) => muestra.style.backgroundColor)).toEqual([
        ...niveles.filter((nivel) => nivel > 0).map((nivel) => colorCss(colorNivelPlan(nivel))),
        ...(vista === 'inundacion' ? [colorCss(COLOR_JUNTO_LAGUNA)] : vista === 'historial' ? [''] : []),
      ])
      if (vista === 'historial') expect(muestras[3]).toHaveClass('map-leyenda__muestra--neutra')
      expect(container.querySelector('p')).toBeNull()
      unmount()
    }
  })

  it('no muestra referencias en Estadísticas', () => {
    const { container } = render(<LeyendaMapa pestana="estadisticas" />)
    expect(container).toBeEmptyDOMElement()
  })
})
