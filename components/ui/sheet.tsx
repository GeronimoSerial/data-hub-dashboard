'use client'

import * as React from 'react'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export const SheetRoot = DialogPrimitive.Root
export const SheetTrigger = DialogPrimitive.Trigger
export const SheetTitle = DialogPrimitive.Title
export const SheetDescription = DialogPrimitive.Description
export const SheetClose = DialogPrimitive.Close

const sideClass = {
  top: 'ui-sheet--top',
  bottom: 'ui-sheet--bottom',
  left: 'ui-sheet--left',
  right: 'ui-sheet--right',
} as const

export function SheetContent({
  className,
  side = 'right',
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Popup> & {
  side?: 'top' | 'bottom' | 'left' | 'right'
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop className="ui-sheet-backdrop" />
      <DialogPrimitive.Viewport className="ui-sheet-viewport">
        <DialogPrimitive.Popup
          className={cn('ui-sheet', sideClass[side], className)}
          {...props}
        >
          {children}
          <DialogPrimitive.Close className="ui-sheet-close" aria-label="Cerrar">
            <X size={18} />
          </DialogPrimitive.Close>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Viewport>
    </DialogPrimitive.Portal>
  )
}