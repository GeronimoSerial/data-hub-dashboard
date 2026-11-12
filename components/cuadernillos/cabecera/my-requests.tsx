'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { BookletRequestLineView, BookletRequestSummary, BookletRequestsPage } from '@/lib/cuadernillos/types'
import { PAGE_SIZE, fichaEscuelaHref, isRequestsPage, readJson, requestLabel, scopedQuery } from './cabecera-api'
import { RemainderAction } from './remainder-action'

function total(lines: BookletRequestLineView[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0)
}

function StatusChip({ request }: { request: BookletRequestSummary }) {
  const tone = request.status === 'rejected' ? 'var(--danger-ink)' : request.status === 'approved' ? 'var(--ink)' : 'var(--ink-soft)'
  return (
    <span style={{ padding: '.15rem .55rem', borderRadius: '999px', border: `1px solid ${tone}`, color: tone, fontSize: '.8rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
      {requestLabel(request)}
    </span>
  )
}

function RequestRow({ request, readOnly, onRequested }: {
  request: BookletRequestSummary
  readOnly: boolean
  onRequested: (message: string) => void
}) {
  const ficha = fichaEscuelaHref(request.recipientCueAnexo)
  const canRemainder = !readOnly && request.status === 'approved' && request.rootRequestId === request.requestId && request.remaining.length > 0
  const submittedAt = request.submittedAt ? new Date(request.submittedAt).toLocaleDateString('es-AR') : null
  return (
    <article style={{ display: 'grid', gap: '.6rem', padding: '.9rem 1rem', border: '1px solid var(--line)', borderRadius: '.75rem', background: 'var(--surface)' }}>
      <header style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: '.5rem' }}>
        <div style={{ display: 'grid', gap: '.15rem', minWidth: 0 }}>
          <strong style={{ color: 'var(--ink)', overflowWrap: 'anywhere' }}>{request.recipientName || 'Escuela destinataria'}</strong>
          <span style={{ color: 'var(--ink-soft)', fontSize: '.85rem' }}>
            CUE {request.recipientCueAnexo}{submittedAt ? ` · ${submittedAt}` : ''}
          </span>
          {ficha ? (
            <a href={ficha} target="_blank" rel="noopener noreferrer" style={{ fontSize: '.85rem', justifySelf: 'start' }}>Ver ficha</a>
          ) : null}
        </div>
        <StatusChip request={request} />
      </header>
      <p style={{ margin: 0, color: 'var(--ink-soft)', fontSize: '.875rem' }}>
        Solicitado {total(request.requested)}
        {request.status === 'approved' ? ` · Aprobado ${total(request.approved)} · Sin aprobar ${total(request.remaining)}` : ''}
      </p>
      <ul style={{ margin: 0, paddingLeft: '1.1rem', color: 'var(--ink)', fontSize: '.9rem' }}>
        {request.requested.map((line) => <li key={line.productId}>{line.productLabel}: {line.quantity}</li>)}
      </ul>
      {canRemainder ? <RemainderAction request={request} disabled={readOnly} onRequested={onRequested} /> : null}
    </article>
  )
}

export function MyRequests({ refreshKey, readOnly, viewAsUserId, onRequested }: {
  refreshKey: number
  readOnly: boolean
  viewAsUserId: string | null
  onRequested: (message: string) => void
}) {
  const [page, setPage] = useState<BookletRequestsPage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    let active = true
    fetch(`/api/cuadernillos/requests?${scopedQuery({ limit: String(PAGE_SIZE), viewAs: viewAsUserId })}`, { cache: 'no-store' })
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
  }, [refreshKey, viewAsUserId])

  async function loadMore() {
    if (!page?.nextCursor || !page.campaignId || loadingMore) return
    setLoadingMore(true)
    try {
      const query = scopedQuery({ campaignId: page.campaignId, cursor: page.nextCursor, limit: String(PAGE_SIZE), viewAs: viewAsUserId })
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
    <section aria-labelledby="my-requests-title" style={{ display: 'grid', gap: '.85rem' }}>
      <h3 id="my-requests-title" style={{ margin: 0, color: 'var(--ink)', fontFamily: 'var(--font-display)', fontSize: '1.15rem' }}>
        Mis pedidos
      </h3>
      {error ? <p role="alert" style={{ margin: 0, color: 'var(--danger-ink)' }}>{error}</p> : null}
      {!page && !error ? (
        <div aria-hidden style={{ display: 'grid', gap: '.5rem' }}>
          <div style={{ height: '4.5rem', borderRadius: '.75rem', background: 'var(--line)', opacity: 0.5 }} />
          <div style={{ height: '4.5rem', borderRadius: '.75rem', background: 'var(--line)', opacity: 0.5 }} />
        </div>
      ) : null}
      {page && page.requests.length === 0 ? (
        <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Todavía no hay pedidos en esta campaña.</p>
      ) : null}
      {page?.requests.length ? (
        <div style={{ display: 'grid', gap: '.6rem' }}>
          {page.requests.map((request) => (
            <RequestRow key={request.requestId} request={request} readOnly={readOnly} onRequested={onRequested} />
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
