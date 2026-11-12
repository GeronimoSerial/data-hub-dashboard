'use client'

import { useEffect, useState, type FormEvent } from 'react'
import type { CabeceraAccount, CabeceraView } from '@/lib/cuadernillos/cabeceras'
import type { MembershipUser } from '@/lib/cuadernillos/memberships'
import { formatCue } from '../supervisor/inbox-model'

type Role = 'supervisor' | 'cabecera'
type Target = { cue: string; role: Role } | null
type Slots = Record<string, { supervisor: CabeceraAccount | null; cabecera: CabeceraAccount | null }>

const ERROR_COPY: Record<string, string> = {
  forbidden: 'No tiene permisos para gestionar cabeceras.',
  unknown_cabecera: 'Una de las cabeceras ya no está en la lista.',
  assignment_conflicts_with_existing_record: 'Una cabecera ya tiene asignación confirmada con otras cuentas. No se modifica desde aquí.',
  user_not_found: 'Una de las cuentas no existe.',
  user_banned: 'Una de las cuentas está deshabilitada.',
  responsible_account_unavailable: 'Una de las cuentas no está lista para ser responsable.',
}
const GENERIC_ERROR = 'No se pudo completar la operación. Intente nuevamente.'

class CabeceraRequestError extends Error {}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init })
  const body = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok) throw new CabeceraRequestError(typeof body.error === 'string' ? body.error : 'request_failed')
  return body as T
}

const errorCopy = (error: unknown) => (error instanceof CabeceraRequestError && ERROR_COPY[error.message]) || GENERIC_ERROR

const slotsFrom = (cabeceras: CabeceraView[]): Slots => Object.fromEntries(
  cabeceras.map((item) => [item.cue, { supervisor: item.supervisor, cabecera: item.cabecera }]),
)

