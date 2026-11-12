'use client'

import { useEffect, useState, type FormEvent } from 'react'
import type { MembershipUser, MembershipView } from '@/lib/cuadernillos/memberships'
import type { BookletCapability } from '@/lib/cuadernillos/types'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

const CAPABILITIES: Array<{ value: BookletCapability; label: string }> = [
  { value: 'planning', label: 'Planeamiento' },
  { value: 'cabecera', label: 'Cabecera' },
  { value: 'supervisor', label: 'Supervisor' },
]

const CAPABILITY_LABEL = Object.fromEntries(CAPABILITIES.map(({ value, label }) => [value, label])) as Record<BookletCapability, string>

const ERROR_COPY: Record<string, string> = {
  forbidden: 'No tiene permisos para administrar membresías.',
  user_not_found: 'La cuenta no existe.',
  user_banned: 'La cuenta está deshabilitada y no puede recibir permisos.',
  membership_not_found: 'La membresía ya no está activa.',
}
const GENERIC_ERROR = 'No se pudo completar la operación. Intente nuevamente.'

// Layout rules inline styles cannot express: the membership table grid, the phone card reflow and the chip states.
// Scoped to `.mem-section` so nothing leaks into the rest of the configuration screen.
const MEMBERSHIP_CSS = `
.mem-section { min-width: 0; max-width: 100%; }
.mem-section * { box-sizing: border-box; }
.mem-table { display: grid; gap: 0; min-width: 0; max-width: 100%; color: var(--ink); }
.mem-head { display: none; }
.mem-row { display: grid; grid-template-columns: minmax(0, 1fr) auto 8.5rem auto; align-items: center; gap: .5rem 1rem; padding: .6rem 0; border-bottom: 1px solid var(--line); min-width: 0; }
.mem-user { min-width: 0; overflow-wrap: anywhere; }
.mem-email { display: block; color: var(--ink-soft); font-size: .85rem; overflow-wrap: anywhere; }
.mem-chip { display: inline-block; padding: .15rem .6rem; border: 1px solid var(--line); border-radius: 999px; background: var(--accent-tint); color: var(--ink); font-size: .85rem; white-space: nowrap; }
.mem-date { color: var(--ink-soft); font-size: .9rem; white-space: nowrap; }
.mem-action { justify-self: end; }

.mem-search-row { display: flex; flex-wrap: nowrap; align-items: flex-end; gap: .5rem; min-width: 0; }
.mem-search-field { display: grid; gap: .3rem; flex: 1 1 auto; min-width: 0; color: var(--ink); }
.mem-search-field .ui-input { width: 100%; min-width: 0; }
.mem-search-button { flex: 0 0 auto; }

.mem-result { width: 100%; min-width: 0; justify-content: flex-start; text-align: left; overflow-wrap: anywhere; }
.mem-result-email { color: var(--ink-soft); }
.mem-result[aria-pressed="true"] { border-color: var(--ink); background: var(--accent-tint); }

.mem-caps { display: flex; flex-wrap: wrap; gap: .5rem; border: 0; padding: 0; margin: 0; min-width: 0; }
.mem-caps legend { margin-bottom: .35rem; }
.mem-cap { display: inline-flex; align-items: center; gap: .4rem; padding: .35rem .7rem; border: 1px solid var(--line); border-radius: 999px; cursor: pointer; color: var(--ink); }
.mem-cap:hover { background: var(--fill); }
.mem-cap:has(input:checked) { border-color: var(--ink); background: var(--accent-tint); }
.mem-cap:has(input:focus-visible) { outline: 2px solid var(--marker); outline-offset: 2px; }

@media (max-width: 640px) {
  .mem-head { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  .mem-row { grid-template-columns: minmax(0, 1fr); gap: .4rem; padding: .85rem; margin-bottom: .5rem; border: 1px solid var(--line); border-radius: .75rem; background: var(--surface); }
  .mem-row .mem-chip { justify-self: start; }
  .mem-date::before { content: attr(data-label) ': '; color: var(--ink-soft); }
  .mem-action { justify-self: stretch; }
  .mem-action .ui-button { width: 100%; }
  .mem-search-row { flex-wrap: nowrap; }
}
`

class MembershipRequestError extends Error {}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init })
  const body = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok) throw new MembershipRequestError(typeof body.error === 'string' ? body.error : 'request_failed')
  return body as T
}

const errorCopy = (error: unknown) => (error instanceof MembershipRequestError && ERROR_COPY[error.message]) || GENERIC_ERROR

const dateCopy = (iso: string) => new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })

