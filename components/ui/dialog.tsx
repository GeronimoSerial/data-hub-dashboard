'use client'

import * as React from 'react'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTextos } from '@/lib/i18n/idioma-provider'
import { useFullscreenElement } from './use-fullscreen-element'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogTitle = DialogPrimitive.Title
export const DialogDescription = DialogPrimitive.Description

export function DialogContent({ className, children, ...props }: React.ComponentProps<typeof DialogPrimitive.Popup>) {
  const container = useFullscreenElement()
  const cerrar = useTextos().parteComunControles.cerrar
  return (
    <DialogPrimitive.Portal container={container ?? undefined}>
      <DialogPrimitive.Backdrop className="ui-dialog-backdrop" />
      <DialogPrimitive.Viewport className="ui-dialog-viewport">
        <DialogPrimitive.Popup className={cn('ui-dialog-popup', className)} {...props}>
          {children}
          <DialogPrimitive.Close className="ui-dialog-close" aria-label={cerrar}>
            <X size={18} />
          </DialogPrimitive.Close>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Viewport>
    </DialogPrimitive.Portal>
  )
}
