import * as React from 'react'
import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { cn } from '@/lib/utils'

type Props = React.ComponentProps<typeof ButtonPrimitive> & {
  variant?: 'default' | 'secondary' | 'ghost' | 'destructive'
  size?: 'default' | 'sm' | 'icon'
}

export function Button({ className, variant = 'default', size = 'default', ...props }: Props) {
  return (
    <ButtonPrimitive
      className={cn('ui-button', `ui-button--${variant}`, `ui-button--${size}`, className)}
      {...props}
    />
  )
}
