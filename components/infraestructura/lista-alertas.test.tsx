// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ListaAlertas } from './lista-alertas'
import { crearParteMapa } from '@/components/test-utils/parte-mapa'

afterEach(() => {
  document.body.innerHTML = ''
})

const parte = crearParteMapa({
  departamento: 'ER',
  localidad: 'Parana',
  lat: -31.7,
  lon: -60.5,
  servicio: 'suspendido',
  afectaciones: [
    {
      id: 'a1',
      motivo: 'Inundación',
      categoria: 'establecimiento',
      severidad: 'Alta',
      descripcion: null,
      rigeDesde: '2026-08-01T00:00:00Z',
      creadaEn: '2026-08-01T00:00:00Z',
    },
  ],
  seccionesAlcanzadas: 2,
  alumnosAlcanzados: 40,
})

describe('ListaAlertas', () => {
  it('no renderiza una caja vacía cuando hay partes', () => {
    const { container } = render(<ListaAlertas partes={[parte]} />)

    expect(container.querySelector('.map-panel')).not.toBeInTheDocument()
  })

  it('no renderiza filtros ni acciones de gestión', () => {
    render(<ListaAlertas partes={[parte]} />)

    expect(screen.queryByText('Filtros del mapa')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/departamento o localidad/i)).not.toBeInTheDocument()
    for (const label of ['crear', 'editar', 'finalizar', 'nueva alerta']) {
      expect(screen.queryByRole('button', { name: new RegExp(label, 'i') })).not.toBeInTheDocument()
    }
  })

  it('avisa cuando no hay escuelas con afectación vigente', () => {
    render(<ListaAlertas partes={[]} />)
    expect(screen.getByText(/no hay escuelas con afectación vigente/i)).toBeInTheDocument()
  })
})
