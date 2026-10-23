// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from './dialog'
import { SheetRoot, SheetContent, SheetTitle, SheetTrigger } from './sheet'

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(document, 'fullscreenElement')
  document.body.innerHTML = ''
})

describe.each(['dialog', 'sheet'] as const)('fullscreen %s portal', (kind) => {
  function renderOverlay(container: HTMLElement) {
    return render(kind === 'dialog' ? (
      <Dialog>
        <DialogTrigger>Abrir</DialogTrigger>
        <DialogContent><DialogTitle>Detalle</DialogTitle><button>Consultar</button></DialogContent>
      </Dialog>
    ) : (
      <SheetRoot>
        <SheetTrigger>Abrir</SheetTrigger>
        <SheetContent><SheetTitle>Detalle</SheetTitle><button>Consultar</button></SheetContent>
      </SheetRoot>
    ), { container })
  }

  it('monta dentro de la raíz fullscreen y permite cerrar para volver a la ficha', async () => {
    const root = document.createElement('div')
    document.body.append(root)
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: root })
    renderOverlay(root)
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }))
    expect(root).toContainElement(await screen.findByRole('dialog', { name: 'Detalle' }))
    await userEvent.click(screen.getByRole('button', { name: 'Consultar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByRole('button', { name: 'Abrir' })).toBeEnabled()
  })

  it('vuelve a body si se sale de fullscreen con el detalle abierto', async () => {
    const root = document.createElement('div')
    document.body.append(root)
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: root, writable: true })
    renderOverlay(root)
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }))
    expect(root).toContainElement(await screen.findByRole('dialog'))
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null })
    fireEvent(document, new Event('fullscreenchange'))
    await waitFor(() => expect(root).not.toContainElement(screen.getByRole('dialog')))
    expect(document.body).toContainElement(screen.getByRole('dialog'))
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
