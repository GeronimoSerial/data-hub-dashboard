'use client'

import { Button } from '@/components/ui/button'

export type ChoiceOption = { value: string; label: string }

/** Compact button group used instead of a native select for short, closed choices. */
export function ChoiceGroup({ label, options, value, onPick, disabled = false }: {
  label: string
  options: ChoiceOption[]
  value: string
  onPick: (value: string) => void
  disabled?: boolean
}) {
  return (
    <div role="group" aria-label={label} style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem' }}>
      {options.map((option) => {
        const active = option.value === value
        return (
          <Button
            key={option.value}
            type="button"
            variant={active ? 'default' : 'secondary'}
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onPick(option.value)}
          >
            {option.label}
          </Button>
        )
      })}
    </div>
  )
}
