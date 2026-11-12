'use client'

import { Button } from '@/components/ui/button'
import { fichaEscuelaHref, type CriticalSchool } from './cabecera-api'

export function SchoolCard({ school, selected, onChoose }: {
  school: CriticalSchool
  selected: boolean
  onChoose: (school: CriticalSchool) => void
}) {
  const ficha = fichaEscuelaHref(school.cueAnexo)
  return (
    <article
      aria-label={school.nombre}
      style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '.75rem',
        padding: '.85rem 1rem', border: `1px solid ${selected ? 'var(--ink)' : 'var(--line)'}`, borderRadius: '.75rem', background: 'var(--surface)',
      }}
    >
      <div style={{ display: 'grid', gap: '.2rem', minWidth: 0 }}>
        <strong style={{ color: 'var(--ink)', overflowWrap: 'anywhere' }}>{school.nombre}</strong>
        <span style={{ color: 'var(--ink-soft)', fontSize: '.875rem' }}>
          CUE {school.cueAnexo} · {school.departamento}
        </span>
        <span style={{ justifySelf: 'start', padding: '.1rem .5rem', borderRadius: '.4rem', border: '1px solid var(--danger-ink)', color: 'var(--danger-ink)', fontSize: '.75rem', fontWeight: 600 }}>
          {school.severity}
        </span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem', alignItems: 'center' }}>
        {ficha ? (
          <a href={ficha} target="_blank" rel="noopener noreferrer" style={{ fontSize: '.875rem' }}>
            Ver ficha<span className="sr-only"> de {school.nombre} (se abre en otra pestaña)</span>
          </a>
        ) : null}
        <Button
          type="button"
          variant={selected ? 'default' : 'secondary'}
          aria-pressed={selected}
          aria-label={`Elegir ${school.nombre}, CUE ${school.cueAnexo}`}
          onClick={() => onChoose(school)}
        >
          {selected ? 'Elegida' : 'Elegir'}
        </Button>
      </div>
    </article>
  )
}
