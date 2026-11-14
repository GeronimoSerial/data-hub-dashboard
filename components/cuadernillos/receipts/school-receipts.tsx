'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Chip, EmptyState, KitStyles, Note, PageHeader, Panel, formatCount, shortProduct } from '../kit'
import { LineQuestions } from './line-questions'
import {
  EMPTY_ANSWERS, errorMessage, evaluateLine, formatWhen, postReceipt, reasonFor, useIdempotencyKey,
  type LineAnswers, type ReceiptItem,
} from './receipt-model'
import { SignPanel, SignedNote } from './sign-panel'
import { useReceiptListing, type SchoolLineView } from './use-receipt-listing'

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
    <Panel title={`Envío del ${formatWhen(line.dispatchedAt)}`} aside={<Chip tone="warn">Pendiente de firma</Chip>}>
      <div className="k-stack" style={{ gap: '.9rem' }}>
        {line.cabeceraReceivedBy ? <Note>{`La cabecera confirmó la cantidad que te corresponde (${line.cabeceraReceivedBy.name} · ${formatWhen(line.cabeceraReceivedAt)}).`}</Note> : null}
        {line.cabeceraShortfallReason ? <p className="k-hint" style={{ margin: 0 }}>{`Motivo de la cabecera: ${line.cabeceraShortfallReason}`}</p> : null}
        <LineQuestions scope={line.lineId} items={items} state={state} disabled={busy} onChange={setState} />
        <SignPanel receivedTotal={evaluation.receivedTotal} expectedTotal={evaluation.expectedTotal}
          canSign={evaluation.complete && !evaluation.reasonMissing} busy={busy} error={error}
          hint={evaluation.reasonMissing ? 'Completá el motivo para poder firmar.' : undefined} onSign={() => { void sign() }} />
      </div>
    </Panel>
  )
}

function TransitLine({ line }: { line: SchoolLineView }) {
  return (
    <Panel title={`Envío del ${formatWhen(line.dispatchedAt)}`} aside={<Chip tone="info">En camino</Chip>}>
      <Note>Todavía no podés firmar: la cabecera tiene que recibir el envío primero. Cuando lo firme, te vamos a pedir confirmar tus cuadernillos acá.</Note>
    </Panel>
  )
}

function HistoryLine({ line }: { line: SchoolLineView }) {
  const closed = line.status === 'closed_empty'
  return (
    <Panel title={`Envío del ${formatWhen(line.dispatchedAt)}`} aside={<Chip tone={closed ? 'neutral' : 'ok'}>{closed ? 'Cerrado sin cuadernillos' : 'Recibido'}</Chip>}>
      <div className="k-stack" style={{ gap: '.5rem' }}>
        {line.items.length > 0 ? (
          <ul className="k-qty-list">
            {line.items.map((item) => (
              <li key={item.productId} className="k-qty-row">
                <span>{shortProduct(item.productName)}</span>
                <span>{`${formatCount(item.schoolReceivedQuantity ?? 0)} de ${formatCount(item.expectedQuantity ?? 0)}`}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {line.schoolShortfallReason ? <p className="k-hint" style={{ margin: 0 }}>{`Motivo: ${line.schoolShortfallReason}`}</p> : null}
        {!closed ? <SignedNote signer={line.schoolReceivedBy} at={line.schoolReceivedAt} /> : null}
      </div>
    </Panel>
  )
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
      <PageHeader id="school-receipts-title" title="Recepción de cuadernillos" description="Confirmá los cuadernillos que llegaron a tu escuela y firmá el recibido." />
      {error ? (
        <div className="k-stack" style={{ gap: '.5rem', justifyItems: 'start' }}>
          <Note tone="danger">{error}</Note>
          <Button type="button" variant="secondary" onClick={retry}>Reintentar</Button>
        </div>
      ) : null}
      {!lines && !error ? <p role="status" style={{ margin: 0, color: 'var(--ink-soft)' }}>Cargando recibidos…</p> : null}
      {lines && lines.length === 0 ? <EmptyState title="Sin envíos" description="Todavía no hay envíos de cuadernillos para tu escuela." /> : null}
      {pending.length > 0 ? (
        <div className="k-stack" role="region" aria-label="Pendientes">
          <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Pendientes</h2>
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
        <div className="k-stack" role="region" aria-label="Historial">
          <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Historial</h2>
          {history.map((line) => <HistoryLine key={line.lineId} line={line} />)}
        </div>
      ) : null}
    </section>
  )
}
