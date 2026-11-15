'use client'

import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { readJson, isSchoolList, type CriticalSchool } from './cabecera-api'
import { EmptyState, Note } from '../kit'
import { SchoolCard } from './school-card'

/** School search by CUE (the only lookup the API offers). Once a school is chosen, only that school stays on screen until "Cambiar escuela". */
export type SchoolSearchState = {
  cueQuery: string
  setCueQuery: (value: string) => void
  results: CriticalSchool[] | null
  setResults: (value: CriticalSchool[] | null) => void
}

/** Search state lives with the caller so the results survive choosing a school and then changing it. */
export function useSchoolSearchState(): SchoolSearchState {
  const [cueQuery, setCueQuery] = useState('')
  const [results, setResults] = useState<CriticalSchool[] | null>(null)
  return { cueQuery, setCueQuery, results, setResults }
}

export function SchoolSearch({ selected, onChoose, onClear, state }: {
  selected: CriticalSchool | null
  onChoose: (school: CriticalSchool) => void
  onClear: () => void
  state: SchoolSearchState
}) {
  const { cueQuery, setCueQuery, results, setResults } = state
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const cue = cueQuery.trim()
    if (!/^\d{3,9}$/.test(cue)) { setError('Escribí al menos 3 dígitos del CUE de la escuela.'); return }
    setError(null)
    setSearching(true)
    try {
      const response = await fetch(`/api/cuadernillos/schools?cue=${encodeURIComponent(cue)}`, { cache: 'no-store' })
      const data = await readJson(response)
      if (!response.ok || !isSchoolList(data)) throw new Error('No se pudieron buscar las escuelas. Intentá nuevamente.')
      setResults(data.schools)
    } catch (reason) {
      setResults(null)
      setError(reason instanceof Error ? reason.message : 'No se pudieron buscar las escuelas.')
    } finally {
      setSearching(false)
    }
  }

  if (selected) {
    return (
      <ul className="k-list" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        <li><SchoolCard school={selected} selected onChoose={onChoose} onClear={onClear} /></li>
      </ul>
    )
  }

  return (
    <div style={{ display: 'grid', gap: '.75rem', minWidth: 0 }}>
      <form onSubmit={(event) => void search(event)} className="k-field">
        <label htmlFor="cab-cue">Buscar escuela por CUE</label>
        <div style={{ display: 'flex', gap: '.5rem' }}>
          <Input
            id="cab-cue"
            className="cab-cue-input"
            inputMode="numeric"
            value={cueQuery}
            onChange={(event) => setCueQuery(event.target.value)}
            maxLength={9}
            placeholder="Ej. 180012300"
            style={{ flex: '1 1 auto', minWidth: 0 }}
          />
          <Button type="submit" variant="secondary" disabled={searching} style={{ flex: '0 0 auto' }}>
            {searching ? 'Buscando…' : 'Buscar escuela'}
          </Button>
        </div>
        <span className="k-hint">Alcanza con los primeros dígitos. Solo aparecen las escuelas que necesitan cuadernillos.</span>
      </form>
      {error ? <Note tone="danger">{error}</Note> : null}
      {results && results.length === 0 ? (
        <EmptyState title="Sin resultados" description="No hay escuelas que necesiten cuadernillos con ese CUE." />
      ) : null}
      {results && results.length ? (
        <ul className="k-list">
          {results.map((school) => (
            <li key={school.cueAnexo}><SchoolCard school={school} selected={false} onChoose={onChoose} /></li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
