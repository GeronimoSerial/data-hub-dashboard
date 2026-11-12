'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { MembershipUser, MembershipView } from '@/lib/cuadernillos/memberships'
import type { BookletCapability } from '@/lib/cuadernillos/types'

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

class MembershipRequestError extends Error {}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init })
  const body = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok) throw new MembershipRequestError(typeof body.error === 'string' ? body.error : 'request_failed')
  return body as T
}

const errorCopy = (error: unknown) => (error instanceof MembershipRequestError && ERROR_COPY[error.message]) || GENERIC_ERROR

const dateCopy = (iso: string) => new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })

export function MembershipAdmin() {
  const [memberships, setMemberships] = useState<MembershipView[] | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MembershipUser[] | null>(null)
  const [selected, setSelected] = useState<MembershipUser | null>(null)
  const [capability, setCapability] = useState<BookletCapability>('planning')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadMemberships = useCallback(async () => {
    try {
      const body = await request<{ memberships: MembershipView[] }>('/api/cuadernillos/memberships')
      setMemberships(body.memberships ?? [])
    } catch (caught) {
      setError(errorCopy(caught))
    }
  }, [])

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
    <section aria-labelledby="membership-admin-title" style={{ marginTop: '2rem' }}>
      <h3 id="membership-admin-title" style={{ margin: 0, color: 'var(--ink)', fontFamily: 'var(--font-display)', fontSize: '1.15rem' }}>
        Membresías
      </h3>
      {error ? <p role="alert" style={{ color: 'var(--danger-ink)' }}>{error}</p> : null}

      {memberships === null && !error ? <p role="status" style={{ color: 'var(--ink-soft)' }}>Cargando membresías…</p> : null}
      {memberships !== null && memberships.length === 0 ? <p style={{ color: 'var(--ink-soft)' }}>Sin asignaciones activas.</p> : null}
      {memberships !== null && memberships.length > 0 ? (
        <div style={{ overflowX: 'auto' }}>
          <table aria-label="Membresías activas" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th scope="col" style={{ textAlign: 'left' }}>Usuario</th>
                <th scope="col" style={{ textAlign: 'left' }}>Capacidad</th>
                <th scope="col" style={{ textAlign: 'left' }}>Otorgada el</th>
                <th scope="col"><span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>Acción</span></th>
              </tr>
            </thead>
            <tbody>
              {memberships.map((membership) => (
                <tr key={membership.id}>
                  <td>{membership.userName} <span style={{ color: 'var(--ink-soft)' }}>{membership.userEmail}</span></td>
                  <td>{CAPABILITY_LABEL[membership.capability]}</td>
                  <td>{dateCopy(membership.grantedAt)}</td>
                  <td>
                    <button type="button" className="ui-button ui-button--secondary" disabled={busy} onClick={() => void revokeMembership(membership.id)}>
                      Revocar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div style={{ marginTop: '1.25rem', display: 'grid', gap: '.75rem', maxWidth: '40rem' }}>
        <form role="search" onSubmit={searchUsers} style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'end' }}>
          <label style={{ display: 'grid', gap: '.25rem', flex: '1 1 16rem' }}>
            <span>Buscar usuario por nombre o correo</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Nombre o correo"
            />
          </label>
          <button type="submit" className="ui-button ui-button--secondary" disabled={busy || query.trim() === ''}>Buscar</button>
        </form>

        {results !== null ? (
          results.length === 0 ? (
            <p style={{ color: 'var(--ink-soft)' }}>Sin coincidencias.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '.35rem' }}>
              {results.map((candidate) => (
                <li key={candidate.id}>
                  <button
                    type="button"
                    aria-pressed={selected?.id === candidate.id}
                    onClick={() => setSelected(candidate)}
                    className="ui-button ui-button--secondary"
                    style={{ width: '100%', justifyContent: 'flex-start', textAlign: 'left' }}
                  >
                    {candidate.name} <span style={{ color: 'var(--ink-soft)' }}>{candidate.email}</span>
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : null}

        <form onSubmit={grantSelected} style={{ display: 'grid', gap: '.75rem' }}>
          <p style={{ margin: 0, color: 'var(--ink-soft)' }}>
            {selected ? `Usuario seleccionado: ${selected.name}` : 'Seleccione un usuario de la búsqueda.'}
          </p>
          <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <legend style={{ marginBottom: '.35rem' }}>Capacidad</legend>
            {CAPABILITIES.map(({ value, label }) => (
              <label key={value} style={{ display: 'inline-flex', gap: '.35rem', alignItems: 'center' }}>
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
            <button type="submit" className="ui-button ui-button--primary" disabled={busy || selected === null}>Otorgar</button>
          </div>
        </form>
      </div>
    </section>
  )
}
