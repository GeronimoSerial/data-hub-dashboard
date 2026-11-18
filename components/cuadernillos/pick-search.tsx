'use client'

import { useEffect, useId, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Note } from './kit'

export const MIN_QUERY = 3

export type ParsedQuery = { kind: 'cue'; value: string } | { kind: 'text'; value: string }

/** The one way every search here reads what was typed: digits (dashes allowed) are a CUE, anything else is a name. */
export function parseQuery(raw: string): ParsedQuery | null {
  const typed = raw.trim()
  const digits = typed.replace(/[-\s]/g, '')
  if (/^\d+$/.test(digits)) return digits.length >= MIN_QUERY ? { kind: 'cue', value: digits.slice(0, 9) } : null
  return typed.length >= MIN_QUERY ? { kind: 'text', value: typed } : null
}

export const foldText = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

export type PickOption = { key: string; title: string; meta: string; label: string }

/** Type a CUE or a name, see matching results, pick one. Cabeceras and schools share it so both read the same. */
export function PickSearch<T>({ label, placeholder, search, describe, onPick, noun }: {
  label: string
  placeholder?: string
  /** What is being looked for, for the empty and hint messages: "cabecera" or "escuela". */
  noun: string
  search: (query: ParsedQuery, signal: AbortSignal) => Promise<T[]>
  describe: (item: T) => PickOption
  onPick: (item: T) => void
}) {
  const inputId = useId()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<T[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const parsed = parseQuery(query)
  const key = parsed ? `${parsed.kind}:${parsed.value}` : null
  // Below the minimum nothing is searched, so nothing from an earlier query may linger.
  const shown = parsed ? results : null
  const shownError = parsed ? error : null

  useEffect(() => {
    if (!key) return
    const [kind, ...rest] = key.split(':')
    const request: ParsedQuery = { kind: kind as ParsedQuery['kind'], value: rest.join(':') }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setLoading(true)
      search(request, controller.signal).then((found) => {
        if (controller.signal.aborted) return
        setResults(found)
        setError(null)
      }).catch(() => {
        if (controller.signal.aborted) return
        setResults(null)
        setError(`No se pudo buscar. Intentá nuevamente.`)
      }).finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    }, 250)
    return () => { clearTimeout(timer); controller.abort() }
    // `search` is intentionally not a dependency: callers pass inline closures and only the typed text should trigger a lookup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  function pick(item: T) {
    onPick(item)
    setQuery('')
    setResults(null)
  }

  return (
    <div className="k-search">
      <label htmlFor={inputId} className="k-search-label">{label}</label>
      <Input id={inputId} aria-label={label} autoComplete="off" placeholder={placeholder ?? 'Nombre o CUE'} value={query} onChange={(event) => setQuery(event.target.value)} />
      {!parsed ? <p className="k-hint" style={{ margin: 0 }}>{`Escribí el nombre o al menos ${MIN_QUERY} dígitos del CUE.`}</p> : null}
      {shownError ? <Note tone="danger">{shownError}</Note> : null}
      {parsed && loading && !shown ? <p role="status" className="k-hint" style={{ margin: 0 }}>Buscando…</p> : null}
      {parsed && shown && shown.length === 0 ? <p className="k-note">{`Ninguna ${noun} coincide con la búsqueda.`}</p> : null}
      {parsed && shown && shown.length > 0 ? (
        <ul className="k-results" aria-label={`${noun[0].toUpperCase()}${noun.slice(1)}s encontradas`}>
          {shown.map((item) => {
            const option = describe(item)
            return (
              <li key={option.key}>
                <button type="button" aria-label={option.label} onClick={() => pick(item)}>
                  <strong>{option.title}</strong>
                  <span>{option.meta}</span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
