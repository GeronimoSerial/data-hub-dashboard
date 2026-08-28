'use client'

import * as React from 'react'
import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip'
import { cn } from '@/lib/utils'

export const Tooltip = TooltipPrimitive.Root
export const TooltipTrigger = TooltipPrimitive.Trigger

export function TooltipContent({
  className,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Popup>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner className="ui-tooltip-positioner" sideOffset={6}>
        <TooltipPrimitive.Popup className={cn('ui-tooltip-popup', className)} {...props} />
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  )
}

export function TooltipProvider({
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider {...props}>{children}</TooltipPrimitive.Provider>
  )
}