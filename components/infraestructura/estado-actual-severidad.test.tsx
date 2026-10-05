// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EstadoActualSeveridad } from './estado-actual-severidad'

describe('EstadoActualSeveridad', () => {
  it('usa el mismo triángulo de severidad Alta y muestra la marca sugerida opcional', () => {
    const { container } = render(<EstadoActualSeveridad severidad="Alta" sugerida />)

    expect(screen.getByText('Gravedad Alta')).toBeInTheDocument()
    expect(screen.getByText('Sugerido')).toBeInTheDocument()
    expect(container.querySelector('.estado-actual-severidad__marca--triangulo')).toHaveAttribute(
      'style',
      expect.stringContaining('background-color'),
    )
    expect(container.querySelectorAll('.estado-actual-severidad__marca')).toHaveLength(1)
  })

  it('no muestra la marca Sugerido cuando el nivel no es sugerido', () => {
    const { container } = render(<EstadoActualSeveridad severidad="Alta" />)
    expect(container.querySelector('.badge-sugerido')).not.toBeInTheDocument()
  })
})
