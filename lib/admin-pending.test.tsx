// @vitest-environment jsdom
import * as React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useAdminPendingAction } from './admin-pending'

function Harness() {
  const { pending, run } = useAdminPendingAction()
  const action = async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }
  return <button disabled={pending} onClick={() => void run(action)}>Eliminar</button>
}

describe('useAdminPendingAction', () => {
  afterEach(() => { document.body.innerHTML = '' })

  it('serializes a mutation and releases the lock when it settles', async () => {
    const view = render(<Harness />)
    const button = screen.getByRole('button', { name: 'Eliminar' })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(button).toBeDisabled()
    await new Promise((resolve) => setTimeout(resolve, 10))
    view.rerender(<Harness />)
    expect(screen.getByRole('button', { name: 'Eliminar' })).not.toBeDisabled()
  })

  it('does not invoke a second action while the first is pending', async () => {
    const action = vi.fn(async () => new Promise<void>((resolve) => setTimeout(resolve, 5)))
    function Counter() {
      const { run } = useAdminPendingAction()
      return <button onClick={() => void run(action)}>Eliminar</button>
    }
    render(<Counter />)
    const button = screen.getByRole('button', { name: 'Eliminar' })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(action).toHaveBeenCalledTimes(1)
    await new Promise((resolve) => setTimeout(resolve, 10))
  })
})
