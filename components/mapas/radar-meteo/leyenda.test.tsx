// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { LeyendaRadar } from './leyenda'

describe('leyenda del radar meteorológico', () => {
  it('mantiene título, unidad, escala y actualización sin aclaraciones técnicas', () => {
    const { container } = render(<LeyendaRadar variable="lluvia" minutos={5} paso={1} />)
    expect(container.textContent).toContain('Lluvia (mm)')
    expect(container.textContent).toContain('mm/h')
    expect(container.textContent).toContain('Actualizado')
    expect(container.textContent).not.toMatch(/no radar observado|fuente|metodología/i)
  })

  it('oculta la actualización cuando no hay antigüedad disponible', () => {
    const { container } = render(<LeyendaRadar variable="lluvia" paso={1} />)
    expect(container.textContent).not.toContain('Actualizado')
  })
})
