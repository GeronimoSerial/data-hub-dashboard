'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { dashedCue } from '../cabecera/cabecera-api'
import { Chip, EmptyState, formatCount } from '../kit'
import type { RemitoItemRow, RemitoLineRow, RemitoSummary } from './remito-api'

const dateFormat = new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' })

function lineDone(line: RemitoLineRow) {
  return line.status === 'received' || line.status === 'closed_empty'
}

function Shortfall({ from, to, label }: { from: number; to: number | null; label: string }) {
  if (to === null || to >= from) return null
  return <Chip tone="danger">{label}: faltan {formatCount(from - to)}</Chip>
}

function ItemRow({ item, label }: { item: RemitoItemRow; label: string }) {
  return (
    <li className="k-qty-row">
      <span className="k-row-main">
        <span className="k-row-title">{label}</span>
        <span className="k-row-meta">
          Despachado {formatCount(item.dispatchedQuantity)}
          {' · '}Cabecera {item.cabeceraReceivedQuantity === null ? 'pendiente' : formatCount(item.cabeceraReceivedQuantity)}
          {' · '}Escuela {item.schoolReceivedQuantity === null ? 'pendiente' : formatCount(item.schoolReceivedQuantity)}
        </span>
      </span>
      <span style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
        <Shortfall from={item.dispatchedQuantity} to={item.cabeceraReceivedQuantity} label="Planeamiento → Cabecera" />
        <Shortfall from={item.cabeceraReceivedQuantity ?? 0} to={item.cabeceraReceivedQuantity === null ? null : item.schoolReceivedQuantity} label="Cabecera → Escuela" />
      </span>
    </li>
  )
}

export function RemitosList({ remitos, cabeceraNames, productLabels, hasMore, loadingMore, onLoadMore }: {
  remitos: RemitoSummary[]
  cabeceraNames: Map<string, string>
  productLabels: Map<string, string>
  hasMore: boolean
  loadingMore: boolean
  onLoadMore: () => void
}) {
  const [openId, setOpenId] = useState<string | null>(null)
  if (remitos.length === 0) {
    return <EmptyState title="Todavía no despachaste remitos" description="Armá un remito para enviar cuadernillos a las escuelas." />
  }
  return (
    <>
      <ul className="k-list">
        {remitos.map((remito) => {
          const open = openId === remito.remitoId
          const done = remito.lines.filter(lineDone).length
          const name = cabeceraNames.get(remito.cabeceraCueAnexo) ?? `CUE ${dashedCue(remito.cabeceraCueAnexo)}`
          return (
            <li key={remito.remitoId} style={{ display: 'grid', gap: '.5rem' }}>
              <button type="button" className="k-row" aria-expanded={open} aria-label={`Remito a ${name}, ${dateFormat.format(new Date(remito.dispatchedAt))}`}
                onClick={() => setOpenId(open ? null : remito.remitoId)}>
                <span className="k-row-main">
                  <span className="k-row-title">{name}</span>
                  <span className="k-row-meta">{dateFormat.format(new Date(remito.dispatchedAt))} · {remito.lines.length} escuela{remito.lines.length === 1 ? '' : 's'}</span>
                  <span style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
                    <Chip tone="info">Despachado</Chip>
                    {remito.cabeceraReceivedAt ? <Chip tone="ok">Recibido por cabecera</Chip> : <Chip tone="warn">Pendiente en cabecera</Chip>}
                    <Chip tone={done === remito.lines.length ? 'ok' : undefined}>Recibido por escuela {done}/{remito.lines.length}</Chip>
                  </span>
                </span>
                <span className="k-row-side">{open ? <ChevronDown aria-hidden size={20} /> : <ChevronRight aria-hidden size={20} />}</span>
              </button>
              {open ? (
                <div style={{ display: 'grid', gap: '.75rem', paddingLeft: '.5rem' }}>
                  {remito.lines.map((line) => (
                    <section key={line.recipientCueAnexo} aria-label={line.recipientName ?? line.recipientCueAnexo} style={{ display: 'grid', gap: '.4rem' }}>
                      <span className="k-row-title">{line.recipientName ?? 'Escuela'} <span className="k-row-meta">CUE {dashedCue(line.recipientCueAnexo)}</span></span>
                      <ul className="k-qty-list">
                        {line.items.map((item) => <ItemRow key={item.productId} item={item} label={productLabels.get(item.productId) ?? item.productId} />)}
                      </ul>
                    </section>
                  ))}
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
      {hasMore ? (
        <button type="button" className="ui-button ui-button--secondary" disabled={loadingMore} onClick={onLoadMore}>
          {loadingMore ? 'Cargando…' : 'Ver más remitos'}
        </button>
      ) : null}
    </>
  )
}
