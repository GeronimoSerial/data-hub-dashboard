'use client'

import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { dashedCue } from '../cabecera/cabecera-api'
import { CircuitGuide, EmptyState, ShipmentJourney, formatCount, shortProduct, type JourneyStep } from '../kit'
import type { RemitoLineRow, RemitoSigner, RemitoSummary } from './remito-api'

// The campaign already fixes the year, so dates stay short: "13 nov" and "13 nov, 11:10".
const dateFormat = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' })
const dateTimeFormat = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })

function signature(signer: RemitoSigner | null | undefined, at: string | null | undefined) {
  if (!signer) return null
  const name = signer.name || 'cuenta sin nombre'
  return at ? `${name} · ${dateTimeFormat.format(new Date(at))}` : name
}

function lineDone(line: RemitoLineRow) {
  return line.status === 'received' || line.status === 'closed_empty'
}

const LINE_STATUS: Record<RemitoLineRow['status'], string> = {
  in_transit: 'En camino a la cabecera',
  at_cabecera: 'En la cabecera, falta repartir',
  received: 'Recibido por la escuela',
  closed_empty: 'Cerrado sin entrega',
}

/** One received quantity; `from` is what the previous leg handed over, so a smaller number is a shortfall. */
function ReceivedCell({ from, to }: { from: number | null; to: number | null }) {
  if (to === null) return <td data-state="pending">Pendiente</td>
  if (from === null || to >= from) return <td>{formatCount(to)}</td>
  return (
    <td data-state="short">
      {formatCount(to)}
      <span className="pl-short">{formatCount(from - to)} de menos</span>
    </td>
  )
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

function LineDetail({ line, productLabels }: { line: RemitoLineRow; productLabels: Map<string, string> }) {
  const name = line.recipientName ?? 'Escuela'
  const schoolSigner = signature(line.schoolReceivedBy, line.schoolReceivedAt)
  return (
    <section aria-label={line.recipientName ?? line.recipientCueAnexo} className="pl-line">
      <header className="pl-line-head">
        <strong>{name}</strong>
        <span>CUE {dashedCue(line.recipientCueAnexo)} · {LINE_STATUS[line.status]}</span>
      </header>
      <table className="pl-table">
        <thead>
          <tr>
            <th scope="col">Grado</th>
            <th scope="col">Enviado</th>
            <th scope="col">Cabecera</th>
            <th scope="col">Escuela</th>
          </tr>
        </thead>
        <tbody>
          {line.items.map((item) => (
            <tr key={item.productId}>
              <th scope="row">{shortProduct(productLabels.get(item.productId) ?? item.productName ?? item.productId)}</th>
              <td>{formatCount(item.dispatchedQuantity)}</td>
              <ReceivedCell from={item.dispatchedQuantity} to={item.cabeceraReceivedQuantity} />
              <ReceivedCell from={item.cabeceraReceivedQuantity} to={item.cabeceraReceivedQuantity === null ? null : item.schoolReceivedQuantity} />
            </tr>
          ))}
        </tbody>
      </table>
      {line.cabeceraShortfallReason ? <p className="pl-line-note">Por qué llegó de menos a la cabecera: {line.cabeceraShortfallReason}</p> : null}
      {line.schoolShortfallReason ? <p className="pl-line-note">Por qué llegó de menos a la escuela: {line.schoolShortfallReason}</p> : null}
      {schoolSigner ? <p className="pl-line-note">Confirmó la escuela: {schoolSigner}</p> : null}
    </section>
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
      <div className="pl-envios-empty">
        <EmptyState title="Todavía no enviaste cuadernillos" description="Cuando hagas el primer envío, acá vas a ver por dónde va." />
        <CircuitGuide />
      </div>
    )
  }
  return (
    <>
      <ul className="pl-envios">
        {remitos.map((remito) => {
          const open = openId === remito.remitoId
          const name = cabeceraNames.get(remito.cabeceraCueAnexo) ?? `CUE ${dashedCue(remito.cabeceraCueAnexo)}`
          const units = remito.lines.reduce((sum, line) => sum + line.items.reduce((acc, item) => acc + item.dispatchedQuantity, 0), 0)
          const cabeceraSigner = signature(remito.cabeceraReceivedBy, remito.cabeceraReceivedAt)
          return (
            <li key={remito.remitoId} className="pl-envio" data-open={open || undefined}>
              {/* The click bubbles from the button, so the whole row toggles while the button stays the keyboard target. */}
              <div className="pl-envio-row" onClick={() => setOpenId(open ? null : remito.remitoId)}>
                <button type="button" className="pl-envio-toggle" aria-expanded={open} aria-label={`Envío a ${name}, ${dateFormat.format(new Date(remito.dispatchedAt))}`}>
                  <ChevronRight aria-hidden size={16} />
                  <span className="pl-envio-name">{name}</span>
                  <span className="pl-envio-meta">
                    {dateFormat.format(new Date(remito.dispatchedAt))} · {remito.lines.length} escuela{remito.lines.length === 1 ? '' : 's'}
                    {units > 0 ? ` · ${formatCount(units)} cuadernillos` : ''}
                  </span>
                </button>
                <ShipmentJourney steps={journeySteps(remito)} label={`Recorrido del envío a ${name}`} />
              </div>
              {open ? (
                <div className="pl-envio-detail">
                  {cabeceraSigner ? <p className="pl-line-note">Confirmó la cabecera: {cabeceraSigner}</p> : null}
                  <div className="pl-lines">
                    {remito.lines.map((line) => <LineDetail key={line.recipientCueAnexo} line={line} productLabels={productLabels} />)}
                  </div>
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
      {hasMore ? (
        <button type="button" className="ui-button ui-button--secondary pl-more" disabled={loadingMore} onClick={onLoadMore}>
          {loadingMore ? 'Cargando…' : 'Ver más envíos'}
        </button>
      ) : null}
    </>
  )
}
