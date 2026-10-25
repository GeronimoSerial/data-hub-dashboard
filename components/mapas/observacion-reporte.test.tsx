// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ObservacionReporte } from './observacion-reporte'

describe('ObservacionReporte', () => {
  afterEach(cleanup)

  it('identifies report provenance and preserves the text as a semantic quotation', () => {
    const texto = 'Primer renglón\n  segundo renglón'
    render(<ObservacionReporte texto={texto} />)

    const figura = screen.getByTestId('observacion-reporte')
    expect(figura).toHaveTextContent('Observación registrada en el reporte:')
    expect(figura.querySelector('blockquote p')?.textContent).toBe(texto)
  })

  it.each([null, undefined, ''])('omits an absent observation (%s)', (texto) => {
    const { container } = render(<ObservacionReporte texto={texto} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders markup-like and long unbroken content as safe text', () => {
    const texto = `<img src=x onerror=alert(1)> ${'a'.repeat(500)}`
    render(<ObservacionReporte texto={texto} />)

    const figura = screen.getByTestId('observacion-reporte')
    expect(figura.querySelector('img')).toBeNull()
    expect(figura.querySelector('blockquote p')?.textContent).toBe(texto)
  })
})
