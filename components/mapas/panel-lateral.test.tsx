// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { PanelLateral } from './panel-lateral'
import { PanelRadar } from './panel-radar'

afterEach(cleanup)

describe('PanelLateral', () => {
  it('muestra el panel actual sin selección', () => {
    render(
      <PanelLateral
        pestana="actual"
        seleccion={null}
        onCerrarFicha={() => {}}
        actual={<p>Contenido actual</p>}
        radar={<p>Contenido radar</p>}
        planificacion={<p>Contenido de planificación</p>}
      />,
    )

    expect(screen.getByText('Contenido actual')).toBeInTheDocument()
    expect(screen.getByTestId('panel-lateral')).not.toBeEmptyDOMElement()
  })

  it('muestra Radar sin mostrar Situación actual', () => {
    const radar = <PanelRadar
      horizonte={72}
      disponibles={[]}
      onHorizonte={() => {}}
      variable="lluvia"
      onVariable={() => {}}
      puntos={null}
      escuelas={[]}
      cargando={false}
      error={null}
      onSeleccionar={() => {}}
    />
    render(
      <PanelLateral
        pestana="radar"
        seleccion={null}
        onCerrarFicha={() => {}}
        actual={<p>Contenido actual</p>}
        radar={radar}
        planificacion={<p>Contenido de planificación</p>}
      />,
    )

    const panel = screen.getByTestId('panel-lateral')
    expect(panel).toContainElement(screen.getByTestId('panel-radar'))
    expect(screen.getByRole('heading', { name: 'Radar' }).parentElement).toHaveClass('map-sitact__encabezado')
    expect(screen.getByRole('group', { name: 'Horizonte' })).toBeInTheDocument()
    expect(screen.getByText('Todavía no hay un pronóstico disponible. Vuelva a consultar más tarde.')).toHaveClass('map-sitact__vacio')
    expect(screen.queryByText('Contenido actual')).not.toBeInTheDocument()
    expect(panel).not.toBeEmptyDOMElement()
  })

  it('muestra Planificación', () => {
    render(
      <PanelLateral
        pestana="planificacion"
        seleccion={null}
        onCerrarFicha={() => {}}
        actual={<p>Contenido actual</p>}
        radar={<p>Contenido radar</p>}
        planificacion={<p>Contenido de planificación</p>}
      />,
    )

    expect(screen.getByText('Contenido de planificación')).toBeInTheDocument()
    expect(screen.getByTestId('panel-lateral')).not.toBeEmptyDOMElement()
  })

  it('muestra la ficha con una selección y oculta el panel de la pestaña', () => {
    render(
      <PanelLateral
        pestana="actual"
        seleccion="1801605-04"
        onCerrarFicha={() => {}}
        ficha={<p>Ficha seleccionada</p>}
        actual={<p>Contenido actual</p>}
        radar={<p>Contenido radar</p>}
        planificacion={<p>Contenido de planificación</p>}
      />,
    )

    expect(screen.getByText('Ficha seleccionada')).toBeInTheDocument()
    expect(screen.queryByText('Contenido actual')).not.toBeInTheDocument()
    expect(screen.getByTestId('panel-lateral')).not.toBeEmptyDOMElement()
  })

  it('muestra la cabecera antes del contenido y la oculta con la ficha', () => {
    const cabecera = <p>Resumen del departamento</p>
    const { rerender } = render(
      <PanelLateral
        pestana="actual"
        seleccion={null}
        onCerrarFicha={() => {}}
        cabecera={cabecera}
        actual={<p>Contenido actual</p>}
        radar={<p>Contenido radar</p>}
        planificacion={<p>Contenido de planificación</p>}
      />,
    )
    const panel = screen.getByTestId('panel-lateral')
    expect(panel.firstElementChild).toHaveTextContent('Resumen del departamento')
    expect(panel.lastElementChild).toHaveTextContent('Contenido actual')

    rerender(
      <PanelLateral
        pestana="actual"
        seleccion="1801605-04"
        onCerrarFicha={() => {}}
        ficha={<p>Ficha seleccionada</p>}
        cabecera={cabecera}
        actual={<p>Contenido actual</p>}
        radar={<p>Contenido radar</p>}
        planificacion={<p>Contenido de planificación</p>}
      />,
    )
    expect(screen.queryByText('Resumen del departamento')).not.toBeInTheDocument()
    expect(screen.getByText('Ficha seleccionada')).toBeInTheDocument()
  })

  it('usa el panel de la pestaña si hay selección pero no se pasó una ficha', () => {
    render(
      <PanelLateral
        pestana="actual"
        seleccion="1801605-04"
        onCerrarFicha={() => {}}
        actual={<p>Contenido actual</p>}
        radar={<p>Contenido radar</p>}
        planificacion={<p>Contenido de planificación</p>}
      />,
    )

    expect(screen.getByText('Contenido actual')).toBeInTheDocument()
    expect(screen.getByTestId('panel-lateral')).not.toBeEmptyDOMElement()
  })

  it.each(['actual', 'radar', 'planificacion'] as const)(
    'nunca deja vacío el contenedor en la pestaña %s',
    (pestana) => {
      render(
        <PanelLateral
          pestana={pestana}
          seleccion={null}
          onCerrarFicha={() => {}}
          actual={<p>Contenido actual</p>}
          radar={<p>Contenido radar</p>}
          planificacion={<p>Contenido de planificación</p>}
        />,
      )

      expect(screen.getByTestId('panel-lateral')).not.toBeEmptyDOMElement()
    },
  )
})
