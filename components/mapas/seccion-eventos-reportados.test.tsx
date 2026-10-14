// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SeccionEventosReportados } from './seccion-eventos-reportados'
import type { ItemEventoReportado, ResumenEventosReportados } from './capa-eventos-reportados'

afterEach(cleanup)

function evento(extra: Partial<ItemEventoReportado>): ItemEventoReportado {
  return {
    id: 'ev-1',
    titulo: 'Crecida del río',
    lugar: 'Concordia',
    fecha: '2026-10-05',
    confianza: 'alta',
    confianzaEtiqueta: 'Alta',
    medio: 'Diario Uno',
    lon: -58.0,
    lat: -31.4,
    noDeterminada: false,
    ...extra,
  }
}

function resumen(extra: Partial<ResumenEventosReportados> = {}): ResumenEventosReportados {
  return {
    resumenProvincial: [],
    sinUbicacionPrecisa: [],
    total: 3,
    actualizadoAl: '2026-10-10',
    eventos: [
      evento({ id: 'ev-1' }),
      evento({ id: 'ev-2', titulo: 'Anegamiento', confianza: 'media', fecha: null, medio: null }),
      evento({ id: 'ev-3', titulo: 'Corte de ruta', confianza: 'baja', noDeterminada: true, lon: null, lat: null, lugar: 'Gualeguaychú' }),
    ],
    ...extra,
  }
}

