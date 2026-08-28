'use client'

import * as React from 'react'
import { Input as InputPrimitive } from '@base-ui/react/input'
import { cn } from '@/lib/utils'

export function Input({
  className,
  type = 'text',
  ...props
}: React.ComponentProps<typeof InputPrimitive>) {
  return <InputPrimitive type={type} className={cn('ui-input', className)} {...props} />
}