export function CabecerasSection() {
  const [cabeceras, setCabeceras] = useState<CabeceraView[] | null>(null)
  const [slots, setSlots] = useState<Slots>({})
  const [target, setTarget] = useState<Target>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MembershipUser[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = async () => {
    try {
      const body = await request<{ cabeceras: CabeceraView[] }>('/api/cuadernillos/cabeceras')
      setCabeceras(body.cabeceras ?? [])
      setSlots(slotsFrom(body.cabeceras ?? []))
    } catch (caught) {
      setError(errorCopy(caught))
    }
  }

  useEffect(() => {
    let active = true
    request<{ cabeceras: CabeceraView[] }>('/api/cuadernillos/cabeceras')
      .then((body) => {
        if (!active) return
        setCabeceras(body.cabeceras ?? [])
        setSlots(slotsFrom(body.cabeceras ?? []))
      })
      .catch((caught: unknown) => { if (active) setError(errorCopy(caught)) })
    return () => { active = false }
  }, [])

  async function search(event: FormEvent) {
    event.preventDefault()
    const term = query.trim()
    if (term === '') return
    setBusy(true)
    setError(null)
    try {
      const body = await request<{ users: MembershipUser[] }>(`/api/cuadernillos/memberships?q=${encodeURIComponent(term)}`)
      setResults(body.users)
    } catch (caught) {
      setError(errorCopy(caught))
    } finally {
      setBusy(false)
    }
  }

  function assign(account: MembershipUser) {
    if (!target) {
      setError('Elija primero un supervisor o una cabecera de la lista.')
      return
    }
    setError(null)
    setSlots((current) => ({
      ...current,
      [target.cue]: {
        ...current[target.cue],
        [target.role]: { id: account.id, name: account.name, email: account.email },
      },
    }))
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    const mapping = Object.fromEntries(
      Object.entries(slots)
        .filter(([, slot]) => slot.supervisor && slot.cabecera)
        .map(([cue, slot]) => [cue, { supervisorUserId: slot.supervisor!.id, cabeceraUserId: slot.cabecera!.id }]),
    )
    if (Object.keys(mapping).length === 0) {
      setError('Asigne supervisor y cabecera a al menos una escuela.')
      return
    }
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const body = await request<{ confirmed: string[]; unchanged: string[]; blocked: string[] }>('/api/cuadernillos/cabeceras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mapping }),
      })
      setNotice(`Confirmadas: ${body.confirmed.length}. Sin cambios: ${body.unchanged.length}. Bloqueadas: ${body.blocked.length}.`)
      await load()
    } catch (caught) {
      setError(errorCopy(caught))
    } finally {
      setBusy(false)
    }
  }

  const slotButton = (cue: string, role: Role, account: CabeceraAccount | null, label: string) => {
    const active = target?.cue === cue && target.role === role
    return (
      <button
        type="button"
        aria-pressed={active}
        className="ui-button ui-button--secondary"
        onClick={() => setTarget(active ? null : { cue, role })}
        style={{ display: 'grid', gap: '.1rem', minWidth: '10rem', justifyItems: 'start', textAlign: 'left' }}
      >
        <span style={{ color: 'var(--ink-soft)', fontSize: '.8rem' }}>{label}</span>
        <strong style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{account ? account.name : 'Asignar'}</strong>
      </button>
    )
  }

  return (
    <section aria-labelledby="cabeceras-section-title" style={{ display: 'grid', gap: '1rem' }}>
      <h4 id="cabeceras-section-title" style={{ margin: 0, color: 'var(--ink)', fontSize: '1rem' }}>Cabeceras</h4>
      {error ? <p role="alert" style={{ margin: 0, color: 'var(--danger-ink)' }}>{error}</p> : null}
      {notice ? <p role="status" style={{ margin: 0, color: 'var(--ink-soft)' }}>{notice}</p> : null}
      {cabeceras === null && !error ? <p role="status" style={{ margin: 0, color: 'var(--ink-soft)' }}>Cargando cabeceras…</p> : null}

      {cabeceras !== null ? (
        cabeceras.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--ink-soft)' }}>No hay cabeceras cargadas.</p>
        ) : (
          <form onSubmit={save} style={{ display: 'grid', gap: '1rem' }}>
            <ul aria-label="Escuelas cabeceras" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '.6rem' }}>
              {cabeceras.map((item) => {
                const slot = slots[item.cue] ?? { supervisor: null, cabecera: null }
                const ready = item.status === 'confirmada' || Boolean(slot.supervisor && slot.cabecera)
                return (
                  <li
                    key={item.cue}
                    style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '.75rem 1rem', padding: '.85rem 1rem', border: '1px solid var(--line)', borderRadius: '.6rem', background: 'var(--surface)' }}
                  >
                    <div style={{ display: 'grid', gap: '.2rem', flex: '1 1 14rem', minWidth: 0 }}>
                      <strong style={{ color: 'var(--ink)', overflowWrap: 'anywhere' }}>{item.nombre}</strong>
                      <span style={{ color: 'var(--ink-soft)', fontSize: '.9rem', overflowWrap: 'anywhere' }}>
                        <span style={{ whiteSpace: 'nowrap' }}>CUE {formatCue(item.cue)}</span>
                        {` · ${item.departamento} · Supervisora según planilla: `}
                        <span>{item.supervisorName}</span>
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '.5rem' }}>
                      {slotButton(item.cue, 'supervisor', slot.supervisor, 'Supervisor')}
                      {slotButton(item.cue, 'cabecera', slot.cabecera, 'Cabecera')}
                      <span style={{ whiteSpace: 'nowrap', padding: '.2rem .65rem', border: '1px solid var(--line)', borderRadius: '999px', fontSize: '.85rem', color: ready ? 'var(--ink)' : 'var(--ink-soft)' }}>
                        {ready ? 'Lista' : 'Pendiente'}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
            <div>
              <button type="submit" className="ui-button ui-button--primary" disabled={busy}>Guardar</button>
            </div>
          </form>
        )
      ) : null}

      <div style={{ display: 'grid', gap: '.75rem', maxWidth: '40rem' }}>
        <form role="search" onSubmit={search} style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'end' }}>
          <label style={{ display: 'grid', gap: '.25rem', flex: '1 1 16rem' }}>
            <span>Buscar cuenta por nombre o correo</span>
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre o correo" />
          </label>
          <button type="submit" className="ui-button ui-button--secondary" disabled={busy || query.trim() === ''}>Buscar</button>
        </form>
        {target ? <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Asignando {target.role === 'supervisor' ? 'supervisor' : 'cabecera'} de CUE {target.cue}</p> : null}
        {results !== null ? (
          results.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Sin coincidencias.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '.35rem' }}>
              {results.map((candidate) => (
                <li key={candidate.id}>
                  <button type="button" onClick={() => assign(candidate)} className="ui-button ui-button--secondary" style={{ width: '100%', justifyContent: 'flex-start', textAlign: 'left' }}>
                    {candidate.name} <span style={{ color: 'var(--ink-soft)' }}>{candidate.email}</span>
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </div>
    </section>
  )
}
