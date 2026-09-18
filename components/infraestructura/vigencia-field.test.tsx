// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VigenciaField } from './vigencia-field'

// Native date/time inputs are opaque, segmented widgets in real browsers;
// jsdom has no picker UI to drive, so — as with the file input in
// `input.test.tsx` — value changes are dispatched directly via fireEvent
// rather than simulated keystroke-by-keystroke with userEvent.type.

afterEach(() => {
  document.body.innerHTML = ''
})

const AHORA = '2026-09-18T10:30:00.000Z'

/** Controlled harness: mirrors how a consuming form owns the value via useState. */
function Harness({ inicial = AHORA }: { inicial?: string }) {
  const [value, setValue] = useState(inicial)
  return (
    <>
      <VigenciaField value={value} onChange={setValue} />
      <output aria-label="valor actual">{value}</output>
    </>
  )
}

describe('VigenciaField', () => {
  it('renders "Ahora" by default with date/time inputs hidden', () => {
    render(<VigenciaField value={AHORA} onChange={vi.fn()} />)

    expect(screen.getByText('Ahora')).toBeVisible()
    expect(screen.getByLabelText('Fecha')).not.toBeVisible()
    expect(screen.getByLabelText('Hora')).not.toBeVisible()
  })

  it('reveals the date and time inputs when "Cambiar" is pressed', async () => {
    const user = userEvent.setup()
    render(<VigenciaField value={AHORA} onChange={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Cambiar' }))

    expect(screen.getByLabelText('Fecha')).toBeVisible()
    expect(screen.getByLabelText('Hora')).toBeVisible()
    expect(screen.queryByText('Ahora')).not.toBeVisible()
  })

  it('lets the director pick a moment earlier than now', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: 'Cambiar' }))
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-09-15' } })
    fireEvent.change(screen.getByLabelText('Hora'), { target: { value: '08:00' } })

    const emitido = screen.getByLabelText('valor actual').textContent
    expect(emitido).not.toBeNull()
    expect(new Date(emitido as string).getTime()).toBeLessThan(new Date(AHORA).getTime())
  })

  it('lets the director pick a moment later than now', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: 'Cambiar' }))
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-09-25' } })
    fireEvent.change(screen.getByLabelText('Hora'), { target: { value: '18:45' } })

    const emitido = screen.getByLabelText('valor actual').textContent
    expect(emitido).not.toBeNull()
    expect(new Date(emitido as string).getTime()).toBeGreaterThan(new Date(AHORA).getTime())
  })

  it('emits an ISO 8601 string that preserves the untouched half of the timestamp', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<VigenciaField value={AHORA} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Cambiar' }))
    fireEvent.change(screen.getByLabelText('Hora'), { target: { value: '07:15' } })

    expect(onChange).toHaveBeenCalled()
    const ultimoValor = onChange.mock.calls.at(-1)?.[0]
    expect(typeof ultimoValor).toBe('string')
    expect(ultimoValor).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    // Only the time changed — the calendar date carries over from `value`.
    const resultado = new Date(ultimoValor as string)
    expect(resultado.getFullYear()).toBe(new Date(AHORA).getFullYear())
    expect(resultado.getMonth()).toBe(new Date(AHORA).getMonth())
    expect(resultado.getDate()).toBe(new Date(AHORA).getDate())
  })

  it('echoes the chosen moment in plain language, not just raw widget values', async () => {
    render(<Harness />)

    await userEvent.setup().click(screen.getByRole('button', { name: 'Cambiar' }))
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-09-15' } })
    fireEvent.change(screen.getByLabelText('Hora'), { target: { value: '08:00' } })

    expect(screen.getByText('Rige desde el 15 de septiembre a las 08:00')).toBeVisible()
  })

  it('lets the director return to "Ahora" via "Usar ahora", resetting to the real current moment', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<VigenciaField value={AHORA} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Cambiar' }))
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-09-15' } })

    const antes = Date.now()
    await user.click(screen.getByRole('button', { name: 'Usar ahora' }))
    const despues = Date.now()

    // Collapses back to the default "Ahora" display...
    expect(screen.getByText('Ahora')).toBeVisible()
    expect(screen.getByLabelText('Fecha')).not.toBeVisible()
    // ...and re-captures a fresh "now" rather than keeping the mid-edit
    // value or the original `value` prop — the timestamp emitted must fall
    // in the window around the click, not match either stale value.
    const emitido = onChange.mock.calls.at(-1)?.[0] as string
    const emitidoMs = new Date(emitido).getTime()
    expect(emitidoMs).toBeGreaterThanOrEqual(antes)
    expect(emitidoMs).toBeLessThanOrEqual(despues)
    // Focus returns to "Cambiar" so keyboard users aren't dropped.
    expect(screen.getByRole('button', { name: 'Cambiar' })).toHaveFocus()
  })

  it('exposes the disclosure via aria-expanded/aria-controls and is keyboard operable', async () => {
    const user = userEvent.setup()
    render(<VigenciaField value={AHORA} onChange={vi.fn()} id="rige-desde" />)

    const boton = screen.getByRole('button', { name: 'Cambiar' })
    expect(boton).toHaveAttribute('aria-expanded', 'false')
    expect(boton).toHaveAttribute('aria-controls', 'rige-desde-panel')
    expect(document.getElementById('rige-desde-panel')).toBeInTheDocument()

    await user.tab()
    expect(boton).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(boton).toHaveAttribute('aria-expanded', 'true')
    // Focus moves into the newly revealed date input for keyboard users.
    expect(screen.getByLabelText('Fecha')).toHaveFocus()
  })

  it('labels the group with the "Rige desde" legend', () => {
    render(<VigenciaField value={AHORA} onChange={vi.fn()} />)
    expect(screen.getByText('Rige desde')).toBeInTheDocument()
  })

  it('disables the toggle and inputs when disabled', async () => {
    render(<VigenciaField value={AHORA} onChange={vi.fn()} disabled />)
    expect(screen.getByRole('button', { name: 'Cambiar' })).toBeDisabled()
  })
})
