'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { CircuitGuide, EmptyState, Note, PageHeader, Panel, ShipmentJourney, TaskCard, formatCount, shortProduct } from '../kit'
import { LineQuestions } from '../receipts/line-questions'
import {
  EMPTY_ANSWERS, allArrived, arrivalMode, buildJourney, errorMessage, evaluateLine, formatWhen, pluralize, postReceipt, reasonFor, useIdempotencyKey,
  type LineAnswers, type ReceiptItem,
} from '../receipts/receipt-model'
import { SignPanel, SignedNote } from '../receipts/sign-panel'
import { useReceiptListing, type CabeceraRemitoView } from '../receipts/use-receipt-listing'

type RemitoLine = CabeceraRemitoView['lines'][number]

const lineItems = (line: RemitoLine): ReceiptItem[] =>
  line.items.map((item) => ({ productId: item.productId, productName: item.productName, expected: item.dispatchedQuantity }))

const lineName = (line: RemitoLine) => line.recipientName ?? `CUE ${line.recipientCueAnexo}`

function remitoJourney(remito: CabeceraRemitoView) {
  const confirmed = remito.lines.filter((line) => line.status === 'received' || line.status === 'closed_empty')
  return buildJourney({
    dispatchedAt: remito.dispatchedAt,
    cabeceraBy: remito.cabeceraReceivedBy,
    cabeceraAt: remito.cabeceraReceivedAt,
    cabeceraShort: remito.lines.some((line) => Boolean(line.cabeceraShortfallReason)),
    schools: {
      confirmed: confirmed.length,
      total: remito.lines.length,
      short: remito.lines.some((line) => Boolean(line.schoolShortfallReason)),
      by: confirmed[0]?.schoolReceivedBy,
      at: confirmed[0]?.schoolReceivedAt,
    },
  })
}

function PendingRemito({ remito, onSigned }: { remito: CabeceraRemitoView; onSigned: () => void }) {
  const [states, setStates] = useState<Record<string, LineAnswers>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const keyFor = useIdempotencyKey()

  const evaluated = remito.lines.map((line) => {
    const items = lineItems(line)
    const state = states[line.lineId] ?? EMPTY_ANSWERS
    return { line, items, state, evaluation: evaluateLine(items, state) }
  })
  const complete = evaluated.every(({ evaluation }) => evaluation.complete)
  const reasonMissing = evaluated.some(({ evaluation }) => evaluation.reasonMissing)
  const receivedTotal = evaluated.reduce((sum, { evaluation }) => sum + evaluation.receivedTotal, 0)
  const expectedTotal = evaluated.reduce((sum, { evaluation }) => sum + evaluation.expectedTotal, 0)
  const everythingArrived = evaluated.every(({ items, state }) => arrivalMode(items, state) === 'all' || items.every((item) => item.expected === 0))

  function confirmEverything() {
    setStates(Object.fromEntries(evaluated.map(({ line, items }) => [line.lineId, allArrived(items)])))
  }

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
    <Panel title={`Envío del ${formatWhen(remito.dispatchedAt)}`}>
      <div className="k-stack" style={{ gap: '.8rem' }}>
        <ShipmentJourney steps={remitoJourney(remito)} />
        <div className="k-stack" style={{ gap: '.3rem' }}>
          {evaluated.map(({ line, state }) => (
            <div key={line.lineId}>
              <LineQuestions scope={line.lineId} label={lineName(line)} variant="less-only" items={lineItems(line)} state={state} disabled={busy}
                onChange={(next) => setStates((current) => ({ ...current, [line.lineId]: next }))} />
            </div>
          ))}
        </div>
        <SignPanel receivedTotal={receivedTotal} expectedTotal={expectedTotal} answered={complete} canSign={complete && !reasonMissing} busy={busy} error={error}
          hint={reasonMissing ? 'Contanos qué pasó en cada escuela a la que llegó menos para poder confirmar.' : undefined}
          before={(
            <Button type="button" style={{ minHeight: '2.5rem' }} variant={everythingArrived ? 'default' : 'secondary'} disabled={busy}
              aria-pressed={everythingArrived} onClick={confirmEverything}>
              Sí, llegó todo
            </Button>
          )}
          onSign={() => { void sign() }} />
      </div>
    </Panel>
  )
}

function HistoryRemito({ remito }: { remito: CabeceraRemitoView }) {
  return (
    <Panel title={`Envío del ${formatWhen(remito.dispatchedAt)}`}>
      <div className="k-stack" style={{ gap: '.7rem' }}>
        <ShipmentJourney steps={remitoJourney(remito)} />
        <SignedNote signer={remito.cabeceraReceivedBy} at={remito.cabeceraReceivedAt} />
        {remito.lines.map((line) => (
          <div key={line.lineId} className="k-stack" style={{ gap: '.3rem' }}>
            <h4 style={{ margin: 0 }}>{lineName(line)}</h4>
            <ul className="k-qty-list">
              {line.items.map((item) => (
                <li key={item.productId} className="k-qty-row">
                  <span>{shortProduct(item.productName)}</span>
                  <span>{`${formatCount(item.cabeceraReceivedQuantity ?? 0)} de ${formatCount(item.dispatchedQuantity)}`}</span>
                </li>
              ))}
            </ul>
            {line.cabeceraShortfallReason ? <p className="k-hint" style={{ margin: 0 }}>{`Qué pasó: ${line.cabeceraShortfallReason}`}</p> : null}
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
  const title = pending.length === 0 ? 'No tenés nada pendiente.' : `Tenés ${pending.length} ${pluralize(pending.length, 'envío', 'envíos')} para recibir.`

  return (
    <section aria-labelledby="cabecera-home-title" className="k-stack">
      <PageHeader id="cabecera-home-title" title="Recepción de envíos" description="Confirmá qué cuadernillos llegaron a tu cabecera para cada escuela." />
      {error ? (
        <div className="k-stack" style={{ gap: '.5rem', justifyItems: 'start' }}>
          <Note tone="danger">{error}</Note>
          <Button type="button" variant="secondary" onClick={retry}>Reintentar</Button>
        </div>
      ) : null}
      {!remitos && !error ? <p role="status" style={{ margin: 0, color: 'var(--ink-soft)' }}>Cargando envíos…</p> : null}
      {remitos ? <TaskCard tone={pending.length > 0 ? 'warn' : 'ok'} title={title} /> : null}
      {remitos && remitos.length === 0 ? (
        <>
          <EmptyState title="Todavía no hay envíos" description="Cuando Planeamiento envíe cuadernillos a tu cabecera, los confirmás acá." />
          <CircuitGuide />
        </>
      ) : null}
      {pending.length > 0 ? (
        <div className="k-stack" role="region" aria-label="Pendientes">
          {pending.map((remito) => <PendingRemito key={remito.remitoId} remito={remito} onSigned={reload} />)}
        </div>
      ) : null}
      {history.length > 0 ? (
        <details>
          <summary style={{ cursor: 'pointer', fontWeight: 600, minHeight: '2.25rem' }}>{`Envíos anteriores (${history.length})`}</summary>
          <div className="k-stack" role="region" aria-label="Historial" style={{ marginTop: '.5rem' }}>
            {history.map((remito) => <HistoryRemito key={remito.remitoId} remito={remito} />)}
          </div>
        </details>
      ) : null}
    </section>
  )
}
