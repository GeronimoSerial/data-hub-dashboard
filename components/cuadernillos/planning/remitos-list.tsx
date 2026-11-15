'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { dashedCue } from '../cabecera/cabecera-api'
import { Chip, CircuitGuide, EmptyState, ShipmentJourney, formatCount, shortProduct, type JourneyStep } from '../kit'
import type { RemitoItemRow, RemitoLineRow, RemitoSigner, RemitoSummary } from './remito-api'

const dateFormat = new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' })
const dateTimeFormat = new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' })

function signature(signer: RemitoSigner | null | undefined, at: string | null | undefined) {
  if (!signer) return null
  const name = signer.name || 'cuenta sin nombre'
  return at ? `${name}, ${dateTimeFormat.format(new Date(at))}` : name
}

function lineDone(line: RemitoLineRow) {
  return line.status === 'received' || line.status === 'closed_empty'
}

function Shortfall({ from, to, label }: { from: number; to: number | null; label: string }) {
  if (to === null || to >= from) return null
  return <Chip tone="danger">Llegaron {formatCount(from - to)} de menos {label}</Chip>
}

/** "Enviado → Llegó a la cabecera → Llegó a la escuela"; the school step aggregates every school of the envío. */
function journeySteps(remito: RemitoSummary): JourneyStep[] {
  const items = remito.lines.flatMap((line) => line.items)
  const cabeceraShort = items.some((item) => item.cabeceraReceivedQuantity !== null && item.cabeceraReceivedQuantity < item.dispatchedQuantity)
  const schoolShort = items.some((item) => item.schoolReceivedQuantity !== null
    && item.schoolReceivedQuantity < (item.cabeceraReceivedQuantity ?? item.dispatchedQuantity))
  const total = remito.lines.length
  const done = remito.lines.filter(lineDone).length
  const atCabecera = Boolean(remito.cabeceraReceivedAt)
  const cabeceraWho = signature(remito.cabeceraReceivedBy, remito.cabeceraReceivedAt)
    ?? (remito.cabeceraReceivedAt ? dateTimeFormat.format(new Date(remito.cabeceraReceivedAt)) : null)
  const lastSchoolAt = remito.lines.map((line) => line.schoolReceivedAt).filter((at): at is string => Boolean(at)).sort().at(-1)

  const schoolState: JourneyStep['state'] = total > 0 && done === total ? (schoolShort ? 'short' : 'done')
    : atCabecera ? 'current' : 'pending'
  let schoolDetail: string | null = null
  if (total > 0 && done === total) schoolDetail = `${done} de ${total} escuela${total === 1 ? '' : 's'}${lastSchoolAt ? ` · ${dateTimeFormat.format(new Date(lastSchoolAt))}` : ''}${schoolShort ? ' · llegó de menos' : ''}`
  else if (total > 0 && done > 0) schoolDetail = `${done} de ${total} escuelas`

  return [
    { label: 'Enviado', state: 'done', detail: `Planeamiento · ${dateTimeFormat.format(new Date(remito.dispatchedAt))}` },
    {
      label: 'Llegó a la cabecera',
      state: atCabecera ? (cabeceraShort ? 'short' : 'done') : 'current',
      detail: atCabecera ? `${cabeceraWho}${cabeceraShort ? ' · llegó de menos' : ''}` : null,
    },
    { label: 'Llegó a la escuela', state: schoolState, detail: schoolDetail },
  ]
}

function ItemRow({ item, label }: { item: RemitoItemRow; label: string }) {
  return (
    <li className="k-qty-row">
      <span className="k-row-main">
        <span className="k-row-title">{label}</span>
        <span className="k-row-meta">
          Enviado {formatCount(item.dispatchedQuantity)}
          {' · '}Cabecera {item.cabeceraReceivedQuantity === null ? 'pendiente' : formatCount(item.cabeceraReceivedQuantity)}
          {' · '}Escuela {item.schoolReceivedQuantity === null ? 'pendiente' : formatCount(item.schoolReceivedQuantity)}
        </span>
      </span>
      <span style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
        <Shortfall from={item.dispatchedQuantity} to={item.cabeceraReceivedQuantity} label="a la cabecera" />
        <Shortfall from={item.cabeceraReceivedQuantity ?? 0} to={item.cabeceraReceivedQuantity === null ? null : item.schoolReceivedQuantity} label="a la escuela" />
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
    return (
      <>
        <CircuitGuide />
        <EmptyState title="Todavía no enviaste cuadernillos" description="Cuando hagas el primer envío, acá vas a ver por dónde va." />
      </>
    )
  }
  return (
    <>
      <ul className="k-list">
        {remitos.map((remito) => {
          const open = openId === remito.remitoId
          const name = cabeceraNames.get(remito.cabeceraCueAnexo) ?? `CUE ${dashedCue(remito.cabeceraCueAnexo)}`
          return (
            <li key={remito.remitoId} style={{ display: 'grid', gap: '.5rem' }}>
              <button type="button" className="k-row" aria-expanded={open} aria-label={`Envío a ${name}, ${dateFormat.format(new Date(remito.dispatchedAt))}`}
                onClick={() => setOpenId(open ? null : remito.remitoId)}>
                <span className="k-row-main">
                  <span className="k-row-title">{name}</span>
                  <span className="k-row-meta">{dateFormat.format(new Date(remito.dispatchedAt))} · {remito.lines.length} escuela{remito.lines.length === 1 ? '' : 's'}</span>
                </span>
                <span className="k-row-side">{open ? <ChevronDown aria-hidden size={18} /> : <ChevronRight aria-hidden size={18} />}</span>
              </button>
              <ShipmentJourney steps={journeySteps(remito)} label={`Recorrido del envío a ${name}`} />
              {open ? (
                <div style={{ display: 'grid', gap: '.75rem', paddingLeft: '.5rem' }}>
                  {signature(remito.cabeceraReceivedBy, remito.cabeceraReceivedAt) ? (
                    <span className="k-row-meta">Confirmó la cabecera: {signature(remito.cabeceraReceivedBy, remito.cabeceraReceivedAt)}</span>
                  ) : null}
                  {remito.lines.map((line) => (
                    <section key={line.recipientCueAnexo} aria-label={line.recipientName ?? line.recipientCueAnexo} style={{ display: 'grid', gap: '.4rem' }}>
                      <span className="k-row-title">{line.recipientName ?? 'Escuela'} <span className="k-row-meta">CUE {dashedCue(line.recipientCueAnexo)}</span></span>
                      <ul className="k-qty-list">
                        {line.items.map((item) => <ItemRow key={item.productId} item={item} label={shortProduct(productLabels.get(item.productId) ?? item.productName ?? item.productId)} />)}
                      </ul>
                      {line.cabeceraShortfallReason ? <span className="k-row-meta">Por qué llegó de menos a la cabecera: {line.cabeceraShortfallReason}</span> : null}
                      {line.schoolShortfallReason ? <span className="k-row-meta">Por qué llegó de menos a la escuela: {line.schoolShortfallReason}</span> : null}
                      {signature(line.schoolReceivedBy, line.schoolReceivedAt) ? (
                        <span className="k-row-meta">Confirmó la escuela: {signature(line.schoolReceivedBy, line.schoolReceivedAt)}</span>
                      ) : null}
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
          {loadingMore ? 'Cargando…' : 'Ver más envíos'}
        </button>
      ) : null}
    </>
  )
}
