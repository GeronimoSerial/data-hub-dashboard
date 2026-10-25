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
    // modal={false}: el modo modal de Base UI monta una capa fija a pantalla
    // completa (data-base-ui-inert) cuyo recorte sigue al disparador en cada
    // scroll. Esa capa repinta la tarjeta de detrás y la hace titilar.
    <SelectPrimitive.Root
      multiple
      modal={false}
      value={value}
      onValueChange={(next) => onChange(next as T[])}
    >
      <SelectPrimitive.Trigger className={cn('ui-select-trigger', className)} aria-label={ariaLabel}>
        <SelectPrimitive.Value className="ui-select-value">
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
        <SelectPrimitive.Positioner className="ui-select-positioner" sideOffset={6} alignItemWithTrigger={false}>
          <SelectPrimitive.Popup className="ui-select-popup">
            <SelectPrimitive.List className="ui-select-list">
              {options.map((opt) => (
                <SelectPrimitive.Item
                  key={opt.value}
                  value={opt.value}
                  className="ui-select-item"
                  label={opt.label}
                >
                  <span className="ui-select-check" aria-hidden="true">
                    <SelectPrimitive.ItemIndicator>
                      <Check size={13} strokeWidth={3} />
                    </SelectPrimitive.ItemIndicator>
                  </span>
                  <SelectPrimitive.ItemText>{opt.label}</SelectPrimitive.ItemText>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.List>
          </SelectPrimitive.Popup>
        </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}
