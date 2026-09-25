'use client'

import * as React from 'react'
import { Toggle } from '@base-ui/react/toggle'
import { ToggleGroup as ToggleGroupPrimitive } from '@base-ui/react/toggle-group'
import { cn } from '@/lib/utils'

/**
 * Single-select segmented control built on Base UI's ToggleGroup/Toggle,
 * for a small closed set of mutually exclusive options (e.g. a metric
 * switch) — the visual alternative to a `RadioGroup` when the options read
 * better as adjacent buttons than as a stacked list.
 */
export function SegmentedGroup({
  className,
  value,
  onValueChange,
  ...props
}: Omit<React.ComponentProps<typeof ToggleGroupPrimitive>, 'value' | 'onValueChange' | 'multiple'> & {
  value: string
  onValueChange: (value: string) => void
}) {
  return (
    <ToggleGroupPrimitive
      className={cn('ui-segmented', className)}
      value={[value]}
      onValueChange={(next) => {
        const [selected] = next
        if (selected != null) onValueChange(selected)
      }}
      {...props}
    />
  )
}

export function SegmentedItem({
  className,
  ...props
}: React.ComponentProps<typeof Toggle>) {
  return <Toggle className={cn('ui-segmented__item', className)} {...props} />
}
