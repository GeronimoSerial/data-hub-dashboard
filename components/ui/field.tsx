'use client'

import * as React from 'react'
import { Field as FieldPrimitive } from '@base-ui/react/field'
import { cn } from '@/lib/utils'

export const Field = FieldPrimitive.Root

export function FieldLabel({
  className,
  ...props
}: React.ComponentProps<typeof FieldPrimitive.Label>) {
  return <FieldPrimitive.Label className={cn('ui-field__label', className)} {...props} />
}

export function FieldDescription({
  className,
  ...props
}: React.ComponentProps<typeof FieldPrimitive.Description>) {
  return (
    <FieldPrimitive.Description className={cn('ui-field__description', className)} {...props} />
  )
}

export function FieldError({
  className,
  ...props
}: React.ComponentProps<typeof FieldPrimitive.Error>) {
  return (
    <FieldPrimitive.Error className={cn('ui-field__error', className)} {...props} />
  )
}