'use client'

import * as React from 'react'
import { Select as SelectPrimitive } from '@base-ui/react/select'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Wraps the Base UI Select root. Callers should pass `items` (a value→label
 * map or array) so the trigger can render the selected option's label even
 * while the popup is closed; without `items` the trigger shows the raw value.
 */
export function Select({
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root {...props}>{children}</SelectPrimitive.Root>
}

export function SelectTrigger({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger className={cn('ui-select-trigger', className)} {...props}>
      <SelectPrimitive.Value />
      <SelectPrimitive.Icon><ChevronDown size={16} /></SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

export function SelectContent({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Popup>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner className="ui-select-positioner" sideOffset={6}>
        <SelectPrimitive.Popup className={cn('ui-select-popup', className)} {...props} />
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

export function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item className={cn('ui-select-item', className)} {...props}>
      <SelectPrimitive.ItemIndicator><Check size={15} /></SelectPrimitive.ItemIndicator>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}