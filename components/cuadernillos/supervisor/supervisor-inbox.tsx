'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { BookletBalanceView, BookletRequestSummary, BookletRequestsPage } from '@/lib/cuadernillos/types'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { SheetContent, SheetRoot, SheetTitle } from '@/components/ui/sheet'
import { InboxDetail, type ApprovalLine } from './inbox-detail'
import { availabilityFor, formatAge, formatCue, groupPendingByCabecera } from './inbox-model'
import { isBalances, isRequestsPage } from './inbox-guards'

const PAGE_SIZE = 50
const ACTION_ERRORS: Record<string, string> = {
  authority_unavailable: 'La decisión no está disponible: falta la prueba de autorización transaccional y concurrencia PostgreSQL. No se modificó la solicitud.',
  forbidden: 'Esta cuenta no está autorizada para decidir sobre esta solicitud.',
  request_not_found: 'La solicitud ya no está disponible.',
  request_not_pending: 'La solicitud ya no está pendiente. Actualizá la lista.',
  idempotency_conflict: 'La clave de reintento quedó asociada a otra decisión. Actualizá la lista.',
  ineligible: 'La escuela ya no cumple el criterio de elegibilidad vigente.',
}
const DECIDE_FALLBACK = 'No se pudo completar la decisión. La solicitud conserva su estado anterior.'
const STATUS_LABELS: Record<BookletRequestSummary['status'], string> = {
  draft: 'Borrador', pending: 'Pendiente', approved: 'Aprobada', rejected: 'Rechazada',
}

type Decision = { kind: 'approve'; lines: ApprovalLine[] } | { kind: 'reject'; reason: string }

async function fetchJson<T>(url: string, guard: (value: unknown) => value is T, signal?: AbortSignal, fallback = 'No se pudieron cargar los pedidos.'): Promise<T> {
  const response = await fetch(url, { signal, cache: 'no-store' })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : fallback)
  }
  if (!guard(data)) throw new Error('La respuesta no tiene un formato válido.')
  return data
}

