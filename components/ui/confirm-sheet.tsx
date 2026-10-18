'use client'

import type { JSX, ReactNode } from 'react'
import { Button } from './button'
import { SheetContent, SheetRoot, SheetTitle } from './sheet'

export interface ConfirmSheetProps {
  open: boolean
  titulo: string
  children?: ReactNode
  confirmarLabel: string
  cancelarLabel?: string
  confirmarDeshabilitado?: boolean
  onConfirmar: () => void
  onCancelar: () => void
  /**
   * Cierre por Escape o la X. El press fuera del panel no cierra (ver
   * `disablePointerDismissal`). Por defecto equivale a cancelar; se separa
   * cuando el botón de cancelar es una acción propia (p. ej. Descartar).
   */
  onCerrar?: () => void
}

// Confirmación pensada para el celular (spec rediseño §3.1): sale desde abajo,
// al alcance del pulgar. Cerrar con Escape o la X equivale a cancelar; un
// toque fuera del panel no hace nada, para no cancelar una acción por accidente.
export function ConfirmSheet({
  open,
  titulo,
  children,
  confirmarLabel,
  cancelarLabel = 'Cancelar',
  confirmarDeshabilitado = false,
  onConfirmar,
  onCancelar,
  onCerrar = onCancelar,
}: ConfirmSheetProps): JSX.Element {
  return (
    <SheetRoot
      open={open}
      disablePointerDismissal
      onOpenChange={(abierto) => {
        if (!abierto) onCerrar()
      }}
    >
      <SheetContent side="bottom" className="confirm-sheet">
        <SheetTitle>{titulo}</SheetTitle>
        {children ? <div className="confirm-sheet__cuerpo">{children}</div> : null}
        <div className="confirm-sheet__acciones">
          <Button type="button" variant="secondary" onClick={onCancelar}>
            {cancelarLabel}
          </Button>
          <Button type="button" onClick={onConfirmar} disabled={confirmarDeshabilitado}>
            {confirmarLabel}
          </Button>
        </div>
      </SheetContent>
    </SheetRoot>
  )
}
