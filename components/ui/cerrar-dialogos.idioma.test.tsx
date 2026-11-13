// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Dialog, DialogContent, DialogTitle } from './dialog'
import { SheetContent, SheetRoot, SheetTitle } from './sheet'
import { IdiomaProvider } from '@/lib/i18n/idioma-provider'

afterEach(() => cleanup())

describe('cierre de diálogo y hoja · idioma', () => {
  it('el diálogo cierra con "Cerrar" en español', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Título</DialogTitle>
        </DialogContent>
      </Dialog>,
    )
    expect(screen.getByRole('button', { name: 'Cerrar' })).toBeInTheDocument()
  })

  it('el diálogo cierra con "Fechar" en portugués', () => {
    render(
      <IdiomaProvider idioma="pt">
        <Dialog open>
          <DialogContent>
            <DialogTitle>Título</DialogTitle>
          </DialogContent>
        </Dialog>
      </IdiomaProvider>,
    )
    expect(screen.getByRole('button', { name: 'Fechar' })).toBeInTheDocument()
  })

  it('la hoja cierra con "Fechar" en portugués', () => {
    render(
      <IdiomaProvider idioma="pt">
        <SheetRoot open>
          <SheetContent>
            <SheetTitle>Título</SheetTitle>
          </SheetContent>
        </SheetRoot>
      </IdiomaProvider>,
    )
    expect(screen.getByRole('button', { name: 'Fechar' })).toBeInTheDocument()
  })
})
