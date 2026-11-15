'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { dashedCue, errorCode, isRecommendationList, readJson, type CriticalSchool } from '../cabecera/cabecera-api'
import { SchoolSearch, useSchoolSearchState } from '../cabecera/school-search'
import { Chip, EmptyState, Modal, ModalBody, ModalFoot, Note, Stepper, formatCount, shortProduct } from '../kit'
import { dispatchErrorMessage, isCabeceraList, type ConfirmedCabecera, type ProductOption } from './remito-api'

type Step = 'cabecera' | 'escuelas' | 'revision'
type Quantities = Record<string, Record<string, number>>

const STEPS: { id: Step; label: string }[] = [
  { id: 'cabecera', label: '¿A qué cabecera?' },
  { id: 'escuelas', label: '¿Qué escuelas y cuántos?' },
  { id: 'revision', label: 'Revisar y enviar' },
]

const CABECERAS_ERROR = 'No se pudieron cargar las escuelas cabecera.'

export function RemitoBuilder({ open, campaignId, products, onClose, onDispatched }: {
  open: boolean
  campaignId: string
  products: ProductOption[]
  onClose: () => void
  onDispatched: () => void
}) {
  return (
    <Modal open={open} title="Enviar cuadernillos" description="Cada envío va a una escuela cabecera, que después lo reparte a sus escuelas." onClose={onClose}>
      {open ? <BuilderForm campaignId={campaignId} products={products} onClose={onClose} onDispatched={onDispatched} /> : null}
    </Modal>
  )
}

