'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  BookletCampaignOption,
  BookletCapability,
  BookletRequestLineView,
  BookletRequestSummary,
  BookletRequestsPage,
  RequestChainView,
} from '@/lib/cuadernillos/types'

const PAGE_SIZE = 50
const ACTION_ERRORS: Record<string, string> = {
  authority_unavailable: 'La decisión no está disponible: falta la prueba de autorización transaccional y concurrencia PostgreSQL. No se modificó la solicitud.',
  forbidden: 'Esta cuenta no está autorizada para decidir sobre esta solicitud.',
  request_not_found: 'La solicitud ya no está disponible.',
  request_not_pending: 'La solicitud ya no está pendiente. Actualizá la lista.',
  request_not_remainder_eligible: 'Esta solicitud no admite un remanente.',
  remainder_exceeded: 'El remanente disponible cambió. Actualizá la lista antes de volver a intentar.',
  idempotency_conflict: 'La clave de reintento quedó asociada a otra decisión. Actualizá la lista.',
  ineligible: 'La escuela ya no cumple el criterio de elegibilidad vigente.',
}
const STATUS_LABELS: Record<BookletRequestSummary['status'], string> = {
  draft: 'Borrador',
  pending: 'Pendiente',
  approved: 'Aprobada',
  rejected: 'Rechazada',
}

function isLine(value: unknown): value is BookletRequestLineView {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return typeof row.productId === 'string' && typeof row.productLabel === 'string'
    && Number.isSafeInteger(row.quantity) && (row.quantity as number) >= 0
}

function isRequest(value: unknown): value is BookletRequestSummary {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return typeof row.requestId === 'string' && typeof row.recipientCueAnexo === 'string'
    && typeof row.rootRequestId === 'string'
    && /^\d{9}$/.test(row.recipientCueAnexo) && typeof row.recipientName === 'string'
    && typeof row.cabeceraCueAnexo === 'string' && /^\d{9}$/.test(row.cabeceraCueAnexo)
    && typeof row.cabeceraName === 'string'
    && (row.status === 'draft' || row.status === 'pending' || row.status === 'approved' || row.status === 'rejected')
    && Array.isArray(row.requested) && row.requested.every(isLine)
    && Array.isArray(row.approved) && row.approved.every(isLine)
    && Array.isArray(row.remaining) && row.remaining.every(isLine)
    && (row.submittedAt === null || typeof row.submittedAt === 'string')
    && (row.approvedAt === null || typeof row.approvedAt === 'string')
    && (row.approvalIdentity === null || typeof row.approvalIdentity === 'string')
}

function isRequestChain(value: unknown): value is RequestChainView {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  const validLines = (lines: unknown) => Array.isArray(lines) && lines.every((line) =>
    line !== null && typeof line === 'object'
    && typeof (line as Record<string, unknown>).productId === 'string'
    && Number.isSafeInteger((line as Record<string, unknown>).quantity)
    && ((line as Record<string, unknown>).quantity as number) >= 0)
  return typeof row.rootRequestId === 'string'
    && validLines(row.requested) && validLines(row.approved)
    && validLines(row.remaining) && validLines(row.availableRemainder)
}

function isCampaign(value: unknown): value is BookletCampaignOption {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return typeof row.id === 'string' && typeof row.name === 'string'
    && typeof row.distributionEnabled === 'boolean'
    && (typeof row.overassignmentAllowed === 'boolean' || row.overassignmentAllowed === null)
}

function isPage(value: unknown): value is BookletRequestsPage {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return (row.campaignId === null || typeof row.campaignId === 'string')
    && Array.isArray(row.campaignOptions) && row.campaignOptions.every(isCampaign)
    && Array.isArray(row.requests) && row.requests.every(isRequest)
    && typeof row.hasMore === 'boolean'
    && (row.nextCursor === null || typeof row.nextCursor === 'string')
}

async function fetchPage(url: string, signal?: AbortSignal): Promise<BookletRequestsPage> {
  const response = await fetch(url, { signal, cache: 'no-store' })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const error = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
      ? data.error
      : 'No se pudieron cargar las solicitudes.'
    throw new Error(error)
  }
  if (!isPage(data)) throw new Error('La respuesta de solicitudes no tiene un formato válido.')
  return data
}

