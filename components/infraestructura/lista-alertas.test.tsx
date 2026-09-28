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
  // Hallazgo 8: el buscador de escuelas es único y vive en el mapa
  // (EscuelaSearchBox), que busca sobre el padrón completo. Este panel ya no
  // ofrece una segunda caja de búsqueda con la misma etiqueta.
  it('no renderiza un buscador de escuelas propio ni acciones de gestión', () => {
    render(
      <ListaAlertas
        partes={[parte]}
        filtros={filtrosVacios}
        onFiltroChange={vi.fn()}
        filtrosAbiertos={false}
        onFiltrosAbiertosChange={vi.fn()}
      />,
    )

    expect(
      screen.queryByPlaceholderText(/nombre, cue o localidad/i),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Buscar escuela')).not.toBeInTheDocument()

    for (const label of ['crear', 'editar', 'finalizar', 'nueva alerta']) {
      expect(
        screen.queryByRole('button', { name: new RegExp(label, 'i') }),
      ).not.toBeInTheDocument()
    }
  })

  it('muestra los filtros avanzados del mapa', () => {
    render(
      <ListaAlertas
        partes={[parte]}
        filtros={filtrosVacios}
        onFiltroChange={vi.fn()}
        filtrosAbiertos={true}
        onFiltrosAbiertosChange={vi.fn()}
      />,
    )

    expect(screen.getByText('Filtros del mapa')).toBeInTheDocument()
    for (const label of [
      'Territorio',
      'Nivel',
      'Motivo',
      'Severidad',
      'Categoría',
      'Servicio',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it('notifica el cambio de un filtro sin tocar los demás', () => {
    const onFiltroChange = vi.fn()
    render(
      <ListaAlertas
        partes={[]}
        filtros={filtrosVacios}
        onFiltroChange={onFiltroChange}
        filtrosAbiertos={true}
        onFiltrosAbiertosChange={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText(/departamento o localidad/i), {
      target: { value: 'Paraná' },
    })
    expect(onFiltroChange).toHaveBeenCalledWith('territorio', 'Paraná')
  })

  it('propaga la apertura del bloque de filtros al padre', () => {
    const onFiltrosAbiertosChange = vi.fn()
    const { container } = render(
      <ListaAlertas
        partes={[parte]}
        filtros={filtrosVacios}
        onFiltroChange={vi.fn()}
        filtrosAbiertos={false}
        onFiltrosAbiertosChange={onFiltrosAbiertosChange}
      />,
    )

    const details = container.querySelector('details.map-filtros-avanzados') as HTMLDetailsElement
    expect(details).not.toBeNull()
    details.open = true
    fireEvent(details, new Event('toggle'))
    expect(onFiltrosAbiertosChange).toHaveBeenCalledWith(true)
  })

  it('avisa cuando no hay escuelas con los filtros aplicados', () => {
    render(
      <ListaAlertas
        partes={[]}
        filtros={filtrosVacios}
        onFiltroChange={vi.fn()}
        filtrosAbiertos={false}
        onFiltrosAbiertosChange={vi.fn()}
      />,
    )
    expect(
      screen.getByText(/no hay escuelas con afectación vigente con los filtros aplicados/i),
    ).toBeInTheDocument()
  })
})
