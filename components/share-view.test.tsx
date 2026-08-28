// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ShareView } from './share-view'

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('ShareView', () => {
  it('copies the target URL and gives clear feedback on fallback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    // jsdom has no share API, so the clipboard fallback is exercised.
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    render(<ShareView url="https://hub.test/recursos/r1" />)
    fireEvent.click(screen.getByRole('button', { name: /compartir/i }))
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('https://hub.test/recursos/r1')
    })
    expect(screen.getByRole('button', { name: /enlace copiado/i })).toBeInTheDocument()
  })

  it('reports a failure without throwing', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockRejectedValue(new Error('denied')),
      },
      configurable: true,
    })
    render(<ShareView url="https://hub.test/recursos/r1" />)
    fireEvent.click(screen.getByRole('button', { name: /compartir/i }))
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/no se pudo copiar/i)
    })
  })
})