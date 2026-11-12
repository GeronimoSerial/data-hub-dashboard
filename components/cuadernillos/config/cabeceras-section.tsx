'use client'

import { useEffect, useState, type FormEvent } from 'react'
import type { CabeceraAccount, CabeceraView } from '@/lib/cuadernillos/cabeceras'
import type { MembershipUser } from '@/lib/cuadernillos/memberships'

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

const accountCopy = (account: CabeceraAccount | null) => account ? `${account.name} (${account.email})` : 'Sin asignar'

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

  const slotButton = (cue: string, role: Role, account: CabeceraAccount | null) => {
    const active = target?.cue === cue && target.role === role
    return (
      <button
        type="button"
        aria-pressed={active}
        className="ui-button ui-button--secondary"
        onClick={() => setTarget(active ? null : { cue, role })}
        style={{ width: '100%', justifyContent: 'flex-start', textAlign: 'left' }}
      >
        {accountCopy(account)}
      </button>
    )
  }

  return (
    <section aria-labelledby="cabeceras-section-title" style={{ display: 'grid', gap: '1rem' }}>
      <h4 id="cabeceras-section-title" style={{ margin: 0, color: 'var(--ink)', fontSize: '1rem' }}>Cabeceras</h4>
      <p style={{ margin: 0, color: 'var(--ink-soft)', lineHeight: 1.5 }}>
        Cada escuela cabecera debe tener un supervisor y una cuenta de cabecera. Elija un casillero de la tabla y luego una cuenta de la búsqueda.
      </p>
      {error ? <p role="alert" style={{ margin: 0, color: 'var(--danger-ink)' }}>{error}</p> : null}
      {notice ? <p role="status" style={{ margin: 0, color: 'var(--ink-soft)' }}>{notice}</p> : null}
      {cabeceras === null && !error ? <p role="status" style={{ margin: 0, color: 'var(--ink-soft)' }}>Cargando cabeceras…</p> : null}

      {cabeceras !== null ? (
        cabeceras.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--ink-soft)' }}>No hay cabeceras cargadas.</p>
        ) : (
          <form onSubmit={save} style={{ display: 'grid', gap: '1rem' }}>
            <div style={{ overflowX: 'auto' }}>
              <table aria-label="Escuelas cabeceras" style={{ width: '100%', borderCollapse: 'collapse', minWidth: '44rem' }}>
                <thead>
                  <tr>
                    <th scope="col" style={{ textAlign: 'left' }}>CUE</th>
                    <th scope="col" style={{ textAlign: 'left' }}>Nombre</th>
                    <th scope="col" style={{ textAlign: 'left' }}>Departamento</th>
                    <th scope="col" style={{ textAlign: 'left' }}>Supervisor según planilla</th>
                    <th scope="col" style={{ textAlign: 'left' }}>Cuenta supervisor</th>
                    <th scope="col" style={{ textAlign: 'left' }}>Cuenta cabecera</th>
                    <th scope="col" style={{ textAlign: 'left' }}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {cabeceras.map((item) => {
                    const slot = slots[item.cue] ?? { supervisor: null, cabecera: null }
                    const complete = Boolean(slot.supervisor && slot.cabecera)
                    return (
                      <tr key={item.cue}>
                        <td>{item.cue}</td>
                        <td>{item.nombre}</td>
                        <td>{item.departamento}</td>
                        <td>{item.supervisorName}</td>
                        <td>{slotButton(item.cue, 'supervisor', slot.supervisor)}</td>
                        <td>{slotButton(item.cue, 'cabecera', slot.cabecera)}</td>
                        <td>{item.status === 'confirmada' ? 'Confirmada' : complete ? 'Lista para guardar' : 'Pendiente'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
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
