// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ListaAlertas } from './lista-alertas'
import type { ParteMapa } from '@/lib/infraestructura/parte-mapa'

afterEach(() => {
  document.body.innerHTML = ''
})

const parte: ParteMapa = {
  parteId: 'p1',
  cueAnexo: '1801605-04',
  nombre: 'Escuela 1',
  departamento: 'ER',
  localidad: 'Parana',
  lat: -31.7,
  lon: -60.5,
  servicio: 'suspendido',
  estadoEstablecimiento: 'habitual',
  peorSeveridad: 'Alta',
  categorias: ['establecimiento'],
  afectaciones: [
    {
      id: 'a1',
      motivo: 'Inundación',
      categoria: 'establecimiento',
      severidad: 'Alta',
      descripcion: null,
      rigeDesde: '2026-08-01T00:00:00Z',
    },
  ],
  seccionesAlcanzadas: 2,
  alumnosAlcanzados: 40,
  rigeDesde: '2026-08-01T00:00:00Z',
  actualizadaEn: '2026-08-01T00:00:00Z',
}

const filtrosVacios = {
  territorio: '',
  nivel: '',
  establecimiento: '',
  motivo: '',
  severidad: '',
  categoria: '',
  servicio: '',
}

describe('ListaAlertas', () => {
  it('selecciona una escuela al hacer click y no ofrece acciones de gestión', () => {
    const onSeleccionar = vi.fn()
    render(
      <ListaAlertas
        partes={[parte]}
        filtros={filtrosVacios}
        onFiltroChange={vi.fn()}
        seleccionadaCue={null}
        onSeleccionar={onSeleccionar}
      />,
    )

    expect(screen.queryByText('Escuela 1')).not.toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText(/nombre, cue o localidad/i), {
      target: { value: 'escuela' },
    })
    fireEvent.click(screen.getByText('Escuela 1'))
    expect(onSeleccionar).toHaveBeenCalledWith('1801605-04')

    for (const label of ['crear', 'editar', 'finalizar', 'nueva alerta']) {
      expect(
        screen.queryByRole('button', { name: new RegExp(label, 'i') }),
      ).not.toBeInTheDocument()
    }
  })

  it('muestra el estado de servicio en la fila', () => {
    render(
      <ListaAlertas
        partes={[parte]}
        filtros={filtrosVacios}
        onFiltroChange={vi.fn()}
        seleccionadaCue={null}
        onSeleccionar={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText(/nombre, cue o localidad/i), {
      target: { value: '1801605' },
    })
    expect(screen.getByText(/clases suspendidas/i)).toBeInTheDocument()
  })

  it('notifica el cambio de un filtro sin tocar los demás', () => {
    const onFiltroChange = vi.fn()
    render(
      <ListaAlertas
        partes={[]}
        filtros={filtrosVacios}
        onFiltroChange={onFiltroChange}
        seleccionadaCue={null}
        onSeleccionar={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByText('Filtros del mapa'))
    fireEvent.change(screen.getByPlaceholderText(/departamento o localidad/i), {
      target: { value: 'Paraná' },
    })
    expect(onFiltroChange).toHaveBeenCalledWith('territorio', 'Paraná')
  })

  it('avisa cuando no hay escuelas con los filtros aplicados', () => {
    render(
      <ListaAlertas
        partes={[]}
        filtros={filtrosVacios}
        onFiltroChange={vi.fn()}
        seleccionadaCue={null}
        onSeleccionar={vi.fn()}
      />,
    )
    expect(
      screen.getByText(/no hay escuelas con afectación vigente con los filtros aplicados/i),
    ).toBeInTheDocument()
  })
})
