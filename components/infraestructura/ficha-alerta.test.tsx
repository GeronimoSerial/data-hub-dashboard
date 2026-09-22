// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FichaAlerta } from './ficha-alerta'
import type { ParteMapa } from '@/lib/infraestructura/parte-mapa'

afterEach(() => {
  document.body.innerHTML = ''
})

const base: ParteMapa = {
  parteId: 'p1',
  cueAnexo: '1801605-04',
  nombre: 'Escuela 1',
  departamento: 'ER',
  localidad: 'Parana',
  lat: -31.7,
  lon: -60.5,
  servicio: 'suspendido',
  estadoEstablecimiento: 'evacuado',
  peorSeveridad: 'Alta',
  categorias: ['establecimiento'],
  afectaciones: [
    {
      id: 'a1',
      motivo: 'Inundación',
      categoria: 'establecimiento',
      severidad: 'Alta',
      descripcion: 'El acceso principal quedó bajo agua.',
      rigeDesde: '2026-08-01T00:00:00Z',
    },
    {
      id: 'a2',
      motivo: 'Sin energía o agua',
      categoria: 'alumnos',
      severidad: 'Media',
      descripcion: null,
      rigeDesde: '2026-08-02T00:00:00Z',
    },
  ],
  seccionesAlcanzadas: 3,
  alumnosAlcanzados: 74,
  rigeDesde: '2026-08-01T00:00:00Z',
  actualizadaEn: '2026-08-01T00:00:00Z',
}

describe('FichaAlerta', () => {
  it('muestra estado de servicio, de establecimiento y cada afectación por separado', () => {
    render(<FichaAlerta parte={base} mostrarEnlaceNominal={false} />)

    expect(screen.getByText(/clases suspendidas/i)).toBeInTheDocument()
    expect(screen.getByText(/establecimiento evacuado/i)).toBeInTheDocument()
    expect(screen.getByText(/Alta · Inundación/)).toBeInTheDocument()
    expect(screen.getByText(/Media · Sin energía o agua/)).toBeInTheDocument()
  })

  it('muestra la descripción libre de la afectación cuando existe', () => {
    render(<FichaAlerta parte={base} mostrarEnlaceNominal={false} />)
    expect(screen.getByText('El acceso principal quedó bajo agua.')).toBeInTheDocument()
  })

  it('muestra secciones y alumnos alcanzados', () => {
    render(<FichaAlerta parte={base} mostrarEnlaceNominal={false} />)
    expect(screen.getByText(/3 secciones · 74 alumnos alcanzados/)).toBeInTheDocument()
  })

  it('no revienta sin parte seleccionado', () => {
    const { container } = render(<FichaAlerta parte={null} mostrarEnlaceNominal={false} />)
    expect(container).toBeTruthy()
  })

  it('no muestra el enlace nominal sin mostrarEnlaceNominal, aunque haya afectaciones', () => {
    render(<FichaAlerta parte={base} mostrarEnlaceNominal={false} />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('muestra el enlace al alcance nominal sólo cuando mostrarEnlaceNominal es true', () => {
    render(<FichaAlerta parte={base} mostrarEnlaceNominal={true} />)
    const link = screen.getByRole('link', { name: /alumnos alcanzados/i })
    expect(link).toHaveAttribute('href', '/infraestructura/afectados/a1')
  })
})
