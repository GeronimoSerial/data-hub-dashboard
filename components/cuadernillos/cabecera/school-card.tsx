'use client'

import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Chip } from '../kit'
import { dashedCue, fichaEscuelaHref, type CriticalSchool } from './cabecera-api'

export function SchoolCard({ school, selected, onChoose, onClear }: {
  school: CriticalSchool
  selected: boolean
  onChoose: (school: CriticalSchool) => void
  onClear?: () => void
}) {
  const ficha = fichaEscuelaHref(school.cueAnexo)
  return (
    <article aria-label={school.nombre} className="k-row" style={selected ? { borderColor: 'var(--ink)', background: 'var(--fill)' } : undefined}>
      <div className="k-row-main">
        <span className="k-row-title">{school.nombre}</span>
        <span className="k-row-meta">
          CUE {dashedCue(school.cueAnexo)} · {school.departamento}
          {ficha ? (
            <>
              {' · '}
              <a className="k-link" href={ficha} target="_blank" rel="noopener noreferrer">
                Ver ficha<span className="sr-only"> de {school.nombre} (se abre en otra pestaña)</span>
              </a>
            </>
          ) : null}
        </span>
        <span style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
          <Chip tone="danger">{school.severity}</Chip>
          {selected ? <Chip tone="ok"><Check aria-hidden size={13} strokeWidth={3} />Seleccionada</Chip> : null}
        </span>
      </div>
      <div className="k-row-side">
        {selected ? (
          <Button type="button" variant="ghost" onClick={onClear}>Cambiar escuela</Button>
        ) : (
          <Button type="button" variant="secondary" aria-label={`Elegir ${school.nombre}, CUE ${school.cueAnexo}`} onClick={() => onChoose(school)}>
            Elegir
          </Button>
        )}
      </div>
    </article>
  )
}
