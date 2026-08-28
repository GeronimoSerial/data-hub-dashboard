'use client'

import * as React from 'react'
import { Tabs as TabsPrimitive } from '@base-ui/react/tabs'
import { cn } from '@/lib/utils'

export const Tabs = TabsPrimitive.Root

export function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn('ui-tabs-list', className)} {...props} />
}

export function TabsTab({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Tab>) {
  return <TabsPrimitive.Tab className={cn('ui-tabs-tab', className)} {...props} />
}

export function TabsPanel({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Panel>) {
  return <TabsPrimitive.Panel className={cn('ui-tabs-panel', className)} {...props} />
}