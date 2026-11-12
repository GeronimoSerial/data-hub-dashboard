'use client'

import Link from 'next/link'
import { useId, useMemo, useState } from 'react'
import type { ViewAsCandidate } from '@/lib/cuadernillos/view-as'

const CAPABILITY_LABELS: Record<ViewAsCandidate['capabilities'][number], string> = {
  cabecera: 'Cabecera',
  supervisor: 'Supervisión',
}

export function ViewAsPicker({ candidates, currentUserId }: { candidates: ViewAsCandidate[]; currentUserId: string | null }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const id = useId()
  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('es')
    if (!term) return candidates
    return candidates.filter((candidate) =>
      candidate.name.toLocaleLowerCase('es').includes(term) || candidate.email.toLocaleLowerCase('es').includes(term))
  }, [candidates, query])

  return (
    <div style={{ position: 'relative' }} onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false) }}>
      <button
        type="button"
        className="ui-button ui-button--secondary"
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={() => setOpen((value) => !value)}
      >
        Ver como
      </button>
      {open ? (
        <div
          id={`${id}-panel`}
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + .5rem)',
            zIndex: 20,
            width: 'min(24rem, calc(100vw - 2rem))',
            display: 'grid',
            gap: '.6rem',
            padding: '.85rem',
            border: '1px solid var(--line)',
            borderRadius: '.6rem',
            background: 'var(--white)',
            boxShadow: '0 8px 24px rgba(0, 0, 0, .12)',
          }}
        >
          <label htmlFor={`${id}-search`} style={{ fontWeight: 600, color: 'var(--ink)' }}>Buscar cuenta</label>
          <input
            id={`${id}-search`}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nombre o correo"
            style={{ width: '100%', padding: '.5rem .7rem', border: '1px solid var(--line)', borderRadius: '.5rem', background: 'var(--white)', color: 'var(--ink)' }}
          />
          {visible.length === 0 ? (
            <p role="status" style={{ margin: 0, color: 'var(--ink-soft)' }}>Ninguna cuenta coincide con la búsqueda.</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '.35rem', maxHeight: '18rem', overflowY: 'auto' }}>
              {visible.map((candidate) => (
                <li key={candidate.userId}>
                  <Link
                    href={`/cuadernillos?viewAs=${encodeURIComponent(candidate.userId)}`}
                    aria-current={candidate.userId === currentUserId ? 'true' : undefined}
                    style={{ display: 'block', padding: '.55rem .7rem', border: '1px solid var(--line)', borderRadius: '.5rem', color: 'var(--ink)', textDecoration: 'none' }}
                  >
                    <strong>{candidate.name}</strong>{' '}
                    <span style={{ color: 'var(--ink-soft)', overflowWrap: 'anywhere' }}>{candidate.email}</span>
                    <span style={{ display: 'block', color: 'var(--ink-soft)', fontSize: '.85rem' }}>
                      {candidate.capabilities.map((capability) => CAPABILITY_LABELS[capability]).join(' · ')}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}
