// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, within } from '@testing-library/react'
import { LeyendaMapa } from '@/components/mapas/leyenda-mapa'
import { COLOR_JUNTO_LAGUNA, colorNivelPlan, ETIQUETA_JUNTO_LAGUNA, ETIQUETA_NIVEL_PLAN, TITULO_LEYENDA_VISTA, VISTAS_PLANIFICACION } from '@/lib/infraestructura/mapa/planificacion'
import { colorRiesgo } from '@/lib/infraestructura/mapa/radar'

function colorCss(color: string): string {
  const muestra = document.createElement('span')
  muestra.style.backgroundColor = color
  return muestra.style.backgroundColor
}

function titulosSecciones(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('aside.map-leyenda details > summary')).map((summary) => summary.textContent ?? '')
}

describe('LeyendaMapa · contenedor único', () => {
  it.each(['actual', 'radar', 'planificacion'] as const)('renderiza un único aside.map-leyenda en la pestaña %s', (pestana) => {
    const props = pestana === 'radar'
      ? { pestana, horizonte: 72 as const }
      : pestana === 'planificacion' ? { pestana, vista: 'inundacion' as const } : { pestana }
    const { container } = render(<LeyendaMapa {...props} estacionesRio eventosReportados lluviaObservada={{ hasta: null, horas: 24, parciales: 0, vencida: false }} />)

    expect(container.querySelectorAll('aside')).toHaveLength(1)
    expect(container.querySelector('aside.map-leyenda')).toHaveAttribute('aria-label', 'Referencias del mapa')
  })

  it('usa un solo contenedor con los bloques de altura de ríos, eventos y lluvia dentro', () => {
    const { container } = render(<LeyendaMapa pestana="actual" estacionesRio eventosReportados lluviaObservada={{ hasta: null, horas: 24, parciales: 0, vencida: false }} />)

    expect(container.querySelectorAll('aside')).toHaveLength(1)
    const leyenda = within(container.querySelector('aside.map-leyenda') as HTMLElement)
    expect(leyenda.getByText('Estaciones de Prefectura')).toBeTruthy()
    expect(leyenda.getByText('Lo que informan los medios')).toBeTruthy()
    expect(leyenda.getByText('Lluvia observada 24 h')).toBeTruthy()
  })

  it('no renderiza nada en Estadísticas sin capas visibles', () => {
    const { container } = render(<LeyendaMapa pestana="estadisticas" />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('LeyendaMapa · secciones', () => {
  it('ordena Situación actual, Riesgo / gravedad y Símbolos, con Situación y Riesgo abiertas', () => {
    const { container } = render(<LeyendaMapa pestana="actual" estacionesRio lluviaObservada={{ hasta: null, horas: 24, parciales: 0, vencida: false }} />)

    expect(titulosSecciones(container)).toEqual(['Situación actual', 'Riesgo / gravedad', 'Símbolos'])
    const detalles = Array.from(container.querySelectorAll('aside.map-leyenda details')) as HTMLDetailsElement[]
    expect(detalles.map((detalle) => detalle.open)).toEqual([true, true, false])
  })

  it('omite Símbolos fuera de la pestaña Actual y Situación actual sin capas', () => {
    const { container } = render(<LeyendaMapa pestana="radar" horizonte={72} />)

    expect(titulosSecciones(container)).toEqual(['Riesgo / gravedad'])
    expect(container.querySelector('aside.map-leyenda')).toHaveAttribute('aria-label', 'Referencias del mapa')
  })

  it('muestra solo Situación actual en Estadísticas con capas visibles', () => {
    const { container } = render(<LeyendaMapa pestana="estadisticas" estacionesRio />)

    expect(titulosSecciones(container)).toEqual(['Situación actual'])
  })

  it('no muestra el resumen provincial ni la ubicación imprecisa en la leyenda', () => {
    const { container } = render(<LeyendaMapa pestana="estadisticas" eventosReportados resumenEventos={{ actualizadoAl: '2026-10-13' }} />)

    expect(within(container).queryByText('Resumen provincial')).toBeNull()
    expect(within(container).queryByText(/Sin ubicación precisa/)).toBeNull()
  })
})

describe('LeyendaMapa · altura de ríos', () => {
  it('muestra la escala de altura de ríos cuando la capa está visible', () => {
    const { container } = render(<LeyendaMapa pestana="estadisticas" estacionesRio />)

    const leyenda = within(container)
    expect(leyenda.getByText('Estaciones de Prefectura')).toBeTruthy()
    expect(leyenda.getByText('Evacuación')).toBeTruthy()
    expect(leyenda.getByText('Alerta')).toBeTruthy()
    expect(leyenda.getByText('Normal')).toBeTruthy()
    expect(leyenda.getByText('Sin dato')).toBeTruthy()
    // Four states plus the stale-reading sample.
    expect(container.querySelectorAll('.map-pastilla-estacion')).toHaveLength(5)
    expect(container.querySelectorAll('.map-estacion-leyenda .map-insignia')).toHaveLength(5)
    expect(leyenda.getByText('Lectura de más de 18 h')).toBeTruthy()
    expect(leyenda.getByText('3,00 m · 26 h')).toBeTruthy()
    expect(leyenda.getAllByText('3,00 m')).toHaveLength(3)
    expect(leyenda.getByText('s/d')).toBeTruthy()
    expect(leyenda.getAllByRole('note').some((nota) => nota.getAttribute('title') === 'Una lectura de más de 18 h se muestra atenuada con su antigüedad.')).toBe(true)
  })

  it('no muestra la escala de altura de ríos cuando la capa está apagada', () => {
    const { container } = render(<LeyendaMapa pestana="actual" estacionesRio={false} />)

    expect(within(container).queryByText('Estaciones de Prefectura')).toBeNull()
  })
})

describe('LeyendaMapa · lluvia observada', () => {
  it('muestra la escala IMERG; la fecha de corte y la nota satelital van en tooltips, no en el texto', () => {
    const { container } = render(<LeyendaMapa pestana="actual" lluviaObservada={{ hasta: '2026-10-13T12:00:00Z', horas: 72, parciales: 0, vencida: false }} />)
    const leyenda = within(container)

    expect(leyenda.getByText('Lluvia observada 72 h')).toBeTruthy()
    expect(leyenda.getByText('1–10 mm')).toBeTruthy()
    expect(leyenda.getByText('150 mm o más')).toBeTruthy()
    expect(container.querySelector('.dato-fechado')?.getAttribute('title')).toMatch(/^Actualizado 13\/10\/2026/)
    expect(leyenda.getByRole('note').getAttribute('title')).toBe('Estimación satelital (NASA IMERG), no medición en tierra. Hacé clic en el mapa para ver el valor.')
    expect(container.textContent).not.toMatch(/Estimación satelital|celdas con ventana incompleta/)
  })

  it('sin fecha de corte el tooltip lo dice', () => {
    const { container } = render(<LeyendaMapa pestana="actual" lluviaObservada={{ hasta: null, horas: 24, parciales: 0, vencida: false }} />)
    expect(container.querySelector('.dato-fechado')?.getAttribute('title')).toBe('Sin fecha de actualización')
  })

  it('las celdas con ventana incompleta van en la nota de info', () => {
    const { container } = render(<LeyendaMapa pestana="actual" lluviaObservada={{ hasta: null, horas: 72, parciales: 3, vencida: false }} />)
    expect(within(container).getByRole('note').getAttribute('title')).toContain('3 celdas con ventana incompleta.')
  })

  it('con la observación vencida atenúa el título sin texto de aviso', () => {
    const { container } = render(<LeyendaMapa pestana="actual" lluviaObservada={{ hasta: '2026-10-10T12:00:00Z', horas: 72, parciales: 0, vencida: true }} />)
    expect(container.querySelector('.dato-fechado--vencido')).not.toBeNull()
    expect(container.textContent).not.toMatch(/desactualizad/i)
  })

  it('no muestra la sección de lluvia cuando la capa está apagada (null)', () => {
    const { container } = render(<LeyendaMapa pestana="actual" lluviaObservada={null} />)

    expect(within(container).queryByText(/Lluvia observada \d+ h/)).toBeNull()
    expect(container.querySelector('.map-leyenda__escala')).toBeNull()
  })
})

describe('LeyendaMapa · Riesgo / gravedad y Símbolos', () => {
  it('muestra gravedad colapsada y los símbolos dentro de su sección', () => {
    const { container } = render(<LeyendaMapa pestana="actual" />)
    const filas = container.querySelectorAll('.map-leyenda__gravedades')

    expect(filas).toHaveLength(1)
    expect(Array.from(filas[0].querySelectorAll('li')).map((item) => item.textContent)).toEqual([
      'Crítica', 'Alta', 'Media', 'Baja', 'Sin situaciones',
    ])
    const sinReporte = filas[0].querySelector('li:last-child .map-leyenda__muestra')
    expect(sinReporte).toHaveClass('map-leyenda__muestra--neutra')
    expect((sinReporte as HTMLElement).style.backgroundColor).toBe('')
    expect(container.querySelectorAll('button')).toHaveLength(0)
    expect(Array.from(container.querySelectorAll('.map-leyenda__simbolos li')).map((item) => item.textContent)).toEqual([
      'Funcionamiento interrumpido', 'Funcionamiento parcialmente interrumpido', 'Evacuado', 'Usado como centro de evacuados', 'Sin actualizar', 'Solucionada recientemente',
    ])
    expect(container.querySelector('.map-leyenda__simbolos li:last-child .map-insignia')).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelector('.map-leyenda__simbolos li:last-child .map-insignia svg')).not.toBeNull()
    expect(container.querySelector('p')).toBeNull()
  })

  it('muestra título y escala de riesgo para el horizonte del Radar', () => {
    const { container, rerender } = render(<LeyendaMapa pestana="radar" horizonte={72} />)

    expect(container.querySelector('.map-leyenda__titulo')).toHaveTextContent('Riesgo actual (hoy) · 72 h')
    expect(Array.from(container.querySelectorAll('.map-leyenda__fila li')).map((item) => item.textContent)).toEqual([
      'Muy alto', 'Alto', 'Moderado',
    ])
    expect(container.querySelector('p')).toBeNull()

    rerender(<LeyendaMapa pestana="radar" horizonte={240} />)
    expect(container.querySelector('.map-leyenda__titulo')).toHaveTextContent('Riesgo actual (hoy) · 10 días')
    expect(Array.from(container.querySelectorAll('.map-leyenda__muestra')).map((muestra) => (muestra as HTMLElement).style.backgroundColor)).toEqual([
      colorCss(colorRiesgo('muy_alto')), colorCss(colorRiesgo('alto')),
      colorCss(colorRiesgo('moderado')),
    ])
    // El mapa del Radar no dibuja riesgo bajo ni escuelas sin dato.
    expect(container.querySelectorAll('.map-leyenda__muestra--neutra')).toHaveLength(0)
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
})

describe('LeyendaMapa · eventos reportados', () => {
  it('muestra la escala de confianza con insignias y sin la referencia de ubicación departamental', () => {
    const { container } = render(<LeyendaMapa pestana="estadisticas" eventosReportados />)

    const leyenda = within(container)
    expect(leyenda.getByText('Lo que informan los medios')).toBeTruthy()
    expect(leyenda.getByText('Confianza alta')).toBeTruthy()
    expect(leyenda.getByText('Confianza media')).toBeTruthy()
    expect(leyenda.getByText('Confianza baja')).toBeTruthy()
    expect(container.querySelectorAll('.map-insignia')).toHaveLength(3)
    expect(leyenda.queryByText('Ubicado sólo a nivel de departamento')).toBeNull()
  })

  it('muestra la fecha de registro actualizado en dd/MM sin desplazamiento de zona horaria', () => {
    const { container } = render(<LeyendaMapa pestana="estadisticas" eventosReportados resumenEventos={{ actualizadoAl: '2026-10-13' }} />)

    expect(within(container).getByText('Registro actualizado al 13/10')).toBeTruthy()
  })

  it('no muestra la leyenda de eventos reportados cuando la capa está apagada', () => {
    const { container } = render(<LeyendaMapa pestana="actual" eventosReportados={false} />)

    expect(within(container).queryByText('Lo que informan los medios')).toBeNull()
  })

  it.each(['actual', 'radar'] as const)('muestra ambos bloques en la pestaña %s cuando las capas están visibles', (pestana) => {
    const props = pestana === 'radar' ? { pestana, horizonte: 72 as const } : { pestana }
    const { container } = render(<LeyendaMapa {...props} estacionesRio eventosReportados />)

    const leyenda = within(container)
    expect(leyenda.getByText('Estaciones de Prefectura')).toBeTruthy()
    expect(leyenda.getByText('Evacuación')).toBeTruthy()
    expect(leyenda.getByText('Alerta')).toBeTruthy()
    expect(leyenda.getByText('Normal')).toBeTruthy()
    expect(leyenda.getByText('Sin dato')).toBeTruthy()
    expect(leyenda.getByText('Lo que informan los medios')).toBeTruthy()
    expect(leyenda.getByText('Confianza alta')).toBeTruthy()
    expect(leyenda.getByText('Confianza media')).toBeTruthy()
    expect(leyenda.getByText('Confianza baja')).toBeTruthy()
    expect(leyenda.queryByText('Ubicado sólo a nivel de departamento')).toBeNull()
  })
})

describe('LeyendaMapa · posición', () => {
  it('ancla la leyenda abajo a la derecha, sobre la atribución, en escritorio', async () => {
    const fs = await import('node:fs')
    const css = fs.readFileSync('app/globals.css', 'utf8')
    const regla = css.match(/\.map-leyenda\s*\{([^}]+)\}/)?.[1]
    expect(regla).toMatch(/right:\s*var\(--s-3\)/)
    expect(regla).toMatch(/bottom:\s*4\.25rem/)
    expect(regla).not.toMatch(/transform:\s*translateX\(-50%\)/)
    expect(regla).toMatch(/max-height:\s*min\(45vh,\s*26rem\)/)
    expect(regla).toMatch(/overscroll-behavior:\s*contain/)
  })
})
