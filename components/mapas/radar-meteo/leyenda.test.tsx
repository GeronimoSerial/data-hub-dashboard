// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { LeyendaRadar } from './leyenda'

describe('leyenda del radar meteorológico', () => {
  it('mantiene título, unidad, escala y actualización sin aclaraciones técnicas', () => {
    const { container } = render(<LeyendaRadar variable="lluvia" minutos={5} paso={1} />)
    expect(container.querySelector('b')).toHaveTextContent('Lluvia')
    expect(container.textContent).toContain('mm/h')
    // La frescura va en el tooltip del título, no en el texto.
    expect(container.textContent).not.toContain('Actualizado')
    expect(container.querySelector('b')?.getAttribute('title')).toMatch(/^Actualizado /)
    expect(container.textContent).not.toMatch(/no radar observado|fuente|metodología/i)
  })

  it('conserva la aclaración de granizo y su unidad', () => {
    const { container } = render(<LeyendaRadar variable="granizo" paso={1} />)
    expect(container.querySelector('b')).toHaveTextContent('Granizo (estimado)')
    expect(container.querySelector('small')).toHaveTextContent('categoría')
  })

  it('oculta la actualización cuando no hay antigüedad disponible', () => {
    const { container } = render(<LeyendaRadar variable="lluvia" paso={1} />)
    expect(container.textContent).not.toContain('Actualizado')
  })
})
