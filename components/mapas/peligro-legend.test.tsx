// @vitest-environment jsdom
import { describe, expect, it, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import {
  ETIQUETA_NIVEL_PELIGRO,
  NIVELES_PELIGRO,
} from '@/lib/mapas/peligro-capas'
import { PeligroLegend } from './peligro-legend'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('PeligroLegend', () => {
  it('expone una etiqueta de texto accesible por cada uno de los 5 niveles', () => {
    render(<PeligroLegend />)

    const lista = screen.getByRole('list', { name: /niveles de peligro/i })
    const items = within(lista).getAllByRole('listitem')
    expect(items).toHaveLength(NIVELES_PELIGRO.length)

    for (const nivel of NIVELES_PELIGRO) {
      expect(screen.getByText(ETIQUETA_NIVEL_PELIGRO[nivel])).toBeInTheDocument()
    }
  })

  it('incluye un ícono no-color por nivel, oculto para la accesibilidad (el texto es la fuente)', () => {
    render(<PeligroLegend />)
    const lista = screen.getByRole('list', { name: /niveles de peligro/i })
    const items = within(lista).getAllByRole('listitem')

    for (const item of items) {
      const iconos = item.querySelectorAll('svg[aria-hidden="true"]')
      expect(iconos.length).toBeGreaterThan(0)
      expect(item.textContent?.trim().length).toBeGreaterThan(0)
    }
  })

  it('con hayNivelProvisorio muestra el aviso de nivel provisorio', () => {
    render(<PeligroLegend hayNivelProvisorio />)

    expect(
      screen.getByText(
        'Nivel provisorio (umbrales fijos de lluvia) mientras se calcula la climatología de la zona.',
      ),
    ).toBeInTheDocument()
  })

  it('sin hayNivelProvisorio no muestra el aviso de nivel provisorio', () => {
    render(<PeligroLegend />)

    expect(screen.queryByText(/Nivel provisorio/)).not.toBeInTheDocument()
  })
})
