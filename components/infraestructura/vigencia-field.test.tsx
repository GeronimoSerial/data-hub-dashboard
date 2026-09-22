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

/** Local `YYYY-MM-DD`, la forma que espera `<input type="date">`. */
function formatoFecha(fecha: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}`
}

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

    expect(screen.getByText('Desde ahora')).toBeVisible()
    expect(screen.getByLabelText('Fecha')).not.toBeVisible()
    expect(screen.getByLabelText('Hora')).not.toBeVisible()
  })

  it('reveals the date and time inputs when "Cambiar" is pressed', async () => {
    const user = userEvent.setup()
    render(<VigenciaField value={AHORA} onChange={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Cambiar' }))

    expect(screen.getByLabelText('Fecha')).toBeVisible()
    expect(screen.getByLabelText('Hora')).toBeVisible()
    expect(screen.queryByText('Desde ahora')).not.toBeVisible()
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

  // Un valor "later than now" fijo (2026-09-25) queda obsoleto en cuanto pasa
  // esa fecha real: se calcula relativo al reloj del test, dentro de la
  // ventana de 12 meses, para que la prueba siga siendo válida siempre.
  it('lets the director pick a valid later moment, still within the 12-month window', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: 'Cambiar' }))
    const ayer = new Date()
    ayer.setDate(ayer.getDate() - 1)
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: formatoFecha(ayer) } })
    fireEvent.change(screen.getByLabelText('Hora'), { target: { value: '18:45' } })

    const emitido = screen.getByLabelText('valor actual').textContent
    expect(emitido).not.toBeNull()
    expect(new Date(emitido as string).getTime()).toBeGreaterThan(new Date(AHORA).getTime())
  })

  // Issue #29: una fecha del futuro se rechaza. Tipear pasa por alto el
  // min/max nativo del input, así que el handler de cambio tiene que
  // rechazarla igual, sin tocar el valor emitido, y avisar por qué.
  it('rechaza una fecha del futuro y avisa, sin tocar el valor', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<VigenciaField value={AHORA} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Cambiar' }))
    const manana = new Date()
    manana.setDate(manana.getDate() + 1)
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: formatoFecha(manana) } })

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'La fecha debe estar entre hace 12 meses y el momento actual.',
    )
  })

  // Issue #30: una fecha de hace más de 12 meses se rechaza con el mismo
  // mecanismo.
  it('rechaza una fecha de hace más de 12 meses y avisa, sin tocar el valor', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<VigenciaField value={AHORA} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Cambiar' }))
    const vieja = new Date()
    vieja.setMonth(vieja.getMonth() - 13)
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: formatoFecha(vieja) } })

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'La fecha debe estar entre hace 12 meses y el momento actual.',
    )
  })

  // Además del rechazo en el handler, el input nativo ya debería impedir
  // seleccionar un día fuera de la ventana desde el picker del navegador.
  it('fija min/max nativos del input de fecha a la ventana móvil de 12 meses', async () => {
    const user = userEvent.setup()
    const ahora = new Date()
    const doceMesesAtras = new Date(ahora)
    doceMesesAtras.setMonth(doceMesesAtras.getMonth() - 12)

    render(<VigenciaField value={AHORA} onChange={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Cambiar' }))

    const inputFecha = screen.getByLabelText('Fecha') as HTMLInputElement
    expect(inputFecha.max).toBe(formatoFecha(ahora))
    expect(inputFecha.min).toBe(formatoFecha(doceMesesAtras))
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

    // El eco del panel y el resumen colapsado dicen lo mismo a propósito: lo
    // que el director confirma adentro es lo que va a leer afuera. Se busca
    // el del panel, que es el que está a la vista en este momento.
    const eco = document.querySelector('.vigencia-field__resumen-valor')
    expect(eco).toHaveTextContent('Desde el 15 de septiembre a las 08:00')
  })

  /*
    "Usar ahora" era el único botón del panel, así que se leía como la acción
    principal — pero descartaba el momento recién elegido. Leía "confirmar" y
    hacía "cancelar". Ahora hay una acción hacia adelante ("Listo") y una
    hacia atrás, y esta última dice a dónde lleva.
  */
  it('"Volver a «Desde ahora»" deshace lo elegido y recaptura el momento real', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<VigenciaField value={AHORA} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Cambiar' }))
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-09-15' } })

    const antes = Date.now()
    await user.click(screen.getByRole('button', { name: 'Volver a «Desde ahora»' }))
    const despues = Date.now()

    // Collapses back to the default "Desde ahora" display...
    expect(screen.getByText('Desde ahora')).toBeVisible()
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

  // La leyenda es la pregunta que §12 hace ("desde cuándo rige"), no el
  // sustantivo suelto: sobre una palabra colapsada, "Rige desde" obliga al
  // director a deducir que le están preguntando algo.
  it('rotula el grupo con la pregunta, no con el sustantivo suelto', () => {
    render(<VigenciaField value={AHORA} onChange={vi.fn()} />)
    expect(screen.getByText('¿Desde cuándo rige este cambio?')).toBeInTheDocument()
  })

  it('"Listo" cierra el panel conservando el momento elegido', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: 'Cambiar' }))
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-09-15' } })
    fireEvent.change(screen.getByLabelText('Hora'), { target: { value: '08:00' } })
    await user.click(screen.getByRole('button', { name: 'Listo' }))

    expect(screen.getByLabelText('Fecha')).not.toBeVisible()
    // El estado colapsado deja de decir "Desde ahora" y afirma lo elegido.
    const colapsado = document.querySelector('.vigencia-field__ahora')
    expect(colapsado).toHaveTextContent('Desde el 15 de septiembre a las 08:00')
    expect(colapsado).toBeVisible()
  })

  it('disables the toggle and inputs when disabled', async () => {
    render(<VigenciaField value={AHORA} onChange={vi.fn()} disabled />)
    expect(screen.getByRole('button', { name: 'Cambiar' })).toBeDisabled()
  })
})
