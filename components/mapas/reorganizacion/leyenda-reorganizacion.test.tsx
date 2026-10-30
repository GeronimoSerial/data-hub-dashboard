// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LeyendaReorganizacion } from './leyenda-reorganizacion'
import { COLORES_CAPAS, ETIQUETAS_CAPAS } from '@/lib/reorganizacion/capas'
import { COLOR_TENDENCIA, ETIQUETA_TENDENCIA } from '@/lib/reorganizacion/zonas'

afterEach(cleanup)

describe('LeyendaReorganizacion', () => {
  it('muestra cada capa con su texto y los colores de tendencia', () => {
    render(<LeyendaReorganizacion />)

    for (const etiqueta of [
      ETIQUETAS_CAPAS.universo,
      ETIQUETAS_CAPAS.otrasPrimarias,
      ETIQUETAS_CAPAS.secundarias,
      ETIQUETAS_CAPAS.seleccion,
      ETIQUETAS_CAPAS.zonas,
    ]) {
      expect(screen.getByText(etiqueta)).toBeInTheDocument()
    }
    for (const etiqueta of Object.values(ETIQUETA_TENDENCIA)) {
      expect(screen.getByText(etiqueta)).toBeInTheDocument()
    }
  })

  it('explica el anillo con texto y no solo con color', () => {
    render(<LeyendaReorganizacion />)

    expect(screen.getByText(/Anillo alrededor del punto/)).toBeInTheDocument()
  })

  it('toma los colores de las capas y de la tendencia de sus fuentes', () => {
    const { container } = render(<LeyendaReorganizacion />)

    const muestra = (etiqueta: string) =>
      screen.getByText(etiqueta).parentElement?.querySelector('[aria-hidden="true"]') as HTMLElement

    expect(muestra(ETIQUETAS_CAPAS.universo)).toHaveStyle({ backgroundColor: COLORES_CAPAS.universo })
    expect(muestra(ETIQUETAS_CAPAS.otrasPrimarias)).toHaveStyle({ backgroundColor: COLORES_CAPAS.otrasPrimarias })
    expect(muestra(ETIQUETA_TENDENCIA.baja)).toHaveStyle({ backgroundColor: COLOR_TENDENCIA.baja })
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0)
  })

  it('oculta y muestra su contenido con el botón', () => {
    render(<LeyendaReorganizacion />)

    const boton = screen.getByRole('button', { name: 'Ocultar leyenda' })
    expect(boton).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(ETIQUETAS_CAPAS.universo)).toBeVisible()

    fireEvent.click(boton)

    const alternar = screen.getByRole('button', { name: 'Mostrar leyenda' })
    expect(alternar).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText(ETIQUETAS_CAPAS.universo)).not.toBeVisible()

    fireEvent.click(alternar)

    expect(screen.getByRole('button', { name: 'Ocultar leyenda' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(ETIQUETAS_CAPAS.universo)).toBeVisible()
  })

  it('marca como ocultas las capas apagadas sin quitar su texto', () => {
    render(<LeyendaReorganizacion capasVisibles={{ universo: false }} />)

    const entrada = screen.getByText(ETIQUETAS_CAPAS.universo).closest('li')
    expect(entrada).toHaveTextContent('(oculta)')
    expect(entrada).toHaveClass('opacity-50')
    expect(screen.getByText(ETIQUETAS_CAPAS.otrasPrimarias).closest('li')).not.toHaveTextContent('(oculta)')
  })
})
