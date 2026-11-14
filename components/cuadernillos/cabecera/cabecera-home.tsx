'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Chip, EmptyState, Note, PageHeader, Panel, formatCount, shortProduct } from '../kit'
import { LineQuestions } from '../receipts/line-questions'
import {
  EMPTY_ANSWERS, errorMessage, evaluateLine, formatWhen, postReceipt, reasonFor, useIdempotencyKey,
  type LineAnswers, type ReceiptItem,
} from '../receipts/receipt-model'
import { SignPanel, SignedNote } from '../receipts/sign-panel'
import { useReceiptListing, type CabeceraRemitoView } from '../receipts/use-receipt-listing'

type RemitoLine = CabeceraRemitoView['lines'][number]

const lineItems = (line: RemitoLine): ReceiptItem[] =>
  line.items.map((item) => ({ productId: item.productId, productName: item.productName, expected: item.dispatchedQuantity }))

const lineName = (line: RemitoLine) => line.recipientName ?? `CUE ${line.recipientCueAnexo}`

function PendingRemito({ remito, onSigned }: { remito: CabeceraRemitoView; onSigned: () => void }) {
  const [states, setStates] = useState<Record<string, LineAnswers>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const keyFor = useIdempotencyKey()

  const evaluated = remito.lines.map((line) => {
    const state = states[line.lineId] ?? EMPTY_ANSWERS
    return { line, state, evaluation: evaluateLine(lineItems(line), state) }
  })
  const complete = evaluated.every(({ evaluation }) => evaluation.complete)
  const reasonMissing = evaluated.some(({ evaluation }) => evaluation.reasonMissing)
  const receivedTotal = evaluated.reduce((sum, { evaluation }) => sum + evaluation.receivedTotal, 0)
  const expectedTotal = evaluated.reduce((sum, { evaluation }) => sum + evaluation.expectedTotal, 0)

  async function sign() {
    const body = {
      lines: evaluated.map(({ line, state, evaluation }) => {
        const reason = reasonFor(evaluation, state)
        return { lineId: line.lineId, items: evaluation.items, ...(reason !== undefined ? { shortfallReason: reason } : {}) }
      }),
    }
    setBusy(true)
    setError(null)
    const result = await postReceipt(`/api/cuadernillos/remitos/${encodeURIComponent(remito.remitoId)}/recibir`, { idempotencyKey: keyFor(JSON.stringify(body)), ...body })
    setBusy(false)
    if (result.ok) onSigned()
    else setError(errorMessage(result.code))
  }

  return (
    <Panel title={`Remito del ${formatWhen(remito.dispatchedAt)}`} aside={<Chip tone="warn">Pendiente de firma</Chip>}>
      <div className="k-stack" style={{ gap: '1.1rem' }}>
        {evaluated.map(({ line, state }) => {
          const own = line.recipientCueAnexo === remito.cabeceraCueAnexo
          return (
            <div key={line.lineId} className="k-stack" style={{ gap: '.6rem' }}>
              <h4 style={{ margin: 0 }}>{lineName(line)}</h4>
              {own ? <Note>Un solo recibido: este recibido también cuenta como el recibido de tu escuela.</Note> : null}
              <LineQuestions scope={line.lineId} items={lineItems(line)} state={state} disabled={busy}
                onChange={(next) => setStates((current) => ({ ...current, [line.lineId]: next }))} />
            </div>
          )
        })}
        <SignPanel receivedTotal={receivedTotal} expectedTotal={expectedTotal} canSign={complete && !reasonMissing} busy={busy} error={error}
          hint={reasonMissing ? 'Completá el motivo de cada línea con faltante para poder firmar.' : undefined}
          onSign={() => { void sign() }} />
      </div>
    </Panel>
  )
}

function HistoryRemito({ remito }: { remito: CabeceraRemitoView }) {
  return (
    <Panel title={`Remito del ${formatWhen(remito.dispatchedAt)}`} aside={<Chip tone="ok">Recibido</Chip>}>
      <div className="k-stack" style={{ gap: '.9rem' }}>
        <SignedNote signer={remito.cabeceraReceivedBy} at={remito.cabeceraReceivedAt} />
        {remito.lines.map((line) => (
          <div key={line.lineId} className="k-stack" style={{ gap: '.4rem' }}>
            <h4 style={{ margin: 0 }}>{lineName(line)}</h4>
            <ul className="k-qty-list">
              {line.items.map((item) => (
                <li key={item.productId} className="k-qty-row">
                  <span>{shortProduct(item.productName)}</span>
                  <span>{`${formatCount(item.cabeceraReceivedQuantity ?? 0)} de ${formatCount(item.dispatchedQuantity)}`}</span>
                </li>
              ))}
            </ul>
            {line.cabeceraShortfallReason ? <p className="k-hint" style={{ margin: 0 }}>{`Motivo: ${line.cabeceraShortfallReason}`}</p> : null}
          </div>
        ))}
      </div>
    </Panel>
  )
}

export function CabeceraHome() {
  const { listing, error, reload, retry } = useReceiptListing()
  const remitos = listing?.kind === 'cabecera' ? listing.remitos : null
  const pending = remitos?.filter((remito) => remito.status === 'dispatched') ?? []
  const history = remitos?.filter((remito) => remito.status !== 'dispatched') ?? []

  return (
    <section aria-labelledby="cabecera-home-title" className="k-stack">
      <PageHeader id="cabecera-home-title" title="Recepción de remitos" description="Confirmá los cuadernillos que llegaron a tu cabecera para cada escuela y firmá el recibido." />
      {error ? (
        <div className="k-stack" style={{ gap: '.5rem', justifyItems: 'start' }}>
          <Note tone="danger">{error}</Note>
          <Button type="button" variant="secondary" onClick={retry}>Reintentar</Button>
        </div>
      ) : null}
      {!remitos && !error ? <p role="status" style={{ margin: 0, color: 'var(--ink-soft)' }}>Cargando remitos…</p> : null}
      {remitos && remitos.length === 0 ? <EmptyState title="Sin remitos" description="Cuando Planeamiento despache cuadernillos a tu cabecera, los firmás acá." /> : null}
      {pending.length > 0 ? (
        <div className="k-stack" role="region" aria-label="Pendientes">
          <h3 style={{ margin: 0, fontSize: '1.05rem' }}>Pendientes</h3>
          {pending.map((remito) => <PendingRemito key={remito.remitoId} remito={remito} onSigned={reload} />)}
        </div>
      ) : null}
      {history.length > 0 ? (
        <div className="k-stack" role="region" aria-label="Historial">
          <h3 style={{ margin: 0, fontSize: '1.05rem' }}>Historial</h3>
          {history.map((remito) => <HistoryRemito key={remito.remitoId} remito={remito} />)}
        </div>
      ) : null}
    </section>
  )
}
