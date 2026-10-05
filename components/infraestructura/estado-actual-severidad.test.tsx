// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EstadoActualSeveridad } from './estado-actual-severidad'

describe('EstadoActualSeveridad', () => {
  it('muestra el nombre sobre el tono de severidad y la marca sugerida opcional', () => {
    const { container } = render(<EstadoActualSeveridad severidad="Alta" sugerida />)

    expect(screen.getByText('Gravedad Alta')).toBeInTheDocument()
    expect(screen.getByText('Sugerido')).toBeInTheDocument()
    expect(screen.getByText('Gravedad Alta')).toHaveAttribute('style', expect.stringContaining('background-color'))
    expect(container.querySelector('.estado-actual-severidad__marca')).not.toBeInTheDocument()
  })

  it('no muestra la marca Sugerido cuando el nivel no es sugerido', () => {
    const { container } = render(<EstadoActualSeveridad severidad="Alta" />)
    expect(container.querySelector('.badge-sugerido')).not.toBeInTheDocument()
  })
})
