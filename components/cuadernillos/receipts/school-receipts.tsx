'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { CircuitGuide, EmptyState, KitStyles, Note, PageHeader, Panel, ShipmentJourney, TaskCard, formatCount, shortProduct } from '../kit'
import { LineQuestions } from './line-questions'
import {
  EMPTY_ANSWERS, buildJourney, errorMessage, evaluateLine, formatWhen, postReceipt, reasonFor, useIdempotencyKey,
  type LineAnswers, type ReceiptItem,
} from './receipt-model'
import { SignPanel, SignedNote } from './sign-panel'
import { useReceiptListing, type SchoolLineView } from './use-receipt-listing'

function lineJourney(line: SchoolLineView) {
  const confirmed = line.status === 'received' || line.status === 'closed_empty'
  return buildJourney({
    dispatchedAt: line.dispatchedAt,
    cabeceraBy: line.cabeceraReceivedBy,
    cabeceraAt: line.cabeceraReceivedAt,
    cabeceraShort: Boolean(line.cabeceraShortfallReason),
    schools: { confirmed: confirmed ? 1 : 0, total: 1, short: Boolean(line.schoolShortfallReason), by: line.schoolReceivedBy, at: line.schoolReceivedAt },
  })
}

function PendingLine({ line, onSigned }: { line: SchoolLineView; onSigned: () => void }) {
  const [state, setState] = useState<LineAnswers>(EMPTY_ANSWERS)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const keyFor = useIdempotencyKey()
  const items: ReceiptItem[] = line.items.map((item) => ({ productId: item.productId, productName: item.productName, expected: item.expectedQuantity ?? 0 }))
  const evaluation = evaluateLine(items, state)

  async function sign() {
    const body = { items: evaluation.items, ...(reasonFor(evaluation, state) !== undefined ? { shortfallReason: reasonFor(evaluation, state) } : {}) }
    setBusy(true)
    setError(null)
    const result = await postReceipt(`/api/cuadernillos/remito-lineas/${encodeURIComponent(line.lineId)}/recibir`, { idempotencyKey: keyFor(JSON.stringify(body)), ...body })
    setBusy(false)
    if (result.ok) onSigned()
    else setError(errorMessage(result.code))
  }

  return (
    <Panel title={`Envío del ${formatWhen(line.dispatchedAt)}`}>
      <div className="k-stack" style={{ gap: '.7rem' }}>
        <ShipmentJourney steps={lineJourney(line)} />
        {line.cabeceraShortfallReason ? <p className="k-hint" style={{ margin: 0 }}>{`Lo que pasó en la cabecera: ${line.cabeceraShortfallReason}`}</p> : null}
        <LineQuestions scope={line.lineId} items={items} state={state} disabled={busy} onChange={setState} />
        <SignPanel receivedTotal={evaluation.receivedTotal} expectedTotal={evaluation.expectedTotal} answered={evaluation.complete}
          canSign={evaluation.complete && !evaluation.reasonMissing} busy={busy} error={error}
          hint={evaluation.reasonMissing ? 'Contanos qué pasó para poder confirmar.' : undefined} onSign={() => { void sign() }} />
      </div>
    </Panel>
  )
}

function TransitLine({ line }: { line: SchoolLineView }) {
  return (
    <Panel title={`Envío del ${formatWhen(line.dispatchedAt)}`}>
      <div className="k-stack" style={{ gap: '.5rem' }}>
        <ShipmentJourney steps={lineJourney(line)} />
        <p className="k-hint" style={{ margin: 0 }}>Todavía no podés confirmar: primero tiene que llegar a la cabecera. Cuando lo confirme, te avisamos acá.</p>
      </div>
    </Panel>
  )
}

