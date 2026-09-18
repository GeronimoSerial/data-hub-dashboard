// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FichaAlerta } from './ficha-alerta'
import type { AlertaActiva } from '@/lib/infraestructura/consulta'

afterEach(() => {
  document.body.innerHTML = ''
})

const base: AlertaActiva = {
  id: 'a1',
  cueAnexo: '1801605-04',
  nombre: 'Escuela 1',
  departamento: 'ER',
  localidad: 'Parana',
  lat: -31.7,
  lon: -60.5,
  motivo: 'Inundación',
  categoria: 'establecimiento',
  severidad: 'Alta',
  creadaEn: '2026-08-01T00:00:00Z',
}

describe('FichaAlerta', () => {
  it('lista cada alerta por separado en vez de sumar afectaciones', () => {
    const alertas: AlertaActiva[] = [
      base,
      { ...base, id: 'a2', motivo: 'Sin energía o agua', severidad: 'Media' },
    ]
    render(<FichaAlerta alertas={alertas} mostrarEnlaceNominal={false} />)

    expect(screen.getByText(/2 alertas activas/i)).toBeInTheDocument()
    expect(screen.getByText(/Alta · Inundación/)).toBeInTheDocument()
    expect(screen.getByText(/Media · Sin energía o agua/)).toBeInTheDocument()
  })

  it('no incluye ninguna acción de gestión', () => {
    render(<FichaAlerta alertas={[base]} mostrarEnlaceNominal={false} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('no revienta con una lista vacía', () => {
    const { container } = render(<FichaAlerta alertas={[]} mostrarEnlaceNominal={false} />)
    expect(container).toBeTruthy()
  })

  it('no muestra el enlace nominal sin puedeVerNominal, aunque haya alertas', () => {
    render(<FichaAlerta alertas={[base]} mostrarEnlaceNominal={false} />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('muestra el enlace al alcance nominal sólo cuando mostrarEnlaceNominal es true', () => {
    render(<FichaAlerta alertas={[base]} mostrarEnlaceNominal={true} />)
    const link = screen.getByRole('link', { name: /alumnos alcanzados/i })
    expect(link).toHaveAttribute('href', '/infraestructura/afectados/a1')
  })
})
