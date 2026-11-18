'use client'

import { Button } from '@/components/ui/button'
import { CircuitGuide, EmptyState, Note, PageHeader, Panel, ShipmentJourney, TaskCard, formatCount, shortProduct } from '../kit'
import { buildJourney, formatWhen, pluralize, type ReceiptItem } from '../receipts/receipt-model'
import { ReceiptWizard } from '../receipts/receipt-wizard'
import { SignedNote } from '../receipts/sign-panel'
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

function PendingRemito({ remito, remaining, onSigned }: { remito: CabeceraRemitoView; remaining: number; onSigned: () => void }) {
  return (
    <ReceiptWizard
      heading={`Envío del ${formatWhen(remito.dispatchedAt)}`}
      place="tu cabecera"
      remaining={remaining}
      lines={remito.lines.map((line) => ({ id: line.lineId, name: lineName(line), items: lineItems(line) }))}
      request={(lines) => ({ url: `/api/cuadernillos/remitos/${encodeURIComponent(remito.remitoId)}/recibir`, body: { lines } })}
      onSigned={onSigned}
    />
  )
}

function HistoryRemito({ remito }: { remito: CabeceraRemitoView }) {
  return (
    <Panel title={`Envío del ${formatWhen(remito.dispatchedAt)}`}>
      <div className="k-stack" style={{ gap: '.7rem' }}>
        <ShipmentJourney steps={remitoJourney(remito)} />
        {remito.cabeceraReceivedBy ? <SignedNote signer={remito.cabeceraReceivedBy} at={remito.cabeceraReceivedAt} /> : null}
        {remito.lines.map((line) => (
          <div key={line.lineId} className="k-stack" style={{ gap: '.3rem' }}>
            <h4 style={{ margin: 0 }}>{lineName(line)}</h4>
            <ul className="k-qty-list">
              {line.items.map((item) => (
                <li key={item.productId} className="k-qty-row">
                  <span>{shortProduct(item.productName)}</span>
                  <span>{item.cabeceraReceivedQuantity === null ? formatCount(item.dispatchedQuantity) : `${formatCount(item.cabeceraReceivedQuantity)} de ${formatCount(item.dispatchedQuantity)}`}</span>
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
  const readOnly = listing?.kind === 'cabecera' && listing.readOnly === true
  const pending = remitos?.filter((remito) => remito.status === 'dispatched') ?? []
  const history = remitos?.filter((remito) => remito.status !== 'dispatched') ?? []
  const title = readOnly
    ? (pending.length === 0 ? 'Ningún envío está esperando a su cabecera.' : `${pending.length} ${pluralize(pending.length, 'envío está', 'envíos están')} esperando a su cabecera.`)
    : pending.length === 0 ? 'No tenés nada pendiente.' : `Tenés ${pending.length} ${pluralize(pending.length, 'envío', 'envíos')} para recibir.`

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
      {remitos ? <TaskCard tone={pending.length > 0 ? 'warn' : 'ok'} title={title}
        description={readOnly ? 'Estás viendo todos los envíos como administrador. Solo la cuenta de cada cabecera puede confirmar lo que llegó.' : undefined} /> : null}
      {remitos && remitos.length === 0 ? (
        <>
          <EmptyState title="Todavía no hay envíos" description="Cuando Planeamiento envíe cuadernillos a tu cabecera, los confirmás acá." />
          <CircuitGuide />
        </>
      ) : null}
      {pending.length > 0 ? (
        <div className="k-stack" role="region" aria-label="Pendientes">
          {readOnly
            ? pending.map((remito) => <HistoryRemito key={remito.remitoId} remito={remito} />)
            : <PendingRemito key={pending[0].remitoId} remito={pending[0]} remaining={pending.length - 1} onSigned={reload} />}
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
