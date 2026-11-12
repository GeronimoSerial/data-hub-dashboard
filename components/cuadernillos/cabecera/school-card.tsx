'use client'

import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { dashedCue, fichaEscuelaHref, type CriticalSchool } from './cabecera-api'

export function SchoolCard({ school, selected, onChoose, onClear }: {
  school: CriticalSchool
  selected: boolean
  onChoose: (school: CriticalSchool) => void
  onClear?: () => void
}) {
  const ficha = fichaEscuelaHref(school.cueAnexo)
  return (
    <article
      aria-label={school.nombre}
      style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '.75rem', minWidth: 0,
        padding: '.85rem 1rem', borderRadius: '.75rem', background: selected ? 'var(--fill)' : 'var(--surface)',
        border: selected ? '2px solid var(--ink)' : '1px solid var(--line)',
      }}
    >
      <div style={{ display: 'grid', gap: '.2rem', minWidth: 0, flex: '1 1 12rem' }}>
        {selected ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.35rem', color: 'var(--ink)', fontSize: '.85rem', fontWeight: 700 }}>
            <Check aria-hidden size={16} strokeWidth={2.5} />
            Seleccionada
          </span>
        ) : null}
        <strong style={{ color: 'var(--ink)', overflowWrap: 'anywhere' }}>{school.nombre}</strong>
        <span style={{ color: 'var(--ink-soft)', fontSize: '.875rem', overflowWrap: 'anywhere' }}>
          CUE {dashedCue(school.cueAnexo)} · {school.departamento}
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
        {selected ? (
          <Button type="button" variant="ghost" onClick={onClear}>
            Cambiar escuela
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            aria-label={`Elegir ${school.nombre}, CUE ${school.cueAnexo}`}
            onClick={() => onChoose(school)}
          >
            Elegir
          </Button>
        )}
      </div>
    </article>
  )
}
