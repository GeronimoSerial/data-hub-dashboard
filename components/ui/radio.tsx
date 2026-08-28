'use client'

import * as React from 'react'
import { Radio } from '@base-ui/react/radio'
import { RadioGroup as RadioGroupPrimitive } from '@base-ui/react/radio-group'
import { cn } from '@/lib/utils'

export function RadioGroup({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive>) {
  return <RadioGroupPrimitive className={cn('ui-radio-group', className)} {...props} />
}

export function RadioItem({
  className,
  label,
  ...props
}: React.ComponentProps<typeof Radio.Root> & {
  label?: React.ReactNode
}) {
  return (
    <label className={cn('ui-radio', className)}>
      <Radio.Root className="ui-radio__control" {...props}>
        <Radio.Indicator className="ui-radio__indicator" />
      </Radio.Root>
      {label ? <span className="ui-radio__label">{label}</span> : null}
    </label>
  )
}