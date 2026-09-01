// @vitest-environment jsdom
import * as React from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useAdminDialogFocus } from './admin-dialog-focus'

function Harness() {
  const [open, setOpen] = React.useState(false)
  const rememberTrigger = useAdminDialogFocus(open)
  return (
    <>
      <button onClick={() => { rememberTrigger(); setOpen(true) }}>Abrir</button>
      {open ? <button onClick={() => setOpen(false)}>Cerrar diálogo</button> : null}
    </>
  )
}

describe('useAdminDialogFocus', () => {
  afterEach(() => { document.body.innerHTML = '' })

  it('restores focus to the trigger after a controlled dialog closes', () => {
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Abrir' })
    trigger.focus()
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar diálogo' }))
    expect(document.activeElement).toBe(trigger)
  })
})