function BuilderForm({ campaignId, products, onClose, onDispatched }: {
  campaignId: string
  products: ProductOption[]
  onClose: () => void
  onDispatched: () => void
}) {
  // One key per dialog: a retry after a failed or lost response replays the same dispatch instead of duplicating it.
  const idempotencyKey = useRef(crypto.randomUUID())
  const [step, setStep] = useState<Step>('cabecera')
  const [cabeceras, setCabeceras] = useState<ConfirmedCabecera[] | null>(null)
  const [cabeceraError, setCabeceraError] = useState<string | null>(null)
  const [cabeceraFilter, setCabeceraFilter] = useState('')
  const [cabecera, setCabecera] = useState<ConfirmedCabecera | null>(null)
  const [schools, setSchools] = useState<CriticalSchool[]>([])
  const [quantities, setQuantities] = useState<Quantities>({})
  const [loadingRecs, setLoadingRecs] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const search = useSchoolSearchState()

  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      try {
        const response = await fetch('/api/cuadernillos/cabeceras', { cache: 'no-store', signal: controller.signal })
        const data = await readJson(response)
        if (!response.ok || !isCabeceraList(data)) throw new Error(CABECERAS_ERROR)
        setCabeceras(data.cabeceras.filter((row) => row.status === 'confirmada'))
      } catch {
        if (!controller.signal.aborted) setCabeceraError(CABECERAS_ERROR)
      }
    })()
    return () => controller.abort()
  }, [])

  const labels = useMemo(() => new Map(products.map((p) => [p.productId, p.productLabel])), [products])
  const schoolNames = useMemo(() => new Map(schools.map((s) => [s.cueAnexo, s.nombre])), [schools])
  const visibleCabeceras = (cabeceras ?? []).filter((row) =>
    !cabeceraFilter.trim() || `${row.nombre} ${row.cue}`.toLowerCase().includes(cabeceraFilter.trim().toLowerCase()))

  const totals = useMemo(() => products.map((product) => ({
    ...product,
    requested: schools.reduce((sum, school) => sum + (quantities[school.cueAnexo]?.[product.productId] ?? 0), 0),
  })), [products, schools, quantities])
  const lines = schools
    .map((school) => ({
      recipientCueAnexo: school.cueAnexo,
      items: products.flatMap((product) => {
        const quantity = quantities[school.cueAnexo]?.[product.productId] ?? 0
        return quantity > 0 ? [{ productId: product.productId, quantity }] : []
      }),
    }))
    .filter((line) => line.items.length > 0)
  const stockLeft = useMemo(() => new Map(products.map((p) => [p.productId, p.available])), [products])
  const short = totals.filter((row) => row.requested > row.available)

  async function addSchool(school: CriticalSchool) {
    if (!cabecera || schools.some((row) => row.cueAnexo === school.cueAnexo)) return
    setSchools((current) => [...current, school])
    setQuantities((current) => ({ ...current, [school.cueAnexo]: {} }))
    setLoadingRecs((current) => [...current, school.cueAnexo])
    try {
      const query = new URLSearchParams({ cueAnexo: school.cueAnexo, cabeceraCueAnexo: cabecera.cue, campaignId })
      const response = await fetch(`/api/cuadernillos/recommendations?${query}`, { cache: 'no-store' })
      const data = await readJson(response)
      if (response.ok && isRecommendationList(data)) {
        const suggested = Object.fromEntries(data.recommendations.flatMap((row) =>
          row.suggested !== null && row.suggested > 0 ? [[row.productId, row.suggested]] : []))
        setQuantities((current) => ({ ...current, [school.cueAnexo]: { ...suggested, ...(current[school.cueAnexo] ?? {}) } }))
      }
    } catch {
      // No recommendation: the quantities stay at zero and the planner enters them by hand.
    } finally {
      setLoadingRecs((current) => current.filter((cue) => cue !== school.cueAnexo))
    }
  }

  function removeSchool(cue: string) {
    setSchools((current) => current.filter((school) => school.cueAnexo !== cue))
    setQuantities(({ [cue]: _removed, ...rest }) => rest)
  }

  function chooseCabecera(next: ConfirmedCabecera) {
    if (cabecera?.cue !== next.cue) { setSchools([]); setQuantities({}) }
    setCabecera(next)
  }

  async function dispatch() {
    if (!cabecera || lines.length === 0 || short.length > 0) return
    setSending(true)
    setError(null)
    try {
      const response = await fetch('/api/cuadernillos/remitos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId, cabeceraCueAnexo: cabecera.cue, idempotencyKey: idempotencyKey.current, lines }),
      })
      const data = await readJson(response)
      if (!response.ok) {
        setError(dispatchErrorMessage(data ?? { error: errorCode(data) }, labels, schoolNames, stockLeft))
        return
      }
      onDispatched()
    } catch {
      setError('No se pudo enviar. Intentá nuevamente.')
    } finally {
      setSending(false)
    }
  }

  const pickable = search.results?.filter((school) => !schools.some((row) => row.cueAnexo === school.cueAnexo)) ?? null
  const searchState = { ...search, results: pickable && pickable.length === 0 && (search.results?.length ?? 0) > 0 ? null : pickable }
  const recsPending = loadingRecs.length > 0
  const stepIndex = STEPS.findIndex((item) => item.id === step)

  return (
    <>
      <ModalBody>
        <ol aria-label="Pasos del envío" style={{ display: 'flex', flexWrap: 'wrap', gap: '.25rem 1rem', margin: 0, padding: 0, listStyle: 'none' }}>
          {STEPS.map((item, index) => (
            <li key={item.id} aria-current={index === stepIndex ? 'step' : undefined}
              style={{
                paddingBottom: '.15rem', fontSize: '.9rem',
                fontWeight: index === stepIndex ? 700 : 500,
                color: index === stepIndex ? 'var(--ink)' : 'var(--ink-soft)',
                borderBottom: `2px solid ${index === stepIndex ? 'var(--ink)' : 'transparent'}`,
              }}>
              {`${index + 1}. ${item.label}`}
            </li>
          ))}
        </ol>

        {step === 'cabecera' ? (
          <div className="k-field">
            <span className="k-label">Elegí la escuela cabecera que recibe el envío</span>
            {cabeceraError ? <Note tone="danger">{cabeceraError}</Note> : null}
            {!cabeceras && !cabeceraError ? <p role="status" style={{ margin: 0, color: 'var(--ink-soft)' }}>Cargando escuelas cabecera…</p> : null}
            {cabeceras && cabeceras.length === 0 ? <EmptyState title="Ninguna cabecera confirmó su cuenta" description="Una cabecera tiene que confirmar su cuenta para poder recibir envíos." /> : null}
            {cabeceras && cabeceras.length > 8 ? (
              <Input aria-label="Buscar cabecera" placeholder="Buscar por nombre o CUE" value={cabeceraFilter} onChange={(event) => setCabeceraFilter(event.target.value)} />
            ) : null}
            <ul className="k-list" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 15rem), 1fr))' }}>
              {visibleCabeceras.map((row) => (
                <li key={row.cue}>
                  <button type="button" className="k-row" aria-pressed={cabecera?.cue === row.cue} onClick={() => chooseCabecera(row)}
                    style={cabecera?.cue === row.cue ? { borderColor: 'var(--ink)', background: 'var(--fill)' } : undefined}>
                    <span className="k-row-main">
                      <span className="k-row-title">{row.nombre}</span>
                      <span className="k-row-meta">{row.departamento} · CUE {dashedCue(row.cue)}</span>
                    </span>
                    {cabecera?.cue === row.cue ? <span className="k-row-side"><Chip tone="ok">Elegida</Chip></span> : null}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {step === 'escuelas' ? (
          <>
            <div className="k-field">
              <span className="k-label">Escuelas que reciben cuadernillos</span>
              <SchoolSearch selected={null} onChoose={(school) => void addSchool(school)} onClear={() => undefined} state={searchState} />
            </div>
            {schools.length > 0 ? (
              <>
                <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Cantidades sugeridas por matrícula (1 por estudiante). Podés ajustarlas.</p>
                {schools.map((school) => (
                  <div key={school.cueAnexo} role="group" aria-label={school.nombre} style={{ display: 'grid', gap: '.3rem', minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.5rem' }}>
                      <span style={{ minWidth: 0 }}>
                        <span className="k-row-title">{school.nombre}</span>{' '}
                        <span className="k-row-meta">
                          CUE {dashedCue(school.cueAnexo)}{loadingRecs.includes(school.cueAnexo) ? ' · Buscando sugeridos…' : ''}
                        </span>
                      </span>
                      <Button type="button" variant="ghost" aria-label={`Quitar ${school.nombre}`} onClick={() => removeSchool(school.cueAnexo)}>
                        <X aria-hidden size={16} />
                      </Button>
                    </div>
                    <ul className="k-qty-list">
                      {products.map((product) => (
                        <li key={product.productId} className="k-qty-row">
                          <span className="k-row-title">{shortProduct(product.productLabel)}</span>
                          <Stepper
                            label={`${school.nombre} · ${product.productLabel}`}
                            value={quantities[school.cueAnexo]?.[product.productId] ?? 0}
                            onChange={(value) => setQuantities((current) => ({ ...current, [school.cueAnexo]: { ...(current[school.cueAnexo] ?? {}), [product.productId]: value } }))}
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </>
            ) : null}
          </>
        ) : null}

        {step === 'revision' ? (
          <>
            <section className="k-receipt" aria-label="Detalle del envío">
              <header className="k-receipt-head">
                <span>Envío a</span>
                <strong>{cabecera?.nombre}</strong>
              </header>
              {lines.map((line) => (
                <div key={line.recipientCueAnexo} className="k-receipt-group">
                  <h4>{schoolNames.get(line.recipientCueAnexo) ?? line.recipientCueAnexo}</h4>
                  <dl>
                    {line.items.filter((item) => item.quantity > 0).map((item) => (
                      <div key={item.productId}>
                        <dt>{shortProduct(labels.get(item.productId) ?? item.productId)}</dt>
                        <dd>{formatCount(item.quantity)}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
              <p className="k-receipt-total">
                <span>Total</span>
                <strong>{formatCount(lines.reduce((sum, line) => sum + line.items.reduce((acc, item) => acc + item.quantity, 0), 0))} cuadernillos</strong>
              </p>
            </section>
            {short.length > 0 ? <Note tone="danger">{`No alcanza el stock: ${short.map((row) => `${shortProduct(row.productLabel)} (quedan ${formatCount(row.available)}, pediste ${formatCount(row.requested)})`).join(', ')}. Volvé atrás y bajá las cantidades.`}</Note> : null}
            {lines.length === 0 ? <Note tone="danger">El envío no tiene cantidades. Volvé atrás y cargalas.</Note> : null}
          </>
        ) : null}

        {error ? <Note tone="danger">{error}</Note> : null}
      </ModalBody>
      <ModalFoot>
        {step !== 'cabecera' ? (
          <Button type="button" variant="secondary" disabled={sending} onClick={() => setStep(step === 'revision' ? 'escuelas' : 'cabecera')}>Atrás</Button>
        ) : (
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
        )}
        {step === 'cabecera' ? (
          <Button type="button" disabled={!cabecera} onClick={() => setStep('escuelas')}>Siguiente</Button>
        ) : null}
        {step === 'escuelas' ? (
          <Button type="button" disabled={lines.length === 0 || recsPending} onClick={() => setStep('revision')}>
            {recsPending ? 'Buscando sugeridos…' : 'Revisar'}
          </Button>
        ) : null}
        {step === 'revision' ? (
          <Button type="button" disabled={sending || lines.length === 0 || short.length > 0} onClick={() => void dispatch()}>
            {sending ? 'Enviando…' : 'Enviar'}
          </Button>
        ) : null}
      </ModalFoot>
    </>
  )
}
