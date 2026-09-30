// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ParteLayout from './layout'

describe('ParteLayout', () => {
  it('mantiene el contenido dentro del contenedor desplazable público', () => {
    render(<ParteLayout><p>contenido del parte</p></ParteLayout>)

    const scroller = document.querySelector('.publico-main')
    expect(scroller).toBeInTheDocument()
    expect(scroller).toContainElement(screen.getByText('contenido del parte'))
  })
})