async function fetchInbox(campaignId: string, viewAs: string | null, signal: AbortSignal): Promise<{ page: BookletRequestsPage; balances: BookletBalanceView[] }> {
  const query = new URLSearchParams({ limit: String(PAGE_SIZE) })
  if (campaignId) query.set('campaignId', campaignId)
  if (viewAs) query.set('viewAs', viewAs)
  const page = await fetchJson(`/api/cuadernillos/requests?${query}`, isRequestsPage, signal)
  let balances: BookletBalanceView[] = []
  if (page.campaignId) {
    // Availability is informative: if it fails, approvals still default to the requested quantity.
    const overviewQuery = new URLSearchParams({ capability: 'supervisor', campaignId: page.campaignId })
    if (viewAs) overviewQuery.set('viewAs', viewAs)
    balances = await fetch(`/api/cuadernillos/overview?${overviewQuery}`, { signal, cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => (data && typeof data === 'object' && isBalances((data as { balances?: unknown }).balances) ? (data as { balances: BookletBalanceView[] }).balances : []))
      .catch(() => [])
  }
  return { page, balances }
}

function pluralPending(count: number) {
  return `${count} pendiente${count === 1 ? '' : 's'}`
}

const PHONE_QUERY = '(max-width: 640px)'

// Phones get the detail as a bottom sheet; wider screens get the right-side sheet.
function useIsPhone() {
  const [phone, setPhone] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const query = window.matchMedia(PHONE_QUERY)
    const update = () => setPhone(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return phone
}

export function SupervisorInbox({ readOnly, viewAsUserId = null }: { isAdmin: boolean; readOnly: boolean; viewAsUserId?: string | null }) {
  const [page, setPage] = useState<BookletRequestsPage | null>(null)
  const [balances, setBalances] = useState<BookletBalanceView[]>([])
  const [campaign, setCampaign] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)
  const intentKeys = useRef(new Map<string, { body: string; key: string }>())
  const phone = useIsPhone()

  useEffect(() => {
    const controller = new AbortController()
    void Promise.resolve()
      .then(() => fetchInbox(campaign, viewAsUserId, controller.signal))
      .then((data) => {
        if (controller.signal.aborted) return
        setPage(data.page)
        setBalances(data.balances)
        setError(null)
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'No se pudieron cargar los pedidos.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [campaign, viewAsUserId, refresh])

  const groups = useMemo(() => groupPendingByCabecera(page?.requests ?? []), [page])
  const pending = useMemo(() => groups.flatMap((group) => group.requests), [groups])
  const decided = useMemo(() => (page?.requests ?? []).filter((request) => request.status === 'approved' || request.status === 'rejected'), [page])
  const selected = pending.find((request) => request.requestId === selectedId) ?? null

  function requestKey(scope: string, body: unknown) {
    const fingerprint = JSON.stringify(body)
    const prior = intentKeys.current.get(scope)
    if (prior?.body === fingerprint) return prior.key
    const key = crypto.randomUUID()
    intentKeys.current.set(scope, { body: fingerprint, key })
    return key
  }

  async function decide(request: BookletRequestSummary, decision: Decision) {
    const endpoint = `/api/cuadernillos/requests/${encodeURIComponent(request.requestId)}/${decision.kind === 'approve' ? 'approve' : 'reject'}`
    const payload = decision.kind === 'approve' ? { lines: decision.lines } : { reason: decision.reason }
    const idempotencyKey = requestKey(`${request.requestId}:${decision.kind}`, payload)
    setBusy(true)
    setActionError(null)
    try {
      const response = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, idempotencyKey }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        const code = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : ''
        throw new Error(ACTION_ERRORS[code] ?? DECIDE_FALLBACK)
      }
      intentKeys.current.delete(`${request.requestId}:${decision.kind}`)
      setNotice(decision.kind === 'approve' ? 'Pedido aprobado.' : 'Pedido rechazado.')
      setSelectedId(null)
      setRefresh((value) => value + 1)
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : DECIDE_FALLBACK)
    } finally {
      setBusy(false)
    }
  }

  function closePanel() {
    setSelectedId(null)
    setActionError(null)
  }

  return (
    <section aria-labelledby="supervisor-inbox-title" style={{ display: 'grid', gap: '1.25rem' }}>
      <header>
        <h2 id="supervisor-inbox-title" style={{ margin: 0, color: 'var(--ink)', fontFamily: 'var(--font-display)', fontSize: 'clamp(1.25rem, 3vw, 1.6rem)' }}>
          Pedidos pendientes
        </h2>
      </header>

      {notice ? <p role="status" style={{ margin: 0, color: 'var(--ink)' }}>{notice}</p> : null}
      {loading && !page ? <p role="status" style={{ margin: 0, color: 'var(--ink-soft)' }}>Cargando pedidos…</p> : null}
      {error ? <p role="alert" style={{ margin: 0, color: 'var(--danger-ink)' }}>{error}</p> : null}

      {page && page.campaignOptions.length > 1 ? (
        <div role="group" aria-label="Campaña" style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem' }}>
          {page.campaignOptions.map((option) => (
            <button key={option.id} type="button" aria-pressed={campaign === option.id} className="ui-button ui-button--secondary"
              onClick={() => { setLoading(true); setCampaign(option.id) }}>
              {option.name}
            </button>
          ))}
        </div>
      ) : null}
      {page && page.campaignId === null && page.campaignOptions.length > 0 ? (
        <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Elegí una campaña para ver sus pedidos.</p>
      ) : null}

      {page && page.campaignId !== null && pending.length === 0 && !loading ? (
        <p style={{ margin: 0, color: 'var(--ink-soft)' }}>No hay pedidos pendientes</p>
      ) : null}

      {groups.map((group) => (
        <section key={group.cabeceraCueAnexo} role="group" aria-label={group.cabeceraName} style={{ display: 'grid', gap: '.5rem' }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem', alignItems: 'baseline' }}>
            <h3 style={{ margin: 0, color: 'var(--ink)', fontSize: '1rem' }}>{group.cabeceraName}</h3>
            <span style={{ color: 'var(--ink-soft)', fontSize: '.9rem' }}>{pluralPending(group.requests.length)}</span>
          </header>
          {group.requests.map((request) => {
            const total = request.requested.reduce((sum, line) => sum + line.quantity, 0)
            return (
              <button key={request.requestId} type="button" className="cdl-row-button" onClick={() => { setActionError(null); setSelectedId(request.requestId) }}>
                <span style={{ fontWeight: 600, minWidth: 0 }}>{request.recipientName || 'Escuela destinataria'}</span>
                <span style={{ color: 'var(--ink-soft)', fontSize: '.9rem', minWidth: 0 }}>
                  CUE {formatCue(request.recipientCueAnexo)} · {total} cuadernillos
                </span>
                <span style={{ color: 'var(--ink-soft)', fontSize: '.85rem', minWidth: 0 }}>{formatAge(request.submittedAt)}</span>
                <ChevronRight className="cdl-chevron" aria-hidden="true" size={20} />
              </button>
            )
          })}
        </section>
      ))}

      {decided.length ? (
        <details>
          <summary style={{ cursor: 'pointer', color: 'var(--ink-soft)' }}>
            <span>Historial</span> <span>({decided.length})</span>
          </summary>
          <ul style={{ listStyle: 'none', margin: '.75rem 0 0', padding: 0, display: 'grid', gap: '.5rem' }}>
            {decided.map((request) => (
              <li key={request.requestId} style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem', color: 'var(--ink-soft)' }}>
                <span>{request.recipientName || 'Escuela destinataria'}</span>
                <span>{STATUS_LABELS[request.status]}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {phone ? (
        <BottomSheet open={selected !== null} titulo="Pedido de cuadernillos" onCerrar={closePanel}>
          {selected ? (
            <InboxDetail
              key={selected.requestId}
              request={selected}
              availability={availabilityFor(selected, balances)}
              readOnly={readOnly}
              busy={busy}
              error={actionError}
              onApprove={(lines) => void decide(selected, { kind: 'approve', lines })}
              onReject={(reason) => void decide(selected, { kind: 'reject', reason })}
            />
          ) : null}
        </BottomSheet>
      ) : (
        <SheetRoot open={selected !== null} onOpenChange={(open) => { if (!open) closePanel() }}>
          <SheetContent side="right" style={{ width: 'min(100vw, 28rem)', maxWidth: '100vw', boxSizing: 'border-box', padding: '1.5rem', overflowY: 'auto' }}>
            <SheetTitle style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>Pedido de cuadernillos</SheetTitle>
            {selected ? (
              <InboxDetail
                key={selected.requestId}
                request={selected}
                availability={availabilityFor(selected, balances)}
                readOnly={readOnly}
                busy={busy}
                error={actionError}
                onApprove={(lines) => void decide(selected, { kind: 'approve', lines })}
                onReject={(reason) => void decide(selected, { kind: 'reject', reason })}
              />
            ) : null}
          </SheetContent>
        </SheetRoot>
      )}
    </section>
  )
}
