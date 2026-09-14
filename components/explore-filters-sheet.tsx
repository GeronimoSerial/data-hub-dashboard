'use client'

import * as React from 'react'
import { SlidersHorizontal, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { SheetContent, SheetRoot, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import type { ExploreFilters } from '@/lib/explore-filters'

const ALL = 'all'

export type FilterOption = { value: string; label: string }

export type FilterOptions = {
  temas: FilterOption[]
  niveles: FilterOption[]
  formatos: FilterOption[]
}

function withAll(label: string, options: FilterOption[]): FilterOption[] {
  return [{ value: ALL, label }, ...options]
}

export function Filter({
  label,
  value,
  onValueChange,
  options,
}: {
  label: string
  value: string
  onValueChange: (value: string) => void
  options: FilterOption[]
}) {
  // `items` keeps the trigger label resolved even while the popup is closed.
  const items = React.useMemo(
    () => Object.fromEntries(options.map((option) => [option.value, option.label])),
    [options],
  )
  return (
    <div className="filter-field">
      <label>{label}</label>
      <Select
        value={value}
        items={items}
        onValueChange={(next) => next != null && onValueChange(String(next))}
      >
        <SelectTrigger aria-label={label} />
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  allLabel,
  options,
}: {
  label: string
  value: string | undefined
  onChange: (value: string) => void
  allLabel: string
  options: FilterOption[]
}) {
  return (
    <Filter
      label={label}
      value={value ?? ALL}
      onValueChange={onChange}
      options={withAll(allLabel, options)}
    />
  )
}

/**
 * Mobile filter drawer: edits are staged in local draft state and only applied
 * to the URL on "Aplicar", producing the same URL as the desktop filter bar.
 */
export function MobileFilters({
  filters,
  options,
  activeCount,
  onApply,
}: {
  filters: ExploreFilters
  options: FilterOptions
  activeCount: number
  onApply: (next: Partial<ExploreFilters>) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [draft, setDraft] = React.useState<ExploreFilters>(filters)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const restoreFocusRef = React.useRef(false)

  React.useEffect(() => {
    if (open || !restoreFocusRef.current) return
    restoreFocusRef.current = false
    triggerRef.current?.focus()
  }, [open])

  const onOpenChange = (next: boolean) => {
    if (next) setDraft(filters)
    else restoreFocusRef.current = true
    setOpen(next)
  }

  const apply = () => {
    onApply(draft)
    onOpenChange(false)
  }

  const cancel = () => onOpenChange(false)

  const setDraftField = (key: keyof ExploreFilters, value: string) => {
    setDraft((prev) => ({
      ...prev,
      [key]: value === ALL ? undefined : (value as ExploreFilters[typeof key]),
    }))
  }

  return (
    <SheetRoot open={open} onOpenChange={onOpenChange}>
      <SheetTrigger ref={triggerRef} render={<Button className="mobile-filters-toggle" variant="secondary" />}>
        <SlidersHorizontal size={16} />Filtros{activeCount ? ` (${activeCount})` : ''}
      </SheetTrigger>
      <SheetContent side="bottom">
        <SheetTitle>Filtrar resultados</SheetTitle>
        <div className="filters-sheet-body">
          <FilterSelect
            label="Tema"
            value={draft.tema}
            onChange={(value) => setDraftField('tema', value)}
            allLabel="Todos los temas"
            options={options.temas}
          />
          <FilterSelect
            label="Nivel"
            value={draft.nivel}
            onChange={(value) => setDraftField('nivel', value)}
            allLabel="Todos los niveles"
            options={options.niveles}
          />
          <FilterSelect
            label="Formato"
            value={draft.formato}
            onChange={(value) => setDraftField('formato', value)}
            allLabel="Todos los formatos"
            options={options.formatos}
          />
          <Button variant="ghost" size="sm" onClick={() => { setDraft({}) }}>
            <X size={15} /> Limpiar filtros
          </Button>
        </div>
        <div className="filters-sheet-actions">
          <Button variant="ghost" onClick={cancel}>Cancelar</Button>
          <Button onClick={apply}>Aplicar filtros</Button>
        </div>
      </SheetContent>
    </SheetRoot>
  )
}
