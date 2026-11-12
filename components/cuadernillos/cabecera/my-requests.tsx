'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { BookletRequestLineView, BookletRequestSummary, BookletRequestsPage } from '@/lib/cuadernillos/types'
import { PAGE_SIZE, dashedCue, fichaEscuelaHref, isRequestsPage, readJson, requestLabel, scopedQuery } from './cabecera-api'
import { RemainderAction } from './remainder-action'

function total(lines: BookletRequestLineView[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0)
}

function StatusChip({ request }: { request: BookletRequestSummary }) {
  const tone = request.status === 'rejected' ? 'var(--danger-ink)' : request.status === 'approved' ? 'var(--ink)' : 'var(--ink-soft)'
  return (
    <span className="cab-req-chip" style={{ justifySelf: 'end', padding: '.15rem .55rem', borderRadius: '999px', border: `1px solid ${tone}`, color: tone, fontSize: '.8rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
      {requestLabel(request)}
    </span>
  )
}

function RequestRow({ request, onRequested }: {
  request: BookletRequestSummary
  onRequested: (message: string) => void
}) {
  const [open, setOpen] = useState(false)
  const detailId = `request-detail-${request.requestId}`
  const ficha = fichaEscuelaHref(request.recipientCueAnexo)
  const canRemainder = request.status === 'approved' && request.rootRequestId === request.requestId && request.remaining.length > 0
  const submittedAt = request.submittedAt ? new Date(request.submittedAt).toLocaleDateString('es-AR') : null
  return (
    <article className="cab-req">
      <div className="cab-req-main">
        <strong className="cab-req-name">{request.recipientName || 'Escuela destinataria'}</strong>
        <div className="cab-req-meta">
          <span className="cab-req-cue">CUE {dashedCue(request.recipientCueAnexo)}</span>
          <span className="cab-req-date">{submittedAt ?? ''}</span>
          <span className="cab-req-total">{total(request.requested)} solicitados</span>
        </div>
        <StatusChip request={request} />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="cab-req-button"
          aria-expanded={open}
          aria-controls={detailId}
          onClick={() => setOpen((value) => !value)}
        >
          Ver detalle
        </Button>
      </div>
      {open ? (
        <div id={detailId} className="cab-req-detail">
          <ul>
            {request.requested.map((line) => <li key={line.productId}>{line.productLabel}: {line.quantity}</li>)}
          </ul>
          {request.status === 'approved' ? (
            <p style={{ margin: 0, color: 'var(--ink-soft)' }}>
              Aprobado {total(request.approved)} · Sin aprobar {total(request.remaining)}
            </p>
          ) : null}
          {ficha ? (
            <a href={ficha} target="_blank" rel="noopener noreferrer" style={{ justifySelf: 'start' }}>Ver ficha</a>
          ) : null}
        </div>
      ) : null}
      {canRemainder ? <RemainderAction request={request} onRequested={onRequested} /> : null}
    </article>
  )
}

export function MyRequests({ refreshKey, onRequested }: {
  refreshKey: number
  onRequested: (message: string) => void
}) {
  const [page, setPage] = useState<BookletRequestsPage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    let active = true
    fetch(`/api/cuadernillos/requests?${scopedQuery({ limit: String(PAGE_SIZE) })}`, { cache: 'no-store' })
      .then(async (response) => {
        const data = await readJson(response)
        if (!response.ok || !isRequestsPage(data)) throw new Error('No se pudieron cargar tus pedidos.')
        if (!active) return
        setPage(data)
        setError(null)
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'No se pudieron cargar tus pedidos.')
      })
    return () => { active = false }
  }, [refreshKey])

  async function loadMore() {
    if (!page?.nextCursor || !page.campaignId || loadingMore) return
    setLoadingMore(true)
    try {
      const query = scopedQuery({ campaignId: page.campaignId, cursor: page.nextCursor, limit: String(PAGE_SIZE) })
      const response = await fetch(`/api/cuadernillos/requests?${query}`, { cache: 'no-store' })
      const data = await readJson(response)
      if (!response.ok || !isRequestsPage(data)) throw new Error('No se pudieron cargar más pedidos.')
      setPage({ ...data, requests: [...page.requests, ...data.requests] })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudieron cargar más pedidos.')
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <section aria-labelledby="my-requests-title" className="cab-stack">
      <h3 id="my-requests-title" style={{ margin: 0, color: 'var(--ink)', fontFamily: 'var(--font-display)', fontSize: '1.15rem' }}>
        Mis pedidos
      </h3>
      {error ? <p role="alert" style={{ margin: 0, color: 'var(--danger-ink)' }}>{error}</p> : null}
      {!page && !error ? (
        <div aria-hidden style={{ display: 'grid', gap: '.5rem' }}>
          <div style={{ height: '3rem', borderRadius: '.75rem', background: 'var(--line)', opacity: 0.5 }} />
          <div style={{ height: '3rem', borderRadius: '.75rem', background: 'var(--line)', opacity: 0.5 }} />
        </div>
      ) : null}
      {page && page.requests.length === 0 ? (
        <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Todavía no hay pedidos en esta campaña.</p>
      ) : null}
      {page?.requests.length ? (
        <div className="cab-req-list">
          {page.requests.map((request) => (
            <RequestRow key={request.requestId} request={request} onRequested={onRequested} />
          ))}
        </div>
      ) : null}
      {page?.hasMore ? (
        <Button type="button" variant="secondary" disabled={loadingMore} onClick={() => void loadMore()} style={{ justifySelf: 'start' }}>
          {loadingMore ? 'Cargando…' : 'Ver más pedidos'}
        </Button>
      ) : null}
    </section>
  )
}
