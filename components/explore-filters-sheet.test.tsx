// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MobileFilters } from './explore-filters-sheet'

const options = {
  temas: [{ value: 'matricula', label: 'Matrícula' }],
  niveles: [{ value: 'primario', label: 'Primario' }],
  formatos: [{ value: 'mapa', label: 'Mapa' }],
}

afterEach(() => {
  document.body.innerHTML = ''
})

async function openSheet() {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: /filtros/i }))
  await waitFor(() => {
    expect(screen.getByRole('heading', { name: /filtrar resultados/i })).toBeInTheDocument()
  })
  return user
}

async function pick(user: ReturnType<typeof userEvent.setup>, label: string, option: string) {
  // Base UI renders portal popups with pointer-events inert in jsdom, so the
  // option is selected through keyboard navigation (deterministic, same store).
  await user.click(screen.getByLabelText(label))
  await screen.findByText(option) // wait until the popup is rendered
  // The option is the second item after the "Todos …" placeholder.
  await user.keyboard('{ArrowDown}{ArrowDown}{Enter}')
}

describe('MobileFilters (explore Sheet)', () => {
  it('applies the staged draft to the URL contract on "Aplicar filtros"', async () => {
    const onApply = vi.fn()
    render(<MobileFilters filters={{}} options={options} activeCount={0} onApply={onApply} />)
    const user = await openSheet()

    // Staging a filter inside the sheet must not touch the URL yet.
    await pick(user, 'Tema', 'Matrícula')
    expect(onApply).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /aplicar filtros/i }))
    expect(onApply).toHaveBeenCalledTimes(1)
    expect(onApply).toHaveBeenCalledWith({ tema: 'matricula' })
  })

  it('cancelling discards the staged draft and never applies it', async () => {
    const onApply = vi.fn()
    render(<MobileFilters filters={{}} options={options} activeCount={0} onApply={onApply} />)
    const user = await openSheet()

    await pick(user, 'Formato', 'Mapa')

    await user.click(screen.getByRole('button', { name: /^cancelar$/i }))
    expect(onApply).not.toHaveBeenCalled()

    // Reopening resets the draft to the URL filters (nothing picked). The
    // closed Formato trigger resolves its label from the items contract.
    const user2 = await openSheet()
    expect(screen.getByLabelText('Formato')).toHaveTextContent('Todos los formatos')
    await user2.click(screen.getByRole('button', { name: /aplicar filtros/i }))
    expect(onApply).toHaveBeenCalledWith({})
  })

  it('preloads the sheet draft from the current URL filters', async () => {
    const onApply = vi.fn()
    render(<MobileFilters filters={{ tema: 'matricula', formato: 'mapa' }} options={options} activeCount={0} onApply={onApply} />)
    await openSheet()
    // Closed triggers show the resolved labels of the current URL filters.
    expect(screen.getByLabelText('Tema')).toHaveTextContent('Matrícula')
    expect(screen.getByLabelText('Formato')).toHaveTextContent('Mapa')
    // Applying with no edits reproduces the same filters (equivalent desktop URL).
    await userEvent.setup().click(screen.getByRole('button', { name: /aplicar filtros/i }))
    expect(onApply).toHaveBeenCalledWith({ tema: 'matricula', formato: 'mapa' })
  })

  it('clears all filters from the sheet and applies an empty draft', async () => {
    const onApply = vi.fn()
    render(<MobileFilters filters={{ tema: 'matricula' }} options={options} activeCount={1} onApply={onApply} />)
    const user = await openSheet()
    await user.click(screen.getByRole('button', { name: /limpiar filtros/i }))
    await user.click(screen.getByRole('button', { name: /aplicar filtros/i }))
    expect(onApply).toHaveBeenCalledWith({})
  })
})