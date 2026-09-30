// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import VerificacionesLayout from './layout'

describe('VerificacionesLayout', () => {
  it('mantiene el contenido dentro del contenedor desplazable público', () => {
    render(<VerificacionesLayout><p>contenido de verificación</p></VerificacionesLayout>)

    const scroller = document.querySelector('.publico-main')
    expect(scroller).toBeInTheDocument()
    expect(scroller).toContainElement(screen.getByText('contenido de verificación'))
  })
})
