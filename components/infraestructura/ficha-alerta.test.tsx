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
  severidad: 'Alta',
  creadaEn: '2026-08-01T00:00:00Z',
}

describe('FichaAlerta', () => {
  it('lista cada alerta por separado en vez de sumar afectaciones', () => {
    const alertas: AlertaActiva[] = [
      base,
      { ...base, id: 'a2', motivo: 'Sin energía o agua', severidad: 'Media' },
    ]
    render(<FichaAlerta alertas={alertas} />)

    expect(screen.getByText(/2 alertas activas/i)).toBeInTheDocument()
    expect(screen.getByText(/Alta · Inundación/)).toBeInTheDocument()
    expect(screen.getByText(/Media · Sin energía o agua/)).toBeInTheDocument()
  })

  it('no incluye ninguna acción de gestión', () => {
    render(<FichaAlerta alertas={[base]} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('no revienta con una lista vacía', () => {
    const { container } = render(<FichaAlerta alertas={[]} />)
    expect(container).toBeTruthy()
  })
})
