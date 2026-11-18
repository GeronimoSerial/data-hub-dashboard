'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Chip, KpiStrip, Note, Panel, formatCount, shortProduct } from '../kit'
import { formatWhen } from '../receipts/receipt-model'
import { AssignWizard } from './assign-wizard'
import { assignmentStatus, type ReserveView } from './reserve-api'

/** Shown only once the cabecera has received part of a reserve, or already assigned some of it. */
export const hasReserve = (view: ReserveView | null): view is ReserveView =>
  view !== null && (view.balances.some((row) => row.received > 0) || view.assignments.length > 0)

/** What the cabecera can still hand out, one button to assign it, and what it already assigned. */
export function ReservePanel({ view, onChanged }: { view: ReserveView; onChanged: () => void }) {
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const available = view.balances.reduce((sum, row) => sum + row.available, 0)

  return (
    <>
      <Panel title="Para repartir">
        <KpiStrip
          label="Para repartir por grado"
          items={view.balances.map((row) => ({
            label: shortProduct(row.productName),
            value: formatCount(row.available),
            hint: `Recibidos ${formatCount(row.received)} · asignados ${formatCount(row.assigned)}`,
            tone: row.available > 0 ? 'ok' : undefined,
          }))}
        />
        {done ? <Note tone="ok">{done}</Note> : null}
        <div className="k-stack" style={{ gap: '.4rem', justifyItems: 'start' }}>
          <Button type="button" disabled={available === 0} onClick={() => { setDone(null); setOpen(true) }}>Asignar a una escuela</Button>
          <p className="k-hint" style={{ margin: 0 }}>
            {available === 0 ? 'No queda nada para repartir.' : 'A escuelas en estado crítico. No necesita autorización del supervisor.'}
          </p>
        </div>
      </Panel>

      {view.assignments.length > 0 ? (
        <Panel title="Ya asignadas">
          <ul className="k-list" aria-label="Ya asignadas">
            {view.assignments.map((assignment) => (
              <li key={assignment.remitoId} className="k-row">
                <span className="k-row-main">
                  <span className="k-row-title">{assignment.recipientName}</span>
                  <span className="k-row-meta">
                    {formatWhen(assignment.dispatchedAt)} · {assignment.items.map((item) => `${shortProduct(item.productName)}: ${formatCount(item.quantity)}`).join(' · ')}
                  </span>
                </span>
                <span className="k-row-side"><Chip tone={assignment.status === 'received' ? 'ok' : 'neutral'}>{assignmentStatus(assignment.status)}</Chip></span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <AssignWizard
        open={open}
        campaignId={view.campaignId}
        balances={view.balances}
        onClose={() => setOpen(false)}
        onAssigned={(name, units) => {
          setOpen(false)
          setDone(`Asignaste ${formatCount(units)} cuadernillos a ${name}.`)
          onChanged()
        }}
      />
    </>
  )
}
