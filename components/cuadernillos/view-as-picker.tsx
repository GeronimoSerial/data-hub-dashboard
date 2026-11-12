'use client'

import Link from 'next/link'
import { useId, useMemo, useState } from 'react'
import type { ViewAsCandidate } from '@/lib/cuadernillos/view-as'

const CAPABILITY_LABELS: Record<ViewAsCandidate['capabilities'][number], string> = {
  cabecera: 'Cabecera',
  supervisor: 'Supervisión',
}

export function ViewAsPicker({ candidates, currentUserId }: { candidates: ViewAsCandidate[]; currentUserId: string | null }) {
  const [query, setQuery] = useState('')
  const inputId = useId()
  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('es')
    if (!term) return candidates
    return candidates.filter((candidate) =>
      candidate.name.toLocaleLowerCase('es').includes(term) || candidate.email.toLocaleLowerCase('es').includes(term))
  }, [candidates, query])

  return (
    <section aria-labelledby={`${inputId}-title`} style={{ marginBottom: '2rem' }}>
      <h2 id={`${inputId}-title`} style={{ margin: 0, color: 'var(--ink)', fontFamily: 'var(--font-display)', fontSize: '1.15rem' }}>
        Ver como
      </h2>
      <p style={{ margin: '.35rem 0 .75rem', color: 'var(--ink-soft)', lineHeight: 1.5 }}>
        Consulta de solo lectura de lo que ve una supervisión o cabecera.
      </p>
      <label htmlFor={inputId} style={{ display: 'block', marginBottom: '.4rem', fontWeight: 600 }}>Buscar cuenta</label>
      <input
        id={inputId}
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        style={{ width: '100%', maxWidth: '28rem', padding: '.5rem .75rem', border: '1px solid var(--line)', borderRadius: '.5rem' }}
      />
      {visible.length === 0 ? (
        <p role="status" style={{ marginTop: '.75rem', color: 'var(--ink-soft)' }}>Ninguna cuenta coincide con la búsqueda.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: '.75rem 0 0', padding: 0, display: 'grid', gap: '.4rem' }}>
          {visible.map((candidate) => (
            <li key={candidate.userId}>
              <Link
                href={`/cuadernillos?viewAs=${encodeURIComponent(candidate.userId)}`}
                aria-current={candidate.userId === currentUserId ? 'true' : undefined}
                style={{ display: 'block', padding: '.6rem .75rem', border: '1px solid var(--line)', borderRadius: '.5rem', color: 'var(--ink)', textDecoration: 'none' }}
              >
                <strong>{candidate.name}</strong>{' '}
                <span style={{ color: 'var(--ink-soft)' }}>{candidate.email}</span>
                <span style={{ display: 'block', color: 'var(--ink-soft)', fontSize: '.85rem' }}>
                  {candidate.capabilities.map((capability) => CAPABILITY_LABELS[capability]).join(' · ')}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