export function MembershipSection() {
  const [memberships, setMemberships] = useState<MembershipView[] | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MembershipUser[] | null>(null)
  const [selected, setSelected] = useState<MembershipUser | null>(null)
  const [capability, setCapability] = useState<BookletCapability>('planning')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadMemberships = async () => {
    try {
      const body = await request<{ memberships: MembershipView[] }>('/api/cuadernillos/memberships')
      setMemberships(body.memberships ?? [])
    } catch (caught) {
      setError(errorCopy(caught))
    }
  }

  useEffect(() => {
    let active = true
    request<{ memberships: MembershipView[] }>('/api/cuadernillos/memberships')
      .then((body) => { if (active) setMemberships(body.memberships ?? []) })
      .catch((caught: unknown) => { if (active) setError(errorCopy(caught)) })
    return () => { active = false }
  }, [])

  async function searchUsers(event: FormEvent) {
    event.preventDefault()
    const term = query.trim()
    if (term === '') return
    setBusy(true)
    setError(null)
    try {
      const body = await request<{ users: MembershipUser[] }>(`/api/cuadernillos/memberships?q=${encodeURIComponent(term)}`)
      setResults(body.users ?? [])
      setSelected(null)
    } catch (caught) {
      setError(errorCopy(caught))
    } finally {
      setBusy(false)
    }
  }

  async function grantSelected(event: FormEvent) {
    event.preventDefault()
    if (!selected) return
    setBusy(true)
    setError(null)
    try {
      await request('/api/cuadernillos/memberships', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selected.id, capability }),
      })
      setSelected(null)
      setResults(null)
      setQuery('')
      await loadMemberships()
    } catch (caught) {
      setError(errorCopy(caught))
    } finally {
      setBusy(false)
    }
  }

  async function revokeMembership(id: string) {
    setBusy(true)
    setError(null)
    try {
      await request(`/api/cuadernillos/memberships/${encodeURIComponent(id)}`, { method: 'DELETE' })
      await loadMemberships()
    } catch (caught) {
      setError(errorCopy(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mem-section" aria-labelledby="membership-section-title" style={{ display: 'grid', gap: '1rem' }}>
      <style>{MEMBERSHIP_CSS}</style>
      <h4 id="membership-section-title" style={{ margin: 0, color: 'var(--ink)', fontSize: '1rem' }}>Membresías</h4>
      {error ? <p role="alert" style={{ margin: 0, color: 'var(--danger-ink)' }}>{error}</p> : null}

      {memberships === null && !error ? <p role="status" style={{ margin: 0, color: 'var(--ink-soft)' }}>Cargando membresías…</p> : null}
      {memberships !== null && memberships.length === 0 ? <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Sin asignaciones activas.</p> : null}
      {memberships !== null && memberships.length > 0 ? (
        <div role="table" aria-label="Membresías activas" className="mem-table">
          <div role="row" className="mem-head">
            <span role="columnheader">Usuario</span>
            <span role="columnheader">Capacidad</span>
            <span role="columnheader">Otorgada el</span>
            <span role="columnheader">Acción</span>
          </div>
          <div role="rowgroup">
            {memberships.map((membership) => (
              <div role="row" key={membership.id} className="mem-row">
                <div role="cell" className="mem-user">
                  {membership.userName}
                  <span className="mem-email">{membership.userEmail}</span>
                </div>
                <div role="cell">
                  <span className="mem-chip" data-capability={membership.capability}>{CAPABILITY_LABEL[membership.capability]}</span>
                </div>
                <div role="cell" className="mem-date" data-label="Otorgada el">{dateCopy(membership.grantedAt)}</div>
                <div role="cell" className="mem-action">
                  <Button type="button" variant="secondary" disabled={busy} onClick={() => void revokeMembership(membership.id)}>
                    Quitar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div style={{ display: 'grid', gap: '.75rem', maxWidth: '40rem', minWidth: 0 }}>
        <form role="search" onSubmit={searchUsers} className="mem-search-row">
          <label className="mem-search-field">
            <span>Buscar usuario por nombre o correo</span>
            <Input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre o correo" />
          </label>
          <Button type="submit" variant="secondary" className="mem-search-button" disabled={busy || query.trim() === ''}>Buscar</Button>
        </form>

        {results !== null ? (
          results.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Sin coincidencias.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '.35rem', minWidth: 0 }}>
              {results.map((candidate) => (
                <li key={candidate.id} style={{ minWidth: 0 }}>
                  <Button
                    type="button"
                    variant="secondary"
                    aria-pressed={selected?.id === candidate.id}
                    onClick={() => setSelected(candidate)}
                    className="mem-result"
                  >
                    {candidate.name} <span className="mem-result-email">{candidate.email}</span>
                  </Button>
                </li>
              ))}
            </ul>
          )
        ) : null}

        <form onSubmit={grantSelected} style={{ display: 'grid', gap: '.75rem', minWidth: 0 }}>
          <p style={{ margin: 0, color: 'var(--ink-soft)' }}>
            {selected ? `Usuario seleccionado: ${selected.name}` : 'Seleccione un usuario de la búsqueda.'}
          </p>
          <fieldset className="mem-caps">
            <legend>Capacidad</legend>
            {CAPABILITIES.map(({ value, label }) => (
              <label key={value} className="mem-cap">
                <input
                  type="radio"
                  name="membership-capability"
                  value={value}
                  checked={capability === value}
                  onChange={() => setCapability(value)}
                />
                {label}
              </label>
            ))}
          </fieldset>
          <div>
            <Button type="submit" variant="default" disabled={busy || selected === null}>Otorgar</Button>
          </div>
        </form>
      </div>
    </section>
  )
}
