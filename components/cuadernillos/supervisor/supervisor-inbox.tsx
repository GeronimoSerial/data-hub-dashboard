'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { BookletBalanceView, BookletRequestSummary, BookletRequestsPage } from '@/lib/cuadernillos/types'
import { Chip, Drawer, EmptyState, KpiStrip, Note, PageHeader, Panel, Segmented, formatCount } from '../kit'
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

async function fetchInbox(campaignId: string, signal: AbortSignal): Promise<{ page: BookletRequestsPage; balances: BookletBalanceView[] }> {
  const query = new URLSearchParams({ limit: String(PAGE_SIZE) })
  if (campaignId) query.set('campaignId', campaignId)
  const page = await fetchJson(`/api/cuadernillos/requests?${query}`, isRequestsPage, signal)
  let balances: BookletBalanceView[] = []
  if (page.campaignId) {
    // Availability is informative: if it fails, approvals still default to the requested quantity.
    const overviewQuery = new URLSearchParams({ capability: 'supervisor', campaignId: page.campaignId })
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

export function SupervisorInbox() {
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
  const [view, setView] = useState<'pending' | 'history'>('pending')

  useEffect(() => {
    const controller = new AbortController()
    void Promise.resolve()
      .then(() => fetchInbox(campaign, controller.signal))
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
  }, [campaign, refresh])

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

  const unitsPending = pending.reduce((sum, request) => sum + request.requested.reduce((inner, line) => inner + line.quantity, 0), 0)
  const approvedCount = decided.filter((request) => request.status === 'approved').length
  const rejectedCount = decided.length - approvedCount

  return (
    <section aria-labelledby="supervisor-inbox-title" className="k-stack">
      <PageHeader id="supervisor-inbox-title" title="Pedidos pendientes" description="Revisá lo que piden las cabeceras de tu zona y aprobá o rechazá cada pedido." />

      {notice ? <Note tone="ok">{notice}</Note> : null}
      {loading && !page ? <p role="status" style={{ margin: 0, color: 'var(--ink-soft)' }}>Cargando pedidos…</p> : null}
      {error ? <Note tone="danger">{error}</Note> : null}

      {page && page.campaignOptions.length > 1 ? (
        <Segmented
          label="Campaña"
          value={campaign}
          options={page.campaignOptions.map((option) => ({ value: option.id, label: option.name }))}
          onChange={(id) => { setLoading(true); setCampaign(id) }}
        />
      ) : null}
      {page && page.campaignId === null && page.campaignOptions.length > 0 ? (
        <EmptyState title="Elegí una campaña" description="Elegí una campaña para ver sus pedidos." />
      ) : null}

      {page && page.campaignId !== null ? (
        <>
          <KpiStrip label="Resumen de pedidos" items={[
            { label: 'Pendientes', value: pending.length, tone: pending.length > 0 ? 'warn' : undefined },
            { label: 'Cuadernillos a revisar', value: formatCount(unitsPending) },
            { label: 'Aprobados', value: approvedCount },
            { label: 'Rechazados', value: rejectedCount },
          ]} />

          <Segmented
            label="Ver pedidos"
            value={view}
            options={[{ value: 'pending', label: `Pendientes (${pending.length})` }, { value: 'history', label: `Historial (${decided.length})` }]}
            onChange={setView}
          />

          {view === 'pending' && pending.length === 0 && !loading ? (
            <EmptyState title="No hay pedidos pendientes" description="Cuando una cabecera envíe un pedido, aparece acá para que lo revises." />
          ) : null}

          {view === 'pending' ? groups.map((group) => (
            <Panel key={group.cabeceraCueAnexo} title={group.cabeceraName} aside={pluralPending(group.requests.length)}>
              <div role="group" aria-label={group.cabeceraName} className="k-list">
                {group.requests.map((request) => {
                  const total = request.requested.reduce((sum, line) => sum + line.quantity, 0)
                  return (
                    <button key={request.requestId} type="button" className="k-row" onClick={() => { setActionError(null); setSelectedId(request.requestId) }}>
                      <span className="k-row-main">
                        <span className="k-row-title">{request.recipientName || 'Escuela destinataria'}</span>
                        <span className="k-row-meta">CUE {formatCue(request.recipientCueAnexo)} · {total} cuadernillos · {formatAge(request.submittedAt)}</span>
                      </span>
                      <span className="k-row-side"><Chip tone="warn">Pendiente</Chip><ChevronRight aria-hidden size={20} /></span>
                    </button>
                  )
                })}
              </div>
            </Panel>
          )) : null}

          {view === 'history' ? (
            decided.length === 0 ? (
              <EmptyState title="Todavía no hay pedidos resueltos" />
            ) : (
              <ul className="k-list">
                {decided.map((request) => (
                  <li key={request.requestId} className="k-row">
                    <span className="k-row-main">
                      <span className="k-row-title">{request.recipientName || 'Escuela destinataria'}</span>
                      <span className="k-row-meta">CUE {formatCue(request.recipientCueAnexo)} · {request.cabeceraName}</span>
                    </span>
                    <span className="k-row-side"><Chip tone={request.status === 'approved' ? 'ok' : 'danger'}>{STATUS_LABELS[request.status]}</Chip></span>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </>
      ) : null}

      <Drawer
        open={selected !== null}
        title={selected?.recipientName || 'Pedido de cuadernillos'}
        description="Pedido de cuadernillos"
        onClose={closePanel}
      >
        {selected ? (
          <InboxDetail
            key={selected.requestId}
            request={selected}
            availability={availabilityFor(selected, balances)}
            busy={busy}
            error={actionError}
            onApprove={(lines) => void decide(selected, { kind: 'approve', lines })}
            onReject={(reason) => void decide(selected, { kind: 'reject', reason })}
          />
        ) : null}
      </Drawer>
    </section>
  )
}
