// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { PanelLateral } from './panel-lateral'

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
    render(
      <PanelLateral
        pestana="radar"
        seleccion={null}
        onCerrarFicha={() => {}}
        actual={<p>Contenido actual</p>}
        radar={<p>Contenido radar</p>}
        planificacion={<p>Contenido de planificación</p>}
      />,
    )

    expect(screen.getByText('Contenido radar')).toBeInTheDocument()
    expect(screen.queryByText('Contenido actual')).not.toBeInTheDocument()
    expect(screen.getByTestId('panel-lateral')).not.toBeEmptyDOMElement()
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
