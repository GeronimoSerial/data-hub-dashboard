'use client'

import * as React from 'react'
import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Checkbox({
  className,
  label,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root> & {
  label?: React.ReactNode
}) {
  return (
    <label className={cn('ui-checkbox', className)}>
      <CheckboxPrimitive.Root className="ui-checkbox__control" {...props}>
        <CheckboxPrimitive.Indicator className="ui-checkbox__indicator">
          <Check size={14} />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      {label ? <span className="ui-checkbox__label">{label}</span> : null}
    </label>
  )
}