function HistoryLine({ line }: { line: SchoolLineView }) {
  const closed = line.status === 'closed_empty'
  return (
    <Panel title={`Envío del ${formatWhen(line.dispatchedAt)}`}>
      <div className="k-stack" style={{ gap: '.5rem' }}>
        <ShipmentJourney steps={lineJourney(line)} />
        {closed ? <p className="k-hint" style={{ margin: 0 }}>A tu escuela no le correspondían cuadernillos en este envío.</p> : null}
        {line.items.length > 0 && !closed ? (
          <ul className="k-qty-list">
            {line.items.map((item) => (
              <li key={item.productId} className="k-qty-row">
                <span>{shortProduct(item.productName)}</span>
                <span>{`${formatCount(item.schoolReceivedQuantity ?? 0)} de ${formatCount(item.expectedQuantity ?? 0)}`}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {line.schoolShortfallReason ? <p className="k-hint" style={{ margin: 0 }}>{`Qué pasó: ${line.schoolShortfallReason}`}</p> : null}
        {!closed ? <SignedNote signer={line.schoolReceivedBy} at={line.schoolReceivedAt} /> : null}
      </div>
    </Panel>
  )
}

function taskTitle(pending: number) {
  if (pending === 0) return 'No tenés nada pendiente.'
  return pending === 1 ? 'Te llegó un envío de cuadernillos. Confirmá qué recibiste.' : `Te llegaron ${pending} envíos de cuadernillos. Confirmá qué recibiste.`
}

export function SchoolReceipts() {
  const { listing, error, reload, retry } = useReceiptListing()
  const lines = listing?.kind === 'school' ? listing.lines : null
  const pending = lines?.filter((line) => line.status === 'at_cabecera') ?? []
  const transit = lines?.filter((line) => line.status === 'in_transit') ?? []
  const history = lines?.filter((line) => line.status !== 'at_cabecera' && line.status !== 'in_transit') ?? []

  return (
    <section aria-labelledby="school-receipts-title" className="k-stack">
      <KitStyles />
      <PageHeader id="school-receipts-title" title="Recepción de cuadernillos" description="Confirmá qué cuadernillos llegaron a tu escuela." />
      {error ? (
        <div className="k-stack" style={{ gap: '.5rem', justifyItems: 'start' }}>
          <Note tone="danger">{error}</Note>
          <Button type="button" variant="secondary" onClick={retry}>Reintentar</Button>
        </div>
      ) : null}
      {!lines && !error ? <p role="status" style={{ margin: 0, color: 'var(--ink-soft)' }}>Cargando envíos…</p> : null}
      {lines ? (
        <TaskCard tone={pending.length > 0 ? 'warn' : 'ok'} title={taskTitle(pending.length)}
          description={pending.length === 0 && transit.length > 0 ? 'Hay un envío en camino. Primero tiene que llegar a la cabecera.' : undefined} />
      ) : null}
      {lines && lines.length === 0 ? (
        <>
          <EmptyState title="Todavía no hay envíos" description="Cuando Planeamiento envíe cuadernillos para tu escuela, los vas a ver acá." />
          <CircuitGuide />
        </>
      ) : null}
      {pending.length > 0 ? (
        <div className="k-stack" role="region" aria-label="Pendientes">
          {pending.map((line) => <PendingLine key={line.lineId} line={line} onSigned={reload} />)}
        </div>
      ) : null}
      {transit.length > 0 ? (
        <div className="k-stack" role="region" aria-label="En camino">
          <h2 style={{ margin: 0, fontSize: '1.05rem' }}>En camino</h2>
          {transit.map((line) => <TransitLine key={line.lineId} line={line} />)}
        </div>
      ) : null}
      {history.length > 0 ? (
        <details>
          <summary style={{ cursor: 'pointer', fontWeight: 600, minHeight: '2.25rem' }}>{`Envíos anteriores (${history.length})`}</summary>
          <div className="k-stack" role="region" aria-label="Historial" style={{ marginTop: '.5rem' }}>
            {history.map((line) => <HistoryLine key={line.lineId} line={line} />)}
          </div>
        </details>
      ) : null}
    </section>
  )
}
