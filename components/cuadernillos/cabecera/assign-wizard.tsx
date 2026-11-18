'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Modal, ModalBody, ModalFoot, Note, Stepper, WizardHeader, formatCount, shortProduct } from '../kit'
import { PickSearch, type ParsedQuery } from '../pick-search'
import { useIdempotencyKey } from '../receipts/receipt-model'
import { dashedCue, isSchoolList, readJson, type CriticalSchool } from './cabecera-api'
import { assignmentBody, postAssignment, type ReserveBalance } from './reserve-api'

type Step = 'escuela' | 'cantidades' | 'revision'
const STEPS: Step[] = ['escuela', 'cantidades', 'revision']
const MAX_RESULTS = 6

const COPY: Record<Step, { title: string; description?: string }> = {
  escuela: { title: '¿A qué escuela?', description: 'Buscala por nombre o CUE. Solo aparecen las escuelas en estado crítico.' },
  cantidades: { title: '¿Cuántos?', description: 'No podés dar más de lo que te queda.' },
  revision: { title: 'Revisá y asignar' },
}

export function AssignWizard({ open, campaignId, balances, onClose, onAssigned }: {
  open: boolean
  campaignId: string
  balances: ReserveBalance[]
  onClose: () => void
  onAssigned: (recipientName: string, units: number) => void
}) {
  return (
    <Modal open={open} size="wide" title="Asignar a una escuela" onClose={onClose}>
      {open ? <WizardForm campaignId={campaignId} balances={balances} onClose={onClose} onAssigned={onAssigned} /> : null}
    </Modal>
  )
}

async function searchSchools(query: ParsedQuery, signal: AbortSignal): Promise<CriticalSchool[]> {
  const param = query.kind === 'cue' ? 'cue' : 'q'
  const response = await fetch(`/api/cuadernillos/schools?${param}=${encodeURIComponent(query.value)}`, { cache: 'no-store', signal })
  const data = await readJson(response)
  if (!response.ok || !isSchoolList(data)) throw new Error('search_failed')
  return data.schools.slice(0, MAX_RESULTS)
}

function WizardForm({ campaignId, balances, onClose, onAssigned }: {
  campaignId: string
  balances: ReserveBalance[]
  onClose: () => void
  onAssigned: (recipientName: string, units: number) => void
}) {
  // A retry of the same assignment replays it; an edited one gets a fresh key.
  const keyFor = useIdempotencyKey()
  const [step, setStep] = useState<Step>('escuela')
  const [school, setSchool] = useState<CriticalSchool | null>(null)
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const labels = useMemo(() => new Map(balances.map((row) => [row.productId, row.productName])), [balances])
  const items = balances.flatMap((row) => {
    const quantity = quantities[row.productId] ?? 0
    return quantity > 0 ? [{ productId: row.productId, quantity }] : []
  })
  const total = items.reduce((sum, item) => sum + item.quantity, 0)
  const index = STEPS.indexOf(step)
  const copy = COPY[step]

  async function assign() {
    if (!school || items.length === 0) return
    const request = { campaignId, recipientCueAnexo: school.cueAnexo, items }
    setBusy(true)
    setError(null)
    const result = await postAssignment(assignmentBody(request, keyFor(JSON.stringify(request))), labels)
    setBusy(false)
    if (result.ok) onAssigned(result.recipientName || school.nombre, total)
    else setError(result.message)
  }

  return (
    <>
      <ModalBody>
        <WizardHeader step={index + 1} total={STEPS.length} title={copy.title} description={copy.description} />

        {step === 'escuela' ? (
          <div className="k-field">
            {school ? (
              <div className="k-picked">
                <span className="k-picked-main">
                  <strong>{school.nombre}</strong>
                  <span>{school.departamento} · CUE {dashedCue(school.cueAnexo)}</span>
                </span>
                <button type="button" className="k-link-btn" onClick={() => setSchool(null)}>Cambiar</button>
              </div>
            ) : (
              <PickSearch<CriticalSchool>
                label="Buscar escuela"
                noun="escuela"
                search={searchSchools}
                describe={(row) => ({ key: row.cueAnexo, title: row.nombre, meta: `${row.departamento} · CUE ${dashedCue(row.cueAnexo)}`, label: `Elegir ${row.nombre}, CUE ${row.cueAnexo}` })}
                onPick={setSchool}
              />
            )}
          </div>
        ) : null}

        {step === 'cantidades' ? (
          <ul className="k-qty-list">
            {balances.map((row) => (
              <li key={row.productId} className="k-qty-row" data-active={(quantities[row.productId] ?? 0) > 0 ? 'true' : undefined}>
                <span>{shortProduct(row.productName)} <span className="k-hint">{`(quedan ${formatCount(row.available)})`}</span></span>
                <Stepper
                  label={row.productName}
                  value={quantities[row.productId] ?? 0}
                  max={row.available}
                  disabled={row.available === 0}
                  onChange={(value) => setQuantities((current) => ({ ...current, [row.productId]: value }))}
                />
              </li>
            ))}
          </ul>
        ) : null}

        {step === 'revision' && school ? (
          <section className="k-receipt" aria-label="Detalle de la asignación">
            <header className="k-receipt-head">
              <span>Asignar a</span>
              <strong>{school.nombre}</strong>
            </header>
            <div className="k-receipt-group">
              <dl>
                {items.map((item) => (
                  <div key={item.productId}>
                    <dt>{shortProduct(labels.get(item.productId) ?? item.productId)}</dt>
                    <dd>{formatCount(item.quantity)}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <p className="k-receipt-total">
              <span>Total</span>
              <strong>{formatCount(total)} cuadernillos</strong>
            </p>
            <p className="k-hint" style={{ margin: 0 }}>No necesita autorización del supervisor. La escuela confirma cuando lo recibe.</p>
          </section>
        ) : null}

        {error ? <Note tone="danger">{error}</Note> : null}
      </ModalBody>
      <ModalFoot>
        {step === 'cantidades' && total > 0 ? <p style={{ flex: '1 1 auto', margin: '0 auto 0 0', color: 'var(--ink-soft)', fontSize: '.9rem' }}><strong style={{ color: 'var(--ink)', fontWeight: 600 }}>{formatCount(total)}</strong> cuadernillos</p> : null}
        {step === 'escuela' ? (
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
        ) : (
          <Button type="button" variant="ghost" disabled={busy} onClick={() => { setError(null); setStep(STEPS[index - 1]) }}>Atrás</Button>
        )}
        {step === 'escuela' ? <Button type="button" disabled={!school} onClick={() => setStep('cantidades')}>Siguiente</Button> : null}
        {step === 'cantidades' ? <Button type="button" disabled={total === 0} onClick={() => setStep('revision')}>Revisar</Button> : null}
        {step === 'revision' ? <Button type="button" disabled={busy || total === 0} onClick={() => void assign()}>{busy ? 'Asignando…' : 'Asignar'}</Button> : null}
      </ModalFoot>
    </>
  )
}
