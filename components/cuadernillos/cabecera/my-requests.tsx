'use client'

import { useEffect, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { BookletRequestLineView, BookletRequestSummary, BookletRequestsPage } from '@/lib/cuadernillos/types'
import { PAGE_SIZE, dashedCue, fichaEscuelaHref, isRequestsPage, readJson, requestLabel, scopedQuery } from './cabecera-api'
import { Chip, Modal, ModalBody, EmptyState, Note, Panel } from '../kit'
import { RemainderAction } from './remainder-action'

function total(lines: BookletRequestLineView[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0)
}

function statusTone(request: BookletRequestSummary) {
  if (request.status === 'rejected') return 'danger' as const
  if (request.status === 'approved') return request.remaining.length ? 'info' as const : 'ok' as const
  if (request.status === 'pending') return 'warn' as const
  return 'neutral' as const
}

function RequestModal({ request, onClose, onRequested }: {
  request: BookletRequestSummary | null
  onClose: () => void
  onRequested: (message: string) => void
}) {
  const ficha = request ? fichaEscuelaHref(request.recipientCueAnexo) : null
  const canRemainder = request !== null && request.status === 'approved' && request.rootRequestId === request.requestId && request.remaining.length > 0
  return (
    <Modal open={request !== null} title={request?.recipientName || 'Escuela destinataria'} description="Detalle del pedido" onClose={onClose}>
      {request ? (
        <ModalBody>
          <p style={{ margin: 0, color: 'var(--ink-soft)', display: 'flex', flexWrap: 'wrap', gap: '.5rem', alignItems: 'center' }}>
            <Chip tone={statusTone(request)}>{requestLabel(request)}</Chip>
            <span>CUE {dashedCue(request.recipientCueAnexo)}</span>
            {ficha ? <a className="k-link" href={ficha} target="_blank" rel="noopener noreferrer">Ver ficha</a> : null}
          </p>
          <ul className="k-qty-list" aria-label="Cuadernillos pedidos">
            {request.requested.map((line) => {
              const approved = request.approved.find((row) => row.productId === line.productId)?.quantity
              return (
                <li key={line.productId} className="k-qty-row">
                  <span className="k-row-title">{line.productLabel}</span>
                  <span className="k-row-num">
                    {request.status === 'approved' ? `${approved ?? 0} de ${line.quantity}` : line.quantity}
                  </span>
                </li>
              )
            })}
          </ul>
          <div className="k-total">
            <span>{request.status === 'approved' ? 'Aprobado' : 'Solicitado'}</span>
            <strong>{request.status === 'approved' ? total(request.approved) : total(request.requested)}</strong>
          </div>
          {request.status === 'approved' && request.remaining.length ? (
            <Note>Quedaron {total(request.remaining)} cuadernillos sin aprobar.</Note>
          ) : null}
          {canRemainder ? <RemainderAction request={request} onRequested={onRequested} /> : null}
        </ModalBody>
      ) : null}
    </Modal>
  )
}

export function MyRequests({ refreshKey, onRequested }: {
  refreshKey: number
  onRequested: (message: string) => void
}) {
  const [page, setPage] = useState<BookletRequestsPage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

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

  const openRequest = page?.requests.find((request) => request.requestId === openId) ?? null

  return (
    <Panel title="Mis pedidos" aside={page ? `${page.requests.length}${page.hasMore ? '+' : ''}` : undefined}>
      {error ? <Note tone="danger">{error}</Note> : null}
      {!page && !error ? (
        <div aria-hidden style={{ display: 'grid', gap: '.5rem' }}>
          <div style={{ height: '3.5rem', borderRadius: 'var(--r-lg)', background: 'var(--line)', opacity: 0.5 }} />
          <div style={{ height: '3.5rem', borderRadius: 'var(--r-lg)', background: 'var(--line)', opacity: 0.5 }} />
        </div>
      ) : null}
      {page && page.requests.length === 0 ? (
        <EmptyState title="Todavía no hay pedidos" description="Cuando envíes un pedido, aparece acá con su estado." />
      ) : null}
      {page?.requests.length ? (
        <div className="k-list">
          {page.requests.map((request) => {
            const submittedAt = request.submittedAt ? new Date(request.submittedAt).toLocaleDateString('es-AR') : null
            return (
              <button key={request.requestId} type="button" className="k-row" onClick={() => setOpenId(request.requestId)}>
                <span className="k-row-main">
                  <span className="k-row-title">{request.recipientName || 'Escuela destinataria'}</span>
                  <span className="k-row-meta">
                    CUE {dashedCue(request.recipientCueAnexo)} · {total(request.requested)} solicitados{submittedAt ? ` · ${submittedAt}` : ''}
                  </span>
                </span>
                <span className="k-row-side"><Chip tone={statusTone(request)}>{requestLabel(request)}</Chip><ChevronRight aria-hidden size={20} /></span>
              </button>
            )
          })}
        </div>
      ) : null}
      {page?.hasMore ? (
        <Button type="button" variant="secondary" disabled={loadingMore} onClick={() => void loadMore()} style={{ justifySelf: 'start' }}>
          {loadingMore ? 'Cargando…' : 'Ver más pedidos'}
        </Button>
      ) : null}
      <RequestModal request={openRequest} onClose={() => setOpenId(null)} onRequested={(message) => { setOpenId(null); onRequested(message) }} />
    </Panel>
  )
}
