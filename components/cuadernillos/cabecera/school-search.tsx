'use client'

import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { readJson, isSchoolList, type CriticalSchool } from './cabecera-api'
import { SchoolCard } from './school-card'

export function SchoolSearch({ selectedCue, onChoose }: {
  selectedCue: string | null
  onChoose: (school: CriticalSchool) => void
}) {
  const [cueQuery, setCueQuery] = useState('')
  const [results, setResults] = useState<CriticalSchool[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const cue = cueQuery.trim()
    if (!/^\d{3,9}$/.test(cue)) { setError('Ingresá al menos 3 dígitos del CUE.'); return }
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

  return (
    <div style={{ display: 'grid', gap: '.75rem' }}>
      <form onSubmit={(event) => void search(event)} style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem', alignItems: 'flex-end' }}>
        <label style={{ display: 'grid', gap: '.3rem', color: 'var(--ink)', fontWeight: 600 }}>
          CUE de la escuela
          <Input inputMode="numeric" value={cueQuery} onChange={(event) => setCueQuery(event.target.value)} maxLength={9} placeholder="Ej. 180123" />
        </label>
        <Button type="submit" variant="secondary" disabled={searching}>
          {searching ? 'Buscando…' : 'Buscar escuela'}
        </Button>
      </form>
      {error ? <p role="alert" style={{ margin: 0, color: 'var(--danger-ink)' }}>{error}</p> : null}
      {results && results.length === 0 ? (
        <p style={{ margin: 0, color: 'var(--ink-soft)' }}>No hay escuelas en severidad Crítica con ese CUE.</p>
      ) : null}
      {results && results.length ? (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '.5rem' }}>
          {results.map((school) => (
            <li key={school.cueAnexo}>
              <SchoolCard school={school} selected={selectedCue === school.cueAnexo} onChoose={onChoose} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
