'use client'

import type { JSX, ReactNode } from 'react'
import { Button } from './button'
import { useTextos } from '@/lib/i18n/idioma-provider'
import { SheetContent, SheetRoot, SheetTitle } from './sheet'

export interface BottomSheetProps {
  open: boolean
  titulo: string
  children: ReactNode
  cerrarLabel?: string
  onCerrar: () => void
}

// Panel de consulta que sale desde abajo, igual que ConfirmSheet, para que el
// flujo del parte tenga un solo patrón para "ver más" sin empujar la página.
export function BottomSheet({ open, titulo, children, cerrarLabel, onCerrar }: BottomSheetProps): JSX.Element {
  const t = useTextos().parteComunControles
  return (
    <SheetRoot
      open={open}
      onOpenChange={(abierto) => {
        if (!abierto) onCerrar()
      }}
    >
      <SheetContent side="bottom" className="confirm-sheet bottom-sheet">
        <SheetTitle>{titulo}</SheetTitle>
        <div className="confirm-sheet__cuerpo bottom-sheet__cuerpo">{children}</div>
        <div className="confirm-sheet__acciones bottom-sheet__acciones">
          <Button type="button" variant="secondary" onClick={onCerrar}>
            {cerrarLabel ?? t.cerrar}
          </Button>
        </div>
      </SheetContent>
    </SheetRoot>
  )
}
