// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  ETIQUETA_HORIZONTE,
  HORIZONTES_RADAR,
  SelectorHorizonte,
  TEXTO_SIN_EVIDENCIA,
} from './selector-horizonte'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('SelectorHorizonte', () => {
  it('muestra los 4 horizontes con su etiqueta y los no disponibles con aria-disabled y title', () => {
    render(
      <SelectorHorizonte
        horizonte="ahora"
        onChange={() => {}}
        disponibles={['ahora', 72]}
      />,
    )

    for (const h of HORIZONTES_RADAR) {
      expect(screen.getByRole('button', { name: ETIQUETA_HORIZONTE[h] })).toBeInTheDocument()
    }

    const deshabilitado = screen.getByRole('button', { name: ETIQUETA_HORIZONTE[24] })
    expect(deshabilitado).toHaveAttribute('aria-disabled', 'true')
    expect(deshabilitado).toHaveAttribute('title', TEXTO_SIN_EVIDENCIA)

    const habilitado = screen.getByRole('button', { name: ETIQUETA_HORIZONTE[72] })
    expect(habilitado).toHaveAttribute('aria-disabled', 'false')
  })

  it('al hacer click en un horizonte disponible dispara onChange con ese valor', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<SelectorHorizonte horizonte="ahora" onChange={onChange} disponibles={[24, 72, 240]} />)

    await user.click(screen.getByRole('button', { name: ETIQUETA_HORIZONTE[72] }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(72)
  })

  it('al hacer click en un horizonte sin evidencia NO dispara onChange', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <SelectorHorizonte horizonte="ahora" onChange={onChange} disponibles={['ahora', 72]} />,
    )

    await user.click(screen.getByRole('button', { name: ETIQUETA_HORIZONTE[240] }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('con Enter o Space sobre un horizonte sin evidencia tampoco dispara onChange', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <SelectorHorizonte horizonte="ahora" onChange={onChange} disponibles={['ahora', 24]} />,
    )

    const deshabilitado = screen.getByRole('button', { name: ETIQUETA_HORIZONTE[72] })
    deshabilitado.focus()
    expect(deshabilitado).toHaveFocus()

    await user.keyboard('{Enter}')
    await user.keyboard(' ')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('el texto de "sin evidencia" sólo aparece cuando hay horizontes deshabilitados', () => {
    const { rerender } = render(
      <SelectorHorizonte horizonte="ahora" onChange={() => {}} disponibles={['ahora']} />,
    )
    expect(screen.getByText(TEXTO_SIN_EVIDENCIA)).toBeInTheDocument()

    rerender(
      <SelectorHorizonte
        horizonte="ahora"
        onChange={() => {}}
        disponibles={[...HORIZONTES_RADAR]}
      />,
    )
    expect(screen.queryByText(TEXTO_SIN_EVIDENCIA)).not.toBeInTheDocument()
  })

  it('anuncia el horizonte activo en una región aria-live que se actualiza', () => {
    const { rerender } = render(
      <SelectorHorizonte horizonte="ahora" onChange={() => {}} disponibles={[...HORIZONTES_RADAR]} />,
    )
    const region = screen.getByText(/horizonte activo/i)
    expect(region).toHaveAttribute('aria-live', 'polite')
    expect(region).toHaveTextContent(ETIQUETA_HORIZONTE.ahora)

    rerender(
      <SelectorHorizonte horizonte={240} onChange={() => {}} disponibles={[...HORIZONTES_RADAR]} />,
    )
    expect(screen.getByText(/horizonte activo/i)).toHaveTextContent(ETIQUETA_HORIZONTE[240])
  })
})
