// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { PanelLateral } from './panel-lateral'
import { PanelRadar } from './panel-radar'

afterEach(cleanup)

describe('PanelLateral', () => {
  const contenidos = {
    actual: <p>Contenido actual</p>,
    radar: <p>Contenido radar</p>,
    planificacion: <p>Contenido de planificación</p>,
    capas: <p>Contenido capas</p>,
  }

  it.each([
    ['actual', 'Situación actual', '4 oct'],
    ['radar', 'Radar', 'Pronóstico'],
    ['planificacion', 'Planificación', 'Planificación breve'],
    ['capas', 'Capas', 'Mapa base'],
  ] as const)('renderiza un encabezado único para %s', (pestana, titulo, subtitulo) => {
    render(
      <PanelLateral
        pestana={pestana}
        seleccion={null}
        onCerrarFicha={() => {}}
        subtitulos={{ [pestana]: subtitulo }}
        {...contenidos}
      />,
    )

    const encabezados = screen.getAllByTestId('panel-encabezado')
    expect(encabezados).toHaveLength(1)
    expect(encabezados[0]).toHaveTextContent(titulo)
    expect(encabezados[0]).toHaveTextContent(subtitulo)
    expect(screen.getAllByTestId('panel-cuerpo')).toHaveLength(1)
    expect(screen.getByTestId('panel-cuerpo')).toContainElement(screen.getByText(contenidos[pestana].props.children))
  })

  it('muestra el panel actual sin selección', () => {
    render(
      <PanelLateral
        pestana="actual"
        seleccion={null}
        onCerrarFicha={() => {}}
        actual={<p>Contenido actual</p>}
        radar={<p>Contenido radar</p>}
        planificacion={<p>Contenido de planificación</p>}
        capas={<p>Contenido capas</p>}
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
      alertas={{ grupos: [], cargando: false, error: false, claveSeleccionada: null, onSeleccionar: () => {} }}
      pronostico={{ resumen: null, cargando: false, error: false, departamentoId: null, onDepartamento: vi.fn() }}
    />
    render(
      <PanelLateral
        pestana="radar"
        seleccion={null}
        onCerrarFicha={() => {}}
        subtitulos={{ radar: 'Pronóstico' }}
        actual={<p>Contenido actual</p>}
        radar={radar}
        planificacion={<p>Contenido de planificación</p>}
        capas={<p>Contenido capas</p>}
      />,
    )

    const panel = screen.getByTestId('panel-lateral')
    expect(panel).toContainElement(screen.getByTestId('panel-radar'))
    expect(screen.getByTestId('panel-encabezado')).toHaveTextContent('Pronóstico')
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
        capas={<p>Contenido capas</p>}
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
        capas={<p>Contenido capas</p>}
      />,
    )

    expect(screen.getByText('Ficha seleccionada')).toBeInTheDocument()
    expect(screen.queryByText('Contenido actual')).not.toBeInTheDocument()
    expect(screen.queryByTestId('panel-encabezado')).not.toBeInTheDocument()
    expect(screen.getAllByTestId('panel-cuerpo')).toHaveLength(1)
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
        capas={<p>Contenido capas</p>}
      />,
    )
    expect(screen.getByTestId('panel-cuerpo').firstElementChild).toHaveTextContent('Resumen del departamento')
    expect(screen.getByTestId('panel-cuerpo')).toHaveTextContent('Contenido actual')

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
        capas={<p>Contenido capas</p>}
      />,
    )
    expect(screen.queryByText('Resumen del departamento')).not.toBeInTheDocument()
    expect(screen.getByText('Ficha seleccionada')).toBeInTheDocument()
  })

  it.each(['actual', 'radar', 'planificacion', 'capas'] as const)(
    'muestra la cabecera en la pestaña %s', (pestana) => {
      render(
        <PanelLateral
          pestana={pestana}
          seleccion={null}
          onCerrarFicha={() => {}}
          cabecera={<p>Escuela seleccionada: Escuela 1</p>}
          {...contenidos}
        />,
      )

      expect(screen.getByTestId('panel-cuerpo').firstElementChild).toHaveTextContent(
        'Escuela seleccionada: Escuela 1',
      )
    },
  )

  it('usa el panel de la pestaña si hay selección pero no se pasó una ficha', () => {
    render(
      <PanelLateral
        pestana="actual"
        seleccion="1801605-04"
        onCerrarFicha={() => {}}
        actual={<p>Contenido actual</p>}
        radar={<p>Contenido radar</p>}
        planificacion={<p>Contenido de planificación</p>}
        capas={<p>Contenido capas</p>}
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
          capas={<p>Contenido capas</p>}
        />,
      )

      expect(screen.getByTestId('panel-lateral')).not.toBeEmptyDOMElement()
    },
  )

  it('muestra Capas en el panel lateral y prioriza la ficha', () => {
    const { rerender } = render(
      <PanelLateral
        pestana="capas"
        seleccion={null}
        onCerrarFicha={() => {}}
        cabecera={<p>Resumen del departamento</p>}
        actual={<p>Contenido actual</p>}
        radar={<p>Contenido radar</p>}
        planificacion={<p>Contenido de planificación</p>}
        capas={<p>Contenido capas</p>}
      />,
    )
    expect(screen.getByTestId('panel-cuerpo').firstElementChild).toHaveTextContent('Resumen del departamento')
    expect(screen.getByText('Contenido capas')).toBeInTheDocument()
    rerender(
      <PanelLateral
        pestana="capas"
        seleccion="1801605-04"
        onCerrarFicha={() => {}}
        ficha={<p>Ficha seleccionada</p>}
        cabecera={<p>Resumen del departamento</p>}
        actual={<p>Contenido actual</p>}
        radar={<p>Contenido radar</p>}
        planificacion={<p>Contenido de planificación</p>}
        capas={<p>Contenido capas</p>}
      />,
    )
    expect(screen.getByText('Ficha seleccionada')).toBeInTheDocument()
    expect(screen.queryByText('Contenido capas')).not.toBeInTheDocument()
    expect(screen.queryByText('Resumen del departamento')).not.toBeInTheDocument()
  })
})
