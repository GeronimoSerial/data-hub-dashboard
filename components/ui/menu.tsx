'use client'

import * as React from 'react'
import { Menu as MenuPrimitive } from '@base-ui/react/menu'
import { cn } from '@/lib/utils'

export const Menu = MenuPrimitive.Root
export const MenuTrigger = MenuPrimitive.Trigger

export function MenuContent({ className, ...props }: React.ComponentProps<typeof MenuPrimitive.Popup>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner className="ui-menu-positioner" sideOffset={8}>
        <MenuPrimitive.Popup className={cn('ui-menu-popup', className)} {...props} />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  )
}

export function MenuItem({ className, ...props }: React.ComponentProps<typeof MenuPrimitive.Item>) {
  return <MenuPrimitive.Item className={cn('ui-menu-item', className)} {...props} />
}
