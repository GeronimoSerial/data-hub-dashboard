'use client'

import * as React from 'react'
import { Select as SelectPrimitive } from '@base-ui/react/select'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Multi-select picker built on the Base UI Select primitive (multiple).
 * Used by admin editors for tags, levels and audience pickers; renders the
 * same listbox pattern everywhere.
 */
export function MultiSelect<T extends string>({
  value,
  onChange,
  options,
  placeholder = 'Seleccionar…',
  className,
  ariaLabel,
}: {
  value: T[]
  onChange: (next: T[]) => void
  options: { value: T; label: string }[]
  placeholder?: string
  className?: string
  ariaLabel?: string
}) {
  return (
    <SelectPrimitive.Root
      multiple
      value={value}
      onValueChange={(next) => onChange(next as T[])}
    >
      <SelectPrimitive.Trigger className={cn('ui-select-trigger', className)} aria-label={ariaLabel}>
        <SelectPrimitive.Value>
          {(current) => {
            const values = Array.isArray(current) ? (current as T[]) : []
            if (values.length === 0) return placeholder
            return values
              .map((v) => options.find((o) => o.value === v)?.label ?? v)
              .join(', ')
          }}
        </SelectPrimitive.Value>
        <SelectPrimitive.Icon>
          <ChevronDown size={16} />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Positioner className="ui-select-positioner" sideOffset={6}>
          <SelectPrimitive.Popup className="ui-select-popup">
            {options.map((opt) => (
              <SelectPrimitive.Item
                key={opt.value}
                value={opt.value}
                className="ui-select-item"
                label={opt.label}
              >
                <SelectPrimitive.ItemIndicator>
                  <Check size={15} />
                </SelectPrimitive.ItemIndicator>
                <SelectPrimitive.ItemText>{opt.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Popup>
        </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}