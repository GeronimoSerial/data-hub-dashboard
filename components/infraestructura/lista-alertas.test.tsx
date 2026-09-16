// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ListaAlertas } from './lista-alertas'
import type { AlertaActiva } from '@/lib/infraestructura/consulta'

afterEach(() => {
  document.body.innerHTML = ''
})

const alerta: AlertaActiva = {
  id: 'a1',
  cueAnexo: '1801605-04',
  nombre: 'Escuela 1',
  departamento: 'ER',
  localidad: 'Parana',
  lat: -31.7,
  lon: -60.5,
  motivo: 'Inundación',
  severidad: 'Alta',
  creadaEn: '2026-08-01T00:00:00Z',
}

const filtrosVacios = {
  territorio: '',
  nivel: '',
  establecimiento: '',
  motivo: '',
  severidad: '',
}

describe('ListaAlertas', () => {
  it('selecciona una alerta al hacer click y no ofrece acciones de gestión', () => {
    const onSeleccionar = vi.fn()
    render(
      <ListaAlertas
        alertas={[alerta]}
        filtros={filtrosVacios}
        onFiltroChange={vi.fn()}
        seleccionadaCue={null}
        onSeleccionar={onSeleccionar}
      />,
    )

    fireEvent.click(screen.getByText('Escuela 1'))
    expect(onSeleccionar).toHaveBeenCalledWith('1801605-04')

    for (const label of ['crear', 'editar', 'finalizar', 'nueva alerta']) {
      expect(
        screen.queryByRole('button', { name: new RegExp(label, 'i') }),
      ).not.toBeInTheDocument()
    }
  })

  it('notifica el cambio de un filtro sin tocar los demás', () => {
    const onFiltroChange = vi.fn()
    render(
      <ListaAlertas
        alertas={[]}
        filtros={filtrosVacios}
        onFiltroChange={onFiltroChange}
        seleccionadaCue={null}
        onSeleccionar={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText(/departamento o localidad/i), {
      target: { value: 'Paraná' },
    })
    expect(onFiltroChange).toHaveBeenCalledWith('territorio', 'Paraná')
  })

  it('avisa cuando no hay alertas con los filtros aplicados', () => {
    render(
      <ListaAlertas
        alertas={[]}
        filtros={filtrosVacios}
        onFiltroChange={vi.fn()}
        seleccionadaCue={null}
        onSeleccionar={vi.fn()}
      />,
    )
    expect(
      screen.getByText(/no hay alertas activas con los filtros aplicados/i),
    ).toBeInTheDocument()
  })
})
