// @vitest-environment jsdom
import * as React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useDirtyGuard } from './dirty-guard'

function Harness({ dirty, onClose }: { dirty: boolean; onClose: () => void }) {
  const close = useDirtyGuard(dirty, onClose)
  return <button onClick={close}>Cerrar</button>
}

describe('useDirtyGuard', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('closes without confirmation when the form is clean', () => {
    const onClose = vi.fn()
    const confirm = vi.spyOn(window, 'confirm')
    render(<Harness dirty={false} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(confirm).not.toHaveBeenCalled()
  })

  it('prompts only when dirty and respects the user decision', () => {
    const onClose = vi.fn()
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    const view = render(<Harness dirty onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    view.unmount()
  })
})