/** ENOS ficha route takes the dashed CUE form (1801234-57) for a 9-digit booklet CUE (180123457). */
export function fichaEscuelaHref(cueAnexo: string): string | null {
  if (!/^\d{9}$/.test(cueAnexo)) return null
  return `/mapas/infraestructura/escuelas/${cueAnexo.slice(0, 7)}-${cueAnexo.slice(7)}`
}

function RequestLines({ lines }: { lines: BookletRequestLineView[] }) {
  if (!lines.length) return <span>Sin cantidades registradas</span>
  return (
    <ul style={{ margin: '.4rem 0 0', paddingLeft: '1.25rem' }}>
      {lines.map((line) => <li key={line.productId}>{line.productLabel}: {line.quantity}</li>)}
    </ul>
  )
}

export function RequestList({ refreshKey = 0, capability, viewAsUserId = null }: { refreshKey?: number; capability?: BookletCapability; viewAsUserId?: string | null }) {
  // Read-only while viewing as another account: writes always belong to the session actor.
  const readOnly = Boolean(viewAsUserId)
  const [page, setPage] = useState<BookletRequestsPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedCampaign, setSelectedCampaign] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState<string | null>(null)
  const [actionRefresh, setActionRefresh] = useState(0)
  const [approvalQuantities, setApprovalQuantities] = useState<Record<string, Record<string, string>>>({})
  const [remainderQuantities, setRemainderQuantities] = useState<Record<string, Record<string, string>>>({})
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({})
  const [confirmedDecisions, setConfirmedDecisions] = useState<Record<string, boolean>>({})
  const [requestChains, setRequestChains] = useState<Record<string, RequestChainView>>({})
  const intentKeys = useRef(new Map<string, { body: string; key: string }>())

  const load = useCallback(async (campaignId?: string, signal?: AbortSignal) => {
    const query = new URLSearchParams({ limit: String(PAGE_SIZE) })
    if (campaignId) query.set('campaignId', campaignId)
    if (viewAsUserId) query.set('viewAs', viewAsUserId)
    const next = await fetchPage(`/api/cuadernillos/requests?${query}`, signal)
    setError(null)
    setPage(next)
    setSelectedCampaign(next.campaignId ?? '')
  }, [viewAsUserId])

  useEffect(() => {
    const controller = new AbortController()
    void Promise.resolve().then(() => load(undefined, controller.signal)).catch((reason) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'No se pudieron cargar las solicitudes.')
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })
    return () => controller.abort()
  }, [load, refreshKey, actionRefresh])

  function requestKey(scope: string, body: unknown) {
    const fingerprint = JSON.stringify(body)
    const prior = intentKeys.current.get(scope)
    if (prior?.body === fingerprint) return prior.key
    const key = crypto.randomUUID()
    intentKeys.current.set(scope, { body: fingerprint, key })
    return key
  }

  async function loadRequestChain(request: BookletRequestSummary) {
    setActionError(null)
    try {
      const response = await fetch(`/api/cuadernillos/requests/${encodeURIComponent(request.requestId)}/remainder`, { cache: 'no-store' })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        const code = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : ''
        throw new Error(ACTION_ERRORS[code] ?? 'No se pudo verificar el remanente de esta solicitud.')
      }
      if (!isRequestChain(data) || data.rootRequestId !== request.rootRequestId) throw new Error('La cadena de solicitudes no tiene un formato válido.')
      setRequestChains((current) => ({ ...current, [request.requestId]: data }))
      setRemainderQuantities((current) => ({ ...current, [request.requestId]: Object.fromEntries(data.availableRemainder.map((line) => [line.productId, String(line.quantity)])) }))
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'No se pudo verificar el remanente de esta solicitud.')
    }
  }

  async function submitDecision(request: BookletRequestSummary, decision: 'approve' | 'reject' | 'remainder') {
    const requestId = request.requestId
    let endpoint = ''
    let payload: Record<string, unknown>
    if (decision === 'approve') {
      const lines = request.requested.flatMap((line) => {
        const quantity = Number(approvalQuantities[requestId]?.[line.productId] ?? line.quantity)
        return Number.isSafeInteger(quantity) && quantity > 0 && quantity <= line.quantity ? [{ productId: line.productId, quantity }] : []
      })
      if (!lines.length || lines.length !== request.requested.length) { setActionError('Cada cantidad aprobada debe ser un entero positivo y no superar lo solicitado.'); return }
      if (!confirmedDecisions[requestId]) { setActionError('Confirmá la advertencia antes de registrar la decisión.'); return }
      payload = { lines }
      endpoint = `/api/cuadernillos/requests/${encodeURIComponent(requestId)}/approve`
    } else if (decision === 'reject') {
      const reason = rejectReasons[requestId]?.trim() ?? ''
      if (!reason) { setActionError('Ingresá el motivo del rechazo.'); return }
      payload = { reason }
      endpoint = `/api/cuadernillos/requests/${encodeURIComponent(requestId)}/reject`
    } else {
      const available = requestChains[request.requestId]?.availableRemainder ?? []
      const lines = request.remaining.flatMap((line) => {
        const availableQuantity = available.find((candidate) => candidate.productId === line.productId)?.quantity ?? 0
        const quantity = Number(remainderQuantities[requestId]?.[line.productId] ?? availableQuantity)
        return Number.isSafeInteger(quantity) && quantity > 0 && quantity <= availableQuantity ? [{ productId: line.productId, quantity }] : []
      })
      if (!lines.length) { setActionError('No hay cantidades libres para proponer como remanente.'); return }
      payload = { lines }
      endpoint = `/api/cuadernillos/requests/${encodeURIComponent(request.rootRequestId)}/remainder`
    }
    const idempotencyKey = requestKey(`${requestId}:${decision}`, payload)
    setActionBusy(`${requestId}:${decision}`)
    setActionError(null)
    try {
      const response = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, idempotencyKey }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        const code = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : ''
        throw new Error(ACTION_ERRORS[code] ?? 'No se pudo completar la decisión. La solicitud conserva su estado anterior.')
      }
      intentKeys.current.delete(`${requestId}:${decision}`)
      setActionRefresh((value) => value + 1)
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'No se pudo completar la decisión. La solicitud conserva su estado anterior.')
    } finally {
      setActionBusy(null)
    }
  }

  async function selectCampaign(campaignId: string) {
    setSelectedCampaign(campaignId)
    if (!campaignId) return
    setLoading(true)
    setError(null)
    try {
      await load(campaignId)
    } catch (reason) {
      setPage(null)
      setError(reason instanceof Error ? reason.message : 'No se pudieron cargar las solicitudes.')
    } finally {
      setLoading(false)
    }
  }

  async function loadMore() {
    if (!page?.nextCursor || !page.campaignId || loadingMore) return
    setLoadingMore(true)
    setError(null)
    const query = new URLSearchParams({ campaignId: page.campaignId, cursor: page.nextCursor, limit: String(PAGE_SIZE) })
    if (viewAsUserId) query.set('viewAs', viewAsUserId)
    try {
      const next = await fetchPage(`/api/cuadernillos/requests?${query}`)
      setPage((current) => current ? { ...next, requests: [...current.requests, ...next.requests] } : next)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudieron cargar más solicitudes.')
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <section aria-labelledby="request-list-title" style={{ marginTop: '2.5rem' }}>
      <h3 id="request-list-title" style={{ margin: 0, color: 'var(--ink)', fontFamily: 'var(--font-display)', fontSize: '1.2rem' }}>
        Solicitudes
      </h3>
      {loading && !page ? <p role="status" style={{ color: 'var(--ink-soft)' }}>Cargando solicitudes…</p> : null}
      {error ? <p role="alert" style={{ color: 'var(--danger-ink)' }}>{error}</p> : null}
      {actionError ? <p role="alert" style={{ color: 'var(--danger-ink)' }}>{actionError}</p> : null}

      {page?.campaignOptions.length ? (
        <div style={{ marginTop: '.75rem' }}>
          <label htmlFor="cuadernillos-campaign" style={{ display: 'block', marginBottom: '.35rem', fontWeight: 600 }}>Campaña de solicitudes</label>
          <select id="cuadernillos-campaign" value={selectedCampaign} onChange={(event) => void selectCampaign(event.target.value)}>
            <option value="">Seleccioná una campaña</option>
            {page.campaignOptions.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
          </select>
          {!selectedCampaign ? <p style={{ color: 'var(--ink-soft)' }}>Elegí una campaña para consultar sus solicitudes.</p> : null}
        </div>
      ) : null}

      {page?.campaignId && page.requests.length === 0 && !loading ? <p style={{ color: 'var(--ink-soft)' }}>No hay solicitudes en esta campaña.</p> : null}
      {page && page.campaignOptions.length === 0 && page.campaignId === null ? <p style={{ color: 'var(--ink-soft)' }}>No hay campañas activas para consultar.</p> : null}

      {page?.requests.length ? (
        <div style={{ display: 'grid', gap: '.85rem', marginTop: '1rem' }}>
          {page.requests.map((request) => (
            <article key={request.requestId} style={{ border: '1px solid var(--line)', borderRadius: '.75rem', padding: '1rem', background: 'var(--surface)' }}>
              <header style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '.5rem' }}>
                <div>
                  <h4 style={{ margin: 0, color: 'var(--ink)' }}>{request.recipientName || 'Escuela destinataria'}</h4>
                  <p style={{ margin: '.25rem 0 0', color: 'var(--ink-soft)' }}>CUE Anexo {request.recipientCueAnexo}</p>
                  {fichaEscuelaHref(request.recipientCueAnexo) ? (
                    <a href={fichaEscuelaHref(request.recipientCueAnexo)!} style={{ display: 'inline-block', marginTop: '.35rem' }}>Ver ficha en ENOS</a>
                  ) : null}
                </div>
                <span>{STATUS_LABELS[request.status]}</span>
              </header>
              <p style={{ margin: '.75rem 0 0', color: 'var(--ink-soft)' }}>Cabecera: {request.cabeceraName} · CUE Anexo {request.cabeceraCueAnexo}</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))', gap: '.75rem', marginTop: '.75rem' }}>
                <div><strong>Solicitado</strong><RequestLines lines={request.requested} /></div>
                {request.status === 'approved' ? <div><strong>Aprobado</strong><RequestLines lines={request.approved} /></div> : null}
                {request.status === 'approved' ? <div><strong>Pendiente</strong><RequestLines lines={request.remaining} /></div> : null}
              </div>
              {request.status === 'approved' ? (
                <div style={{ marginTop: '.75rem', color: 'var(--ink-soft)' }}>
                  <p style={{ margin: 0 }}>{request.remaining.length ? 'No aprobado en esta solicitud:' : 'Sin diferencia pendiente en esta solicitud:'}</p>
                  {request.remaining.length ? <RequestLines lines={request.remaining} /> : null}
                  <p style={{ margin: '.35rem 0 0' }}>
                    {request.approvedAt ? `Aprobada el ${new Date(request.approvedAt).toLocaleString('es-AR')}.` : ''}
                    {request.approvalIdentity ? ` Cuenta que aprobó: ${request.approvalIdentity}.` : ''}
                  </p>
                </div>
              ) : null}
              {capability === 'supervisor' && request.status === 'pending' ? (
                <div style={{ display: 'grid', gap: '.75rem', marginTop: '1rem', borderTop: '1px solid var(--line)', paddingTop: '1rem' }}>
                  <h5 style={{ margin: 0 }}>Revisión individual</h5>
                  <p style={{ margin: 0, color: 'var(--ink-soft)' }}>La aprobación descuenta stock y cupo inmediatamente, no puede anularse y no confirma una entrega física. No se puede cambiar después.</p>
                  {request.requested.map((line) => (
                    <label key={line.productId} style={{ display: 'grid', gap: '.25rem', maxWidth: '20rem' }}>
                      Cantidad aprobada · {line.productLabel}
                      <input type="number" min="1" max={line.quantity} step="1" value={approvalQuantities[request.requestId]?.[line.productId] ?? line.quantity}
                        onChange={(event) => setApprovalQuantities((current) => ({ ...current, [request.requestId]: { ...current[request.requestId], [line.productId]: event.target.value } }))} />
                    </label>
                  ))}
                  <label><input type="checkbox" checked={confirmedDecisions[request.requestId] ?? false} onChange={(event) => setConfirmedDecisions((current) => ({ ...current, [request.requestId]: event.target.checked }))} /> Confirmo la decisión individual y el descuento inmediato sin anulación.</label>
                  <button type="button" disabled={readOnly || Boolean(actionBusy) || !confirmedDecisions[request.requestId]} onClick={() => void submitDecision(request, 'approve')} className="ui-button ui-button--primary">{actionBusy === `${request.requestId}:approve` ? 'Procesando…' : 'Confirmar aprobación'}</button>
                  <label style={{ display: 'grid', gap: '.25rem' }}>Motivo del rechazo<textarea value={rejectReasons[request.requestId] ?? ''} onChange={(event) => setRejectReasons((current) => ({ ...current, [request.requestId]: event.target.value }))} maxLength={1000} /></label>
                  <button type="button" disabled={readOnly || Boolean(actionBusy) || !(rejectReasons[request.requestId]?.trim())} onClick={() => void submitDecision(request, 'reject')} className="ui-button ui-button--secondary">{actionBusy === `${request.requestId}:reject` ? 'Procesando…' : 'Rechazar solicitud'}</button>
                </div>
              ) : null}
              {capability === 'cabecera' && request.rootRequestId === request.requestId && request.status === 'approved' && request.remaining.length ? (
                <div style={{ display: 'grid', gap: '.75rem', marginTop: '1rem', borderTop: '1px solid var(--line)', paddingTop: '1rem' }}>
                  <h5 style={{ margin: 0 }}>Proponer una solicitud de remanente</h5>
                  <p style={{ margin: 0, color: 'var(--ink-soft)' }}>La diferencia no aprobada de esta solicitud es indicativa; no es un saldo disponible. Consultá la cadena para descontar remanentes ya reservados. El servidor vuelve a validar antes de crear una solicitud pendiente; esto no aprueba ni completa el faltante.</p>
                  {!requestChains[request.requestId] ? (
                    <button type="button" disabled={readOnly || Boolean(actionBusy)} onClick={() => void loadRequestChain(request)} className="ui-button ui-button--secondary">Consultar disponibilidad de remanente</button>
                  ) : (
                    <>
                      <div><strong>Solicitado en la cadena</strong><RequestLines lines={requestChains[request.requestId].requested.map((line) => ({ ...line, productLabel: request.requested.find((requested) => requested.productId === line.productId)?.productLabel ?? line.productId }))} /></div>
                      <div><strong>Aprobado en la cadena</strong><RequestLines lines={requestChains[request.requestId].approved.map((line) => ({ ...line, productLabel: request.requested.find((requested) => requested.productId === line.productId)?.productLabel ?? line.productId }))} /></div>
                      <div><strong>Gap de la cadena (indicativo)</strong><RequestLines lines={requestChains[request.requestId].remaining.map((line) => ({ ...line, productLabel: request.requested.find((requested) => requested.productId === line.productId)?.productLabel ?? line.productId }))} /></div>
                      <div><strong>Disponible para proponer</strong><RequestLines lines={requestChains[request.requestId].availableRemainder.map((line) => ({ ...line, productLabel: request.requested.find((requested) => requested.productId === line.productId)?.productLabel ?? line.productId }))} /></div>
                      {requestChains[request.requestId].availableRemainder.map((line) => {
                        const product = request.requested.find((requested) => requested.productId === line.productId)
                        return product ? (
                          <label key={line.productId} style={{ display: 'grid', gap: '.25rem', maxWidth: '20rem' }}>
                            Cantidad propuesta · {product.productLabel}
                            <input type="number" min="1" max={line.quantity} step="1" value={remainderQuantities[request.requestId]?.[line.productId] ?? line.quantity}
                              onChange={(event) => setRemainderQuantities((current) => ({ ...current, [request.requestId]: { ...current[request.requestId], [line.productId]: event.target.value } }))} />
                          </label>
                        ) : null
                      })}
                      <button type="button" disabled={readOnly || Boolean(actionBusy) || requestChains[request.requestId].availableRemainder.length === 0} onClick={() => void submitDecision(request, 'remainder')} className="ui-button ui-button--secondary">{actionBusy === `${request.requestId}:remainder` ? 'Enviando…' : 'Solicitar remanente'}</button>
                    </>
                  )}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}

      {page?.hasMore ? (
        <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="ui-button ui-button--secondary" style={{ marginTop: '1rem' }}>
          {loadingMore ? 'Cargando…' : 'Ver más solicitudes'}
        </button>
      ) : null}
    </section>
  )
}
