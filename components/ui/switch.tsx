'use client'

import * as React from 'react'
import { Switch as SwitchPrimitive } from '@base-ui/react/switch'
import { cn } from '@/lib/utils'

export function Switch({
  className,
  label,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  label?: React.ReactNode
}) {
  return (
    <label className={cn('ui-switch', className)}>
      <SwitchPrimitive.Root className="ui-switch__root" {...props}>
        <SwitchPrimitive.Thumb className="ui-switch__thumb" />
      </SwitchPrimitive.Root>
      {label ? <span className="ui-switch__label">{label}</span> : null}
    </label>
  )
}