'use client'

import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { CabeceraChoice } from './cabecera-api'

/** Searchable single-choice picker for long lists (no native select). Filters by CUE or name. */
export function CabeceraCombobox({ label, options, value, onPick, disabled = false }: {
  label: string
  options: CabeceraChoice[]
  value: string | null
  onPick: (cue: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const chosen = options.find((option) => option.cue === value) ?? null

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return options
    return options.filter((option) => option.cue.includes(needle) || option.nombre.toLowerCase().includes(needle))
  }, [options, query])

  function close() {
    setOpen(false)
    setQuery('')
    setActive(0)
    wrapRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
  }

  function choose(option: CabeceraChoice) {
    onPick(option.cue)
    close()
  }

  function onSearchKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((index) => Math.min(index + 1, Math.max(matches.length - 1, 0)))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const option = matches[active]
      if (option) choose(option)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      close()
    }
  }

  return (
    <div
      ref={wrapRef}
      className="cab-combo"
      onBlur={(event) => {
        if (open && !event.currentTarget.contains(event.relatedTarget as Node | null)) close()
      }}
      onKeyDown={(event) => { if (event.key === 'Escape' && open) close() }}
    >
      <Button
        type="button"
        variant="secondary"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((current) => !current)}
        style={{ width: '100%', minWidth: 0, justifyContent: 'space-between' }}
      >
        <span className="cab-combo-value">
          {chosen ? `${chosen.nombre} · CUE ${chosen.cue}` : 'Elegí una cabecera'}
        </span>
      </Button>

      {open ? (
        <div className="cab-combo-panel">
          <Input
            autoFocus
            role="combobox"
            aria-label={`Buscar ${label.toLowerCase()} por nombre o CUE`}
            aria-expanded
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={matches[active] ? `${listId}-${active}` : undefined}
            placeholder="Buscar por nombre o CUE"
            value={query}
            onChange={(event) => { setQuery(event.target.value); setActive(0) }}
            onKeyDown={onSearchKey}
          />
          {matches.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Ninguna cabecera coincide con la búsqueda.</p>
          ) : (
            <ul id={listId} role="listbox" aria-label={label} className="cab-combo-list">
              {matches.map((option, index) => (
                <li
                  key={option.cue}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={option.cue === value}
                  className="cab-combo-option"
                  data-active={index === active ? 'true' : undefined}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(option)}
                >
                  <span className="cab-combo-name">{option.nombre}</span>
                  <span className="cab-combo-cue">CUE {option.cue}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}