describe('SeccionEventosReportados', () => {
  it('no renderiza nada sin resumen', () => {
    const { container } = render(
      <SeccionEventosReportados resumen={null} onSeleccionar={vi.fn()} onResaltar={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('muestra los conteos por confianza en el encabezado', () => {
    render(<SeccionEventosReportados resumen={resumen()} onSeleccionar={vi.fn()} onResaltar={vi.fn()} />)
    expect(screen.getByText('Lo que informan los medios')).toBeInTheDocument()
    expect(screen.queryByText('Eventos reportados')).toBeNull()
    expect(screen.getByText(/1 alta · 1 media · 1 baja/)).toBeInTheDocument()
  })

  it('arranca colapsada por defecto', () => {
    const { container } = render(
      <SeccionEventosReportados resumen={resumen()} onSeleccionar={vi.fn()} onResaltar={vi.fn()} />,
    )
    const seccion = container.querySelector('details')
    expect(seccion).not.toHaveAttribute('open')
    expect(seccion?.open).toBe(false)
  })

  it('muestra la etiqueta Resumen provincial solo cuando hay resumen', () => {
    const { unmount } = render(
      <SeccionEventosReportados resumen={resumen()} onSeleccionar={vi.fn()} onResaltar={vi.fn()} />,
    )
    expect(screen.queryByText('Resumen provincial')).toBeNull()
    expect(screen.getByText('Eventos')).toBeInTheDocument()
    unmount()

    render(
      <SeccionEventosReportados
        resumen={resumen({
          resumenProvincial: [
            {
              id_evento: 'prov-1',
              tipo_afectacion: null,
              mediciones: null,
              lugares: [],
              titulo: 'Inundación provincial',
              subtitulo: '',
              hechos: [],
              estadoEtiqueta: '',
              fuentes: [],
            } as unknown as ResumenEventosReportados['resumenProvincial'][number],
          ],
        })}
        onSeleccionar={vi.fn()}
        onResaltar={vi.fn()}
      />,
    )
    expect(screen.getByText('Resumen provincial')).toHaveClass('map-eventos__etiqueta')
  })

  it('muestra la fecha de registro en dd/MM', () => {
    render(<SeccionEventosReportados resumen={resumen()} onSeleccionar={vi.fn()} onResaltar={vi.fn()} />)
    expect(screen.getByText(/registro al 10\/10/)).toBeInTheDocument()
  })

  it('renderiza el resumen provincial primero y no como botón', () => {
    const conProvincial = resumen({
      resumenProvincial: [
        {
          id_evento: 'prov-1',
          tipo_afectacion: null,
          mediciones: null,
          lugares: ['Concordia'],
          titulo: 'Inundación provincial',
          subtitulo: '',
          hechos: ['Evacuados en varias localidades'],
          estadoEtiqueta: '',
          fuentes: [{ medio: 'Diario Uno', fecha: '2026-10-06', url: 'https://example.com/nota' }],
        } as unknown as ResumenEventosReportados['resumenProvincial'][number],
      ],
    })
    render(<SeccionEventosReportados resumen={conProvincial} onSeleccionar={vi.fn()} onResaltar={vi.fn()} />)
    const titulo = screen.getByText('Inundación provincial')
    expect(titulo.closest('button')).toBeNull()
    expect(screen.getByText('Evacuados en varias localidades')).toBeInTheDocument()
    const enlace = screen.getByRole('link', { name: 'Fuente: Diario Uno, 2026-10-06' })
    expect(enlace).toHaveAttribute('href', 'https://example.com/nota')
    expect(enlace).toHaveAttribute('target', '_blank')
    expect(enlace).toHaveAttribute('rel', 'noopener noreferrer')
    const botones = screen.getAllByRole('button')
    expect(titulo.compareDocumentPosition(botones[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('llama onSeleccionar al pulsar un evento ubicado', () => {
    const onSeleccionar = vi.fn()
    render(<SeccionEventosReportados resumen={resumen()} onSeleccionar={onSeleccionar} onResaltar={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Crecida del río, Concordia' }))
    expect(onSeleccionar).toHaveBeenCalledWith('ev-1')
  })

  it('muestra el lugar, la fecha o su ausencia y el medio en cada fila', () => {
    render(<SeccionEventosReportados resumen={resumen()} onSeleccionar={vi.fn()} onResaltar={vi.fn()} />)
    expect(screen.getByText('Concordia · 05/10')).toBeInTheDocument()
    expect(screen.getByText('Concordia · 05/10').closest('button')).toHaveTextContent('Diario Uno')
    expect(screen.getByText('Anegamiento').closest('button')).toHaveTextContent('fecha sin informar')
  })

  it('marca como no determinado el evento sin ubicación precisa y no lo selecciona', () => {
    const onSeleccionar = vi.fn()
    render(<SeccionEventosReportados resumen={resumen()} onSeleccionar={onSeleccionar} onResaltar={vi.fn()} />)
    const boton = screen.getByRole('button', { name: 'Corte de ruta, Gualeguaychú' })
    expect(boton).toHaveAttribute('aria-disabled', 'true')
    expect(boton).toHaveTextContent('Ubicación no determinada')
    fireEvent.click(boton)
    expect(onSeleccionar).not.toHaveBeenCalled()
  })

  it('resalta al entrar o enfocar y limpia al salir o desenfocar', () => {
    const onResaltar = vi.fn()
    render(<SeccionEventosReportados resumen={resumen()} onSeleccionar={vi.fn()} onResaltar={onResaltar} />)
    const boton = screen.getByRole('button', { name: 'Crecida del río, Concordia' })
    fireEvent.mouseEnter(boton)
    expect(onResaltar).toHaveBeenLastCalledWith('ev-1')
    fireEvent.mouseLeave(boton)
    expect(onResaltar).toHaveBeenLastCalledWith(null)
    fireEvent.focus(boton)
    expect(onResaltar).toHaveBeenLastCalledWith('ev-1')
    fireEvent.blur(boton)
    expect(onResaltar).toHaveBeenLastCalledWith(null)
  })

  it('no muestra identificadores internos en el texto', () => {
    const { container } = render(
      <SeccionEventosReportados resumen={resumen()} onSeleccionar={vi.fn()} onResaltar={vi.fn()} />,
    )
    expect(container.textContent).not.toMatch(/[a-z]+_[a-z]+/)
  })
})
